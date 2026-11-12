/**
 * Glasses. Front: one frame ring per eye (eyes at x12-13 / x18-19, rows 14-16) plus temples
 * to the ears; side: lens in front of the eye and a temple arm to the ear.
 * Tints: clear = eyes untouched + a glint; light = lens colour with the eyes mixed through;
 * dark = opaque lens.
 */
import type { CharacterLook } from "@agent-office/protocol";
import { type PixelCanvas, packColor } from "../pixel.ts";
import { hash2, lighten, mix, NIGHT } from "./color.ts";
import type { View } from "./geometry.ts";
import { EYE_X, faceSides } from "./head.ts";

type Eyewear = CharacterLook["eyewear"];

function frameColor(e: Eyewear, x: number, y: number): string {
  if (e.framePattern !== "tortoiseshell") return e.frame;
  const h = hash2(x, y, 23) % 4;
  return h === 0 ? e.frameAccent : h === 3 ? mix(e.frame, "#d77643", 0.4) : e.frame;
}

/** Ring texels relative to the lens box (lens box = 4×4 at ex-1.., rows 13..16). */
function ringFor(
  style: Eyewear["style"],
  left: boolean,
): { ring: [number, number][]; lens: [number, number][] } {
  const ring: [number, number][] = [];
  const lens: [number, number][] = [];
  // default lens box: x -1..2 (relative to eye x), rows 13..16
  let x0 = -1;
  let x1 = 2;
  let y0 = 13;
  let y1 = 16;
  if (style === "rectangle") {
    x0 = -2;
    x1 = 3;
    y0 = 14;
    y1 = 16;
  } else if (style === "square") {
    y1 = 16;
    y0 = 13;
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) lens.push([x, y]);
  // ring around the lens box
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    ring.push([x, y0 - 1]);
    ring.push([x, y1 + 1]);
  }
  for (let y = y0; y <= y1; y++) {
    ring.push([x0 - 1, y]);
    ring.push([x1 + 1, y]);
  }
  const drop = (pts: [number, number][], x: number, y: number) => {
    const i = pts.findIndex(([a, b]) => a === x && b === y);
    if (i >= 0) pts.splice(i, 1);
  };
  const outer = left ? x0 - 1 : x1 + 1;
  const inner = left ? x1 + 1 : x0 - 1;
  switch (style) {
    case "round":
      for (const [x, y] of [
        [x0 - 1, y0 - 1],
        [x1 + 1, y0 - 1],
        [x0 - 1, y1 + 1],
        [x1 + 1, y1 + 1],
      ] as const)
        drop(ring, x, y);
      break;
    case "panto":
      // flat top, round bottom (keyhole-ish bridge from the flat tops)
      drop(ring, x0 - 1, y1 + 1);
      drop(ring, x1 + 1, y1 + 1);
      drop(lens, x0, y1);
      drop(lens, x1, y1);
      ring.push([x0, y1]);
      ring.push([x1, y1]);
      drop(ring, x0, y1 + 1);
      drop(ring, x1, y1 + 1);
      break;
    case "aviator":
      // straight top, teardrop bottom toward the nose
      drop(ring, outer, y1 + 1);
      drop(ring, outer, y1);
      drop(lens, left ? x0 : x1, y1);
      ring.push([left ? x0 : x1, y1]);
      drop(ring, left ? x0 : x1, y1 + 1);
      ring.push([inner, y0 - 2 + 1]);
      break;
    case "cat-eye":
      drop(ring, x0 - 1, y1 + 1);
      drop(ring, x1 + 1, y1 + 1);
      ring.push([outer, y0 - 2]);
      ring.push([outer + (left ? -1 : 1), y0 - 2]);
      ring.push([outer + (left ? -1 : 1), y0 - 1]);
      break;
    default:
  }
  return { ring, lens };
}

// ---- crazy wardrobe (WD12): novelty frames, 3D glasses, monocle, cyber visor ----------------
type Pt = [number, number];
/** A shape from ASCII rows ('#' = in) at (x0, y0), split into its rim and its inside. */
function shape(rows: readonly string[], x0: number, y0: number): { ring: Pt[]; lens: Pt[] } {
  const inside = new Set<string>();
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) if (r[i] === "#") inside.add(`${x0 + i},${y0 + j}`);
  });
  const has = (x: number, y: number) => inside.has(`${x},${y}`);
  const ring: Pt[] = [];
  const lens: Pt[] = [];
  for (const k of inside) {
    const [x, y] = k.split(",").map(Number) as Pt;
    const inner = has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1);
    (inner ? lens : ring).push([x, y]);
  }
  return { ring, lens };
}
const HEART = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
const STAR = ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "##...##"];
const HEART_SIDE = ["##.##", "#####", ".###.", "..#.."];
const STAR_SIDE = ["..#..", ".###.", "#####", ".###.", "##.##"];
const RED_3D = "#e43b44";
const CYAN_3D = "#2ce8f5";

/** Lens texels as the tint wants them (clear leaves them be). */
function fillLens(
  pc: PixelCanvas,
  L: CharacterLook,
  lens: readonly Pt[],
  hy: number,
  color: string,
  tint: Eyewear["tint"],
) {
  const eyePacked = packColor(L.face.eyeColor);
  for (const [x, y] of lens) {
    const isEye = pc.get(x, y + hy) === eyePacked;
    if (tint === "dark") pc.set(x, y + hy, color);
    else if (tint === "light") pc.set(x, y + hy, isEye ? mix(color, L.face.eyeColor, 0.35) : color);
  }
}

/** Heart and star frames: a whole shape per eye, glint top-left. */
function drawShapeFrames(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const e = L.eyewear;
  const heart = e.style === "heart";
  const parts =
    view === "left"
      ? [heart ? shape(HEART_SIDE, 7, 13) : shape(STAR_SIDE, 7, 12)]
      : EYE_X.map((ex, i) => {
          // 7 wide: the two shapes meet at the bridge
          const x0 = ex - 3 + i;
          return heart ? shape(HEART, x0, 12) : shape(STAR, x0, 11);
        });
  for (const { ring, lens } of parts) {
    fillLens(pc, L, lens, hy, e.lens, e.tint);
    const [gx, gy] = lens.reduce((a, b) => (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a));
    pc.set(
      gx,
      gy + hy,
      e.tint === "clear" ? e.lens : lighten(e.lens, e.tint === "dark" ? 0.3 : 0.6),
    );
    for (const [x, y] of ring) pc.set(x, y + hy, frameColor(e, x, y));
  }
  const ty = 14 + hy;
  if (view === "left") {
    for (let x = 12; x <= 16; x++) pc.set(x, ty, frameColor(e, x, 14));
    return;
  }
  const [l, r] = faceSides(L.face.shape);
  for (let x = l; x <= EYE_X[0] - 4; x++) pc.set(x, ty, frameColor(e, x, 14));
  for (let x = EYE_X[1] + 5; x <= r; x++) pc.set(x, ty, frameColor(e, x, 14));
}

/** Cardboard 3D glasses: one red lens, one cyan lens, whatever the lens colour says. */
function draw3d(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const e = L.eyewear;
  const tint = e.tint === "dark" ? "dark" : "light";
  if (view === "left") {
    const box: Pt[] = [];
    for (let y = 14; y <= 16; y++) for (let x = 9; x <= 11; x++) box.push([x, y]);
    fillLens(pc, L, box, hy, RED_3D, tint);
    for (let x = 8; x <= 12; x++) {
      pc.set(x, 13 + hy, frameColor(e, x, 13));
      pc.set(x, 17 + hy, frameColor(e, x, 17));
    }
    pc.vline(8, 14 + hy, 3, frameColor(e, 8, 14));
    pc.vline(12, 14 + hy, 3, frameColor(e, 12, 14));
    for (let x = 13; x <= 16; x++) pc.set(x, 14 + hy, frameColor(e, x, 14));
    return;
  }
  const [l, r] = faceSides(L.face.shape);
  for (let y = 13; y <= 17; y++)
    for (let x = 9; x <= 22; x++) pc.set(x, y + hy, frameColor(e, x, y));
  const lensOf = (x0: number): Pt[] => {
    const pts: Pt[] = [];
    for (let y = 14; y <= 16; y++) for (let x = x0; x <= x0 + 4; x++) pts.push([x, y]);
    return pts;
  };
  for (const [x0, col] of [
    [10, RED_3D],
    [17, CYAN_3D],
  ] as const) {
    const pts = lensOf(x0);
    fillLens(pc, L, pts, hy, col, tint);
    pc.set(x0, 14 + hy, lighten(col, 0.5));
  }
  // the nose notch
  pc.set(15, 17 + hy, mix(e.frame, NIGHT, 0.35));
  pc.set(16, 17 + hy, mix(e.frame, NIGHT, 0.35));
  for (let x = l; x <= 8; x++) pc.set(x, 14 + hy, frameColor(e, x, 14));
  for (let x = 23; x <= r; x++) pc.set(x, 14 + hy, frameColor(e, x, 14));
}

/** One round lens on the viewer's right eye (the side view's eye) and its chain. */
function drawMonocle(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const e = L.eyewear;
  const ROUND = [".####.", "######", "######", "######", "######", ".####."];
  const side = view === "left";
  const { ring, lens } = shape(ROUND, side ? 7 : EYE_X[1] - 2, 12);
  fillLens(pc, L, lens, hy, e.lens, e.tint);
  const [gx, gy] = lens[0]!;
  pc.set(gx, gy + hy, e.tint === "clear" ? lighten(e.lens, 0.4) : lighten(e.lens, 0.6));
  for (const [x, y] of ring) pc.set(x, y + hy, frameColor(e, x, y));
  // the chain hangs from the rim down past the jaw
  const chain: Pt[] = side
    ? [
        [12, 18],
        [12, 19],
        [13, 20],
        [13, 21],
        [14, 22],
        [14, 23],
        [15, 24],
      ]
    : [
        [21, 18],
        [22, 19],
        [22, 20],
        [23, 21],
        [23, 22],
        [23, 23],
        [22, 24],
        [22, 25],
      ];
  chain.forEach(([x, y], i) => {
    pc.set(x, y + hy, i % 2 ? mix(e.frame, NIGHT, 0.35) : lighten(e.frame, 0.25));
  });
}

/** One wide glowing band across both eyes; from behind its strap shows. */
function drawVisor(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const e = L.eyewear;
  const glow = e.tint === "dark" ? e.lens : lighten(e.lens, 0.15);
  const bright = lighten(e.lens, 0.65);
  const eyePacked = packColor(L.face.eyeColor);
  const rim = frameColor(e, 0, 0);
  const rimDark = mix(e.frame, NIGHT, 0.35);
  if (view === "up") {
    // the strap round the back of the head
    const [l, r] = faceSides(L.face.shape);
    for (let x = l - 1; x <= r + 1; x++) {
      pc.set(x, 14 + hy, frameColor(e, x, 14));
      pc.set(x, 15 + hy, rimDark);
    }
    pc.set(15, 14 + hy, bright);
    pc.set(16, 14 + hy, glow);
    return;
  }
  const [x0, x1] =
    view === "left"
      ? [6, 13]
      : (() => {
          const [l, r] = faceSides(L.face.shape);
          return [l - 1, r + 1];
        })();
  for (let x = x0; x <= x1; x++) {
    pc.set(x, 13 + hy, frameColor(e, x, 13));
    pc.set(x, 16 + hy, rimDark);
    for (const y of [14, 15]) {
      const isEye = pc.get(x, y + hy) === eyePacked;
      const c =
        isEye && e.tint !== "dark"
          ? mix(glow, L.face.eyeColor, e.tint === "clear" ? 0.55 : 0.3)
          : y === 14 && (x + 64) % 5 !== 0
            ? bright
            : glow;
      pc.set(x, y + hy, c);
    }
  }
  // end caps
  for (const x of view === "left" ? [x0] : [x0, x1]) {
    pc.set(x, 14 + hy, rim);
    pc.set(x, 15 + hy, rimDark);
  }
  if (view === "left") for (let x = x1 + 1; x <= 17; x++) pc.set(x, 14 + hy, rim);
}

/** The WD12 styles; false = not one of them. */
function drawNoveltyEyewear(pc: PixelCanvas, L: CharacterLook, view: View, hy: number): boolean {
  switch (L.eyewear.style) {
    case "heart":
    case "star":
      if (view !== "up") drawShapeFrames(pc, L, view, hy);
      return true;
    case "3d":
      if (view !== "up") draw3d(pc, L, view, hy);
      return true;
    case "monocle":
      if (view !== "up") drawMonocle(pc, L, view, hy);
      return true;
    case "cyber-visor":
      drawVisor(pc, L, view, hy);
      return true;
    default:
      return false;
  }
}

export function drawEyewear(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const e = L.eyewear;
  if (drawNoveltyEyewear(pc, L, view, hy)) return;
  if (e.style === "none" || view === "up") return;
  if (view === "left") {
    drawSide(pc, L, hy);
    return;
  }
  const eyePacked = packColor(L.face.eyeColor);
  for (const ex of EYE_X) {
    const left = ex === EYE_X[0];
    const { ring, lens } = ringFor(e.style, left);
    for (const [dx, y] of lens) {
      const x = ex + dx;
      const yy = y + hy;
      const isEye = pc.get(x, yy) === eyePacked;
      if (e.tint === "dark") pc.set(x, yy, e.lens);
      else if (e.tint === "light")
        pc.set(x, yy, isEye ? mix(e.lens, L.face.eyeColor, 0.35) : e.lens);
    }
    // glint, top-left of each lens
    const [gx, gy] = lens[0]!;
    pc.set(
      ex + gx,
      gy + hy,
      e.tint === "clear" ? e.lens : lighten(e.lens, e.tint === "dark" ? 0.3 : 0.6),
    );
    for (const [dx, y] of ring) pc.set(ex + dx, y + hy, frameColor(e, ex + dx, y));
  }
  // temples to the ears
  const [l, r] = faceSides(L.face.shape);
  const ty = (e.style === "rectangle" ? 13 : 12) + hy + 1;
  for (let x = l; x <= EYE_X[0] - 3; x++) pc.set(x, ty, frameColor(e, x, ty));
  for (let x = EYE_X[1] + 4; x <= r; x++) pc.set(x, ty, frameColor(e, x, ty));
}

function drawSide(pc: PixelCanvas, L: CharacterLook, hy: number) {
  const e = L.eyewear;
  const eyePacked = packColor(L.face.eyeColor);
  const y0 = e.style === "rectangle" ? 14 : 13;
  const y1 = 16;
  // lens seen from the side: x9..11 in front of the eye (x10-11)
  for (let y = y0; y <= y1; y++) {
    for (let x = 9; x <= 11; x++) {
      const isEye = pc.get(x, y + hy) === eyePacked;
      if (e.tint === "dark") pc.set(x, y + hy, e.lens);
      else if (e.tint === "light")
        pc.set(x, y + hy, isEye ? mix(e.lens, L.face.eyeColor, 0.35) : e.lens);
    }
  }
  // front rim + top/bottom
  for (let y = y0 - 1; y <= y1 + 1; y++) pc.set(8, y + hy, frameColor(e, 8, y));
  const round = e.style === "round" || e.style === "panto" || e.style === "cat-eye";
  for (let x = round ? 9 : 8; x <= 12; x++) {
    pc.set(x, y0 - 1 + hy, frameColor(e, x, y0 - 1));
    if (!(round && x === 12) && e.style !== "aviator")
      pc.set(x, y1 + 1 + hy, frameColor(e, x, y1 + 1));
  }
  if (e.style === "aviator") pc.hline(9, y1 + 1 + hy, 2, frameColor(e, 9, y1 + 1));
  pc.vline(12, y0 + hy, y1 - y0 + 1, frameColor(e, 12, y0));
  if (e.style === "cat-eye") pc.set(13, y0 - 2 + hy, e.frame);
  // temple arm to the ear
  for (let x = 13; x <= 16; x++) pc.set(x, y0 + hy, frameColor(e, x, y0));
}
