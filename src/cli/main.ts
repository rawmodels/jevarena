import { parseArgs } from "node:util";
import { commandSchema, loadArenaConfig } from "./config";
import {
  importFighters,
  runConfiguredFight,
  runConfiguredTournament,
  serveConfiguredArena,
} from "./actions";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string", default: "examples/arena.json" },
    dev: { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "npm run arena -- [run|import|fight|tournament|serve] --config examples/arena.json [--dev]",
  );
} else {
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort(new Error("Interrupted")));
  try {
    if (positionals.length > 1)
      throw new Error("Choose one command or use the config's steps array");
    const config = await loadArenaConfig(values.config!);
    const requested = positionals[0] ?? "run";
    const steps = requested === "run" ? config.steps : [commandSchema.parse(requested)];
    for (const step of steps) {
      abort.signal.throwIfAborted();
      if (step === "serve") {
        await serveConfiguredArena(config);
        break;
      }
      const result =
        step === "import"
          ? await importFighters(config)
          : step === "fight"
            ? await runConfiguredFight(config, abort.signal)
            : await runConfiguredTournament(config, abort.signal);
      console.log(JSON.stringify({ event: "COMPLETE", command: step, ...result }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Arena command failed");
    process.exitCode = 1;
  }
}
