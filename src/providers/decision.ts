import { setTimeout as delay } from "node:timers/promises";
import { ACTIONS, mentalQuestions, type Action } from "../core/mental-attack";
import { randomPolicy, scriptedPolicy } from "../core/policy";
import type { GameState, Side } from "../core/engine";
import type { Model } from "./registry";

export type Decision = { move: Action; probs: number[]; ms: number; resolvedModel: string };
export type Decide = (
  state: GameState,
  side: Side,
  observation: string,
  signal: AbortSignal,
) => Promise<Decision>;

/** A failed or malformed API response is an infrastructure error, never a move. */
export function parseDecision(data: unknown, mode: "choice" | "noul" = "choice") {
  const value = data as {
    answers?: Record<
      string,
      { choice?: string; probabilities?: Record<string, number>; noul?: number }
    >;
  };
  const values = ACTIONS.map((move) =>
    mode === "noul" ? value?.answers?.[move]?.noul : value?.answers?.move?.probabilities?.[move],
  );
  if (values.some((p) => typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1))
    throw new Error("Invalid decision probabilities");
  const weights = values as number[];
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error("Empty decision distribution");
  const probs = weights.map((value) => value / total);
  const move =
    mode === "noul"
      ? ACTIONS[weights.indexOf(Math.max(...weights))]
      : (value.answers?.move?.choice as Action);
  if (!ACTIONS.includes(move)) throw new Error("Invalid decision move");
  return { move, probs };
}

export class RequestBudget {
  used = 0;
  constructor(
    readonly limit: number,
    private onAttempt?: (used: number) => void,
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error("Request limit must be a positive integer");
  }
  take() {
    if (this.used >= this.limit)
      throw new Error(`Request budget exhausted (${this.limit} attempts)`);
    this.used++;
    this.onAttempt?.(this.used);
  }
}

// All matches in this process share one gate per endpoint/model. Free OR variants share a gate.
const nextSlot = new Map<string, number>();
async function throttle(model: Model, signal: AbortSignal) {
  const free = model.upstream!.endsWith(":free");
  const scope = free ? "openrouter-free" : `${model.endpoint}/${model.upstream}`;
  const slot = Math.max(Date.now(), nextSlot.get(scope) ?? 0);
  nextSlot.set(scope, slot + (free ? 3200 : 1000 / (model.requestsPerSecond ?? 4)));
  if (slot > Date.now()) await delay(slot - Date.now(), undefined, { signal });
  signal.throwIfAborted();
  return scope;
}

export function createPolicy(model: Model, seed: number, budget: RequestBudget): Decide {
  if (model.kind !== "api") {
    const policy = model.kind === "scripted" ? scriptedPolicy(seed) : randomPolicy(seed);
    return async (state, side, observation, signal) => {
      signal.throwIfAborted();
      const result = await policy(state, side, observation);
      if (!result.move || !result.probs) throw new Error("Invalid built-in decision");
      return {
        move: result.move,
        probs: [...result.probs, 0],
        ms: 0,
        resolvedModel: `builtin/${model.kind}-v1`,
      };
    };
  }
  const key = process.env[model.keyEnv!];
  if (!key) throw new Error(`Set ${model.keyEnv} to use ${model.name}`);
  return async (_state, _side, observation, signal) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const scope = await throttle(model, signal);
      budget.take();
      const started = performance.now();
      const response = await fetch(model.endpoint!, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model.upstream,
          state: observation,
          questions: mentalQuestions(model.mode === "noul"),
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (!retryable || attempt === 2)
          throw new Error(`${model.name}: provider HTTP ${response.status}`);
        const retryAfter = Number(response.headers.get("retry-after"));
        const wait = Math.max(
          model.upstream!.endsWith(":free") ? 65_000 : 1000 * (attempt + 1),
          Number.isFinite(retryAfter) ? Math.min(120_000, retryAfter * 1000) : 0,
        );
        nextSlot.set(scope, Math.max(nextSlot.get(scope) ?? 0, Date.now() + wait));
        await delay(wait, undefined, { signal });
        continue;
      }
      const data = await response.json();
      const parsed = parseDecision(data, model.mode);
      return {
        ...parsed,
        ms: Math.round(performance.now() - started),
        resolvedModel: typeof data.model === "string" ? data.model : model.upstream!,
      };
    }
    throw new Error("Decision attempts exhausted");
  };
}
