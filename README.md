# JEV Arena

A self-hosted fighting game for decision models. Write a fighter's strategy, choose its model, and watch the moves it chooses. Run paired tournaments and replay every result through the same deterministic engine.

The repository includes the **21-model, 420-fight `@arenaraw` tournament**. You can watch it without an API key. Built-in arcade and random bots also run entirely offline.

[Blog: Decision models, street fighting](https://www.rawmodels.ai/blog/jev-arena) · [Hosted arena](https://www.rawmodels.ai/arena) · [Architecture](docs/architecture.md) · [Tournament protocol](docs/tournaments.md) · [Contributing](CONTRIBUTING.md)

![Character sprites, model leaderboard and local fighter workspace](docs/arena.jpg)

## Run locally

Requires **Node.js 22.12+** (Node 24 recommended).

```sh
git clone https://github.com/rawmodels/jevarena.git
cd jevarena
npm ci
npm run dev
```

Open **http://127.0.0.1:3100**.

- **Models** shows the bundled, dated benchmark. Watch opens its recorded fights.
- **User Jev Fighters** shows the current versions of your local configs.
- **Build a fighter** saves a config to this installation. Save two fighters, then choose them under **Start a fight**. Select **Arcade CPU** and **Button Masher** for an offline match.
- Live fights appear in the player and in **Your fights**. You can cancel them.

![All five character portraits and the animated preview](docs/characters.jpg)

This is a local experiment workspace. Nicknames identify configs; they are not authenticated accounts. Hosted RawModels accounts, payments, email notifications and customer records are not part of this application.

## Run it with an agent

Paste the [ready-to-run agent prompt](docs/agent-quickstart.md) into your coding agent. It installs dependencies, verifies the benchmark, runs an offline tournament, starts the app and checks the characters and replays. Repository instructions live in [AGENTS.md](AGENTS.md).

## Use real models

```sh
cp .env.example .env
```

Set `OPENROUTER_API_KEY` for OpenRouter decision models or `RAWMODELS_API_KEY` for OpenJev. Restart the server. Keys are read only by the server and never sent to the browser.

The model list is in [`src/providers/models.json`](src/providers/models.json). An API key being configured does **not** imply every listed model is available to that account. Provider errors interrupt a match; they do not award a win.

Both fighters' API calls use your keys. The editor asks for acknowledgement before starting an API fight. `ARENA_MAX_REQUESTS` caps request **attempts** per editor fight, including retries. This is not a dollar spending cap. API latency can make a fight take much longer than its simulated five-minute maximum.

## Run a tournament

No-key smoke tournament:

```sh
npm run tournament -- --config examples/bots.json --out data/bots --games 2
```

API tournament:

```sh
npm run tournament -- \
  --config examples/models.json \
  --out data/models \
  --games 2 --parallel 2 --max-requests 20000
```

Each pair plays the same seed with sides swapped. The runner saves the manifest, replay files and progress in the output directory. Ratings appear only when every scheduled fight finishes and verifies. Repeat the same command to resume completed games. A changed config or source requires a new output directory.

The cumulative request-attempt journal survives a restart. An interrupted individual fight restarts from the beginning and can incur API charges again; per-decision API responses are not cached. See [protocol and limits](docs/tournaments.md).

## Build, check and run

```sh
npm run check           # TypeScript, formatting, unit/integrity tests
npm run dataset:verify  # All 420 archived replay byte hashes, results and ratings
npm run build
npm run smoke           # Real production HTTP server + complete offline fight
npm start
```

`npm run format` applies the repository's Prettier configuration. CI runs these checks on pull requests and pushes.

## Docker

```sh
docker build -t jevarena .
docker run --rm -p127.0.0.1:3100:3100 \
  --env-file .env -v jevarena-data:/app/data jevarena
```

`.env` is optional if you omit `--env-file .env` and use built-in bots. The image starts the production web server; CLI development runs from the source checkout.

## Layout

```text
src/core/        Simulation, observations, mental attacks, replay format, ratings
src/providers/   Model registry, API validation, throttling, request budget
src/server/      Local HTTP API, atomic persistence, live job lifecycle
src/tournament/  Paired scheduling, manifests, resume and complete-cohort ratings
src/web/         React UI, character sprites, previews and replay controls
examples/        Small fighter rosters for offline and API tournaments
datasets/        Dated public model benchmark, including all 420 replays
scripts/         Dataset verifier and production integration smoke
```

## License and artwork

Code and the bundled benchmark are released under **MIT**, copyright RawModels contributors.

Character artwork comes from [Mental Kombat](https://jevfight.com/). The original five characters are bundled for local portraits, previews and fights. These third-party images are outside the MIT license; see [ASSETS.md](ASSETS.md) for provenance and scope. The published benchmark contains default `@arenaraw` configs, not customer configs or private request logs.
