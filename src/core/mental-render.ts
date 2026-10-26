import type { GameState } from "./engine";
import type { MentalEvent } from "./mental-attack";

// Visual feedback only; the replay's physics and probabilities are untouched.
export function drawMentalAttacks(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  events: MentalEvent[],
) {
  for (const event of events) {
    const age = state.tick - event.tick;
    if (age < 0 || age > 45) continue;
    const fighter = state.fighters[event.side];
    const x = Math.min(870, Math.max(90, fighter.x)),
      y = 205 - fighter.y;
    ctx.save();
    ctx.globalAlpha = 1 - age / 46;
    ctx.strokeStyle = "#b982f5";
    ctx.lineWidth = 3;
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      ctx.arc(x, y + 35, 12 + age * 1.5 + ring * 12, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();
    }
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#261538";
    ctx.strokeText("MENTAL ATTACK", x, 146);
    ctx.fillStyle = "#e8ceff";
    ctx.fillText("MENTAL ATTACK", x, 146);
    ctx.restore();
  }
}
