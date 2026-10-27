// Versioned replay wire format. Short field names preserve compatibility with archived games.
import type { Side } from "./engine";
import type { Lang } from "./i18n";

export type MatchFile = {
  id: string;
  fighters: [string, string];
  seed: number;
  promptVersion: number;
  lang?: Lang;
  // Turn mode (default): the game pauses every DECISION_TICKS and both fighters answer.
  d: [number, number][]; // move index per decision in MOVES order, -1 = no physical move (for example, mental_attack)
  p: [number[] | null, number[] | null][]; // probabilities per mille, MOVES order
  ms: [number, number][];
  characters?: [string, string];
  actionNames?: string[];
  actions?: [number, number][];
  mentalEvents?: { tick: number; side: Side; decision: number }[];
  // Real-time mode: the game never waits; a move applies on the tick its answer arrives.
  mode?: "turn" | "realtime";
  ev?: [tick: number, side: Side, move: number, ms: number, askTick: number][];
  evp?: (number[] | null)[];
  errors: [number, number];
  winner: Side | null;
  wins: [number, number];
  rounds: { winner: Side | null; reason: string; hp: [number, number]; ticks: number }[];
  ticks: number;
  hash: string;
};
