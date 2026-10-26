import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadDataset } from "../src/server/storage";
import { verifyReplay, playMatch } from "../src/core/match";
import { defaultFighter } from "../src/core/config";
import { createPolicy, RequestBudget } from "../src/providers/decision";
import { modelById } from "../src/providers/registry";
import { newGame, MAX_HP } from "../src/core/engine";
import { MentalAttacks, MENTAL_COOLDOWN } from "../src/core/mental-attack";

describe("published replay compatibility", () => {
  it("replays all420 published fights and verifies their original byte hashes", async () => {
    const data = await loadDataset();
    expect(Object.keys(data.matches)).toHaveLength(420);
    for (const record of data.validation.files) {
      const raw = data.matches[record.id];
      expect(createHash("sha256").update(raw).digest("hex")).toBe(record.sha256);
      expect(() => verifyReplay(JSON.parse(raw))).not.toThrow();
    }
  });
  it("detects a changed action log", async () => {
    const data = await loadDataset();
    const replay = JSON.parse(Object.values(data.matches)[0]);
    replay.d[0][0] = replay.d[0][0] === 0 ? 1 : 0;
    replay.hash = "changed";
    expect(() => verifyReplay(replay)).toThrow();
  });
  it("produces complete deterministic matches without API keys", async () => {
    const configs: [typeof defaultFighter, typeof defaultFighter] = [
      { ...defaultFighter, id: "cpu", model: "scripted" },
      { ...defaultFighter, id: "random", model: "random" },
    ];
    const play = () => {
      const budget = new RequestBudget(1);
      return playMatch(
        "test",
        43,
        configs,
        [
          createPolicy(modelById("scripted"), 43, budget),
          createPolicy(modelById("random"), 44, budget),
        ],
        new AbortController().signal,
      );
    };
    const a = await play(),
      b = await play();
    expect(a.hash).toBe(b.hash);
    expect(a.d).toEqual(b.d);
    expect(a.observations?.length).toBe(a.d.length);
    expect(verifyReplay(a).over).toBe(true);
  });
});
describe("mental attacks", () => {
  it("delivers the selected message once without changing HP", () => {
    const s = newGame(1);
    const mental = new MentalAttacks(["LEFT", "RIGHT"]);
    expect(mental.resolve(s, ["kick", "block"], 0)).toEqual([]);
    expect(mental.receive(s, 1)).toBe("");
    expect(mental.resolve(s, ["mental_attack", "mental_attack"], 1)).toHaveLength(2);
    expect(s.fighters.map((f) => f.hp)).toEqual([MAX_HP, MAX_HP]);
    expect(mental.receive(s, 1)).toBe("LEFT");
    expect(mental.receive(s, 1)).toBe("");
    expect(mental.resolve(s, ["mental_attack", "block"], 2)).toEqual([]);
    s.tick += MENTAL_COOLDOWN;
    expect(mental.available(s, 0)).toBe(true);
  });
  it("rejects attacks while stunned and clears pending messages at a new round", () => {
    const s = newGame(1);
    const mental = new MentalAttacks(["LEFT", ""]);
    s.fighters[0].stun = 10;
    expect(mental.available(s, 0)).toBe(false);
    s.fighters[0].stun = 0;
    mental.resolve(s, ["mental_attack", "block"], 0);
    s.round++;
    expect(mental.receive(s, 1)).toBe("");
    expect(mental.available(s, 1)).toBe(false);
  });
});
