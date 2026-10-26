import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { runTournament } from "./runner";
import { fighterSchema } from "../core/config";
const { values } = parseArgs({
  options: {
    config: { type: "string", default: "examples/bots.json" },
    out: { type: "string", default: "data/tournament" },
    games: { type: "string", default: "2" },
    parallel: { type: "string", default: "2" },
    "max-requests": { type: "string", default: "20000" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "npm run tournament -- --config examples/bots.json --out data/tournament --games 2 --parallel 2 --max-requests 20000",
  );
} else {
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort(new Error("Interrupted")));
  try {
    const input = JSON.parse(await readFile(values.config!, "utf8")) as unknown[];
    const board = await runTournament({
      fighters: input.map((f) => fighterSchema.parse(f)),
      out: values.out!,
      games: Number(values.games),
      parallel: Number(values.parallel),
      maxRequests: Number(values["max-requests"]),
      signal: abort.signal,
    });
    console.table(
      board.fighters.map(({ name, elo, w, l, d, games }) => ({ name, elo, w, l, d, games })),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Tournament failed");
    process.exitCode = 1;
  }
}
