import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { defaultFighter } from "../src/core/config";
import { verifyReplay } from "../src/core/match";
const root = await mkdtemp(path.join(tmpdir(), "jevarena-config-smoke-"));
const configFile = path.join(root, "arena.json");
const fighters = [
  {
    ...defaultFighter,
    id: "sam",
    name: "Config Sam",
    model: "scripted",
    character: "ship-it-sam",
    strategy: "HEADLESS STRATEGY",
    defense: "HEADLESS DEFENSE",
    injection: "HEADLESS MESSAGE",
  },
  {
    ...defaultFighter,
    id: "goblin",
    name: "Config Goblin",
    model: "random",
    character: "search-goblin",
  },
];
await writeFile(
  configFile,
  JSON.stringify({
    fighters,
    dataDir: "data",
    steps: ["import", "fight", "serve"],
    fight: { left: "sam", right: "goblin", seed: 77, maxRequests: 1 },
    tournament: { out: "run", gamesPerPair: 2, parallel: 2, maxRequests: 1 },
    server: { host: "127.0.0.1", port: 0 },
  }),
);
const env = {
  ...process.env,
  ARENA_ORIGIN: "",
  OPENROUTER_API_KEY: "config-smoke-only",
  RAWMODELS_API_KEY: "config-smoke-only",
};
const child = spawn(process.execPath, ["dist/arena.js", "--config", configFile], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (chunk) => (logs += chunk));
child.stderr.on("data", (chunk) => (logs += chunk));
async function command(args: string[]) {
  const runner = spawn(process.execPath, ["dist/arena.js", ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  runner.stdout.on("data", (chunk) => (output += chunk));
  runner.stderr.on("data", (chunk) => (output += chunk));
  const code = await new Promise<number | null>((resolve, reject) => {
    runner.on("error", reject);
    runner.on("exit", resolve);
  });
  assert.equal(code, 0, output);
}
try {
  let base = "";
  for (let attempt = 0; attempt < 150; attempt++) {
    base = logs.match(/JEV Arena: (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    if (base) break;
    if (child.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(base, logs);
  const state = async () => {
    const response = await fetch(base + "/api/state");
    assert.equal(response.status, 200);
    return response.json();
  };
  const initial = await state();
  assert.equal(initial.fighters.length, 2);
  assert.equal(initial.matches.length, 1);
  assert.equal(initial.modelBoard.matches.length, 420);
  const record = await (await fetch(base + "/api/matches/" + initial.matches[0].id)).json();
  assert.equal(record.status, "COMPLETED");
  verifyReplay(record.replay);
  assert.deepEqual(record.replay.configs, fighters);
  assert.equal(record.replay.seed, 77);
  assert.ok(record.replay.observations[0][0].includes("HEADLESS MESSAGE"));
  assert.ok(logs.includes('"requests":0'), logs);
  const extra = path.join(root, "extra.json");
  await writeFile(
    extra,
    JSON.stringify({ fighters: [{ ...defaultFighter, id: "extra" }], dataDir: "data" }),
  );
  await command(["import", "--config", extra]);
  assert.equal((await state()).fighters.length, 3);
  await command(["tournament", "--config", configFile]);
  const after = await state();
  assert.equal(after.matches.length, 3);
  assert.ok(
    after.userBoard
      .filter((r: { id: string }) => r.id !== "extra")
      .every((r: { games: number }) => r.games === 3),
  );
  await command(["tournament", "--config", configFile]);
  const resumed = await state();
  assert.equal(resumed.matches.length, 3);
  assert.deepEqual(
    resumed.matches.map((m: { id: string }) => m.id).sort(),
    after.matches.map((m: { id: string }) => m.id).sort(),
  );
  assert.equal(
    (await fetch(base + "/arena/sprites/ship-it-sam/idle.png")).headers.get("content-type"),
    "image/png",
  );
  console.log(
    "Config smoke passed: bundled CLI imports fighters, runs a real offline fight, starts the server, exposes replays and ratings, merges external imports, and resumes tournament imports without duplicates.",
  );
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null)
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  await rm(root, { recursive: true, force: true });
}
