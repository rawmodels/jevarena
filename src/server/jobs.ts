import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { FighterConfig } from "../core/config";
import { playMatch, type Replay } from "../core/match";
import { RequestBudget, createPolicy } from "../providers/decision";
import { modelById } from "../providers/registry";
import type { Storage } from "./storage";

export type MatchJob = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "VOID";
  configs: [FighterConfig, FighterConfig];
  decisions: number;
  requests: number;
  error?: string;
  replay?: Replay;
};
export class MatchJobs {
  private jobs = new Map<string, MatchJob>();
  private controllers = new Map<string, AbortController>();
  constructor(
    private storage: Storage,
    private maxRequests: number,
  ) {}
  list() {
    return [...this.jobs.values()].map(({ replay: _replay, ...job }) => job).reverse();
  }
  get(id: string) {
    return this.jobs.get(id);
  }
  start(configs: [FighterConfig, FighterConfig], seed = 43) {
    if (this.controllers.size >= 2)
      throw new Error("Two fights are already running. Wait or cancel one.");
    if (this.jobs.size >= 100) {
      for (const [id, job] of this.jobs) if (job.status !== "RUNNING") this.jobs.delete(id);
    }
    const id = randomUUID();
    const budget = new RequestBudget(this.maxRequests);
    // Fail before returning a job if a model/key is missing.
    const policies = configs.map((config) =>
      createPolicy(
        modelById(config.model),
        seed ^ [...config.id].reduce((a, c) => a + c.charCodeAt(0), 0),
        budget,
      ),
    ) as Parameters<typeof playMatch>[3];
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const job: MatchJob = { id, configs, status: "RUNNING", decisions: 0, requests: 0 };
    this.jobs.set(id, job);
    void playMatch(
      id,
      seed,
      configs,
      policies,
      AbortSignal.any([controller.signal, AbortSignal.timeout(60 * 60_000)]),
      async (replay) => {
        // Yield for HTTP polling even when both policies are local CPU bots.
        job.decisions = replay.d.length;
        job.requests = budget.used;
        job.replay = structuredClone(replay);
        await delay(0);
      },
    )
      .then(async (replay) => {
        await this.storage.saveReplay(replay);
        job.replay = replay;
        job.status = "COMPLETED";
      })
      .catch((error) => {
        job.error = controller.signal.aborted
          ? "Cancelled"
          : error instanceof Error
            ? error.message
            : "Match failed";
        job.status = "VOID";
      })
      .finally(() => {
        job.requests = budget.used;
        this.controllers.delete(id);
      });
    return id;
  }
  cancel(id: string) {
    this.controllers.get(id)?.abort();
  }
}
