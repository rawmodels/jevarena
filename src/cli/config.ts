import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fighterSchema } from "../core/config";
import { modelById } from "../providers/registry";

export const commandSchema = z.enum(["import", "fight", "tournament", "serve"]);
const positive = z.number().int().positive();
const fightSchema = z
  .object({
    left: z.string().optional(),
    right: z.string().optional(),
    seed: z.number().int().min(1).max(0xffffffff).default(43),
    maxRequests: positive.default(3000),
    timeoutMs: positive.default(3_600_000),
  })
  .strict();
const tournamentSchema = z
  .object({
    out: z.string().min(1).optional(),
    gamesPerPair: positive
      .refine((n) => n >= 2 && n % 2 === 0, "Use a positive even number of games")
      .default(2),
    parallel: positive.max(16).default(2),
    maxRequests: positive.default(20000),
  })
  .strict();
const serverSchema = z
  .object({
    host: z.string().min(1).optional(),
    port: z.number().int().min(0).max(65535).optional(),
    origin: z.url().optional(),
    maxRequests: positive.optional(),
  })
  .strict();
const configSchema = z
  .object({
    fighters: z.array(fighterSchema).min(1),
    dataDir: z.string().min(1).optional(),
    steps: z.array(commandSchema).min(1).default(["import", "fight"]),
    fight: fightSchema.default(() => fightSchema.parse({})),
    tournament: tournamentSchema.default(() => tournamentSchema.parse({})),
    server: serverSchema.default({}),
  })
  .strict();
export type ArenaConfig = ReturnType<typeof parseArenaConfig>;

/** File paths are relative to the config file; env/default data paths remain relative to cwd. */
export function parseArenaConfig(value: unknown, file: string) {
  const parsed = configSchema.parse(Array.isArray(value) ? { fighters: value } : value);
  const ids = parsed.fighters.map((f) => f.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate fighter IDs in config");
  parsed.fighters.forEach((f) => modelById(f.model));
  if (parsed.steps.includes("serve") && parsed.steps.indexOf("serve") !== parsed.steps.length - 1)
    throw new Error("serve must be the final configured step");
  const resolve = (p: string) => path.resolve(path.dirname(path.resolve(file)), p);
  return {
    ...parsed,
    dataDir: parsed.dataDir
      ? resolve(parsed.dataDir)
      : path.resolve(process.env.ARENA_DATA_DIR ?? "data"),
    tournament: {
      ...parsed.tournament,
      out: parsed.tournament.out ? resolve(parsed.tournament.out) : path.resolve("data/tournament"),
    },
  };
}
export async function loadArenaConfig(file: string) {
  return parseArenaConfig(JSON.parse(await readFile(file, "utf8")), file);
}
