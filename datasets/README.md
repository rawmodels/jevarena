# Public replay snapshot

`arenaraw-2026-10-25.json.gz` is a gzip-compressed JSON object containing:

- `manifest.json`: public frozen tournament protocol.
- `board.json`: 21 model rows and 420 match summaries.
- `validation.json`: SHA-256 hashes of all 420 replay files.
- `matches`: map from replay ID to its original JSON **string**, preserving exact file bytes.

The top-level keys are named `manifest.json`, `board.json`, `validation.json` in the original export and normalized to `manifest`, `board`, `validation` by this repository's dataset container.

Source: https://www.rawmodels.ai/arena/tournaments/arenaraw-defaults-20261025/

This contains public default `@arenaraw` results only. No private API response cache or customer data is included. Verify with `npm run dataset:verify`. The dataset is covered by the repository's MIT license.
