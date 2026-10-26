import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { tournamentJobs, runTournament } from "../src/tournament/runner";
import { defaultFighter } from "../src/core/config";
import { Storage } from "../src/server/storage";
import { userRatings } from "../src/server/ratings";

describe("tournament integrity and persistence", () => {
  it("pairs identical seeds with swapped sides", () => {
    const jobs = tournamentJobs(["a", "b", "c"], 4);
    expect(jobs).toHaveLength(12);
    for (let i = 0; i < jobs.length; i += 2) {
      expect(jobs[i].seed).toBe(jobs[i + 1].seed);
      expect(jobs[i].fighters).toEqual([...jobs[i + 1].fighters].reverse());
    }
    expect(() => tournamentJobs(["a", "a"], 2)).toThrow();
    expect(() => tournamentJobs(["a", "b"], 3)).toThrow();
  });
  it("resumes complete games and refuses changed configs", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "jevarena-tournament-"));
    try {
      const fighters = [
        { ...defaultFighter, id: "cpu", model: "scripted" },
        { ...defaultFighter, id: "random", model: "random" },
      ];
      const options = { fighters, out, games: 2, parallel: 2, maxRequests: 1 };
      const a = await runTournament(options),
        b = await runTournament(options);
      expect(a).toEqual(b);
      expect(JSON.parse(await readFile(path.join(out, "progress.json"), "utf8"))).toMatchObject({
        status: "COMPLETE",
        completed: 2,
        requests: 0,
      });
      await expect(
        runTournament({
          ...options,
          fighters: [{ ...fighters[0], strategy: "Changed" }, fighters[1]],
        }),
      ).rejects.toThrow("changed");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
  it("serializes concurrent fighter saves and preserves permanent author names", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "jevarena-storage-"));
    try {
      const storage = new Storage(out);
      await Promise.all([
        storage.saveFighter({ ...defaultFighter, id: "one" }),
        storage.saveFighter({ ...defaultFighter, id: "two" }),
      ]);
      expect(await storage.fighters()).toHaveLength(2);
      await expect(
        storage.saveFighter({ ...defaultFighter, id: "one", author: "different" }),
      ).rejects.toThrow("permanent");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
  it("starts an edited, unplayed config at 1000 rather than inheriting old wins", () => {
    const f = { ...defaultFighter, strategy: "Changed strategy" };
    expect(userRatings([f], [])).toMatchObject([{ elo: 1000, w: 0, l: 0, d: 0, games: 0 }]);
  });
});

describe("failed runs", () => {
  it("does not publish a board after provider errors and preserves its attempt cap on resume", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "jevarena-failure-"));
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetch = vi.fn(async () => new Response("denied", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    try {
      const options = {
        fighters: [
          { ...defaultFighter, id: "api", model: "pplx" },
          { ...defaultFighter, id: "cpu", model: "scripted" },
        ],
        out,
        games: 2,
        parallel: 2,
        maxRequests: 1,
      };
      await expect(runTournament(options)).rejects.toThrow("Incomplete");
      await expect(readFile(path.join(out, "board.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      await expect(runTournament(options)).rejects.toThrow("Incomplete");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(await readFile(path.join(out, "progress.json"), "utf8"))).toMatchObject({
        requests: 1,
        completed: 0,
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await rm(out, { recursive: true, force: true });
    }
  });
  it("refuses to run over an existing writer lock", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "jevarena-lock-"));
    try {
      await writeFile(path.join(out, ".runner.lock"), "existing runner");
      await expect(
        runTournament({
          fighters: [
            { ...defaultFighter, id: "one" },
            { ...defaultFighter, id: "two" },
          ],
          out,
          games: 2,
          parallel: 1,
          maxRequests: 1,
        }),
      ).rejects.toThrow("locked");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
