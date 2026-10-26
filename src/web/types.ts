import type { FighterConfig } from "../core/config";
import type { Model } from "../providers/registry";
import type { MatchFile } from "../core/replay-types";
import type { Replay } from "../core/match";
export type RatingRow = {
  id: string;
  name: string;
  model: string;
  author?: string;
  maker?: string;
  color?: string;
  elo: number;
  w: number;
  l: number;
  d: number;
  games: number;
};
export type Summary = {
  id: string;
  fighters: [string, string];
  winner: 0 | 1 | null;
  names?: string[];
};
export type State = {
  models: (Model & { configured: boolean })[];
  modelBoard: { date: string; fighters: RatingRow[]; matches: Summary[] };
  fighters: FighterConfig[];
  userBoard: RatingRow[];
  matches: Summary[];
  jobs: {
    id: string;
    status: "RUNNING" | "COMPLETED" | "VOID";
    configs: [FighterConfig, FighterConfig];
    decisions: number;
    requests: number;
    error?: string;
  }[];
};
export type ReplayResponse = {
  status: "RUNNING" | "COMPLETED" | "VOID";
  replay: (MatchFile & Partial<Replay>) | null;
  error?: string;
};
