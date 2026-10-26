import { z } from "zod";
import { CHARACTERS, STARTER_DEFENSE, STARTER_INJECTION } from "./characters";
import { DECISION_TICKS, MAX_ROUNDS, ROUND_TICKS } from "./engine";

export const PROTOCOL_VERSION = 2;
export const MAX_DECISIONS = Math.ceil(ROUND_TICKS / DECISION_TICKS) * MAX_ROUNDS + 6;
export const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/);
export const fighterSchema = z
  .object({
    id: identifier,
    name: z.string().trim().min(2).max(48),
    author: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,23}$/),
    model: identifier,
    character: z.enum(CHARACTERS.map((c) => c.id) as [string, ...string[]]),
    strategy: z.string().trim().min(1).max(2000),
    defense: z.string().trim().max(1000),
    injection: z.string().trim().max(1000),
  })
  .strict();
export type FighterConfig = z.infer<typeof fighterSchema>;
export const defaultFighter: FighterConfig = {
  id: "my-fighter",
  name: "Leather Jacket",
  author: "localplayer",
  model: "scripted",
  character: CHARACTERS[0].id,
  strategy: CHARACTERS[0].strategy,
  defense: STARTER_DEFENSE,
  injection: STARTER_INJECTION,
};
export function composeObservation(
  engine: string,
  fighter: FighterConfig,
  opponentMessage: string,
) {
  return `${engine}\n\n${fighter.strategy}\n\n${opponentMessage}\n\n${fighter.defense}`;
}
