import { afterEach, describe, it, expect, vi } from "vitest";
import { parseDecision, RequestBudget, createPolicy } from "../src/providers/decision";
import { ACTIONS } from "../src/core/mental-attack";
import { newGame } from "../src/core/engine";
const response = () => ({
  answers: {
    move: {
      choice: "mental_attack",
      probabilities: Object.fromEntries(ACTIONS.map((m) => [m, 1 / ACTIONS.length])),
    },
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("decision provider boundary", () => {
  it("accepts normalized choice and yes/no distributions", () => {
    expect(parseDecision(response()).move).toBe("mental_attack");
    const noul = {
      answers: Object.fromEntries(ACTIONS.map((m) => [m, { noul: m === "kick" ? 0.8 : 0.1 }])),
    };
    expect(parseDecision(noul, "noul").move).toBe("kick");
  });
  it("rejects unknown choices, missing, negative, nonfinite, and empty probabilities", () => {
    for (const value of [undefined, -1, NaN, Infinity]) {
      const data = response();
      (data.answers.move.probabilities as Record<string, unknown>).kick = value;
      expect(() => parseDecision(data)).toThrow();
    }
    const empty = response();
    for (const key in empty.answers.move.probabilities) empty.answers.move.probabilities[key] = 0;
    expect(() => parseDecision(empty)).toThrow();
    const unknown = response();
    unknown.answers.move.choice = "win";
    expect(() => parseDecision(unknown)).toThrow();
  });
  it("reserves a request attempt before sending and never exceeds the cap", async () => {
    vi.stubEnv("TEST_PROVIDER_KEY", "test-key");
    const fetch = vi.fn(async () => Response.json(response()));
    vi.stubGlobal("fetch", fetch);
    const attempts: number[] = [];
    const budget = new RequestBudget(1, (used) => attempts.push(used));
    const decide = createPolicy(
      {
        id: "test",
        name: "Test",
        maker: "Test",
        kind: "api",
        color: "#111111",
        endpoint: "https://example.invalid/decisions",
        upstream: "test",
        keyEnv: "TEST_PROVIDER_KEY",
        requestsPerSecond: 100000,
      },
      1,
      budget,
    );
    await decide(newGame(), 0, "observation", new AbortController().signal);
    await expect(decide(newGame(), 0, "observation", new AbortController().signal)).rejects.toThrow(
      "budget exhausted",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([1]);
  });
  it("does not convert a provider failure to a game action", async () => {
    vi.stubEnv("TEST_PROVIDER_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    const policy = createPolicy(
      {
        id: "bad",
        name: "Bad",
        maker: "Test",
        kind: "api",
        color: "#111111",
        endpoint: "https://example.invalid/denied",
        upstream: "bad",
        keyEnv: "TEST_PROVIDER_KEY",
      },
      1,
      new RequestBudget(1),
    );
    await expect(policy(newGame(), 0, "state", new AbortController().signal)).rejects.toThrow(
      "HTTP 401",
    );
  });
});
