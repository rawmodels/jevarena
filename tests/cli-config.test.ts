import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { parseArenaConfig } from "../src/cli/config";
import { importFighters, runConfiguredFight, runConfiguredTournament } from "../src/cli/actions";
import { defaultFighter } from "../src/core/config";
import { Storage } from "../src/server/storage";
import { verifyReplay } from "../src/core/match";
const fighters = [
  {
    ...defaultFighter,
    id: "sam",
    name: "Ship-It Sam",
    character: "ship-it-sam",
    model: "scripted",
    strategy: "CUSTOM STRATEGY",
    defense: "CUSTOM DEFENSE",
    injection: "CUSTOM MENTAL MESSAGE",
  },
  {
    ...defaultFighter,
    id: "goblin",
    name: "Search Goblin",
    character: "search-goblin",
    model: "random",
  },
];
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("config-driven workflows", () => {
  it("accepts legacy arrays and resolves explicit file paths from the config directory", () => {
    const file = path.resolve("examples/arena.json");
    expect(parseArenaConfig(fighters, file).fighters).toEqual(fighters);
    const c = parseArenaConfig(
      { fighters, dataDir: "../records", tournament: { out: "../runs" } },
      file,
    );
    expect(c.dataDir).toBe(path.resolve("records"));
    expect(c.tournament.out).toBe(path.resolve("runs"));
    expect(() => parseArenaConfig({ fighters, typo: true }, file)).toThrow();
    expect(() => parseArenaConfig({ fighters: [fighters[0], fighters[0]] }, file)).toThrow(
      "Duplicate",
    );
    expect(() => parseArenaConfig({ fighters, steps: ["serve", "fight", "serve"] }, file)).toThrow(
      "final",
    );
  });
  it("imports all config fields and preserves unrelated fighters across storage instances", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jevarena-config-import-"));
    try {
      const c = parseArenaConfig({ fighters, dataDir: "data" }, path.join(root, "config.json"));
      await importFighters(c);
      const a = new Storage(c.dataDir),
        b = new Storage(c.dataDir);
      await Promise.all([
        a.saveFighter({ ...defaultFighter, id: "third" }),
        b.saveFighter({ ...defaultFighter, id: "fourth" }),
      ]);
      expect(await a.fighters()).toHaveLength(4);
      expect((await a.fighters()).find((f) => f.id === "sam")).toEqual(fighters[0]);
      await expect(
        a.saveFighters([
          { ...defaultFighter, id: "new" },
          { ...fighters[0], author: "changed" },
        ]),
      ).rejects.toThrow("permanent");
      expect((await a.fighters()).some((f) => f.id === "new")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("runs a fight without a server or UI and keeps character and prompt fields in its replay", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jevarena-config-fight-"));
    try {
      const c = parseArenaConfig(
        {
          fighters,
          dataDir: "data",
          fight: { left: "sam", right: "goblin", seed: 77, maxRequests: 1 },
        },
        path.join(root, "config.json"),
      );
      const result = await runConfiguredFight(c, signal());
      expect(result.requests).toBe(0);
      const [replay] = await new Storage(c.dataDir).replays();
      expect(replay.configs).toEqual(fighters);
      expect(replay.seed).toBe(77);
      expect(replay.observations![0][0]).toContain("CUSTOM STRATEGY");
      expect(replay.observations![0][0]).toContain("CUSTOM DEFENSE");
      expect(replay.observations![0][0]).toContain("CUSTOM MENTAL MESSAGE");
      verifyReplay(replay);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("imports only complete tournament results and does not duplicate them when resumed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jevarena-config-tournament-"));
    try {
      const c = parseArenaConfig(
        {
          fighters,
          dataDir: "data",
          tournament: { out: "run", gamesPerPair: 2, parallel: 2, maxRequests: 1 },
        },
        path.join(root, "config.json"),
      );
      await runConfiguredTournament(c, signal());
      const storage = new Storage(c.dataDir);
      const first = await storage.replays();
      expect(first).toHaveLength(2);
      const original = await readFile(
        path.join(c.tournament.out, "matches", "sam--goblin--0.json"),
        "utf8",
      );
      await runConfiguredTournament(c, signal());
      expect((await storage.replays()).map((m) => m.id).sort()).toEqual(
        first.map((m) => m.id).sort(),
      );
      expect(
        await readFile(path.join(c.tournament.out, "matches", "sam--goblin--0.json"), "utf8"),
      ).toBe(original);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not turn a failed API tournament into local rated matches", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jevarena-config-failure-"));
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    try {
      const c = parseArenaConfig(
        {
          fighters: [{ ...fighters[0], model: "pplx" }, fighters[1]],
          dataDir: "data",
          tournament: { out: "run", maxRequests: 1 },
        },
        path.join(root, "config.json"),
      );
      await expect(runConfiguredTournament(c, signal())).rejects.toThrow("Incomplete");
      expect(await new Storage(c.dataDir).replays()).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
