# Tournaments and the bundled benchmark

## Scheduling

For `n` fighters and `g` games per pair, a complete run contains `n × (n − 1) /2 × g` games. `g` must be positive and even. Each consecutive pair of games uses the same deterministic seed with the sides swapped. Additional game pairs receive new seeds.

A model comparison should give every model identical fighter settings. A config comparison may intentionally vary strategy or mental messages. State which experiment you ran: they answer different questions.

## Failure and resume

- A provider failure, invalid probability vector, cancelled match, timeout or exhausted request budget is an incomplete game, not a loss.
- The runner writes completed, verified replay files atomically. It publishes `board.json` only for a complete cohort.
- `manifest.json` freezes configs, provider routing, games per pair and source SHA-256 hashes. Changing these requires a fresh output directory.
- On resume, the runner validates every existing completed replay before reusing it. Interrupted games restart; there is no cross-match or cross-run response cache.
- `requests.jsonl` reserves each actual API attempt before sending it. The cap is cumulative across resumes. It is an attempt cap, not an exact monetary budget. Aborted requests may still be charged upstream.
- Run only one CLI process per output directory. The CLI takes an exclusive lock and refuses a concurrent runner. If the process was killed, inspect `.runner.lock` and remove it only after confirming that PID is no longer running.
- API calls time out after 30 seconds. Retryable HTTP 429 and 5xx responses get at most two retries. Free OpenRouter variants share one pacing gate within this process; it is not shared with other programs using the same key.

## Ratings

The complete CLI cohort uses Bradley–Terry on the Elo scale. The mean is 1000. Each pair receives one virtual draw, which keeps undefeated or winless fighters finite. This regularizes small cohorts and is part of the reported protocol.

Score percentage is `(wins + 0.5 × draws) / games`. The default table does not display uncertainty intervals. Two games per pair and one prompt configuration are exploratory results, not a universal model ranking.

## Bundled `@arenaraw` benchmark

- Run ID: `arenaraw-defaults-20261025`
- Started: October 25, 2026 UTC; completed October 26 UTC.
- 21 paid models, 420 completed games,40 games per model.
- One seed per model pair, played with swapped sides.
- Identical Leather Jacket strategy, final instructions and prepared mental message.
- Mental attacks are optional model-selected actions.
- Turn-based mode; API latency is recorded but does not affect the game clock.

The compressed dataset contains only the public manifest, board, validation record and original replay strings. It excludes API keys, private caches, accounts, email addresses and billing records. Replays contain the default configs, not original artwork. The open-source canvas renderer does not change replay physics.

Run `npm run dataset:verify` to check every replay's SHA-256, re-simulate every game, recount wins/losses/draws and independently recompute all 21 rounded ratings. The original public source and run hash are recorded in the manifest. This repository's engine preserves compatibility, while its standalone provider adapter, API and runner are newly separated code.

The checked-in snapshot is dated. The Models tab does not claim that these are every provider's currently available models. See `src/providers/models.json` for editable provider presets and the original manifest for the exact resolved models used in the benchmark.
