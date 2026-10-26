// A small deterministic 2D fighting game. Integer math only and no randomness, so a match replays
// bit for bit from its list of decisions, in Node (the tournament runner) and in the browser (the replay).

export const MOVES = [
  "walk_forward",
  "walk_back",
  "jump_kick",
  "crouch",
  "block",
  "light_punch",
  "heavy_punch",
  "kick",
  "sweep",
  "fireball",
] as const;
export type Move = (typeof MOVES)[number];
export type Side = 0 | 1;

export const TICKS_PER_SECOND = 60;
export const DECISION_TICKS = 15; // four decisions per second of game time
export const ROUND_TICKS = 60 * TICKS_PER_SECOND;
export const ROUNDS_TO_WIN = 2;
export const MAX_ROUNDS = 5; // drawn rounds can push a match past three
export const MAX_HP = 100;
export const STAGE_LEFT = 40;
export const STAGE_RIGHT = 920;
export const MIN_GAP = 56;
export const START_GAP = 300;
export const ROUND_PAUSE = 90;

const WALK_FORWARD = 4;
const WALK_BACK = 3;
const JUMP_VY = 15;
const JUMP_VX = 4;
const JUMP_KICK_FROM = 12; // airborne ticks before the kick comes out
const JUMP_KICK_RANGE = 84;
const LANDING = 6;
const FIREBALL_STARTUP = 12;
const FIREBALL_RECOVERY = 18;
const FIREBALL_SPEED = 7;
export const FIREBALL_COOLDOWN = 150;
const BODY = 30; // half width of a fighter

export type Height = "high" | "mid" | "low" | "overhead";
export type AttackSpec = {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  chip: number;
  range: number;
  height: Height;
  hitstun: number;
  blockstun: number;
  knockdown?: boolean;
};

export const ATTACKS: Record<"light_punch" | "heavy_punch" | "kick" | "sweep", AttackSpec> = {
  light_punch: {
    startup: 3,
    active: 3,
    recovery: 7,
    damage: 4,
    chip: 0,
    range: 78,
    height: "high",
    hitstun: 14,
    blockstun: 9,
  },
  heavy_punch: {
    startup: 8,
    active: 4,
    recovery: 16,
    damage: 10,
    chip: 1,
    range: 88,
    height: "high",
    hitstun: 22,
    blockstun: 14,
  },
  kick: {
    startup: 6,
    active: 4,
    recovery: 13,
    damage: 7,
    chip: 0,
    range: 106,
    height: "mid",
    hitstun: 18,
    blockstun: 11,
  },
  sweep: {
    startup: 7,
    active: 4,
    recovery: 18,
    damage: 8,
    chip: 0,
    range: 112,
    height: "low",
    hitstun: 40,
    blockstun: 12,
    knockdown: true,
  },
};
export const JUMP_KICK: AttackSpec = {
  startup: JUMP_KICK_FROM,
  active: 0,
  recovery: LANDING,
  damage: 9,
  chip: 0,
  range: JUMP_KICK_RANGE,
  height: "overhead",
  hitstun: 18,
  blockstun: 10,
};
export const FIREBALL: AttackSpec = {
  startup: FIREBALL_STARTUP,
  active: 0,
  recovery: FIREBALL_RECOVERY,
  damage: 9,
  chip: 2,
  range: 0,
  height: "high",
  hitstun: 20,
  blockstun: 14,
};

export type Act =
  | "idle"
  | "walk_forward"
  | "walk_back"
  | "crouch"
  | "block"
  | "jump_kick"
  | "land"
  | "light_punch"
  | "heavy_punch"
  | "kick"
  | "sweep"
  | "fireball";
export type Stun = "hit" | "block" | "down" | null;

export type Fighter = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  act: Act;
  t: number; // current action and ticks spent in it
  stun: number;
  stunKind: Stun;
  guard: "stand" | "crouch" | null;
  hit: boolean; // the current attack already connected
  cd: number; // fireball cooldown
  intent: Move | null; // last decision; attacks are consumed when they start
  facing: 1 | -1;
};
export type Fireball = { owner: Side; x: number; dir: 1 | -1 };
export type Spark = { x: number; y: number; kind: "hit" | "block"; life: number };
export type RoundResult = {
  winner: Side | null;
  reason: "ko" | "time" | "double_ko";
  hp: [number, number];
  ticks: number;
};

export type GameState = {
  seed: number;
  tick: number; // global, keeps counting through pauses
  round: number; // 1-based
  roundTick: number;
  pause: number; // ticks left in the between-rounds pause
  fighters: [Fighter, Fighter];
  fireballs: Fireball[];
  sparks: Spark[];
  wins: [number, number];
  rounds: RoundResult[];
  over: boolean;
  winner: Side | null;
};

const newFighter = (x: number, facing: 1 | -1): Fighter => ({
  x,
  y: 0,
  vx: 0,
  vy: 0,
  hp: MAX_HP,
  act: "idle",
  t: 0,
  stun: 0,
  stunKind: null,
  guard: null,
  hit: false,
  cd: 0,
  intent: null,
  facing,
});

// Seed 0 is the textbook start: centre stage, START_GAP apart. Other seeds move the start around a little,
// different every round, so that two deterministic models do not replay the same fight in every match.
function resetRound(s: GameState) {
  const mix = s.seed === 0 ? 0 : (Math.imul(s.seed, 2654435761) ^ Math.imul(s.round, 40503)) >>> 0;
  const gap = mix === 0 ? START_GAP : 180 + (mix % 6) * 50;
  const mid = (STAGE_LEFT + STAGE_RIGHT) / 2 + (mix === 0 ? 0 : (((mix >>> 8) % 7) - 3) * 50);
  s.fighters = [newFighter(mid - gap / 2, 1), newFighter(mid + gap / 2, -1)];
  s.fireballs = [];
  s.sparks = [];
  s.roundTick = 0;
}

export function newGame(seed = 0): GameState {
  const s = {
    seed,
    tick: 0,
    round: 1,
    roundTick: 0,
    pause: 0,
    fighters: [newFighter(0, 1), newFighter(0, -1)],
    fireballs: [],
    sparks: [],
    wins: [0, 0],
    rounds: [],
    over: false,
    winner: null,
  } as GameState;
  resetRound(s);
  return s;
}

export const cloneState = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;

export const needsDecision = (s: GameState) =>
  !s.over && s.pause === 0 && s.roundTick % DECISION_TICKS === 0;

// Real time: one fighter changes its mind on any tick.
export function setIntent(s: GameState, side: Side, move: Move | null) {
  s.fighters[side].intent = move;
}

export function applyDecisions(s: GameState, moves: [Move | null, Move | null]) {
  s.fighters[0].intent = moves[0];
  s.fighters[1].intent = moves[1];
}

export const isAttack = (act: Act): act is keyof typeof ATTACKS => act in ATTACKS;
export const airborne = (f: Fighter) => f.y > 0 || f.act === "jump_kick";
export const busy = (f: Fighter) =>
  f.stun > 0 ||
  isAttack(f.act) ||
  f.act === "fireball" ||
  f.act === "jump_kick" ||
  f.act === "land";

// How many more ticks the fighter is locked into its current action or stun.
export function lockedFor(f: Fighter): number {
  if (f.stun > 0) return f.stun;
  if (isAttack(f.act)) {
    const a = ATTACKS[f.act];
    return a.startup + a.active + a.recovery - f.t;
  }
  if (f.act === "fireball") return FIREBALL_STARTUP + FIREBALL_RECOVERY - f.t;
  if (f.act === "jump_kick") return 2 * JUMP_VY + LANDING - f.t;
  if (f.act === "land") return LANDING - f.t;
  return 0;
}

export type Phase = "startup" | "active" | "recovery";
export function attackPhase(f: Fighter): Phase | null {
  if (isAttack(f.act)) {
    const a = ATTACKS[f.act];
    return f.t < a.startup ? "startup" : f.t < a.startup + a.active ? "active" : "recovery";
  }
  if (f.act === "fireball") return f.t < FIREBALL_STARTUP ? "startup" : "recovery";
  if (f.act === "jump_kick") return f.t < JUMP_KICK_FROM ? "startup" : "active";
  if (f.act === "land") return "recovery";
  return null;
}

function startIntent(f: Fighter) {
  const move = f.intent;
  f.guard = null;
  switch (move) {
    case null:
      f.act = "idle";
      return;
    case "walk_forward":
      f.act = "walk_forward";
      f.x += WALK_FORWARD * f.facing;
      return;
    case "walk_back":
      f.act = "walk_back";
      f.x -= WALK_BACK * f.facing;
      return;
    case "crouch":
      f.act = "crouch";
      f.guard = "crouch";
      return;
    case "block":
      f.act = "block";
      f.guard = "stand";
      return;
    case "jump_kick":
      f.act = "jump_kick";
      f.t = 0;
      f.hit = false;
      f.vy = JUMP_VY;
      f.vx = JUMP_VX * f.facing;
      f.intent = null;
      return;
    case "fireball":
      f.intent = null;
      if (f.cd > 0) {
        f.act = "idle";
        return;
      }
      f.act = "fireball";
      f.t = 0;
      f.cd = FIREBALL_COOLDOWN;
      return;
    default:
      f.act = move;
      f.t = 0;
      f.hit = false;
      f.intent = null;
  }
}

function advance(f: Fighter, side: Side, s: GameState) {
  if (f.cd > 0) f.cd--;
  if (f.stun > 0) {
    f.stun--;
    if (f.stun === 0) {
      f.stunKind = null;
      f.act = "idle";
    }
    return;
  }
  if (f.act === "jump_kick") {
    f.t++;
    f.x += f.vx;
    f.y += f.vy;
    f.vy--;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      f.vx = 0;
      f.act = "land";
      f.t = 0;
    }
    return;
  }
  if (f.act === "land") {
    if (++f.t >= LANDING) {
      f.act = "idle";
      f.t = 0;
      startIntent(f);
    }
    return;
  }
  if (f.act === "fireball") {
    f.t++;
    if (f.t === FIREBALL_STARTUP)
      s.fireballs.push({ owner: side, x: f.x + f.facing * (BODY + 12), dir: f.facing });
    if (f.t >= FIREBALL_STARTUP + FIREBALL_RECOVERY) {
      f.act = "idle";
      f.t = 0;
      startIntent(f);
    }
    return;
  }
  if (isAttack(f.act)) {
    const a = ATTACKS[f.act];
    if (++f.t >= a.startup + a.active + a.recovery) {
      f.act = "idle";
      f.t = 0;
      startIntent(f);
    }
    return;
  }
  startIntent(f);
}

type Hit = { attacker: Side; spec: AttackSpec; x: number; y: number };

// Whether a strike of this height lands on the defender, is blocked, or misses them altogether.
function contact(height: Height, d: Fighter): "hit" | "block" | "miss" {
  if (airborne(d)) return height === "low" ? "miss" : "hit";
  const guard = d.stun > 0 ? (d.stunKind === "block" ? d.guard : null) : d.guard;
  if (guard === "crouch") return height === "high" ? "miss" : height === "low" ? "block" : "hit";
  if (guard === "stand") return height === "low" ? "hit" : "block";
  return "hit";
}

function land(s: GameState, h: Hit, outcome: "hit" | "block") {
  const d = s.fighters[(1 - h.attacker) as Side];
  const a = s.fighters[h.attacker];
  const push = outcome === "hit" ? 24 : 14;
  if (outcome === "hit") {
    d.hp = Math.max(0, d.hp - h.spec.damage);
    d.stun = h.spec.hitstun;
    d.stunKind = h.spec.knockdown ? "down" : "hit";
    d.guard = null;
  } else {
    d.hp = Math.max(0, d.hp - h.spec.chip);
    d.stun = h.spec.blockstun;
    d.stunKind = "block";
  }
  // Getting hit cancels whatever the defender was doing, a jump included.
  if (outcome === "hit" && (d.act === "jump_kick" || d.y > 0)) {
    d.y = 0;
    d.vy = 0;
    d.vx = 0;
  }
  d.act = "idle";
  d.t = 0;
  d.x += push * a.facing;
  s.sparks.push({ x: h.x, y: h.y, kind: outcome, life: 10 });
}

function separate(s: GameState) {
  const [l, r] =
    s.fighters[0].x <= s.fighters[1].x
      ? [s.fighters[0], s.fighters[1]]
      : [s.fighters[1], s.fighters[0]];
  for (const f of s.fighters) f.x = Math.min(STAGE_RIGHT, Math.max(STAGE_LEFT, f.x));
  const gap = r.x - l.x;
  if (gap < MIN_GAP) {
    const need = MIN_GAP - gap;
    const left = Math.floor(need / 2);
    l.x -= left;
    r.x += need - left;
    if (l.x < STAGE_LEFT) {
      r.x += STAGE_LEFT - l.x;
      l.x = STAGE_LEFT;
    }
    if (r.x > STAGE_RIGHT) {
      l.x -= r.x - STAGE_RIGHT;
      r.x = STAGE_RIGHT;
    }
  }
}

function endRound(s: GameState, reason: RoundResult["reason"], winner: Side | null) {
  s.rounds.push({ winner, reason, hp: [s.fighters[0].hp, s.fighters[1].hp], ticks: s.roundTick });
  if (winner !== null) s.wins[winner]++;
  if (s.wins[0] >= ROUNDS_TO_WIN || s.wins[1] >= ROUNDS_TO_WIN || s.rounds.length >= MAX_ROUNDS) {
    s.over = true;
    s.winner = s.wins[0] === s.wins[1] ? null : s.wins[0] > s.wins[1] ? 0 : 1;
  }
  s.pause = ROUND_PAUSE;
}

export function step(s: GameState) {
  if (s.over) return;
  s.tick++;
  if (s.pause > 0) {
    s.sparks = s.sparks.filter((p) => --p.life > 0);
    if (--s.pause === 0) {
      s.round++;
      resetRound(s);
    }
    return;
  }
  const [f0, f1] = s.fighters;
  for (const [f, o] of [
    [f0, f1],
    [f1, f0],
  ] as const)
    if (!airborne(f) && f.stun === 0) f.facing = o.x >= f.x ? 1 : -1;
  advance(f0, 0, s);
  advance(f1, 1, s);
  separate(s);

  // Strikes resolve against the positions after movement; both sides can trade on the same tick.
  const hits: [Hit, "hit" | "block"][] = [];
  s.fighters.forEach((a, index) => {
    const side = index as Side;
    const d = s.fighters[(1 - side) as Side];
    const dist = Math.abs(d.x - a.x);
    if (a.hit || a.stun > 0) return;
    let spec: AttackSpec | null = null;
    if (isAttack(a.act) && attackPhase(a) === "active") spec = ATTACKS[a.act];
    if (a.act === "jump_kick" && a.t >= JUMP_KICK_FROM && a.vy <= 0) spec = JUMP_KICK;
    if (!spec || dist > spec.range) return;
    const outcome = contact(spec.height, d);
    if (outcome === "miss") return;
    a.hit = true;
    hits.push([
      {
        attacker: side,
        spec,
        x: (a.x + d.x) / 2,
        y: spec.height === "low" ? 18 : spec.height === "overhead" ? 120 : 80,
      },
      outcome,
    ]);
  });

  // Fireballs fly, cancel each other, and hit whoever they reach.
  const live: Fireball[] = [];
  for (const fb of s.fireballs) {
    fb.x += fb.dir * FIREBALL_SPEED;
    if (fb.x < STAGE_LEFT - 40 || fb.x > STAGE_RIGHT + 40) continue;
    const d = s.fighters[(1 - fb.owner) as Side];
    if (Math.abs(d.x - fb.x) <= BODY) {
      const outcome = d.y > 40 ? "miss" : contact(FIREBALL.height, d);
      if (outcome === "miss") {
        live.push(fb);
        continue;
      }
      hits.push([{ attacker: fb.owner, spec: FIREBALL, x: fb.x, y: 80 }, outcome]);
      continue;
    }
    live.push(fb);
  }
  s.fireballs = live.filter(
    (fb) =>
      !live.some(
        (other) =>
          other !== fb &&
          other.owner !== fb.owner &&
          Math.abs(other.x - fb.x) <= 2 * FIREBALL_SPEED,
      ),
  );
  for (const [h, outcome] of hits) land(s, h, outcome);
  separate(s);
  s.sparks = s.sparks.filter((p) => --p.life > 0);

  s.roundTick++;
  const [h0, h1] = [f0.hp, f1.hp];
  if (h0 === 0 || h1 === 0)
    endRound(
      s,
      h0 === 0 && h1 === 0 ? "double_ko" : "ko",
      h0 === 0 && h1 === 0 ? null : h0 === 0 ? 1 : 0,
    );
  else if (s.roundTick >= ROUND_TICKS) endRound(s, "time", h0 === h1 ? null : h0 > h1 ? 0 : 1);
}

// FNV-1a over the parts of the state that matter, to check that a replay matches the original match.
export function hashState(s: GameState): string {
  const text = JSON.stringify([
    s.tick,
    s.wins,
    s.rounds,
    s.fighters.map((f) => [f.x, f.y, f.hp, f.act, f.t, f.stun, f.cd]),
    s.fireballs,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Re-run a match from its decisions. `onDecision` sees the state at every decision point, before the moves apply.
export function replay(
  decisions: [Move | null, Move | null][],
  seed = 0,
  untilTick = Infinity,
  onDecision?: (s: GameState, index: number) => void,
): GameState {
  const s = newGame(seed);
  let next = 0;
  while (!s.over && s.tick < untilTick) {
    if (needsDecision(s)) {
      if (next >= decisions.length) break;
      onDecision?.(s, next);
      applyDecisions(s, decisions[next++]);
    }
    step(s);
  }
  return s;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
