# Configuration and headless workflows

Run commands from the repository root. No browser, account or running HTTP server is required for importing fighter configs, running fights or running tournaments.

```sh
npm run arena -- --config examples/arena.json
```

With no explicit command, the CLI executes the config's `steps` array. The bundled example imports two built-in fighters, runs one fight, then starts the server. Stop the server with Ctrl-C. For a fully headless job, omit `serve` from `steps`.

You can also choose `import`, `fight`, `tournament` or `serve` as a positional command. It runs only that stage; fight, tournament and serve load the configured fighters automatically.

## File shape

A legacy JSON array of fighter configs still works. The complete format is an object:

```json
{
  "fighters": [],
  "dataDir": "../data",
  "steps": ["import", "fight", "serve"],
  "fight": {
    "left": "arcade-cpu",
    "right": "button-masher",
    "seed": 43,
    "maxRequests": 3000,
    "timeoutMs": 3600000
  },
  "tournament": {
    "out": "../data/config-tournament",
    "gamesPerPair": 2,
    "parallel": 2,
    "maxRequests": 20000
  },
  "server": {
    "host": "127.0.0.1",
    "port": 3100,
    "maxRequests": 3000
  }
}
```

Populate `fighters` with at least one full fighter object. [examples/arena.json](../examples/arena.json) is a runnable file with two fighters. Fighter IDs must be unique. Unknown config fields and unknown model IDs are rejected.

## Fighters

Every fighter field is supplied in JSON: `id`, `name`, `author`, `model`, `character`, `strategy`, `defense` and `injection`. A file can contain one or many fighters. Import updates matching IDs and preserves unrelated saved fighters. An existing fighter's author remains permanent. A batch containing an invalid author change is rejected without importing part of the batch.

Import and web saves share a filesystem writer lock, so simultaneous processes cannot overwrite each other's fighter updates. After a crash, inspect `.fighters.lock` and confirm that its PID is stopped before removing it.

## Fight

`left` and `right` select two distinct fighter IDs; by default the first two configured fighters are used. The seed defaults to 43. The request-attempt budget defaults to 3000, and the whole-fight timeout to one hour. A successful replay is verified before it is saved. A failed fight produces no rated result.

Running a fight again creates a new match. CLI progress is printed to the terminal; completed results appear in the app after its next refresh. This command does not silently submit a queued league job.

## Tournament

`gamesPerPair` defaults to 2 and must be positive and even. `parallel` defaults to 2 and may be 1–16. `maxRequests` defaults to 20000 and remains cumulative across resumes. `out` defaults to `data/tournament` relative to the working directory when omitted.

The complete manifest, paired matches, error policy and writer lock are described in [tournaments.md](tournaments.md). No board or local rating results are imported from an incomplete cohort. Successful games are copied into the local match store with stable, per-run IDs: resuming the same run updates the same files instead of counting them again. The original tournament evidence is kept untouched in `out`.

For an evidence-only tournament without copying results into the app, keep using:

```sh
npm run tournament -- --config examples/arena.json
```

Its `--out`, `--games`, `--parallel` and `--max-requests` flags override file settings. Existing roster-array files remain compatible.

## Server and paths

Explicit `dataDir` and `tournament.out` paths are relative to the config file. When `dataDir` is omitted, `ARENA_DATA_DIR` or the working directory's `data/` is used. Fighter files and replays are shared with the web UI only when both processes use the same data directory.

Explicit `server.host`, `server.port`, `server.maxRequests` and optional `server.origin` override their corresponding environment settings for the config-driven server. Omitted settings use the normal server defaults. The `serve` command imports the configs before starting the server. Add `--dev` for the Vite development server.

Keep the default loopback bind for a local installation. A remote deployment still needs authentication; see [SECURITY.md](../SECURITY.md). Configs contain no API key fields. Credentials stay in `.env` or the server environment.

## Production bundle and Docker

`npm run build` also produces `dist/arena.js`, which supports the same commands:

```sh
node --env-file-if-exists=.env dist/arena.js fight --config examples/arena.json
```

The Docker image includes this CLI, source hashes and example configs:

```sh
docker run --rm -v jevarena-data:/app/data jevarena \
  node dist/arena.js fight --config examples/arena.json
```

For a config-driven server inside Docker, set `server.host` to `0.0.0.0` in your config and publish the container port to loopback. The bundled local example intentionally uses `127.0.0.1`.
