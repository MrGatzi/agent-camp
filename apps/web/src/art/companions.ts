/**
 * Companions: small friends that now and then tag along with a character (catalog
 * `companion`). Drawn at 1 texel per world pixel, like the office cats, from the Endesga
 * palette only. Two frames each: the eye blinks, the pig steps.
 *
 * - eye: a small glowing golden triangle with one eye (the old "eye of providence" motif)
 * - pig: a little pink pig seen from the side, facing left, with a darker spot on its back
 */
import { C } from "./palette.ts";
import { PixelCanvas } from "./pixel.ts";

export type CompanionKind = "eye" | "pig";
export const COMPANION_SIZE: Record<CompanionKind, { w: number; h: number }> = {
  eye: { w: 13, h: 12 },
  pig: { w: 14, h: 10 },
};

/** Eye in a triangle, apex up; frame 1 = blinking. */
function paintEye(p: PixelCanvas, frame: number): void {
  const { w, h } = COMPANION_SIZE.eye;
  const cx = (w - 1) / 2;
  // filled triangle with a night outline and a lighter left face
  for (let y = 0; y < h; y++) {
    const half = Math.round((y * cx) / (h - 1));
    for (let x = cx - half; x <= cx + half; x++) {
      const edge = x === cx - half || x === cx + half || y === h - 1;
      p.set(x, y, edge ? C.night : x < cx - half / 3 ? C.lemon : C.amber);
    }
  }
  // the eye: white almond with an ink pupil, or a closed lid line when blinking
  const ey = 7;
  if (frame === 1) {
    p.hline(cx - 2, ey, 5, C.night);
  } else {
    p.hline(cx - 1, ey - 1, 3, C.white);
    p.hline(cx - 2, ey, 5, C.white);
    p.hline(cx - 1, ey + 1, 3, C.white);
    p.set(cx, ey, C.night);
    p.set(cx - 2, ey, C.silver);
    p.set(cx + 2, ey, C.silver);
  }
}

/** Little pig facing left; frame 1 = the other pair of legs forward. */
function paintPig(p: PixelCanvas, frame: number): void {
  const body = C.pink;
  const shade = C.berry;
  // legs first (the body overlaps their tops): two pairs, alternating while it trots
  const legs = frame === 0 ? [3, 5, 9, 11] : [4, 6, 8, 10];
  for (const x of legs) {
    p.rect(x, 6, 1, 4, shade);
    p.set(x, 9, C.night); // trotter
  }
  // round body and head
  p.ellipse(2, 1, 11, 6, body);
  p.ellipse(0, 2, 6, 4, body);
  // belly in shade so the shape reads at 1×
  for (let x = 4; x <= 10; x++) p.set(x, 6, shade);
  // darker spot on the back
  p.rect(8, 2, 3, 2, shade);
  p.set(9, 4, shade);
  // ear, eye, snout with a nostril
  p.set(2, 1, shade);
  p.set(3, 1, shade);
  p.set(3, 2, shade);
  p.set(2, 4, C.night);
  p.rect(0, 4, 1, 2, C.peach);
  p.set(0, 5, shade);
  // curly tail
  p.set(13, 3, shade);
  p.set(13, 2, shade);
  p.set(12, 1, shade);
}

/** A companion frame as a canvas (for a Pixi texture). */
export function companionCanvas(kind: CompanionKind, frame: number): HTMLCanvasElement {
  return companionPixels(kind, frame).toCanvas();
}

/** The same frame as pixels (tests, previews). */
export function companionPixels(kind: CompanionKind, frame: number): PixelCanvas {
  const { w, h } = COMPANION_SIZE[kind];
  const p = new PixelCanvas(w, h);
  if (kind === "eye") paintEye(p, frame);
  else paintPig(p, frame);
  return p;
}
