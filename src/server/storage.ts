import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fighterSchema, type FighterConfig } from "../core/config";
import type { Replay } from "../core/match";
import type { MatchFile } from "../core/replay-types";
import type { Model } from "../providers/registry";

export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600 });
  await rename(temporary, file);
}
export class Storage {
  constructor(readonly root: string) {}
  private pendingSave: Promise<void> = Promise.resolve();
  async fighters(): Promise<FighterConfig[]> {
    try {
      return (
        JSON.parse(await readFile(path.join(this.root, "fighters.json"), "utf8")) as unknown[]
      ).map((value) => fighterSchema.parse(value));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  saveFighter(fighter: FighterConfig): Promise<void> {
    const operation = this.pendingSave.then(() => this.writeFighter(fighter));
    this.pendingSave = operation.catch(() => {});
    return operation;
  }
  private async writeFighter(fighter: FighterConfig) {
    const fighters = await this.fighters();
    const existing = fighters.find((f) => f.id === fighter.id);
    if (existing && existing.author !== fighter.author)
      throw new Error("The fighter's author is permanent");
    await atomicJson(path.join(this.root, "fighters.json"), [
      ...fighters.filter((f) => f.id !== fighter.id),
      fighter,
    ]);
  }
  async saveReplay(replay: Replay) {
    await atomicJson(path.join(this.root, "matches", `${replay.id}.json`), replay);
  }
  async replays(): Promise<Replay[]> {
    const root = path.join(this.root, "matches");
    let files: string[];
    try {
      files = await readdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (file) => JSON.parse(await readFile(path.join(root, file), "utf8")) as Replay),
    );
  }
}
export type Dataset = {
  manifest: {
    startedAt: string;
    protocol: Record<string, unknown>;
    roster: string[];
    runHash: string;
    prices: Record<string, { upstreamModel: string }>;
  };
  board: {
    runHash: string;
    fighters: {
      id: string;
      name: string;
      model: string;
      elo: number;
      w: number;
      l: number;
      d: number;
      games: number;
    }[];
    matches: {
      id: string;
      fighters: [string, string];
      winner: 0 | 1 | null;
      wins: [number, number];
    }[];
  };
  validation: { runHash: string; files: { id: string; sha256: string }[] };
  matches: Record<string, string>;
};
export async function loadDataset(): Promise<Dataset> {
  const compressed = await readFile(path.resolve("datasets/arenaraw-2026-10-25.json.gz"));
  return JSON.parse(gunzipSync(compressed).toString()) as Dataset;
}
export function datasetReplay(dataset: Dataset, id: string): MatchFile | null {
  const raw = Object.hasOwn(dataset.matches, id) ? dataset.matches[id] : undefined;
  return raw ? (JSON.parse(raw) as MatchFile) : null;
}
export function datasetBoard(dataset: Dataset, models: Model[]) {
  return {
    ...dataset.board,
    date: dataset.manifest.startedAt.slice(0, 10),
    fighters: dataset.board.fighters.map((row) => ({
      ...row,
      maker: models.find((m) => m.id === row.id)?.maker ?? "",
      color: models.find((m) => m.id === row.id)?.color ?? "#526449",
    })),
  };
}
