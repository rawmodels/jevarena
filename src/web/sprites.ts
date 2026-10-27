import manifest from "./public/arena/sprites/manifest.json";
import { attackPhase, FIREBALL, type Fighter } from "../core/engine";

export const SPRITE_FRAMES = [
  "idle",
  "block",
  "crouch",
  "jump",
  "jump_back",
  "stunned",
  "downed",
  ...["light_punch", "heavy_punch", "kick", "sweep", "jump_kick", "fireball"].flatMap((m) =>
    [0, 1, 2].map((n) => `${m}_${n}`),
  ),
  ...["walk_forward", "walk_back"].flatMap((m) => [0, 1].map((n) => `${m}_${n}`)),
];
type Character = keyof typeof manifest.characters;
const images = new Map<string, CanvasImageSource>();
const loading = new Map<string, Promise<void>>();
export const spriteUrl = (character: string, frame = "idle") =>
  `/arena/sprites/${character}/${frame}.png?v=${manifest.version}`;
export function registerSprite(character: string, frame: string, image: CanvasImageSource) {
  images.set(`${character}/${frame}`, image);
}
export function warmCharacterSprites(characters: string[]) {
  if (typeof Image === "undefined") return Promise.resolve();
  return Promise.all(
    characters.flatMap((character) =>
      SPRITE_FRAMES.map((frame) => {
        const key = `${character}/${frame}`;
        if (!loading.has(key))
          loading.set(
            key,
            new Promise<void>((resolve) => {
              const image = new Image();
              image.onload = () => {
                registerSprite(character, frame, image);
                resolve();
              };
              image.onerror = () => {
                loading.delete(key);
                resolve();
              };
              image.src = spriteUrl(character, frame);
            }),
          );
        return loading.get(key)!;
      }),
    ),
  ).then(() => {});
}
export function spriteFrame(f: Fighter, tick: number, over = false, lost = false): string {
  if (over) return lost ? "downed" : "idle";
  if (f.stun > 0) return f.stunKind === "down" ? "downed" : "stunned";
  if (f.act === "walk_forward" || f.act === "walk_back")
    return `${f.act}_${Math.floor(tick / 7) % 2}`;
  if (f.act === "land") return "crouch";
  if (f.act === "fireball")
    return `fireball_${f.t < FIREBALL.startup ? 0 : f.t < FIREBALL.startup + 6 ? 1 : 2}`;
  const phase = attackPhase(f);
  if (phase) return `${f.act}_${phase === "startup" ? 0 : phase === "active" ? 1 : 2}`;
  if (f.act === "block" || f.act === "crouch") return f.act;
  return "idle";
}
export function hasCharacterSprite(character: string) {
  return images.has(`${character}/idle`);
}
export function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  character: string,
  frame: string,
  floor: number,
  tick: number,
  twin: boolean,
  viewLeft: number,
  viewRight: number,
) {
  const meta = manifest.characters[character as Character];
  if (!meta) return false;
  const image = images.get(`${character}/${frame}`) ?? images.get(`${character}/idle`);
  if (!image) return false;
  const scale = 136 / meta.height;
  const [cw, ch] = manifest.cell;
  const ext = meta.extent[frame as keyof typeof meta.extent] ?? meta.extent.idle;
  const [behind, ahead] = f.facing === 1 ? ext : [ext[1], ext[0]];
  const x = Math.min(viewRight - 4 - ahead * scale, Math.max(viewLeft + 4 + behind * scale, f.x));
  const bob = frame === "idle" ? Math.sin(tick / 10) : 0;
  ctx.save();
  ctx.translate(x, floor - f.y + manifest.foot * scale + bob);
  ctx.scale(f.facing, 1);
  const filters = [];
  if (twin) filters.push("hue-rotate(150deg) saturate(1.3)");
  if (f.stun > 0 && f.stunKind === "hit" && f.stun % 4 < 2 && f.hp > 0)
    filters.push("brightness(1.8) saturate(.5)");
  if (filters.length) ctx.filter = filters.join(" ");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, (-cw * scale) / 2, -ch * scale, cw * scale, ch * scale);
  ctx.restore();
  return true;
}
