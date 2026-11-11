/**
 * Paper-doll characters. One HD painter (art/avatar/*) draws everybody from a CharacterLook:
 * the avatar's own `look`, or one derived from its catalog fields (`resolveLook`).
 *
 * Frames are 32×48 texels at 2× density and shown at 16×24 world px (texture resolution 2),
 * so layout, seats, hit-testing and animations are unchanged. One sheet (35 frames) per
 * RenderLook; sheets are cached so siblings and re-joins reuse them.
 */
import { CanvasSource, Rectangle, Texture } from "pixi.js";
import { ANIM, type AnimName, FH, FW, SPECS } from "./avatar/geometry.ts";
import { RefCache } from "./avatar/refCache.ts";
import { lookFor, type RenderLook, renderKey } from "./avatar/renderLook.ts";
import { paintSheet } from "./avatar/sheet.ts";

/** Character frame size in world px. */
export const CHAR_W = 16;
export const CHAR_H = 24;
/** Texels per world px of the character textures. */
export const CHAR_RES = FW / CHAR_W;

export { ANIM, type AnimName, lookFor, type RenderLook };
/** @deprecated name kept for older imports */
export type Look = RenderLook;
export const lookKey = renderKey;

export type CharacterSheet = { frames: Texture[]; anims: Record<AnimName, Texture[]> };

function buildSheet(look: RenderLook): CharacterSheet {
  const pc = paintSheet(look);
  // resolution 2: frame rectangles below are in world px, each world px holds 2×2 texels
  const source = new CanvasSource({
    resource: pc.toCanvas(),
    resolution: CHAR_RES,
    scaleMode: "nearest",
  });
  const frames = SPECS.map(
    (_, i) => new Texture({ source, frame: new Rectangle(i * CHAR_W, 0, CHAR_W, CHAR_H) }),
  );
  const anims = {} as Record<AnimName, Texture[]>;
  for (const [name, idx] of Object.entries(ANIM)) {
    anims[name as AnimName] = idx.map((i) => frames[i]!);
  }
  return { frames, anims };
}

/** Looks currently being built (RefCache builds from the key; the key is the look's JSON). */
const sheets = new RefCache<CharacterSheet>(
  (key) => buildSheet(JSON.parse(key) as RenderLook),
  (sheet) => {
    const source = sheet.frames[0]?.source;
    for (const f of sheet.frames) f.destroy(false);
    source?.destroy();
  },
);

/**
 * The sheet for a look, shared by everyone with the same RenderLook. Each call holds one
 * reference: pair it with `releaseSheet` when the sheet is no longer shown, so its texture
 * can be freed (free-hex looks make the key space unbounded).
 */
export function characterSheet(look: RenderLook): CharacterSheet {
  return sheets.acquire(renderKey(look));
}

/** Give back one reference from `characterSheet`; the texture is destroyed at zero. */
export function releaseSheet(sheet: CharacterSheet): void {
  sheets.release(sheet);
}

/** Number of distinct sheets alive (diagnostics, tests). */
export const liveSheets = () => sheets.size;

/** Texel size of one frame (for copying a frame out of the sheet canvas, e.g. HUD portrait). */
export const FRAME_TEXELS = { w: FW, h: FH } as const;
