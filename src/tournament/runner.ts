import { readFile, mkdir, open, unlink } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fighterSchema, PROTOCOL_VERSION, type FighterConfig } from "../core/config";
import { playMatch, verifyReplay, type Replay } from "../core/match";
import { bradleyTerry } from "../core/elo";
import { createPolicy, RequestBudget } from "../providers/decision";
import { modelById } from "../providers/registry";
import { atomicJson, fingerprint } from "../server/storage";

export type Job = { id: string; fighters: [string, string]; seed: number };
export function tournamentJobs(ids: string[], gamesPerPair: number): Job[] {
  if (ids.length < 2 || new Set(ids).size !== ids.length)
    throw new Error("Use at least two unique fighter IDs");
  if (!Number.isSafeInteger(gamesPerPair) || gamesPerPair < 2 || gamesPerPair % 2)
    throw new Error("Games per pair must be a positive even integer");
  const jobs: Job[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      for (let game = 0; game < gamesPerPair; game++) {
        const block = `${[ids[i], ids[j]].sort().join("--")}--seed${Math.floor(game / 2)}`;
        const fighters: [string, string] = game % 2 ? [ids[j], ids[i]] : [ids[i], ids[j]];
        jobs.push({
          id: `${fighters.join("--")}--${game}`,
          fighters,
          seed: parseInt(createHash("sha256").update(block).digest("hex").slice(0, 8), 16) || 1,
        });
      }
  return jobs;
}
async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function runTournamentUnlocked(options: {
  fighters: FighterConfig[];
  out: string;
  games: number;
  parallel: number;
  maxRequests: number;
  signal?: AbortSignal;
}) {
  const fighters = options.fighters.map((f) => fighterSchema.parse(f));
  fighters.forEach((f) => modelById(f.model));
  const jobs = tournamentJobs(
    fighters.map((f) => f.id),
    options.games,
  );
  if (!Number.isSafeInteger(options.parallel) || options.parallel < 1 || options.parallel > 16)
    throw new Error("Parallel must be an integer from 1 to 16");
  const models = fighters.map((f) => modelById(f.model));
  const sourceFiles = [
    "core/engine.ts",
    "core/policy.ts",
    "core/i18n.ts",
    "core/mental-attack.ts",
    "core/match.ts",
    "core/config.ts",
    "core/elo.ts",
    "core/replay.ts",
    "core/replay-types.ts",
    "providers/decision.ts",
    "providers/registry.ts",
    "providers/models.json",
    "tournament/runner.ts",
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (f) => [
        f,
        createHash("sha256")
          .update(await readFile(path.resolve("src", f)))
          .digest("hex"),
      ]),
    ),
  );
  const protocol = {
    version: PROTOCOL_VERSION,
    fighters,
    models,
    gamesPerPair: options.games,
    sourceHashes: hashes,
  };
  const runHash = fingerprint(protocol);
  const out = path.resolve(options.out);
  await mkdir(out, { recursive: true });
  const previous = (await readJson(path.join(out, "manifest.json"))) as { runHash: string } | null;
  if (previous && previous.runHash !== runHash)
    throw new Error("Run config or source changed. Choose a new output directory.");
  if (!previous)
    await atomicJson(path.join(out, "manifest.json"), {
      ...protocol,
      runHash,
      startedAt: new Date().toISOString(),
    });
  const prior = (await readJson(path.join(out, "progress.json"))) as { requests: number } | null;
  const journalFile = path.join(out, "requests.jsonl");
  let attempts: number[] = [];
  try {
    attempts = (await readFile(journalFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { attempt: number }).attempt);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const budget = new RequestBudget(options.maxRequests, (attempt) =>
    appendFileSync(journalFile, JSON.stringify({ attempt, at: new Date().toISOString() }) + "\n", {
      mode: 0o600,
    }),
  );
  budget.used = attempts.reduce((max, attempt) => Math.max(max, attempt), prior?.requests ?? 0);
  const completed = new Map<string, Replay>();
  const failures: Record<string, string> = {};
  let pendingProgress = Promise.resolve();
  const progress = () => {
    const snapshot = {
      status: completed.size === jobs.length ? "COMPLETE" : "INCOMPLETE",
      completed: completed.size,
      expected: jobs.length,
      requests: budget.used,
      maxRequests: budget.limit,
      failures: { ...failures },
      runHash,
    };
    pendingProgress = pendingProgress.then(() =>
      atomicJson(path.join(out, "progress.json"), snapshot),
    );
    return pendingProgress;
  };
  let cursor = 0;
  await Promise.all(
    Array.from({ length: options.parallel }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const file = path.join(out, "matches", `${job.id}.json`);
        try {
          const saved = (await readJson(file)) as (Replay & { runHash: string }) | null;
          if (saved) {
            if (
              saved.runHash !== runHash ||
              saved.seed !== job.seed ||
              JSON.stringify(saved.fighters) !== JSON.stringify(job.fighters)
            )
              throw new Error("Saved match belongs to a different run");
            verifyReplay(saved);
            completed.set(job.id, saved);
            continue;
          }
          const configs = job.fighters.map((id) => fighters.find((f) => f.id === id)!) as [
            FighterConfig,
            FighterConfig,
          ];
          const policies = configs.map((f) =>
            createPolicy(
              modelById(f.model),
              job.seed ^ [...f.id].reduce((s, c) => s + c.charCodeAt(0), 0),
              budget,
            ),
          ) as Parameters<typeof playMatch>[3];
          const signal = AbortSignal.any([
            options.signal ?? new AbortController().signal,
            AbortSignal.timeout(60 * 60_000),
          ]);
          const replay = await playMatch(job.id, job.seed, configs, policies, signal);
          await atomicJson(file, { ...replay, runHash });
          completed.set(job.id, replay);
          console.log(`${completed.size}/${jobs.length} ${job.id}`);
        } catch (error) {
          failures[job.id] = error instanceof Error ? error.message : "Match failed";
        }
        await progress();
      }
    }),
  );
  await progress();
  if (completed.size !== jobs.length)
    throw new Error(
      `Incomplete: ${completed.size}/${jobs.length}. Fix errors and resume the same command; no ratings published.`,
    );
  const matches = jobs.map((job) => completed.get(job.id)!);
  for (const fighter of fighters) {
    const versions = new Set(
      matches
        .filter((m) => m.fighters.includes(fighter.id))
        .map((m) => m.resolvedModels[m.fighters.indexOf(fighter.id)]),
    );
    if (versions.size !== 1)
      throw new Error(`Provider version changed across the cohort: ${fighter.id}`);
  }
  const ratings = bradleyTerry(
    fighters.map((f) => f.id),
    matches.map((m) => ({
      a: m.fighters[0],
      b: m.fighters[1],
      score: m.winner === null ? 0.5 : m.winner === 0 ? 1 : 0,
    })),
  );
  const rows = fighters
    .map((f) => {
      const own = matches.filter((m) => m.fighters.includes(f.id));
      const w = own.filter((m) => m.winner !== null && m.fighters[m.winner] === f.id).length;
      const d = own.filter((m) => m.winner === null).length;
      return {
        ...f,
        elo: Math.round(ratings[f.id]),
        w,
        l: own.length - w - d,
        d,
        games: own.length,
      };
    })
    .sort((a, b) => b.elo - a.elo);
  const board = {
    runHash,
    fighters: rows,
    matches: matches.map((m) => ({
      id: m.id,
      fighters: m.fighters,
      winner: m.winner,
      wins: m.wins,
    })),
  };
  await atomicJson(path.join(out, "board.json"), board);
  return board;
}

/** One writer owns a run directory; never race two resumptions. */
export async function runTournament(options: Parameters<typeof runTournamentUnlocked>[0]) {
  const root = path.resolve(options.out);
  await mkdir(root, { recursive: true });
  const lockFile = path.join(root, ".runner.lock");
  let lock;
  try {
    lock = await open(lockFile, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "Run directory is locked. Stop its runner before resuming; inspect .runner.lock if a process crashed.",
      );
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await lock.close();
    return await runTournamentUnlocked(options);
  } finally {
    await lock.close();
    await unlink(lockFile);
  }
}
