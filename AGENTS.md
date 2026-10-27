# Agent guide

## What this repository is

JEV Arena is a standalone, local-first TypeScript app. It contains a deterministic fighting engine, model adapters, a React UI, a resumable tournament CLI and a dated public benchmark. Read `README.md` first and use `docs/architecture.md` for module boundaries.

## Start here

Use Node.js 22.12+; Node 24 is the CI version. Install with `npm ci` and keep the lockfile.

```sh
npm run check
npm run dataset:verify
npm run build
npm run smoke
npm start
```

The default URL is `http://127.0.0.1:3100`. For development, use `npm run dev`. No `.env` or API key is needed to watch the bundled benchmark, preview characters, or run built-in bots.

Check whether a server already owns the requested port. Reuse it if it is this app; otherwise choose another port with `PORT`. Do not kill unrelated processes or overwrite an existing `.env`. Keep a requested preview server running and report its URL and process.

## Product behavior to preserve

- Keep all five characters, their names, sprite frames, selection portraits and previews. Character art is part of the product; do not silently replace it with generic fighters.
- Respect the saved `character` in each fighter config and recorded character IDs in archived replays. Visual work must not change physics, actions, hashes or results.
- Keep **Models** and **User Jev Fighters** as separate rating pools. Model ratings come from the bundled dated benchmark; local fighter ratings use immutable config versions.
- Keep keys on the server. Browser code may use environment variable names and a configured flag, never secret values.
- Do not start paid/API fights unless the user explicitly requests them. Installation, previews and validation use the scripted/random bots. A request-attempt limit is not a dollar spending cap.
- Preserve existing user data, fighter configs and replays. Use temporary directories for integration tests and fresh output directories for tournament experiments.

## Code boundaries

- `src/core`: physics, observations, mental attacks, replay contract and rating math. No HTTP, filesystem, credentials or React.
- `src/providers`: registry, response validation, pacing, retries and request budgets.
- `src/server`: local HTTP API, atomic storage and live jobs. It is a single-operator application, not an authenticated public service.
- `src/tournament`: paired schedules, frozen manifests, writer lock, resume and complete-cohort ratings.
- `src/web`: UI, character previews, sprite loading and rendering. Static sprites are under `src/web/public/arena/sprites`.

Use TypeScript strict types and Prettier. Avoid introducing a framework, state library or server dependency for a small change. Comments should explain invariants, units or tradeoffs. Read `CONTRIBUTING.md`, `SECURITY.md` and `ASSETS.md` when changing their respective boundaries.

## Verification

For functional changes run `npm run check`, `npm run dataset:verify`, `npm run build` and `npm run smoke`. For documentation-only changes, check formatting and verify that documented commands and paths exist; do not add tests that only assert prose.

For rendering changes, inspect the actual browser: all five portraits load, changing character changes the preview, and a saved fighter's character appears in its replay. Verify production asset URLs as well as the development server. Report any browser verification you could not perform.

The published benchmark has 21 models and 420 games. Verify original replay SHA-256 values, paired seeds, simulated results and ratings; do not regenerate historical data to make a changed engine pass. Failed, cancelled, timed-out or malformed model requests never become rated losses or standstill moves. Publish a tournament board only after the whole scheduled cohort verifies.

For engine or protocol changes, define compatibility and versioning before editing the rules. A changed source/config requires a new CLI output directory. Never remove a runner lock unless its owning process is confirmed stopped. Never edit request journals to reset an API budget.

## Assets and publication

The MIT license covers code and benchmark data. Third-party character art has separate provenance in `ASSETS.md`; do not claim it is original artwork or grant a new MIT license for it. Preserve attribution and asset metadata when changing presentation.

Never commit `.env`, runtime `data/`, API caches, credentials or customer content. Before publishing, inspect the diff and verify the intended GitHub account and remote. Do not deploy the hosted RawModels application as part of a standalone-repo change unless the user asks for that deployment.
