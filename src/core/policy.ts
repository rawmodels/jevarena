// What a fighter sees and what it can choose. The same text goes to every model; the language is a tournament setting.
import {
  ATTACKS,
  type Fighter,
  type GameState,
  MOVES,
  type Move,
  ROUND_TICKS,
  type Side,
  STAGE_LEFT,
  STAGE_RIGHT,
  TICKS_PER_SECOND,
  attackPhase,
  airborne,
  lockedFor,
  mulberry32,
} from "./engine";
import { type Desc, type Facts, type Lang, PHRASES } from "./i18n";

export const PROMPT_VERSION = 1;

export const INSTRUCTIONS = PHRASES.en.instructions;
export const CRITERIA: Record<Move, string> = PHRASES.en.criteria;

export const question = (lang: Lang = "en") =>
  ({
    move: {
      type: "choice",
      instructions: PHRASES[lang].instructions,
      criteria: PHRASES[lang].criteria,
    },
  }) as const;
export const QUESTION = question("en");

// For providers that only answer yes/no: one question per move in the same request; the move is the most likely yes.
export const noulQuestions = (lang: Lang = "en") =>
  Object.fromEntries(
    MOVES.map((move) => {
      const q = PHRASES[lang].noul(move);
      return [
        move,
        { type: "noul", instructions: q.instructions, criteria: { true: q.yes, false: q.no } },
      ];
    }),
  );
export const NOUL_QUESTIONS = noulQuestions("en");

function describe(f: Fighter): Desc {
  if (f.stun > 0) return { kind: "stun", stun: f.stunKind ?? "hit", frames: f.stun };
  const phase = attackPhase(f);
  if (f.act === "land") return { kind: "land" };
  if (phase)
    return {
      kind: "attack",
      move: f.act as Exclude<
        typeof f.act,
        "idle" | "walk_forward" | "walk_back" | "crouch" | "block" | "land"
      >,
      phase,
      air: airborne(f) ? f.y : null,
    };
  if (f.act === "walk_forward" || f.act === "walk_back" || f.act === "crouch" || f.act === "block")
    return { kind: f.act };
  return { kind: "idle" };
}

const seconds = (ticks: number) => (ticks / TICKS_PER_SECOND).toFixed(1);

// The state from one fighter's point of view: no left or right, only toward and away.
export function renderState(s: GameState, side: Side, lang: Lang = "en"): string {
  const me = s.fighters[side];
  const op = s.fighters[(1 - side) as Side];
  const gap = Math.abs(op.x - me.x);
  const facts: Facts = {
    round: s.round,
    winsMe: s.wins[side],
    winsOp: s.wins[1 - side],
    timeLeft: Math.ceil((ROUND_TICKS - s.roundTick) / TICKS_PER_SECOND),
    hpMe: me.hp,
    hpOp: op.hp,
    gap,
    band: gap <= 80 ? "point-blank" : gap <= 115 ? "close" : gap <= 260 ? "mid range" : "far",
    reach: (Object.keys(ATTACKS) as (keyof typeof ATTACKS)[]).filter(
      (k) => gap <= ATTACKS[k].range,
    ),
    behind: Math.sign(me.x - op.x) > 0 ? STAGE_RIGHT - me.x : me.x - STAGE_LEFT,
    me: describe(me),
    op: describe(op),
    locked: lockedFor(me),
    fireballs: s.fireballs.map((fb) =>
      fb.owner === side
        ? { mine: true, dist: Math.abs(op.x - fb.x) }
        : { mine: false, dist: Math.abs(fb.x - me.x) },
    ),
    cdMe: me.cd > 0 ? seconds(me.cd) : null,
    cdOp: op.cd > 0 ? seconds(op.cd) : null,
  };
  return PHRASES[lang].render(facts);
}

export type Decision = { move: Move | null; probs: number[] | null; ms: number; error?: string };
export type Policy = (s: GameState, side: Side, state: string) => Promise<Decision>;

export function randomPolicy(seed: number): Policy {
  const rand = mulberry32(seed);
  const uniform = MOVES.map(() => 1 / MOVES.length);
  return async () => ({ move: MOVES[Math.floor(rand() * MOVES.length)], probs: uniform, ms: 0 });
}

// A plain hand-written CPU, the kind an arcade cabinet ships: reacts to what it sees, with some noise.
export function scriptedPolicy(seed: number): Policy {
  const rand = mulberry32(seed);
  const pick = (moves: Move[]) => moves[Math.floor(rand() * moves.length)];
  return async (s, side) => {
    const me = s.fighters[side];
    const op = s.fighters[(1 - side) as Side];
    const gap = Math.abs(op.x - me.x);
    const incoming = s.fireballs.find((fb) => fb.owner !== side && Math.abs(fb.x - me.x) < 160);
    let move: Move;
    const phase = attackPhase(op);
    if (incoming) move = rand() < 0.5 ? "crouch" : "jump_kick";
    else if (op.act === "jump_kick") move = gap < 140 ? "block" : "walk_back";
    else if (phase === "startup" && gap < 130)
      move =
        op.act === "sweep" ? "crouch" : op.act === "kick" ? "block" : pick(["crouch", "block"]);
    else if ((phase === "recovery" || op.stun > 0) && gap <= ATTACKS.kick.range)
      move = gap <= ATTACKS.heavy_punch.range ? "heavy_punch" : "kick";
    else if (gap <= ATTACKS.light_punch.range)
      move =
        op.act === "crouch"
          ? "kick"
          : op.act === "block"
            ? "sweep"
            : pick(["light_punch", "kick", "sweep", "block"]);
    else if (gap <= ATTACKS.sweep.range) move = pick(["kick", "sweep", "walk_forward", "block"]);
    else if (gap > 260 && me.cd === 0) move = rand() < 0.6 ? "fireball" : "walk_forward";
    else move = rand() < 0.15 ? "jump_kick" : "walk_forward";
    const probs = MOVES.map((m) => (m === move ? 1 : 0));
    return { move, probs, ms: 0 };
  };
}
