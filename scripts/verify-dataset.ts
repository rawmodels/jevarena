import { createHash } from "node:crypto";
import { bradleyTerry } from "../src/core/elo";
import { verifyReplay } from "../src/core/match";
import { loadDataset } from "../src/server/storage";
import { tournamentJobs } from "../src/tournament/runner";
import type { MatchFile } from "../src/core/replay-types";

const dataset = await loadDataset();
const { manifest, board, validation } = dataset;
const expected = new Map(tournamentJobs(manifest.roster, 2).map((job) => [job.id, job]));
const summaries = new Map(board.matches.map((match) => [match.id, match]));
if (
  manifest.runHash !== board.runHash ||
  manifest.runHash !== validation.runHash ||
  manifest.roster.length !== 21 ||
  new Set(manifest.roster).size !== 21 ||
  board.fighters.length !== 21 ||
  new Set(board.fighters.map((f) => f.id)).size !== 21 ||
  board.matches.length !== 420 ||
  summaries.size !== 420 ||
  validation.files.length !== 420 ||
  new Set(validation.files.map((f) => f.id)).size !== 420
)
  throw new Error("Dataset cohort mismatch");
const replays: MatchFile[] = [];
for (const record of validation.files) {
  const raw = dataset.matches[record.id];
  if (!raw || createHash("sha256").update(raw).digest("hex") !== record.sha256)
    throw new Error(`Replay bytes changed: ${record.id}`);
  const replay = JSON.parse(raw) as MatchFile & { runHash: string };
  const job = expected.get(record.id),
    summary = summaries.get(record.id);
  if (
    !job ||
    !summary ||
    replay.id !== record.id ||
    replay.runHash !== manifest.runHash ||
    replay.seed !== job.seed ||
    JSON.stringify(replay.fighters) !== JSON.stringify(job.fighters) ||
    JSON.stringify(summary.fighters) !== JSON.stringify(replay.fighters) ||
    summary.winner !== replay.winner ||
    JSON.stringify(summary.wins) !== JSON.stringify(replay.wins)
  )
    throw new Error(`Replay metadata or summary mismatch: ${record.id}`);
  verifyReplay(replay);
  replays.push(replay);
}
const ratings = bradleyTerry(
  manifest.roster,
  replays.map((m) => ({
    a: m.fighters[0],
    b: m.fighters[1],
    score: m.winner === null ? 0.5 : m.winner === 0 ? 1 : 0,
  })),
);
for (const row of board.fighters) {
  const matches = replays.filter((m) => m.fighters.includes(row.id));
  const w = matches.filter((m) => m.winner !== null && m.fighters[m.winner] === row.id).length;
  const d = matches.filter((m) => m.winner === null).length;
  if (
    matches.length !== 40 ||
    row.w !== w ||
    row.d !== d ||
    row.l !== 40 - w - d ||
    row.elo !== Math.round(ratings[row.id])
  )
    throw new Error(`Rating mismatch: ${row.id}`);
}
console.log(
  "Verified 420 replay byte hashes, paired seeds, simulated results, board summaries and 21 ratings (40 games each).",
);
