/** Per-frame painting context shared by the part painters. */
import type { CharacterLook, FullLook, Ramp } from "@agent-office/protocol";
import type { PixelCanvas } from "../pixel.ts";
import type { FrameSpec, View } from "./geometry.ts";
import type { RenderLook } from "./renderLook.ts";

export type Ctx = {
  pc: PixelCanvas;
  r: RenderLook;
  /** the look, every wardrobe section present (withWardrobe) */
  L: FullLook;
  f: FrameSpec;
  view: View;
  /** head + torso vertical offset (bob + seat drop - height lift) */
  dy: number;
  /**
   * Height (WD3): texels the head, torso and arms are drawn higher than an average body
   * (negative = lower). Legs are painted at average height and stretched to meet the torso.
   */
  lift: number;
  /**
   * Where a row of the average-height leg layer ends up after the height stretch (lets
   * painters outside the leg layer, like the apron, meet a skirt hem).
   */
  legRow: (y: number) => number;
  /** torso columns (inclusive) for the current view */
  tl: number;
  tr: number;
  /** the look's pose applies (standing idle front) */
  posed: boolean;
  /** sleeve colours: outer garment if any, else shirt */
  sleeve: Ramp;
  /** painters that run after the outline (thin held items and their smoke) */
  after: (() => void)[];
};

/**
 * Torso columns of one row (y) for the build *and* figure (WD4): curvy = waist in, hips out;
 * belly = rounder middle; muscular = wider shoulders. `b.T` is the shoulder row, `b.W` the
 * waistband. Painters of the torso and of the bare body use it for their outline.
 */
export function torsoSpan(c: Ctx, y: number, T: number, W: number): [number, number] {
  let l = c.tl;
  let r = c.tr;
  const side = c.view === "left";
  switch (c.L.body.figure) {
    case "curvy":
      if (y >= W - 2 && y <= W - 1) {
        l += 1;
        if (!side) r -= 1;
      } else if (y >= W + 1) {
        l -= 1;
        if (!side) r += 1;
      }
      break;
    case "belly":
      if (y >= W - 4 && y <= W) {
        const k = y === W - 4 || y === W ? 0 : 1;
        if (side) l -= k + 1;
        else {
          l -= k;
          r += k;
        }
      }
      break;
    case "muscular":
      if (y >= T && y <= T + 2) {
        l -= 1;
        if (!side) r += 1;
      }
      break;
    default:
  }
  return [l, r];
}

/** Torso columns per build and view. */
export function torsoCols(build: CharacterLook["build"], view: View): [number, number] {
  if (view === "left") {
    if (build === "slim") return [11, 20];
    if (build === "broad") return [10, 22];
    return [10, 21];
  }
  if (build === "slim") return [9, 22];
  if (build === "broad") return [7, 24];
  return [8, 23];
}
