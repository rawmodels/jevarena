import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { playMatch, type Replay } from "../core/match";
import { RequestBudget, createPolicy } from "../providers/decision";
import { modelById } from "../providers/registry";
import { fingerprint, Storage } from "../server/storage";
import { runTournament } from "../tournament/runner";
import type { FighterConfig } from "../core/config";
import type { ArenaConfig } from "./config";

export async function importFighters(config: ArenaConfig) {
  await new Storage(config.dataDir).saveFighters(config.fighters);
  return { fighters: config.fighters.length, dataDir: config.dataDir };
}
export async function runConfiguredFight(config: ArenaConfig, signal: AbortSignal) {
  const left = config.fighters.find((f) => f.id === (config.fight.left ?? config.fighters[0]?.id));
  const right = config.fighters.find(
    (f) => f.id === (config.fight.right ?? config.fighters[1]?.id),
  );
  if (!left || !right || left.id === right.id)
    throw new Error("fight.left and fight.right must name two distinct configured fighters");
  const fighters: [FighterConfig, FighterConfig] = [left, right];
  const budget = new RequestBudget(config.fight.maxRequests);
  const policies = fighters.map((f) =>
    createPolicy(
      modelById(f.model),
      config.fight.seed ^ [...f.id].reduce((sum, c) => sum + c.charCodeAt(0), 0),
      budget,
    ),
  ) as Parameters<typeof playMatch>[3];
  const storage = new Storage(config.dataDir);
  await storage.saveFighters(config.fighters);
  const replay = await playMatch(
    randomUUID(),
    config.fight.seed,
    fighters,
    policies,
    AbortSignal.any([signal, AbortSignal.timeout(config.fight.timeoutMs)]),
    async (progress) => {
      console.log(
        JSON.stringify({
          event: "PROGRESS",
          id: progress.id,
          decisions: progress.d.length,
          requests: budget.used,
        }),
      );
    },
  );
  await storage.saveReplay(replay);
  return {
    id: replay.id,
    winner: replay.winner === null ? null : replay.configs[replay.winner].name,
    wins: replay.wins,
    hash: replay.hash,
    requests: budget.used,
    dataDir: config.dataDir,
  };
}
export async function runConfiguredTournament(config: ArenaConfig, signal: AbortSignal) {
  const storage = new Storage(config.dataDir);
  await storage.saveFighters(config.fighters);
  const board = await runTournament({
    fighters: config.fighters,
    out: config.tournament.out,
    games: config.tournament.gamesPerPair,
    parallel: config.tournament.parallel,
    maxRequests: config.tournament.maxRequests,
    signal,
  });
  const manifest = JSON.parse(
    await readFile(path.join(config.tournament.out, "manifest.json"), "utf8"),
  ) as { startedAt: string };
  if (typeof manifest.startedAt !== "string")
    throw new Error("Tournament manifest has no run timestamp");
  for (const match of board.matches) {
    const replay = JSON.parse(
      await readFile(path.join(config.tournament.out, "matches", `${match.id}.json`), "utf8"),
    ) as Replay;
    // Stable per-run IDs make resume idempotent without overwriting a different run.
    const id = `tournament-${fingerprint({ runHash: board.runHash, startedAt: manifest.startedAt, match: match.id })}`;
    await storage.saveReplay({ ...replay, id });
  }
  return { matches: board.matches.length, out: config.tournament.out, dataDir: config.dataDir };
}
export async function serveConfiguredArena(config: ArenaConfig) {
  await importFighters(config);
  process.env.ARENA_DATA_DIR = config.dataDir;
  if (config.server.host !== undefined) process.env.HOST = config.server.host;
  if (config.server.port !== undefined) process.env.PORT = String(config.server.port);
  if (config.server.origin !== undefined) process.env.ARENA_ORIGIN = config.server.origin;
  if (config.server.maxRequests !== undefined)
    process.env.ARENA_MAX_REQUESTS = String(config.server.maxRequests);
  await import("../server/main");
}
