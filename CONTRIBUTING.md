# Contributing

Use Node 22.12+ and `npm ci`. Before a pull request:

```sh
npm run format
npm run check
npm run dataset:verify
npm run build
npm run smoke
```

Keep simulation changes in `src/core`, providers in `src/providers`, and filesystem/HTTP concerns in `src/server`. Browser modules must never import credentials or server modules at runtime.

For a game-rule change, bump the engine/replay protocol and define a migration or compatibility path. Do not rewrite historical replay files to make a new engine pass. Provider failures must not become standing-still moves or rated losses.

For a new provider, add a registry entry and a mock response contract test. Use environment variable names, never literal credentials. Availability and prices change; do not hard-code claims that every account can use a model.

Keep comments for invariants, units and tradeoffs. Document public behavior and commands in the README; put protocol details in `docs/`. Prettier owns formatting.

Only contribute code and assets you are permitted to publish under this repository's license. No customer data, API caches, copied sprites or private production configuration.
