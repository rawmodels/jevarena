import { request } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { defaultFighter } from "../src/core/config";
import { verifyReplay } from "../src/core/match";
const root = await mkdtemp(path.join(tmpdir(), "jevarena-smoke-"));
const port = "0";
const testKey = "smoke-only-never-valid";
let base = "";
const child = spawn(process.execPath, ["dist/server.js"], {
  env: {
    ...process.env,
    PORT: port,
    HOST: "127.0.0.1",
    ARENA_DATA_DIR: root,
    ARENA_ORIGIN: "",
    OPENROUTER_API_KEY: testKey,
    RAWMODELS_API_KEY: testKey,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (data) => (logs += data));
child.stderr.on("data", (data) => (logs += data));
async function call(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(base + url, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    base = logs.match(/JEV Arena: (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    try {
      if (base && (await call("/api/state")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, logs);
  const state = await (await call("/api/state")).json();
  assert.equal(state.modelBoard.fighters.length, 21);
  assert.equal(state.modelBoard.matches.length, 420);
  assert.ok(!JSON.stringify(state).includes(testKey));
  assert.equal(
    (await call("/api/fighters", { ...defaultFighter }, { Origin: "https://evil.invalid" })).status,
    403,
  );
  const badHost = await new Promise<number>((resolve, reject) => {
    const req = request(base + "/api/state", { headers: { Host: "evil.invalid" } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(badHost, 403);
  for (const [id, model] of [
    ["cpu", "scripted"],
    ["random", "random"],
  ])
    assert.equal((await call("/api/fighters", { ...defaultFighter, id, model })).status, 201);
  const fight = await (await call("/api/fights", { left: "cpu", right: "random" })).json();
  assert.ok(fight.id);
  let completed = false;
  for (let i = 0; i < 200; i++) {
    const result = await (await call(`/api/matches/${fight.id}`)).json();
    if (result.status === "COMPLETED") {
      verifyReplay(result.replay);
      completed = true;
      break;
    }
    if (result.status === "VOID") throw Error(result.error);
    await delay(50);
  }
  assert.ok(completed, "Fight did not complete");
  const updated = await (await call("/api/state")).json();
  assert.equal(updated.userBoard.length, 2);
  assert.ok(updated.userBoard.every((row: { games: number }) => row.games === 1));
  assert.match(await (await call("/")).text(), /JEV Arena/);
  console.log(
    "Smoke passed: 21-model snapshot, origin/host checks, save fighters, complete bot fight, verified replay, persisted ratings, production HTML.",
  );
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null)
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  await rm(root, { recursive: true, force: true });
}
