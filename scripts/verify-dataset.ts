import { createHash } from "node:crypto";
import { bradleyTerry } from "../src/core/elo";
import { verifyReplay } from "../src/core/match";
import { loadDataset } from "../src/server/storage";
const dataset = await loadDataset();
const { manifest, board, validation } = dataset;
if (
  manifest.runHash !== board.runHash ||
  manifest.runHash !== validation.runHash ||
  board.matches.length !== 420 ||
  validation.files.length !== 420
)
  throw new Error("Dataset cohort mismatch");
for (const record of validation.files) {
  const raw = dataset.matches[record.id];
  if (!raw || createHash("sha256").update(raw).digest("hex") !== record.sha256)
    throw new Error(`Replay bytes changed: ${record.id}`);
  verifyReplay(JSON.parse(raw));
}
const ratings = bradleyTerry(
  manifest.roster,
  board.matches.map((m) => ({
    a: m.fighters[0],
    b: m.fighters[1],
    score: m.winner === null ? 0.5 : m.winner === 0 ? 1 : 0,
  })),
);
for (const row of board.fighters) {
  const matches = board.matches.filter((m) => m.fighters.includes(row.id));
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
console.log("Verified 420 replay hashes, deterministic results, and 21 ratings (40 games each).");
