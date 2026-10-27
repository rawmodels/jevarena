import { parseArgs } from "node:util";
import { runTournament } from "./runner";
import { loadArenaConfig } from "../cli/config";
const { values } = parseArgs({
  options: {
    config: { type: "string", default: "examples/bots.json" },
    out: { type: "string" },
    games: { type: "string" },
    parallel: { type: "string" },
    "max-requests": { type: "string" },
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
    const config = await loadArenaConfig(values.config!);
    const board = await runTournament({
      fighters: config.fighters,
      out: values.out ?? config.tournament.out,
      games: values.games ? Number(values.games) : config.tournament.gamesPerPair,
      parallel: values.parallel ? Number(values.parallel) : config.tournament.parallel,
      maxRequests: values["max-requests"]
        ? Number(values["max-requests"])
        : config.tournament.maxRequests,
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
