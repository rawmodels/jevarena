// The prompt in several languages. Option keys (walk_forward, ...) stay English everywhere: they are identifiers,
// and the language test is about the instructions, the move descriptions and the state text.
import { ATTACKS, FIREBALL, FIREBALL_COOLDOWN, type Move, TICKS_PER_SECOND } from "./engine";

export const LANGS = ["en", "ru", "zh", "es"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  ru: "Russian",
  zh: "Chinese",
  es: "Spanish",
};
export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  ru: "Русский",
  zh: "中文",
  es: "Español",
};

type Attack = keyof typeof ATTACKS;
export type Desc =
  | { kind: "stun"; stun: "hit" | "block" | "down"; frames: number }
  | {
      kind: "attack";
      move: "light_punch" | "heavy_punch" | "kick" | "sweep" | "fireball" | "jump_kick";
      phase: "startup" | "active" | "recovery";
      air: number | null;
    }
  | { kind: "land" | "walk_forward" | "walk_back" | "crouch" | "block" | "idle" };
export type Facts = {
  round: number;
  winsMe: number;
  winsOp: number;
  timeLeft: number;
  hpMe: number;
  hpOp: number;
  gap: number;
  band: "point-blank" | "close" | "mid range" | "far";
  reach: Attack[];
  behind: number;
  me: Desc;
  op: Desc;
  locked: number;
  fireballs: { mine: boolean; dist: number }[];
  cdMe: string | null;
  cdOp: string | null; // seconds left, null when ready
};
export type Phrases = {
  instructions: string;
  criteria: Record<Move, string>;
  noul: (move: Move) => { instructions: string; yes: string; no: string };
  render: (f: Facts) => string;
};

const L = ATTACKS.light_punch,
  H = ATTACKS.heavy_punch,
  K = ATTACKS.kick,
  S = ATTACKS.sweep;
const RECHARGE = FIREBALL_COOLDOWN / TICKS_PER_SECOND;

// ---------- English (the original prompt, kept byte for byte) ----------
const enMove: Record<string, string> = {
  light_punch: "a quick jab",
  heavy_punch: "a heavy punch",
  kick: "a kick",
  sweep: "a low sweep",
  fireball: "a fireball throw",
  jump_kick: "a jump kick",
};
const enPhase = {
  startup: "winding up",
  active: "hitting right now",
  recovery: "recovering from it and open to a counter",
};
function enDescribe(d: Desc, me: boolean): string {
  const who = me ? "You are" : "The opponent is";
  switch (d.kind) {
    case "stun":
      return `${who} ${d.stun === "down" ? "knocked down" : d.stun === "block" ? "blocking an attack" : "reeling from a hit"} for ${d.frames} more frames.`;
    case "attack":
      return `${who} doing ${enMove[d.move]}, ${enPhase[d.phase]}${d.air !== null ? `, ${d.air} px in the air` : ""}.`;
    case "land":
      return `${who} landing from a jump kick, open to a counter.`;
    case "walk_forward":
      return `${who} walking ${me ? "toward the opponent" : "toward you"}.`;
    case "walk_back":
      return `${who} backing away${me ? " from the opponent" : " from you"}.`;
    case "crouch":
      return `${who} crouching.`;
    case "block":
      return `${who} standing guard.`;
    default:
      return `${who} standing still.`;
  }
}
const en: Phrases = {
  instructions:
    "You are a fighter in a 2D fighting game. Pick the move to make right now to win the round: deal damage and avoid getting hit.",
  criteria: {
    walk_forward: "Walk toward the opponent to get into attack range.",
    walk_back: "Walk away from the opponent to get out of range.",
    jump_kick:
      "Jump toward the opponent and kick on the way down. Flies over sweeps and fireballs, and a standing block stops it.",
    crouch:
      "Crouch: punches and fireballs pass over you and you block sweeps, but kicks and jump kicks still hit you.",
    block:
      "Stand and block. Stops punches, kicks, jump kicks and fireballs, but a sweep still hits you.",
    light_punch: `Quick jab: ${L.damage} damage, reaches ${L.range} px, comes out in ${L.startup} frames. Misses a crouching opponent.`,
    heavy_punch: `Strong punch: ${H.damage} damage, reaches ${H.range} px, slow (${H.startup} frames) and open to a counter if it misses. Misses a crouching opponent.`,
    kick: `Kick: ${K.damage} damage, reaches ${K.range} px, hits a crouching opponent.`,
    sweep: `Low sweep: ${S.damage} damage, reaches ${S.range} px and knocks down. Beats a standing block, a crouch blocks it, a jump avoids it.`,
    fireball: `Throw a fireball: ${FIREBALL.damage} damage at any distance. Crouching or jumping avoids it. Needs ${RECHARGE} s to recharge.`,
  },
  noul: (move) => ({
    instructions: `${en.instructions} Is "${move.replace("_", " ")}" the best move right now?`,
    yes: `Yes. ${en.criteria[move]}`,
    no: "No, another move is better right now.",
  }),
  render: (f) => {
    const lines = [
      `Round ${f.round}. Rounds won: you ${f.winsMe}, opponent ${f.winsOp}. Time left: ${f.timeLeft} s.`,
      `Your health: ${f.hpMe}/100. Opponent's health: ${f.hpOp}/100.`,
      `Distance to the opponent: ${f.gap} px (${f.band}). ${f.reach.length ? `In range of your ${f.reach.map((k) => k.replace("_", " ")).join(", ")}.` : "None of your melee attacks reach."}`,
      `The wall behind you is ${f.behind} px away.`,
      enDescribe(f.me, true),
      enDescribe(f.op, false),
    ];
    if (f.locked > 0)
      lines.push(
        `You cannot act for ${f.locked} more frames; the move you pick starts after that.`,
      );
    for (const fb of f.fireballs)
      lines.push(
        fb.mine
          ? `Your fireball is in the air, ${fb.dist} px from the opponent.`
          : `The opponent's fireball is flying at you, ${fb.dist} px away.`,
      );
    lines.push(f.cdMe ? `Your fireball recharges in ${f.cdMe} s.` : "Your fireball is ready.");
    lines.push(
      f.cdOp
        ? `The opponent's fireball recharges in ${f.cdOp} s.`
        : "The opponent's fireball is ready.",
    );
    return lines.join("\n");
  },
};

// ---------- Russian ----------
const ruAttack: Record<Attack, string> = {
  light_punch: "быстрый джеб",
  heavy_punch: "сильный удар рукой",
  kick: "удар ногой",
  sweep: "подсечка",
};
const ruMove: Record<string, string> = {
  light_punch: "быстрый джеб",
  heavy_punch: "сильный удар рукой",
  kick: "удар ногой",
  sweep: "подсечку",
  fireball: "бросок огненного шара",
  jump_kick: "удар ногой в прыжке",
};
const ruPhaseMe = {
  startup: "замах",
  active: "удар проходит прямо сейчас",
  recovery: "восстановление, вы открыты для контратаки",
};
const ruPhaseOp = {
  startup: "замахивается",
  active: "удар проходит прямо сейчас",
  recovery: "восстанавливается и открыт для контратаки",
};
const ruBand = {
  "point-blank": "вплотную",
  close: "близко",
  "mid range": "средняя дистанция",
  far: "далеко",
};
function ruDescribe(d: Desc, me: boolean): string {
  const who = me ? "Вы" : "Соперник";
  switch (d.kind) {
    case "stun":
      return d.stun === "down"
        ? `${who} ${me ? "сбиты с ног" : "сбит с ног"} ещё на ${d.frames} кадров.`
        : d.stun === "block"
          ? `${who} ${me ? "блокируете" : "блокирует"} атаку ещё ${d.frames} кадров.`
          : `${who} ${me ? "оглушены" : "оглушён"} ударом ещё на ${d.frames} кадров.`;
    case "attack":
      return `${who} ${me ? "делаете" : "делает"} ${ruMove[d.move]}: ${(me ? ruPhaseMe : ruPhaseOp)[d.phase]}${d.air !== null ? `, ${d.air} px над землёй` : ""}.`;
    case "land":
      return `${who} ${me ? "приземляетесь" : "приземляется"} после удара в прыжке и ${me ? "открыты" : "открыт"} для контратаки.`;
    case "walk_forward":
      return me ? "Вы идёте к сопернику." : "Соперник идёт к вам.";
    case "walk_back":
      return me ? "Вы отходите от соперника." : "Соперник отходит от вас.";
    case "crouch":
      return me ? "Вы сидите в приседе." : "Соперник сидит в приседе.";
    case "block":
      return me ? "Вы стоите в блоке." : "Соперник стоит в блоке.";
    default:
      return me ? "Вы стоите на месте." : "Соперник стоит на месте.";
  }
}
const ru: Phrases = {
  instructions:
    "Вы боец в двумерном файтинге. Выберите ход, который нужно сделать прямо сейчас, чтобы выиграть раунд: наносите урон и не пропускайте удары.",
  criteria: {
    walk_forward: "Идти к сопернику, чтобы достать его атакой.",
    walk_back: "Отойти от соперника, чтобы выйти из зоны его атак.",
    jump_kick:
      "Прыгнуть к сопернику и ударить ногой на снижении. Перелетает подсечки и огненные шары, стоячий блок его останавливает.",
    crouch:
      "Присесть: удары руками и огненные шары проходят над вами, подсечку вы блокируете, но удары ногой и удары в прыжке попадают.",
    block:
      "Встать в блок. Останавливает удары руками, ногами, в прыжке и огненные шары, но подсечка всё равно попадает.",
    light_punch: `Быстрый джеб: ${L.damage} урона, достаёт на ${L.range} px, выходит за ${L.startup} кадра. Не попадает по присевшему сопернику.`,
    heavy_punch: `Сильный удар рукой: ${H.damage} урона, достаёт на ${H.range} px, медленный (${H.startup} кадров), при промахе открывает вас для контратаки. Не попадает по присевшему сопернику.`,
    kick: `Удар ногой: ${K.damage} урона, достаёт на ${K.range} px, попадает по присевшему сопернику.`,
    sweep: `Подсечка: ${S.damage} урона, достаёт на ${S.range} px и сбивает с ног. Пробивает стоячий блок, присед её блокирует, прыжок уходит от неё.`,
    fireball: `Бросить огненный шар: ${FIREBALL.damage} урона на любой дистанции. От него уходят приседом или прыжком. Перезарядка ${RECHARGE} с.`,
  },
  noul: (move) => ({
    instructions: `${ru.instructions} Ход «${move.replace("_", " ")}» сейчас лучший?`,
    yes: `Да. ${ru.criteria[move]}`,
    no: "Нет, сейчас лучше другой ход.",
  }),
  render: (f) => {
    const lines = [
      `Раунд ${f.round}. Выиграно раундов: вы ${f.winsMe}, соперник ${f.winsOp}. Осталось времени: ${f.timeLeft} с.`,
      `Ваше здоровье: ${f.hpMe}/100. Здоровье соперника: ${f.hpOp}/100.`,
      `Расстояние до соперника: ${f.gap} px (${ruBand[f.band]}). ${f.reach.length ? `Достают: ${f.reach.map((k) => ruAttack[k]).join(", ")}.` : "Ни одна ваша атака вблизи не достаёт."}`,
      `Стена позади вас: ${f.behind} px.`,
      ruDescribe(f.me, true),
      ruDescribe(f.op, false),
    ];
    if (f.locked > 0)
      lines.push(
        `Вы не можете действовать ещё ${f.locked} кадров; выбранный ход начнётся после этого.`,
      );
    for (const fb of f.fireballs)
      lines.push(
        fb.mine
          ? `Ваш огненный шар летит, до соперника ${fb.dist} px.`
          : `Огненный шар соперника летит в вас, до него ${fb.dist} px.`,
      );
    lines.push(
      f.cdMe ? `Ваш огненный шар перезарядится через ${f.cdMe} с.` : "Ваш огненный шар готов.",
    );
    lines.push(
      f.cdOp
        ? `Огненный шар соперника перезарядится через ${f.cdOp} с.`
        : "Огненный шар соперника готов.",
    );
    return lines.join("\n");
  },
};

// ---------- Chinese (Simplified) ----------
const zhAttack: Record<Attack, string> = {
  light_punch: "快速刺拳",
  heavy_punch: "重拳",
  kick: "踢腿",
  sweep: "扫堂腿",
};
const zhMove: Record<string, string> = {
  light_punch: "快速刺拳",
  heavy_punch: "重拳",
  kick: "踢腿",
  sweep: "扫堂腿",
  fireball: "发射火球",
  jump_kick: "跳踢",
};
const zhPhase = { startup: "正在蓄力", active: "正在命中", recovery: "正在收招，可被反击" };
const zhBand = { "point-blank": "贴身", close: "近距离", "mid range": "中距离", far: "远距离" };
function zhDescribe(d: Desc, me: boolean): string {
  const who = me ? "你" : "对手";
  switch (d.kind) {
    case "stun":
      return `${who}${d.stun === "down" ? "被击倒" : d.stun === "block" ? "正在格挡攻击" : "被击中硬直"}，还剩 ${d.frames} 帧。`;
    case "attack":
      return `${who}正在使用${zhMove[d.move]}，${zhPhase[d.phase]}${d.air !== null ? `，离地 ${d.air} px` : ""}。`;
    case "land":
      return `${who}跳踢后正在落地，可被反击。`;
    case "walk_forward":
      return me ? "你正走向对手。" : "对手正走向你。";
    case "walk_back":
      return me ? "你正在后退，远离对手。" : "对手正在后退，远离你。";
    case "crouch":
      return `${who}正蹲着。`;
    case "block":
      return `${who}正站立防守。`;
    default:
      return `${who}站着不动。`;
  }
}
const zh: Phrases = {
  instructions:
    "你是一款二维格斗游戏中的格斗家。选择现在要出的招式来赢下这一回合：造成伤害，避免被击中。",
  criteria: {
    walk_forward: "走向对手，进入攻击范围。",
    walk_back: "远离对手，退出攻击范围。",
    jump_kick: "跳向对手并在下落时踢击。可越过扫堂腿和火球，站立格挡可以挡住它。",
    crouch: "蹲下：拳和火球从你头上越过，你能挡住扫堂腿，但踢腿和跳踢仍会打中你。",
    block: "站立格挡。能挡住拳、踢腿、跳踢和火球，但扫堂腿仍会打中你。",
    light_punch: `快速刺拳：${L.damage} 点伤害，攻击距离 ${L.range} px，${L.startup} 帧出招。打不到蹲下的对手。`,
    heavy_punch: `重拳：${H.damage} 点伤害，攻击距离 ${H.range} px，出招慢（${H.startup} 帧），落空会被反击。打不到蹲下的对手。`,
    kick: `踢腿：${K.damage} 点伤害，攻击距离 ${K.range} px，能打中蹲下的对手。`,
    sweep: `扫堂腿：${S.damage} 点伤害，攻击距离 ${S.range} px，能把对手击倒。可破站立格挡，蹲下能挡住，跳跃能躲开。`,
    fireball: `发射火球：任何距离造成 ${FIREBALL.damage} 点伤害。蹲下或跳跃可以躲开。需要 ${RECHARGE} 秒冷却。`,
  },
  noul: (move) => ({
    instructions: `${zh.instructions}现在“${move.replace("_", " ")}”是最佳招式吗？`,
    yes: `是。${zh.criteria[move]}`,
    no: "不是，现在有更好的招式。",
  }),
  render: (f) => {
    const lines = [
      `第 ${f.round} 回合。已赢回合：你 ${f.winsMe}，对手 ${f.winsOp}。剩余时间：${f.timeLeft} 秒。`,
      `你的生命值：${f.hpMe}/100。对手的生命值：${f.hpOp}/100。`,
      `与对手的距离：${f.gap} px（${zhBand[f.band]}）。${f.reach.length ? `能打到的攻击：${f.reach.map((k) => zhAttack[k]).join("、")}。` : "你的近身攻击都够不到。"}`,
      `你身后的墙在 ${f.behind} px 外。`,
      zhDescribe(f.me, true),
      zhDescribe(f.op, false),
    ];
    if (f.locked > 0) lines.push(`你还有 ${f.locked} 帧无法行动；你选择的招式会在之后开始。`);
    for (const fb of f.fireballs)
      lines.push(
        fb.mine
          ? `你的火球正在飞行，距离对手 ${fb.dist} px。`
          : `对手的火球正飞向你，距离 ${fb.dist} px。`,
      );
    lines.push(f.cdMe ? `你的火球还需 ${f.cdMe} 秒冷却。` : "你的火球已就绪。");
    lines.push(f.cdOp ? `对手的火球还需 ${f.cdOp} 秒冷却。` : "对手的火球已就绪。");
    return lines.join("\n");
  },
};

// ---------- Spanish ----------
const esAttack: Record<Attack, string> = {
  light_punch: "jab rápido",
  heavy_punch: "puñetazo fuerte",
  kick: "patada",
  sweep: "barrida",
};
const esMove: Record<string, string> = {
  light_punch: "un jab rápido",
  heavy_punch: "un puñetazo fuerte",
  kick: "una patada",
  sweep: "una barrida",
  fireball: "un lanzamiento de bola de fuego",
  jump_kick: "una patada en salto",
};
const esPhase = {
  startup: "preparando el golpe",
  active: "golpeando ahora mismo",
  recovery: "recuperándose y expuesto a un contraataque",
};
const esBand = {
  "point-blank": "cuerpo a cuerpo",
  close: "cerca",
  "mid range": "media distancia",
  far: "lejos",
};
function esDescribe(d: Desc, me: boolean): string {
  const who = me ? "Estás" : "El rival está";
  switch (d.kind) {
    case "stun":
      return `${who} ${d.stun === "down" ? "derribado" : d.stun === "block" ? "bloqueando un ataque" : "aturdido por un golpe"} durante ${d.frames} fotogramas más.`;
    case "attack":
      return `${who} haciendo ${esMove[d.move]}, ${esPhase[d.phase]}${d.air !== null ? `, a ${d.air} px del suelo` : ""}.`;
    case "land":
      return `${who} aterrizando de una patada en salto, expuesto a un contraataque.`;
    case "walk_forward":
      return me ? "Estás caminando hacia el rival." : "El rival está caminando hacia ti.";
    case "walk_back":
      return me
        ? "Estás retrocediendo, alejándote del rival."
        : "El rival está retrocediendo, alejándose de ti.";
    case "crouch":
      return `${who} agachado.`;
    case "block":
      return `${who} en guardia de pie.`;
    default:
      return `${who} quieto.`;
  }
}
const es: Phrases = {
  instructions:
    "Eres un luchador en un juego de lucha 2D. Elige el movimiento que debes hacer ahora mismo para ganar el asalto: haz daño y evita que te golpeen.",
  criteria: {
    walk_forward: "Caminar hacia el rival para ponerte a distancia de ataque.",
    walk_back: "Alejarte del rival para salir de su alcance.",
    jump_kick:
      "Saltar hacia el rival y patear al caer. Pasa por encima de barridas y bolas de fuego, y un bloqueo de pie la detiene.",
    crouch:
      "Agacharte: los puñetazos y las bolas de fuego pasan por encima y bloqueas las barridas, pero las patadas y las patadas en salto te alcanzan.",
    block:
      "Bloquear de pie. Detiene puñetazos, patadas, patadas en salto y bolas de fuego, pero una barrida te alcanza igual.",
    light_punch: `Jab rápido: ${L.damage} de daño, alcanza ${L.range} px, sale en ${L.startup} fotogramas. Falla contra un rival agachado.`,
    heavy_punch: `Puñetazo fuerte: ${H.damage} de daño, alcanza ${H.range} px, lento (${H.startup} fotogramas) y expuesto a un contraataque si falla. Falla contra un rival agachado.`,
    kick: `Patada: ${K.damage} de daño, alcanza ${K.range} px, golpea a un rival agachado.`,
    sweep: `Barrida: ${S.damage} de daño, alcanza ${S.range} px y derriba. Supera el bloqueo de pie; agacharse la bloquea y saltar la esquiva.`,
    fireball: `Lanzar una bola de fuego: ${FIREBALL.damage} de daño a cualquier distancia. Se esquiva agachándose o saltando. Tarda ${RECHARGE} s en recargarse.`,
  },
  noul: (move) => ({
    instructions: `${es.instructions} ¿Es «${move.replace("_", " ")}» el mejor movimiento ahora mismo?`,
    yes: `Sí. ${es.criteria[move]}`,
    no: "No, ahora hay un movimiento mejor.",
  }),
  render: (f) => {
    const lines = [
      `Asalto ${f.round}. Asaltos ganados: tú ${f.winsMe}, rival ${f.winsOp}. Tiempo restante: ${f.timeLeft} s.`,
      `Tu salud: ${f.hpMe}/100. Salud del rival: ${f.hpOp}/100.`,
      `Distancia al rival: ${f.gap} px (${esBand[f.band]}). ${f.reach.length ? `Alcanzan: ${f.reach.map((k) => esAttack[k]).join(", ")}.` : "Ninguno de tus ataques cuerpo a cuerpo alcanza."}`,
      `La pared detrás de ti está a ${f.behind} px.`,
      esDescribe(f.me, true),
      esDescribe(f.op, false),
    ];
    if (f.locked > 0)
      lines.push(
        `No puedes actuar durante ${f.locked} fotogramas más; el movimiento que elijas empezará después.`,
      );
    for (const fb of f.fireballs)
      lines.push(
        fb.mine
          ? `Tu bola de fuego está en el aire, a ${fb.dist} px del rival.`
          : `La bola de fuego del rival vuela hacia ti, a ${fb.dist} px.`,
      );
    lines.push(
      f.cdMe ? `Tu bola de fuego se recarga en ${f.cdMe} s.` : "Tu bola de fuego está lista.",
    );
    lines.push(
      f.cdOp
        ? `La bola de fuego del rival se recarga en ${f.cdOp} s.`
        : "La bola de fuego del rival está lista.",
    );
    return lines.join("\n");
  },
};

export const PHRASES: Record<Lang, Phrases> = { en, ru, zh, es };
