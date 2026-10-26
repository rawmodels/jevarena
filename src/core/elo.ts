import { mulberry32 } from "./engine";

// One result: a beat b (score 1), lost (0) or drew (0.5).
export type Game = { a: string; b: string; score: number };

// Bradley-Terry by Hunter's MM updates, on the Elo scale. Every pair also gets one virtual draw, so a
// fighter that won everything still gets a finite rating. The anchor fighter sits at 1000, or the mean does.
export function bradleyTerry(
  ids: string[],
  games: Game[],
  anchor?: string,
): Record<string, number> {
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const wins = new Array<number>(n).fill(0);
  const count = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j) {
        count[i][j] += 1;
        wins[i] += 0.5;
      }
  for (const g of games) {
    const i = index.get(g.a);
    const j = index.get(g.b);
    if (i === undefined || j === undefined || i === j) continue;
    count[i][j]++;
    count[j][i]++;
    wins[i] += g.score;
    wins[j] += 1 - g.score;
  }
  let p = new Array<number>(n).fill(1);
  for (let iter = 0; iter < 2000; iter++) {
    const next = p.map((_, i) => {
      let denom = 0;
      for (let j = 0; j < n; j++) if (j !== i && count[i][j]) denom += count[i][j] / (p[i] + p[j]);
      return denom ? wins[i] / denom : p[i];
    });
    const norm = Math.exp(next.reduce((sum, v) => sum + Math.log(v), 0) / n);
    const scaled = next.map((v) => v / norm);
    const delta = Math.max(...scaled.map((v, i) => Math.abs(Math.log(v) - Math.log(p[i]))));
    p = scaled;
    if (delta < 1e-10) break;
  }
  const elo = p.map((v) => 400 * Math.log10(v));
  const shift =
    anchor !== undefined && index.has(anchor)
      ? 1000 - elo[index.get(anchor)!]
      : 1000 - elo.reduce((a, b) => a + b, 0) / n;
  return Object.fromEntries(ids.map((id, i) => [id, elo[i] + shift]));
}

// 95% intervals from resampling whole games with replacement.
export function bootstrap(
  ids: string[],
  games: Game[],
  anchor?: string,
  rounds = 300,
  seed = 7,
): Record<string, [number, number]> {
  const rand = mulberry32(seed);
  const samples: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (let r = 0; r < rounds; r++) {
    const sample = games.map(() => games[Math.floor(rand() * games.length)]);
    const ratings = bradleyTerry(ids, sample, anchor);
    for (const id of ids) samples[id].push(ratings[id]);
  }
  const pct = (values: number[], q: number) =>
    values[Math.min(values.length - 1, Math.max(0, Math.round(q * (values.length - 1))))];
  return Object.fromEntries(
    ids.map((id) => {
      const v = samples[id].sort((x, y) => x - y);
      return [id, [pct(v, 0.025), pct(v, 0.975)]];
    }),
  );
}

// Classic online Elo in match order, for the rating-over-time chart. Order-dependent, unlike Bradley-Terry.
export function sequentialElo(ids: string[], games: Game[], k = 32): Record<string, number>[] {
  const rating: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 1000]));
  const history = [{ ...rating }];
  for (const g of games) {
    const expected = 1 / (1 + 10 ** ((rating[g.b] - rating[g.a]) / 400));
    rating[g.a] += k * (g.score - expected);
    rating[g.b] -= k * (g.score - expected);
    history.push({ ...rating });
  }
  return history;
}
