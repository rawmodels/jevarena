import {
  applyDecisions,
  hashState,
  MOVES,
  needsDecision,
  newGame,
  step,
  type Move,
} from "./engine";
import { MentalAttacks, ACTIONS } from "./mental-attack";
import { MAX_DECISIONS, PROTOCOL_VERSION, composeObservation, type FighterConfig } from "./config";
import { renderState } from "./policy";
import { Stepper } from "./replay";
import type { MatchFile } from "./replay-types";
import type { Decide } from "../providers/decision";

export type Replay = MatchFile & {
  protocolVersion: number;
  configs: [FighterConfig, FighterConfig];
  resolvedModels: [string, string];
  observations?: [string, string][];
};
export function verifyReplay(replay: MatchFile) {
  const stepper = new Stepper(replay);
  while (stepper.advance());
  const state = stepper.s;
  if (
    !state.over ||
    state.tick !== replay.ticks ||
    hashState(state) !== replay.hash ||
    state.winner !== replay.winner ||
    JSON.stringify(state.wins) !== JSON.stringify(replay.wins)
  )
    throw new Error(`Replay verification failed: ${replay.id}`);
  return state;
}

/** API latency pauses the game; both choices apply to the same simulation tick. */
export async function playMatch(
  id: string,
  seed: number,
  configs: [FighterConfig, FighterConfig],
  policies: [Decide, Decide],
  signal: AbortSignal,
  onProgress?: (replay: Replay) => Promise<void>,
) {
  const state = newGame(seed);
  const mental = new MentalAttacks([configs[0].injection, configs[1].injection]);
  const replay: Replay = {
    id,
    seed,
    fighters: [configs[0].id, configs[1].id],
    configs,
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: PROTOCOL_VERSION,
    resolvedModels: ["", ""],
    lang: "en",
    mode: "turn",
    actionNames: [...ACTIONS],
    actions: [],
    mentalEvents: [],
    observations: [],
    d: [],
    p: [],
    ms: [],
    errors: [0, 0],
    winner: null,
    wins: [0, 0],
    rounds: [],
    ticks: 0,
    hash: "",
  };
  const siblingAbort = new AbortController();
  const decisionSignal = AbortSignal.any([signal, siblingAbort.signal]);
  let lastProgress = 0;
  const snapshot = () =>
    Object.assign(replay, {
      winner: state.winner,
      wins: state.wins,
      rounds: state.rounds,
      ticks: state.tick,
      hash: hashState(state),
    });
  while (!state.over) {
    signal.throwIfAborted();
    if (needsDecision(state)) {
      if (replay.d.length >= MAX_DECISIONS) throw new Error("Decision bound exceeded");
      const observations = ([0, 1] as const).map((side) =>
        composeObservation(
          `${renderState(state, side)}\n\n${mental.describe(state, side)}`,
          configs[side],
          mental.receive(state, side),
        ),
      ) as [string, string];
      const answers = await Promise.all(
        ([0, 1] as const).map((side) =>
          policies[side](state, side, observations[side], decisionSignal),
        ),
      ).catch((error) => {
        siblingAbort.abort(error);
        throw error;
      });
      for (const side of [0, 1] as const)
        if (
          replay.resolvedModels[side] &&
          replay.resolvedModels[side] !== answers[side].resolvedModel
        )
          throw new Error("Provider model version changed during the match");
      replay.observations!.push(observations);
      replay.mentalEvents!.push(
        ...mental.resolve(state, [answers[0].move, answers[1].move], replay.d.length),
      );
      replay.actions!.push(answers.map((a) => ACTIONS.indexOf(a.move)) as [number, number]);
      const physical = answers.map((a) => (a.move === "mental_attack" ? null : a.move)) as [
        Move | null,
        Move | null,
      ];
      applyDecisions(state, physical);
      replay.d.push(
        physical.map((move) => (move === null ? -1 : MOVES.indexOf(move))) as [number, number],
      );
      replay.p.push(
        answers.map((a) => a.probs.map((p) => Math.round(p * 1000))) as [number[], number[]],
      );
      replay.ms.push(answers.map((a) => a.ms) as [number, number]);
      replay.resolvedModels = answers.map((a) => a.resolvedModel) as [string, string];
      if (onProgress && performance.now() - lastProgress >= 1000) {
        lastProgress = performance.now();
        await onProgress(snapshot());
      }
    }
    step(state);
  }
  snapshot();
  verifyReplay(replay);
  await onProgress?.(replay);
  return replay;
}
