# Security and deployment scope

JEV Arena is a **local, single-operator application**, not an authenticated public service. Saving a fighter or starting a fight is an administrator action on that installation.

The default bind is `127.0.0.1:3100`. Mutating requests require JSON and a matching Origin, if present. Host allowlisting also blocks DNS rebinding. These checks protect a local application from unrelated websites; they are not authentication.

If serving behind a proxy, set `ARENA_ORIGIN` to the exact external origin and put authentication and access control at the proxy. `HOST=0.0.0.0` alone does not establish a secure public deployment. Do not share an installation's paid keys with untrusted users.

Keys belong in the server environment. `.env`, runtime data, logs and private config are ignored by Git and Docker build context. The public API returns only environment variable **names** and whether they are configured, never their values. Model endpoints are server-owned registry entries; browser clients cannot submit arbitrary upstream URLs.

Full prompts are stored in new local replay files. They include your strategies and opponent messages. Treat `data/` and your tournament output directory as private unless you intend to publish those configs.

Before publishing an issue, remove API keys and private prompts from any logs or reproduction data. Use GitHub's private vulnerability reporting if enabled on the repository; otherwise contact a maintainer without posting credentials publicly.
