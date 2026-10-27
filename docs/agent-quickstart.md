# Run JEV Arena with an agent

Paste this into your coding agent. It should perform the setup and leave a working local app, not just explain the commands.

```text
Set up and run https://github.com/rawmodels/jevarena on this machine.

1. If this directory is already the repository, use it. Otherwise clone the
   repository into a new directory without overwriting an existing checkout.
   Read AGENTS.md and README.md before changing or running anything.
2. Check Node.js: use 22.12+ (prefer 24). Run npm ci using the committed lockfile.
   Do not require API keys or create/overwrite .env for the offline launch.
3. Run npm run check, npm run dataset:verify, npm run build and npm run smoke.
   Fix actual setup failures and rerun the affected checks. Do not skip a failed
   check, rewrite archived data, or silently change the game rules.
4. Exercise the tournament CLI with examples/bots.json, two games per pair,
   and a fresh temporary output directory. Run the same command again to verify
   resume. Both runs must finish without API calls. Keep user data untouched.
5. Start the production app on 127.0.0.1:3100. If that port belongs to this app,
   reuse it; if it belongs to another process, choose a free port. Do not kill
   unrelated processes. Keep the server running after this task.
6. Verify HTTP 200 for the app, 21 models and 420 matches in /api/state, and the
   five character portraits under /arena/sprites/<character-id>/idle.png.
7. If browser tools are available, inspect both leaderboard tabs and a recorded
   fight. In Build a fighter, verify all five character cards and switch between
   Leather Jacket, Ship-It Sam, Search Goblin, Safety Monk and Metaverse Lizard.
   Confirm that the preview uses the selected character and sprites load. Use
   built-in bots for any new fight; do not start API fights or spend credits.
   Do not replace the characters with generic artwork.
8. Report the working URL, server process/start command, check results and any
   concrete blockers. Say explicitly if browser verification was unavailable.
   Do not claim success based only on a build or an attempted server start.

No account, database, Railway service, Docker daemon or paid API is required
for this offline setup. Do not publish, push, or deploy unrelated changes.
```

Manual quick start and API configuration are in the [README](../README.md). The same repository instructions apply whether the agent is Codex, Claude Code, or another terminal agent.
