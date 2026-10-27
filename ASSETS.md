# Character artwork

The bundled character artwork is maintained by RawModels and is included under the repository's MIT license. The portraits and animation frames live in `src/web/public/arena/sprites/`.

Keep all five character IDs stable: `leather-jacket`, `ship-it-sam`, `search-goblin`, `safety-monk` and `metaverse-lizard`. `manifest.json` defines frame geometry; the sprite loader selects frames from the fighter's current action. Rendering must not mutate simulation state or recorded replay data.
