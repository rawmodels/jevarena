// Steps a recorded match forward tick by tick, in either mode, and reports each decision as it applies,
// together with optional rendered state text. Full prompts, when recorded, live in Replay.observations.
import type { MatchFile } from "./replay-types";
import {
  type GameState,
  MOVES,
  type Move,
  type Side,
  applyDecisions,
  needsDecision,
  newGame,
  setIntent,
  step,
} from "./engine";

export type Applied = {
  side: Side;
  move: number;
  index: number;
  probs: number[] | null;
  ms: number;
  text: string | null;
  cd: number;
}; // cd: fireball cooldown when the move applied

export class Stepper {
  s: GameState;
  private next = 0;
  private asks: Map<number, Side[]> = new Map(); // ask tick -> sides asked on it (real-time mode)
  private told: [string[], string[]] = [[], []]; // texts of requests still in flight, oldest first
  constructor(
    private m: MatchFile,
    private describe?: (s: GameState, side: Side) => string,
  ) {
    this.s = newGame(m.seed);
    for (const [, side, , , ask] of m.ev ?? [])
      this.asks.set(ask, [...(this.asks.get(ask) ?? []), side]);
  }

  // One tick. Returns the decisions that applied on it, or null when the match is over or the log ran out.
  advance(): Applied[] | null {
    const { s, m } = this;
    if (s.over) return null;
    const applied: Applied[] = [];
    if (m.mode === "realtime") {
      if (this.describe)
        for (const side of this.asks.get(s.tick) ?? [])
          this.told[side].push(this.describe(s, side));
      const ev = m.ev ?? [];
      while (this.next < ev.length && ev[this.next][0] === s.tick) {
        const [, side, move, ms] = ev[this.next];
        setIntent(s, side, move >= 0 ? MOVES[move] : null);
        applied.push({
          side,
          move,
          index: this.next,
          probs: m.evp?.[this.next] ?? null,
          ms,
          text: this.told[side].shift() ?? null,
          cd: s.fighters[side].cd,
        });
        this.next++;
      }
    } else if (needsDecision(s)) {
      const row = m.d[this.next];
      if (!row) return null;
      for (const side of [0, 1] as Side[])
        applied.push({
          side,
          move: m.actions?.[this.next]?.[side] ?? row[side],
          index: this.next,
          probs: m.p[this.next]?.[side] ?? null,
          ms: m.ms[this.next]?.[side] ?? 0,
          text: this.describe?.(s, side) ?? null,
          cd: s.fighters[side].cd,
        });
      applyDecisions(s, row.map((i) => (i >= 0 ? MOVES[i] : null)) as [Move | null, Move | null]);
      this.next++;
    }
    step(s);
    return applied;
  }
}
