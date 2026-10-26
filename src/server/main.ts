import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fighterSchema } from "../core/config";
import { MODELS, modelById, publicModels } from "../providers/registry";
import { datasetBoard, datasetReplay, loadDataset, Storage } from "./storage";
import { MatchJobs } from "./jobs";
import { userRatings } from "./ratings";

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";
const configuredOrigin = process.env.ARENA_ORIGIN ? new URL(process.env.ARENA_ORIGIN).origin : null;

const storage = new Storage(path.resolve(process.env.ARENA_DATA_DIR ?? "data"));
const dataset = await loadDataset();
const jobs = new MatchJobs(storage, Number(process.env.ARENA_MAX_REQUESTS ?? 3000));
const dev = process.argv.includes("--dev");
const vite = dev
  ? await (await import("vite")).createServer({ server: { middlewareMode: true }, appType: "spa" })
  : null;
const fightSchema = z
  .object({
    left: z.string(),
    right: z.string(),
    seed: z.number().int().min(1).max(0xffffffff).default(43),
  })
  .strict();
const json = (res: ServerResponse, data: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
};
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16000) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method !== "GET") {
    // The unauthenticated local API must not accept cross-site paid actions.
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}` &&
      req.headers.origin !== `https://${req.headers.host}`
    )
      return json(res, { error: "Origin rejected" }, 403);
    if (req.headers["content-type"]?.split(";")[0] !== "application/json")
      return json(res, { error: "Use application/json" }, 415);
  }
  if (url.pathname === "/api/benchmark/manifest" && req.method === "GET")
    return json(res, dataset.manifest);
  if (url.pathname === "/api/benchmark/ratings.csv" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=arenaraw-ratings.csv",
    });
    const rows = dataset.board.fighters.map((f, i) => [
      i + 1,
      f.name,
      "arenaraw",
      f.elo,
      f.w,
      f.l,
      f.d,
      f.games,
    ]);
    const quote = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;
    return res.end(
      [["rank", "model", "config_by", "elo", "wins", "losses", "draws", "games"], ...rows]
        .map((row) => row.map(quote).join(","))
        .join("\n") + "\n",
    );
  }
  if (url.pathname === "/api/state" && req.method === "GET") {
    const [fighters, matches] = await Promise.all([storage.fighters(), storage.replays()]);
    return json(res, {
      models: publicModels(),
      modelBoard: datasetBoard(dataset, MODELS),
      fighters,
      userBoard: userRatings(fighters, matches),
      matches: matches.map((m) => ({
        id: m.id,
        fighters: m.fighters,
        names: m.configs.map((c) => c.name),
        winner: m.winner,
      })),
      jobs: jobs.list(),
    });
  }
  if (url.pathname === "/api/fighters" && req.method === "POST") {
    const fighter = fighterSchema.parse(await body(req));
    modelById(fighter.model);
    await storage.saveFighter(fighter);
    return json(res, { saved: true }, 201);
  }
  if (url.pathname === "/api/fights" && req.method === "POST") {
    const input = fightSchema.parse(await body(req));
    const fighters = await storage.fighters();
    const left = fighters.find((f) => f.id === input.left),
      right = fighters.find((f) => f.id === input.right);
    if (!left || !right || left.id === right.id)
      throw new Error("Choose two different saved fighters");
    return json(res, { id: jobs.start([left, right], input.seed) }, 202);
  }
  const match = url.pathname.match(/^\/api\/matches\/([a-zA-Z0-9_-]{1,160})$/);
  if (match && req.method === "GET") {
    const id = match[1];
    const job = jobs.get(id);
    if (job) return json(res, { status: job.status, replay: job.replay ?? null, error: job.error });
    const bundled = datasetReplay(dataset, id);
    const replay = bundled ?? (await storage.replays()).find((m) => m.id === id);
    return replay
      ? json(res, { status: "COMPLETED", replay })
      : json(res, { error: "Match not found" }, 404);
  }
  const cancel = url.pathname.match(/^\/api\/matches\/([a-zA-Z0-9_-]{1,160})\/cancel$/);
  if (cancel && req.method === "POST") {
    jobs.cancel(cancel[1]);
    return json(res, { cancelled: true });
  }
  return json(res, { error: "Not found" }, 404);
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const origin = `${process.env.ARENA_ORIGIN?.startsWith("https:") ? "https" : "http"}://${req.headers.host}`;
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    const allowedOrigins = new Set(
      configuredOrigin
        ? [configuredOrigin]
        : [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`],
    );
    if (!allowedOrigins.has(origin)) return json(res, { error: "Host rejected" }, 403);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (vite)
      return vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end("Not found");
      });
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const root = path.resolve("dist/client");
    const file = path.resolve(root, relative || "index.html");
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.statusCode = 403;
      return res.end("Forbidden");
    }
    let bytes: Buffer,
      served = file;
    try {
      bytes = await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      served = path.join(root, "index.html");
      bytes = await readFile(served);
    }
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
    };
    res.setHeader("Content-Type", types[path.extname(served)] ?? "application/octet-stream");
    res.end(bytes);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : "Request failed";
    json(res, { error: message }, 400);
  }
});
server.listen(port, host, () =>
  console.log(
    `JEV Arena: http://${host}:${typeof server.address() === "object" ? (server.address() as import("node:net").AddressInfo).port : port} (${dev ? "development" : "production"})`,
  ),
);
