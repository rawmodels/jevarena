// Draw selected character sprites over the arena. Physics remains entirely in core/engine.
// Third-party character artwork is attributed in ASSETS.md.
import {
  ATTACKS,
  type Fighter,
  type GameState,
  MAX_HP,
  ROUND_TICKS,
  TICKS_PER_SECOND,
  attackPhase,
  isAttack,
  lockedFor,
} from "../core/engine";

import { drawCharacterSprite, hasCharacterSprite, spriteFrame } from "./sprites";

export const VIEW_W = 960;
export const VIEW_H = 420;
const PIXEL = 3; // one buffer pixel = 3x3 view pixels
const BUF_W = VIEW_W / PIXEL;
const BUF_H = VIEW_H / PIXEL;
const FLOOR = 360; // world y of the floor line
const INK = "#1d1420";
const SKIN = "#e2a676";
const SKIN_DARK = "#b97c55";
const HAIR = "#2a1d1a";

// ---------- colour helpers ----------
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k))),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------- skeleton ----------
type Leg = { foot: [number, number] } | { thigh: number; shin: number };
type Pose = {
  hip: [number, number]; // hip position, x forward, y up from the floor
  torso: number; // degrees from vertical, positive leans toward the opponent
  head: number; // extra head tilt
  front: [number, number]; // near arm: upper arm and forearm angles, 0 = straight down, 90 = forward, 180 = up
  back: [number, number];
  frontLeg: Leg;
  backLeg: Leg;
};

const THIGH = 34;
const SHIN = 34;
const UPPER = 25;
const FORE = 23;
const TORSO = 46;

const IDLE: Pose = {
  hip: [0, 64],
  torso: 10,
  head: 0,
  front: [40, 140],
  back: [25, 125],
  frontLeg: { foot: [24, 0] },
  backLeg: { foot: [-26, 0] },
};
const POSES = {
  idle: IDLE,
  crouch: {
    hip: [2, 36],
    torso: 24,
    head: -10,
    front: [55, 160],
    back: [35, 150],
    frontLeg: { foot: [28, 0] },
    backLeg: { foot: [-26, 0] },
  },
  block: {
    hip: [-4, 62],
    torso: -6,
    head: 8,
    front: [95, 175],
    back: [80, 170],
    frontLeg: { foot: [22, 0] },
    backLeg: { foot: [-30, 0] },
  },
  crouchBlock: {
    hip: [-2, 36],
    torso: 14,
    head: 0,
    front: [95, 175],
    back: [80, 170],
    frontLeg: { foot: [26, 0] },
    backLeg: { foot: [-28, 0] },
  },
  jabWind: {
    hip: [2, 64],
    torso: 12,
    head: 0,
    front: [30, 120],
    back: [25, 130],
    frontLeg: { foot: [24, 0] },
    backLeg: { foot: [-26, 0] },
  },
  jab: {
    hip: [6, 64],
    torso: 16,
    head: 0,
    front: [90, 92],
    back: [25, 135],
    frontLeg: { foot: [28, 0] },
    backLeg: { foot: [-24, 0] },
  },
  heavyWind: {
    hip: [-6, 62],
    torso: -4,
    head: 0,
    front: [60, 150],
    back: [-30, 100],
    frontLeg: { foot: [20, 0] },
    backLeg: { foot: [-32, 0] },
  },
  heavy: {
    hip: [12, 60],
    torso: 26,
    head: 0,
    front: [40, 140],
    back: [92, 90],
    frontLeg: { foot: [34, 0] },
    backLeg: { foot: [-20, 0] },
  },
  kickWind: {
    hip: [-2, 64],
    torso: -8,
    head: 0,
    front: [60, 150],
    back: [30, 130],
    frontLeg: { thigh: 100, shin: 10 },
    backLeg: { foot: [-8, 0] },
  },
  kick: {
    hip: [0, 64],
    torso: -28,
    head: 10,
    front: [50, 140],
    back: [-20, 30],
    frontLeg: { thigh: 92, shin: 94 },
    backLeg: { foot: [-12, 0] },
  },
  sweepWind: {
    hip: [0, 30],
    torso: 30,
    head: -10,
    front: [70, 150],
    back: [20, 40],
    frontLeg: { foot: [26, 0] },
    backLeg: { foot: [-24, 0] },
  },
  sweep: {
    hip: [-4, 22],
    torso: 42,
    head: -15,
    front: [20, 10],
    back: [70, 150],
    frontLeg: { thigh: 86, shin: 93 },
    backLeg: { foot: [-6, 0] },
  },
  fireWind: {
    hip: [-6, 58],
    torso: 0,
    head: 0,
    front: [-35, 70],
    back: [-45, 60],
    frontLeg: { foot: [28, 0] },
    backLeg: { foot: [-32, 0] },
  },
  fire: {
    hip: [8, 58],
    torso: 22,
    head: 0,
    front: [88, 95],
    back: [82, 92],
    frontLeg: { foot: [36, 0] },
    backLeg: { foot: [-28, 0] },
  },
  jumpUp: {
    hip: [0, 62],
    torso: 8,
    head: 0,
    front: [60, 160],
    back: [30, 140],
    frontLeg: { thigh: 105, shin: -15 },
    backLeg: { thigh: 50, shin: -40 },
  },
  jumpKick: {
    hip: [0, 60],
    torso: -12,
    head: 6,
    front: [70, 160],
    back: [-10, 60],
    frontLeg: { thigh: 55, shin: 62 },
    backLeg: { thigh: 110, shin: -10 },
  },
  land: {
    hip: [0, 44],
    torso: 18,
    head: -5,
    front: [60, 150],
    back: [40, 140],
    frontLeg: { foot: [26, 0] },
    backLeg: { foot: [-28, 0] },
  },
  hit: {
    hip: [-10, 62],
    torso: -32,
    head: 25,
    front: [-30, -60],
    back: [-50, -80],
    frontLeg: { foot: [16, 0] },
    backLeg: { foot: [-30, 0] },
  },
  down: {
    hip: [-8, 10],
    torso: -96,
    head: 0,
    front: [-150, -150],
    back: [-120, -140],
    frontLeg: { thigh: 86, shin: 92 },
    backLeg: { thigh: 80, shin: 96 },
  },
  win: {
    hip: [0, 66],
    torso: 0,
    head: -8,
    front: [175, 180],
    back: [20, 120],
    frontLeg: { foot: [20, 0] },
    backLeg: { foot: [-20, 0] },
  },
} satisfies Record<string, Pose>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

function legPoints(hip: [number, number], leg: Leg): [[number, number], [number, number]] {
  if ("thigh" in leg) {
    const rad = (a: number) => (a * Math.PI) / 180;
    const knee: [number, number] = [
      hip[0] + THIGH * Math.sin(rad(leg.thigh)),
      hip[1] - THIGH * Math.cos(rad(leg.thigh)),
    ];
    return [
      knee,
      [knee[0] + SHIN * Math.sin(rad(leg.shin)), knee[1] - SHIN * Math.cos(rad(leg.shin))],
    ];
  }
  // Two-bone IK to a foot on the floor, knee bent toward the opponent.
  const [tx, ty] = leg.foot;
  const dx = tx - hip[0];
  const dy = ty - hip[1];
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d)));
  const a = base + bend;
  const knee: [number, number] = [hip[0] + THIGH * Math.cos(a), hip[1] + THIGH * Math.sin(a)];
  return [knee, [hip[0] + (dx / Math.hypot(dx, dy)) * d, hip[1] + (dy / Math.hypot(dx, dy)) * d]];
}

function legAngles(hip: [number, number], leg: Leg): { thigh: number; shin: number } {
  const [knee, foot] = legPoints(hip, leg);
  const angle = (from: [number, number], to: [number, number]) =>
    (Math.atan2(to[0] - from[0], -(to[1] - from[1])) * 180) / Math.PI;
  return { thigh: angle(hip, knee), shin: angle(knee, foot) };
}

// Blend two poses. Grounded feet blend as positions; anything mixed blends as joint angles.
function blend(a: Pose, b: Pose, t: number): Pose {
  const k = ease(Math.max(0, Math.min(1, t)));
  const hip: [number, number] = [lerp(a.hip[0], b.hip[0], k), lerp(a.hip[1], b.hip[1], k)];
  const leg = (la: Leg, lb: Leg): Leg => {
    if ("foot" in la && "foot" in lb)
      return { foot: [lerp(la.foot[0], lb.foot[0], k), lerp(la.foot[1], lb.foot[1], k)] };
    const x = legAngles(a.hip, la);
    const y = legAngles(b.hip, lb);
    return { thigh: lerp(x.thigh, y.thigh, k), shin: lerp(x.shin, y.shin, k) };
  };
  return {
    hip,
    torso: lerp(a.torso, b.torso, k),
    head: lerp(a.head, b.head, k),
    front: [lerp(a.front[0], b.front[0], k), lerp(a.front[1], b.front[1], k)],
    back: [lerp(a.back[0], b.back[0], k), lerp(a.back[1], b.back[1], k)],
    frontLeg: leg(a.frontLeg, b.frontLeg),
    backLeg: leg(a.backLeg, b.backLeg),
  };
}

function poseFor(f: Fighter, tick: number, s: GameState, side: number): Pose {
  const breathe = Math.sin(tick / 9) * 1.5;
  const withBreath = (p: Pose): Pose => ({ ...p, hip: [p.hip[0], p.hip[1] + breathe] });
  if (s.over && s.winner === side) return POSES.win;
  if (f.hp === 0 || (f.stun > 0 && f.stunKind === "down")) return POSES.down;
  if (f.stun > 0 && f.stunKind === "hit")
    return blend(POSES.hit, IDLE, 1 - Math.min(1, f.stun / 10));
  if (f.stun > 0 && f.stunKind === "block")
    return f.guard === "crouch" ? POSES.crouchBlock : POSES.block;
  if (f.act === "jump_kick") return attackPhase(f) === "active" ? POSES.jumpKick : POSES.jumpUp;
  if (f.act === "land") return blend(POSES.land, IDLE, f.t / 6);
  if (isAttack(f.act) || f.act === "fireball") {
    const spec = f.act === "fireball" ? { startup: 12, active: 6, recovery: 12 } : ATTACKS[f.act];
    const [wind, strike] = (
      {
        light_punch: [POSES.jabWind, POSES.jab],
        heavy_punch: [POSES.heavyWind, POSES.heavy],
        kick: [POSES.kickWind, POSES.kick],
        sweep: [POSES.sweepWind, POSES.sweep],
        fireball: [POSES.fireWind, POSES.fire],
      } as const
    )[f.act];
    if (f.t < spec.startup)
      return blend(f.act === "sweep" ? POSES.crouch : IDLE, wind, f.t / spec.startup + 0.25);
    if (f.t < spec.startup + spec.active) return blend(wind, strike, (f.t - spec.startup + 1) / 2);
    const rest = f.act === "sweep" ? POSES.crouch : IDLE;
    return blend(
      strike,
      rest,
      (f.t - spec.startup - spec.active) /
        Math.max(1, lockedFor(f) + f.t - spec.startup - spec.active),
    );
  }
  if (f.act === "crouch") return POSES.crouch;
  if (f.act === "block") return POSES.block;
  if (f.act === "walk_forward" || f.act === "walk_back") {
    const phase = Math.sin(tick / 4);
    return {
      ...IDLE,
      hip: [IDLE.hip[0], IDLE.hip[1] + Math.abs(phase) * 2],
      frontLeg: { foot: [24 + phase * 12, Math.max(0, phase) * 6] },
      backLeg: { foot: [-26 - phase * 12, Math.max(0, -phase) * 6] },
    };
  }
  return withBreath(IDLE);
}

// ---------- drawing a fighter ----------
type Look = { gi: string; trim: string; band: string; character?: string };

function limb(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  width: number,
  color: string,
) {
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.moveTo(from[0], -from[1]);
  ctx.lineTo(to[0], -to[1]);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from[0], -from[1]);
  ctx.lineTo(to[0], -to[1]);
  ctx.stroke();
}

function blob(ctx: CanvasRenderingContext2D, at: [number, number], r: number, color: string) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(at[0], -at[1], r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(at[0], -at[1], r, 0, Math.PI * 2);
  ctx.fill();
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  look: Look,
  p: Pose,
  tick: number,
  flash: boolean,
) {
  const rad = (a: number) => (a * Math.PI) / 180;
  const at = (o: [number, number], len: number, angle: number): [number, number] => [
    o[0] + len * Math.sin(rad(angle)),
    o[1] - len * Math.cos(rad(angle)),
  ];
  const hip = p.hip;
  const neck = at(hip, TORSO, 180 + p.torso);
  const shoulderF: [number, number] = [neck[0] + 2, neck[1] - 6];
  const shoulderB: [number, number] = [neck[0] - 4, neck[1] - 6];
  const giBack = shade(look.gi, 0.7);
  const skinBack = SKIN_DARK;

  ctx.save();
  ctx.translate(f.x, FLOOR - f.y);
  ctx.scale(f.facing, 1);
  if (flash) ctx.filter = "brightness(1.8)";

  // back limbs, darker
  const [bKnee, bFoot] = legPoints(hip, p.backLeg);
  limb(ctx, hip, bKnee, 15, giBack);
  limb(ctx, bKnee, bFoot, 13, giBack);
  blob(ctx, [bFoot[0] + 4, bFoot[1] + 2], 5, skinBack);
  const bElbow = at(shoulderB, UPPER, p.back[0]);
  const bHand = at(bElbow, FORE, p.back[1]);
  limb(ctx, shoulderB, bElbow, 11, giBack);
  limb(ctx, bElbow, bHand, 9, skinBack);
  blob(ctx, bHand, 6, SKIN_DARK);
  blob(ctx, [bHand[0], bHand[1]], 3, "#e8e0d0");

  // torso: gi jacket with an open collar and a belt
  ctx.save();
  ctx.translate(hip[0], -hip[1]);
  ctx.rotate(rad(p.torso));
  ctx.fillStyle = INK;
  ctx.fillRect(-15.5, -TORSO - 5.5, 31, TORSO + 13);
  ctx.fillStyle = look.gi;
  ctx.fillRect(-14, -TORSO - 4, 28, TORSO + 10);
  ctx.fillStyle = shade(look.gi, 1.25);
  ctx.fillRect(4, -TORSO - 4, 8, TORSO + 4);
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.moveTo(-5, -TORSO - 4);
  ctx.lineTo(9, -TORSO - 4);
  ctx.lineTo(2, -TORSO + 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(-15, -4, 30, 7);
  ctx.fillStyle = look.trim;
  ctx.fillRect(-14, -3, 28, 5);
  ctx.fillRect(-12, 2, 4, 10);
  ctx.fillRect(-6, 2, 4, 8);
  ctx.restore();

  // Original costumes share the articulated animation rig.
  if (look.character) {
    ctx.save();
    ctx.translate(hip[0], -hip[1]);
    ctx.rotate(rad(p.torso));
    ctx.fillStyle = look.character === "ship-it-sam" ? "#e8dfcf" : look.gi;
    ctx.fillRect(-14, -TORSO - 4, 28, TORSO + 9);
    ctx.fillStyle = look.band;
    ctx.fillRect(-1, -TORSO + 2, 2, TORSO - 2);
    if (look.character === "leather-jacket") {
      ctx.strokeStyle = "#a4b3b9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, -TORSO + 3);
      ctx.lineTo(5, -18);
      ctx.lineTo(7, 3);
      ctx.stroke();
      ctx.fillStyle = "#93f14a";
      ctx.fillRect(6, -30, 6, 4);
    }
    if (look.character === "ship-it-sam") {
      ctx.fillStyle = "#e06b53";
      ctx.fillRect(-6, -35, 12, 4);
    }
    if (look.character === "safety-monk") {
      ctx.fillStyle = "#edc47e";
      for (let i = 0; i < 5; i++) ctx.fillRect(-10 + i * 4, -32 + Math.abs(2 - i) * -3, 3, 4);
    }
    ctx.restore();
  }

  // head with hair and a headband whose tails trail behind
  const head = at(neck, 12, 180 + p.torso + p.head);
  const flutter = Math.sin(tick / 3) * 4;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(head[0] - 8, -head[1] - 5);
  ctx.lineTo(head[0] - 22, -head[1] - 2 + flutter);
  ctx.stroke();
  ctx.strokeStyle = look.band;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(head[0] - 8, -head[1] - 5);
  ctx.lineTo(head[0] - 22, -head[1] - 2 + flutter);
  ctx.stroke();
  blob(ctx, head, 11, SKIN);
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.arc(head[0] - 1, -head[1] - 2, 11, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.fillStyle = look.band;
  ctx.fillRect(head[0] - 11, -head[1] - 6, 22, 4);
  ctx.fillStyle = INK;
  ctx.fillRect(head[0] + 4, -head[1] - 1, 3, 3);
  ctx.fillRect(head[0] + 3, -head[1] + 5, 5, 1.5);

  if (look.character) {
    const hx = head[0],
      hy = -head[1];
    const lizard = look.character === "metaverse-lizard";
    blob(
      ctx,
      head,
      16,
      lizard ? "#93ba75" : look.character === "search-goblin" ? "#c99b70" : "#e6b18c",
    );
    ctx.fillStyle =
      look.character === "leather-jacket"
        ? "#bdc6c9"
        : look.character === "ship-it-sam"
          ? "#6e4438"
          : "#302c35";
    if (!lizard && look.character !== "safety-monk") {
      ctx.beginPath();
      ctx.arc(hx - 2, hy - 4, 15, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (look.character === "search-goblin") {
      ctx.fillStyle = "#c99b70";
      ctx.beginPath();
      ctx.moveTo(hx - 12, hy - 5);
      ctx.lineTo(hx - 28, hy - 10);
      ctx.lineTo(hx - 14, hy + 5);
      ctx.fill();
      ctx.fillStyle = "#36c9cf";
      ctx.fillRect(hx - 13, hy - 4, 28, 6);
    }
    if (lizard) {
      ctx.fillStyle = "#415c3b";
      ctx.fillRect(hx - 15, hy - 7, 29, 10);
      ctx.fillStyle = "#bb9bff";
      ctx.fillRect(hx - 11, hy - 5, 21, 5);
    } else {
      ctx.fillStyle = INK;
      ctx.fillRect(hx + 4, hy - 1, 3, 3);
      ctx.fillRect(hx + 2, hy + 8, 7, 2);
    }
    if (look.character === "leather-jacket") {
      ctx.fillStyle = "#242b31";
      ctx.fillRect(hx - 8, hy - 3, 23, 4);
    }
  }

  // front limbs
  const [fKnee, fFoot] = legPoints(hip, p.frontLeg);
  limb(ctx, hip, fKnee, 15, look.gi);
  limb(ctx, fKnee, fFoot, 13, look.gi);
  blob(ctx, [fFoot[0] + 4, fFoot[1] + 2], 5, SKIN);
  const fElbow = at(shoulderF, UPPER, p.front[0]);
  const fHand = at(fElbow, FORE, p.front[1]);
  limb(ctx, shoulderF, fElbow, 11, look.gi);
  limb(ctx, fElbow, fHand, 9, SKIN);
  blob(ctx, fHand, 6.5, SKIN);
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(fHand[0] - 6, -fHand[1] + 1, 12, 3);
  ctx.restore();
}

// ---------- stage ----------
function drawStage(ctx: CanvasRenderingContext2D, camX: number, tick: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
  sky.addColorStop(0, "#2d1b47");
  sky.addColorStop(0.45, "#8a3b5c");
  sky.addColorStop(0.8, "#e0714a");
  sky.addColorStop(1, "#f6b25f");
  ctx.fillStyle = sky;
  ctx.fillRect(-200, -200, VIEW_W + 400, FLOOR + 200);
  // sun, far parallax
  const par = (k: number) => camX * (1 - k);
  ctx.fillStyle = "#ffd98a";
  ctx.beginPath();
  ctx.arc(560 + par(0.15), FLOOR - 120, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,217,138,.35)";
  ctx.beginPath();
  ctx.arc(560 + par(0.15), FLOOR - 120, 92, 0, Math.PI * 2);
  ctx.fill();
  // mountains
  ctx.fillStyle = "#5b2e55";
  ctx.beginPath();
  ctx.moveTo(-200 + par(0.3), FLOOR - 70);
  for (let x = -200; x <= VIEW_W + 300; x += 60)
    ctx.lineTo(
      x + par(0.3),
      FLOOR - 110 - 50 * Math.abs(Math.sin(x / 130)) - 25 * Math.abs(Math.sin(x / 47)),
    );
  ctx.lineTo(VIEW_W + 300 + par(0.3), FLOOR - 70);
  ctx.closePath();
  ctx.fill();
  // temple wall with lanterns and a crowd
  const wall = par(0.6);
  ctx.fillStyle = "#3a1d3b";
  ctx.fillRect(-200 + wall, FLOOR - 92, VIEW_W + 500, 92);
  ctx.fillStyle = "#2a1430";
  for (let x = -200; x < VIEW_W + 300; x += 120) ctx.fillRect(x + wall, FLOOR - 104, 14, 104);
  ctx.fillStyle = "#4a2648";
  ctx.fillRect(-200 + wall, FLOOR - 108, VIEW_W + 500, 10);
  for (let i = 0; i < 26; i++) {
    const x = -160 + i * 46 + wall;
    const bob = Math.abs(Math.sin(tick / 7 + i * 1.7)) * 4;
    ctx.fillStyle = i % 3 ? "#24112a" : "#2f1734";
    ctx.beginPath();
    ctx.arc(x, FLOOR - 96 - bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 11, FLOOR - 90 - bob, 22, 24);
  }
  for (let x = -140; x < VIEW_W + 300; x += 240) {
    ctx.fillStyle = "#ff8a3d";
    ctx.fillRect(x + wall - 8, FLOOR - 150, 16, 20);
    ctx.fillStyle = "rgba(255,170,90,.25)";
    ctx.beginPath();
    ctx.arc(x + wall, FLOOR - 140, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillRect(x + wall - 1, FLOOR - 160, 2, 10);
  }
  // wooden floor
  const floor = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 140);
  floor.addColorStop(0, "#9a5a32");
  floor.addColorStop(1, "#5e3420");
  ctx.fillStyle = floor;
  ctx.fillRect(-200, FLOOR, VIEW_W + 400, 160);
  ctx.strokeStyle = "rgba(40,18,10,.45)";
  ctx.lineWidth = 2;
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + i * 60, FLOOR);
    ctx.lineTo(VIEW_W / 2 + i * 150, FLOOR + 160);
    ctx.stroke();
  }
  for (const y of [18, 44, 80, 126]) {
    ctx.beginPath();
    ctx.moveTo(-200, FLOOR + y);
    ctx.lineTo(VIEW_W + 200, FLOOR + y);
    ctx.stroke();
  }
  ctx.fillStyle = "#c98a52";
  ctx.fillRect(-200, FLOOR, VIEW_W + 400, 3);
}

function drawDataCenter(ctx: CanvasRenderingContext2D, camX: number, tick: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
  sky.addColorStop(0, "#0e182c");
  sky.addColorStop(1, "#35566c");
  ctx.fillStyle = sky;
  ctx.fillRect(-200, -200, 1500, 800);
  const parallax = camX * 0.6;
  ctx.strokeStyle = "#5a7487";
  ctx.lineWidth = 5;
  for (let x = -100; x < 1300; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x + parallax, 30);
    ctx.lineTo(x + 70 + parallax, FLOOR);
    ctx.stroke();
    ctx.fillStyle = "#182b40";
    ctx.fillRect(x + parallax, 150, 100, 210);
    ctx.fillStyle = "#0c1828";
    ctx.fillRect(x + parallax + 5, 156, 90, 198);
    for (let y = 165; y < 350; y += 16) {
      ctx.fillStyle = "#294356";
      ctx.fillRect(x + parallax + 10, y, 79, 10);
      ctx.fillStyle = Math.floor(tick / 12 + x + y) % 3 ? "#4db9b4" : "#c8ee64";
      ctx.fillRect(x + parallax + 14, y + 3, 4, 3);
      ctx.fillRect(x + parallax + 23, y + 3, 3, 3);
    }
  }
  ctx.strokeStyle = "#78919b";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-200, 115);
  ctx.lineTo(1300, 115);
  ctx.stroke();
  ctx.strokeStyle = "#162b42";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-200, 122);
  ctx.lineTo(1300, 122);
  ctx.stroke();
  ctx.fillStyle = "#bed3c6";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("INFERENCE FLOOR / NO RUNNING IN THE CLUSTER", 480 + parallax, 85);
  const floor = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 100);
  floor.addColorStop(0, "#687a7d");
  floor.addColorStop(1, "#263a49");
  ctx.fillStyle = floor;
  ctx.fillRect(-200, FLOOR, 1500, 180);
  ctx.strokeStyle = "#273c4c";
  ctx.lineWidth = 2;
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(480 + i * 65, FLOOR);
    ctx.lineTo(480 + i * 150, FLOOR + 160);
    ctx.stroke();
  }
  for (const y of [14, 35, 65, 105]) {
    ctx.beginPath();
    ctx.moveTo(-200, FLOOR + y);
    ctx.lineTo(1300, FLOOR + y);
    ctx.stroke();
  }
  ctx.fillStyle = "#b9d254";
  for (let x = -200; x < 1300; x += 30) ctx.fillRect(x, FLOOR + 1, 17, 3);
}

function drawFireball(
  ctx: CanvasRenderingContext2D,
  x: number,
  dir: number,
  color: string,
  tick: number,
) {
  const y = FLOOR - 86;
  for (let i = 5; i >= 1; i--) {
    ctx.globalAlpha = 0.12 * (6 - i);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - dir * i * 9, y + Math.sin(tick / 2 + i) * 3, 13 - i, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 1.6);
  ctx.beginPath();
  ctx.arc(x + dir * 3, y, 9 + Math.sin(tick) * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fffbe8";
  ctx.beginPath();
  ctx.arc(x + dir * 5, y - 1, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: "hit" | "block",
  life: number,
) {
  const age = 10 - life;
  const r = 10 + age * 4;
  ctx.save();
  ctx.translate(x, FLOOR - y);
  ctx.fillStyle = kind === "hit" ? "#fff3a8" : "#bfe9ff";
  ctx.strokeStyle = kind === "hit" ? "#ff6a2a" : "#3b8fd1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r * 0.4 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.globalAlpha = Math.min(1, life / 5);
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------- HUD, drawn crisp at full resolution ----------
function bar(ctx: CanvasRenderingContext2D, x: number, hp: number, mirror: boolean, tick: number) {
  const w = 360;
  const y = 22;
  const h = 20;
  ctx.fillStyle = INK;
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = "#b8202b";
  ctx.fillRect(x, y, w, h);
  const fill = Math.round((w * hp) / MAX_HP);
  const low = hp <= 25 && Math.floor(tick / 8) % 2 === 0;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, low ? "#ffe9a8" : "#fff1a0");
  g.addColorStop(0.5, low ? "#ffb347" : "#f7c531");
  g.addColorStop(1, "#d79a12");
  ctx.fillStyle = g;
  ctx.fillRect(mirror ? x + w - fill : x, y, fill, h);
  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.fillRect(x, y + 2, w, 3);
}

function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string | CanvasGradient,
  align: CanvasTextAlign = "center",
) {
  ctx.font = `italic 900 ${size}px 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size / 6);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function hud(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  names: [string, string],
  colors: [string, string],
) {
  bar(ctx, 40, s.fighters[0].hp, true, s.tick);
  bar(ctx, VIEW_W - 400, s.fighters[1].hp, false, s.tick);
  // timer
  ctx.fillStyle = INK;
  ctx.fillRect(VIEW_W / 2 - 38, 10, 76, 50);
  ctx.fillStyle = "#3a2440";
  ctx.fillRect(VIEW_W / 2 - 34, 14, 68, 42);
  outlinedText(
    ctx,
    String(Math.ceil((ROUND_TICKS - s.roundTick) / TICKS_PER_SECOND)).padStart(2, "0"),
    VIEW_W / 2,
    36,
    32,
    "#ffd23f",
  );
  // names on colour plates
  for (const side of [0, 1] as const) {
    ctx.font = "italic 800 15px 'Helvetica Neue', Helvetica, Arial, sans-serif";
    const label = names[side].toUpperCase();
    const w = ctx.measureText(label).width + 20;
    const x = side === 0 ? 40 : VIEW_W - 40 - w;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 2, 50, w + 4, 24);
    ctx.fillStyle = colors[side];
    ctx.fillRect(x, 52, w, 20);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 10, 62.5);
    for (let i = 0; i < 2; i++) {
      const cx = side === 0 ? 400 - 14 - i * 22 : VIEW_W - 400 + 14 + i * 22;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(cx, 62, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i < s.wins[side] ? "#ffd23f" : "#4a3550";
      ctx.beginPath();
      ctx.arc(cx, 62, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // banners
  const last = s.rounds.at(-1);
  const gold = ctx.createLinearGradient(0, 150, 0, 230);
  gold.addColorStop(0, "#fff6b0");
  gold.addColorStop(0.5, "#ffc93a");
  gold.addColorStop(1, "#ff7a1a");
  const red = ctx.createLinearGradient(0, 140, 0, 240);
  red.addColorStop(0, "#ff7b6b");
  red.addColorStop(1, "#c3121f");
  if (s.over)
    outlinedText(
      ctx,
      s.winner === null ? "DRAW GAME" : `${names[s.winner].toUpperCase()} WINS`,
      VIEW_W / 2,
      190,
      58,
      gold,
    );
  else if (s.pause > 0 && last)
    outlinedText(
      ctx,
      last.reason === "time" ? "TIME OVER" : last.reason === "double_ko" ? "DOUBLE K.O." : "K.O.",
      VIEW_W / 2,
      190,
      last.reason === "ko" ? 110 : 70,
      last.reason === "ko" ? red : gold,
    );
  else if (s.roundTick < 40)
    outlinedText(
      ctx,
      s.roundTick < 24 ? `ROUND ${s.round}` : "FIGHT!",
      VIEW_W / 2,
      190,
      s.roundTick < 24 ? 64 : 90,
      gold,
    );
}

// ---------- frame ----------
let buffer: HTMLCanvasElement | null = null;
let makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
// Node has no document; the frame renderer for the vision fighter passes its own canvas factory.
export function setCanvasFactory(factory: (w: number, h: number) => HTMLCanvasElement) {
  makeCanvas = factory;
  buffer = null;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  names: [string, string],
  colors: [string, string],
  characters?: [string | undefined, string | undefined],
) {
  if (!buffer) buffer = makeCanvas(BUF_W, BUF_H);
  const b = buffer.getContext("2d")!;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.imageSmoothingEnabled = false;

  // Camera: zoom on the fighters like an arcade cabinet, never past the stage edges; shake on fresh hits.
  const [f0, f1] = s.fighters;
  const zoom = Math.min(1.25, Math.max(1, VIEW_W / (Math.abs(f0.x - f1.x) + 380)));
  const span = VIEW_W / zoom;
  const camX = Math.min(VIEW_W - span, Math.max(0, (f0.x + f1.x) / 2 - span / 2));
  const fresh = s.sparks.find((p) => p.kind === "hit" && p.life >= 7);
  const shake = fresh ? (fresh.life - 6) * 2 * (s.tick % 2 ? 1 : -1) : 0;
  b.scale(1 / PIXEL, 1 / PIXEL);
  b.translate(shake, VIEW_H - 34);
  b.scale(zoom, zoom);
  b.translate(-camX, -FLOOR);

  if (characters) drawDataCenter(b, camX, s.tick);
  else drawStage(b, camX, s.tick);
  const looks: Look[] = colors.map((c, i) => ({
    gi: c,
    trim: shade(c, 0.45),
    band: shade(c, 1.5),
    character: characters?.[i],
  }));
  for (const f of s.fighters) {
    b.fillStyle = "rgba(20,8,10,.35)";
    b.beginPath();
    b.ellipse(f.x, FLOOR + 4, 34 - Math.min(20, f.y / 5), 7, 0, 0, Math.PI * 2);
    b.fill();
  }
  const order = attackPhase(f0) === "active" || f0.act === "jump_kick" ? [1, 0] : [0, 1];
  for (const i of order) {
    // The match freezes on its last tick; put a winner who was mid-jump back on the floor for the victory pose.
    const f = s.over ? { ...s.fighters[i], y: 0 } : s.fighters[i];
    const flash = f.stun > 0 && f.stunKind === "hit" && f.stun % 4 < 2 && f.hp > 0;
    if (!characters?.[i] || !hasCharacterSprite(characters[i]!))
      drawFighter(b, f, looks[i], poseFor(f, s.tick + i * 13, s, i), s.tick, flash);
  }
  if (!characters) {
    if (!s.over)
      for (const fb of s.fireballs) drawFireball(b, fb.x, fb.dir, colors[fb.owner], s.tick);
    for (const p of s.sparks) drawSpark(b, p.x, p.y, p.kind, p.life);
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, BUF_W, BUF_H, 0, 0, VIEW_W, VIEW_H);
  if (characters) {
    ctx.save();
    ctx.translate(shake, VIEW_H - 34);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -FLOOR);
    for (const i of order) {
      const f = s.over ? { ...s.fighters[i], y: 0 } : s.fighters[i];
      drawCharacterSprite(
        ctx,
        f,
        characters[i]!,
        spriteFrame(f, s.tick, s.over, f.hp <= 0 || (s.winner !== null && s.winner !== i)),
        FLOOR,
        s.tick,
        i === 1 && characters[0] === characters[1],
        camX,
        camX + span,
      );
    }
    if (!s.over)
      for (const fb of s.fireballs) drawFireball(ctx, fb.x, fb.dir, colors[fb.owner], s.tick);
    for (const p of s.sparks) drawSpark(ctx, p.x, p.y, p.kind, p.life);
    ctx.restore();
  }
  hud(ctx, s, names, colors);
}

// ---------- versus screen (social preview) ----------
type Corner = { name: string; color: string; maker: string };

// An arcade "player select" versus card: two fighters, a burning VS, name plates. Used for the post's preview image.
export function drawVersus(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  left: Corner,
  right: Corner,
  title: string,
  footer: string,
) {
  const px = 3;
  const buf = makeCanvas(Math.ceil(w / px), Math.ceil(h / px));
  const b = buf.getContext("2d")!;
  b.scale(1 / px, 1 / px);

  // split background: each half takes its fighter's colour, cut by a diagonal
  const half = (color: string, from: number, to: number, x0: number) => {
    const g = b.createLinearGradient(x0, 0, x0 + (to - from), h);
    g.addColorStop(0, shade(color, 0.6));
    g.addColorStop(1, shade(color, 0.2));
    return g;
  };
  b.fillStyle = half(left.color, 0, w / 2, 0);
  b.beginPath();
  b.moveTo(0, 0);
  b.lineTo(w / 2 + 90, 0);
  b.lineTo(w / 2 - 90, h);
  b.lineTo(0, h);
  b.closePath();
  b.fill();
  b.fillStyle = half(right.color, w / 2, w, w / 2);
  b.beginPath();
  b.moveTo(w / 2 + 90, 0);
  b.lineTo(w, 0);
  b.lineTo(w, h);
  b.lineTo(w / 2 - 90, h);
  b.closePath();
  b.fill();
  // speed lines
  b.strokeStyle = "rgba(255,255,255,.07)";
  b.lineWidth = 6;
  for (let i = -20; i < 40; i++) {
    b.beginPath();
    b.moveTo(i * 60, 0);
    b.lineTo(i * 60 - 220, h);
    b.stroke();
  }
  // the dividing bolt
  b.strokeStyle = "#fff4c2";
  b.lineWidth = 10;
  b.lineJoin = "miter";
  b.beginPath();
  b.moveTo(w / 2 + 90, 0);
  b.lineTo(w / 2 + 10, h * 0.42);
  b.lineTo(w / 2 + 40, h * 0.5);
  b.lineTo(w / 2 - 90, h);
  b.stroke();
  b.strokeStyle = "#ffb43a";
  b.lineWidth = 4;
  b.stroke();

  // fighters, big, on a floor glow
  const scale = h / 300;
  const pose = (side: 0 | 1, color: string) => {
    const f = {
      x: 0,
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
      facing: side === 0 ? 1 : -1,
    } as Fighter;
    b.save();
    b.translate(side === 0 ? w * 0.25 : w * 0.75, h * 0.86);
    b.scale(scale, scale);
    b.translate(0, -FLOOR);
    b.fillStyle = "rgba(0,0,0,.35)";
    b.beginPath();
    b.ellipse(0, FLOOR + 4, 48, 9, 0, 0, Math.PI * 2);
    b.fill();
    drawFighter(
      b,
      f,
      { gi: color, trim: shade(color, 0.45), band: shade(color, 1.5) },
      side === 0 ? POSES.fire : POSES.heavyWind,
      7,
      false,
    );
    if (side === 0) drawFireball(b, 92, 1, color, 3);
    b.restore();
  };
  pose(0, left.color);
  pose(1, right.color);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, buf.width, buf.height, 0, 0, buf.width * px, buf.height * px);

  // crisp type on top
  const fire = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.62);
  fire.addColorStop(0, "#fff7b8");
  fire.addColorStop(0.45, "#ffc531");
  fire.addColorStop(1, "#ff4b1f");
  outlinedText(ctx, "VS", w / 2, h * 0.47, h * 0.3, fire);
  const gold = ctx.createLinearGradient(0, 30, 0, 100);
  gold.addColorStop(0, "#fff6b0");
  gold.addColorStop(0.5, "#ffc93a");
  gold.addColorStop(1, "#ff7a1a");
  outlinedText(ctx, title, w / 2, h * 0.1, h * 0.085, gold);
  for (const [side, c] of [
    [0, left],
    [1, right],
  ] as const) {
    ctx.font = `italic 900 ${Math.round(h * 0.075)}px 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
    const label = c.name.toUpperCase();
    const tw = ctx.measureText(label).width + 44;
    const x = side === 0 ? 36 : w - 36 - tw;
    const y = h * 0.2;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 4, y - 4, tw + 8, h * 0.11 + 8);
    ctx.fillStyle = c.color;
    ctx.fillRect(x, y, tw, h * 0.11);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 22, y + h * 0.058);
    ctx.font = `700 ${Math.round(h * 0.03)}px 'Helvetica Neue', Helvetica, Arial, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = side === 0 ? "left" : "right";
    ctx.fillText(c.maker.toUpperCase(), side === 0 ? x : x + tw, y + h * 0.11 + 22);
  }
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillRect(0, h - 52, w, 52);
  ctx.font = `800 ${Math.round(h * 0.036)}px 'Helvetica Neue', Helvetica, Arial, sans-serif`;
  ctx.fillStyle = "#ffd23f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(footer, w / 2, h - 26);
}
