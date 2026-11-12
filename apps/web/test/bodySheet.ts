/**
 * Test helper: a painted sheet without its headroom rows (WD2), i.e. the 48 body rows every
 * row assertion and pinned checksum was written against. A look that keeps its pixels in the
 * body window and leaves the headroom empty hashes exactly as before the headroom existed.
 */
import { BODY_ROWS, HEADROOM } from "../src/art/avatar/geometry.ts";
import type { RenderLook } from "../src/art/avatar/renderLook.ts";
import { paintSheet } from "../src/art/avatar/sheet.ts";
import { PixelCanvas } from "../src/art/pixel.ts";

export function bodyOnly(full: PixelCanvas): PixelCanvas {
  const pc = new PixelCanvas(full.width, BODY_ROWS);
  pc.data.set(full.data.subarray(HEADROOM * full.width, (HEADROOM + BODY_ROWS) * full.width));
  return pc;
}

export const paintBody = (r: RenderLook): PixelCanvas => bodyOnly(paintSheet(r));
