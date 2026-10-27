import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { CHARACTERS } from "../src/core/characters";
import { SPRITE_FRAMES } from "../src/web/sprites";
import manifest from "../src/web/public/arena/sprites/manifest.json";

describe("restored character assets", () => {
  it("bundles a real PNG frame for every character and animation", async () => {
    expect(CHARACTERS).toHaveLength(5);
    for (const character of CHARACTERS) {
      expect(manifest.characters).toHaveProperty(character.id);
      for (const frame of SPRITE_FRAMES) {
        const file = path.resolve("src/web/public/arena/sprites", character.id, `${frame}.png`);
        const png = await readFile(file);
        expect(png.subarray(0, 8).toString("hex"), file).toBe("89504e470d0a1a0a");
        expect([png.readUInt32BE(16), png.readUInt32BE(20)], file).toEqual(manifest.cell);
      }
    }
  });
});
