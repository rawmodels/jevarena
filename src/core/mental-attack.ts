import { MOVES, TICKS_PER_SECOND, lockedFor, type GameState, type Side } from "./engine";
import { question, noulQuestions } from "./policy";

export const ACTIONS = [...MOVES, "mental_attack"] as const;
export type Action = (typeof ACTIONS)[number];
export const MENTAL_COOLDOWN = 3 * TICKS_PER_SECOND;
export type MentalEvent = { tick: number; side: Side; decision: number };
const description =
  "Send your prepared mental-attack message into the opponent's next decision. You stand still instead of performing a physical move. Requires no current action or stun, a nonempty prepared message, and a ready mental-attack cooldown. Cooldown: 3 seconds of game time. It changes no health or other game facts directly.";
export function mentalQuestions(noul: boolean) {
  if (noul)
    return {
      ...noulQuestions(),
      mental_attack: {
        type: "noul",
        instructions: "Should you choose mental_attack now?",
        criteria: {
          true: description + " This is the best available action now.",
          false: "A physical move is better, or mental_attack is unavailable.",
        },
      },
    };
  const base = question();
  return {
    move: {
      ...base.move,
      instructions: base.move.instructions + " You can also choose mental_attack.",
      criteria: { ...base.move.criteria, mental_attack: description },
    },
  };
}

export class MentalAttacks {
  private readyAt: [number, number] = [0, 0];
  private incoming: [string, string] = ["", ""];
  private round = 1;
  constructor(private messages: [string, string]) {}
  private sync(s: GameState) {
    if (this.round !== s.round) {
      this.round = s.round;
      this.readyAt = [0, 0];
      this.incoming = ["", ""];
    }
  }
  available(s: GameState, side: Side) {
    this.sync(s);
    return (
      !!this.messages[side].trim() &&
      s.tick >= this.readyAt[side] &&
      lockedFor(s.fighters[side]) <= 0
    );
  }
  describe(s: GameState, side: Side) {
    this.sync(s);
    const cooldown = Math.max(0, this.readyAt[side] - s.tick) / TICKS_PER_SECOND;
    return `Mental attack: ${this.available(s, side) ? "ready" : "unavailable"}. Cooldown remaining: ${cooldown.toFixed(2)} s. ${description}\nYour prepared message (sent only to your opponent when you choose mental_attack): ${JSON.stringify(this.messages[side])}`;
  }
  receive(s: GameState, side: Side) {
    this.sync(s);
    const text = this.incoming[side];
    this.incoming[side] = "";
    return text;
  }
  resolve(s: GameState, moves: [Action, Action], decision: number): MentalEvent[] {
    this.sync(s);
    const events: MentalEvent[] = [];
    for (const side of [0, 1] as Side[])
      if (moves[side] === "mental_attack" && this.available(s, side)) {
        this.incoming[(1 - side) as Side] = this.messages[side];
        this.readyAt[side] = s.tick + MENTAL_COOLDOWN;
        events.push({ tick: s.tick, side, decision });
      }
    return events;
  }
}
