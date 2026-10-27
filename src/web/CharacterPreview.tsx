import { useEffect, useRef } from "react";
import { applyDecisions, needsDecision, newGame, step, TICKS_PER_SECOND } from "../core/engine";
import { characterById } from "../core/characters";
import { randomPolicy, scriptedPolicy } from "../core/policy";
import { drawFrame, VIEW_W, VIEW_H } from "./render";
import { warmCharacterSprites } from "./sprites";

/** Local visual preview: neither policy makes network requests. */
export function CharacterPreview({ character }: { character: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current,
      ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    let live = true,
      frame = 0,
      previous = performance.now(),
      budget = 0;
    let state = newGame(43);
    const rival = character === "metaverse-lizard" ? "ship-it-sam" : "metaverse-lizard";
    const left = characterById(character),
      right = characterById(rival);
    const policies = [scriptedPolicy(43), randomPolicy(44)];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    async function loop(now: number) {
      budget = Math.min(budget + ((now - previous) / 1000) * TICKS_PER_SECOND, 8);
      previous = now;
      while (budget >= 1 && !reduced) {
        if (state.over) state = newGame(43);
        if (needsDecision(state)) {
          const choices = await Promise.all(
            policies.map((policy, side) => policy(state, side as 0 | 1, "")),
          );
          if (!live) return;
          applyDecisions(state, [choices[0].move, choices[1].move]);
        }
        step(state);
        budget--;
      }
      ctx!.setTransform(2, 0, 0, 2, 0, 0);
      drawFrame(
        ctx!,
        state,
        [left.name, right.name],
        [left.color, right.color],
        [left.id, right.id],
      );
      if (live && !reduced) frame = requestAnimationFrame(loop);
    }
    void warmCharacterSprites([left.id, right.id]).then(() => {
      if (live) void loop(performance.now());
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [character]);
  return (
    <div className="character-preview">
      <canvas
        ref={canvas}
        width={VIEW_W * 2}
        height={VIEW_H * 2}
        role="img"
        aria-label={`${characterById(character).name} character preview`}
      />
      <span>Preview · local bots</span>
    </div>
  );
}
