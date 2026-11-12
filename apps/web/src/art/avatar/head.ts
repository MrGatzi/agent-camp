/**
 * Head: skin silhouette per face shape and view, ears, eyes, brows, cheeks, mouth, facial hair.
 * Front head spans x6..25 (round face), rows 6..23 (+ head offset).
 */
import type { CharacterLook } from "@agent-office/protocol";
import { C } from "../palette.ts";
import type { PixelCanvas } from "../pixel.ts";
import { hash2, lighten, luma, mix, NIGHT, WHITE } from "./color.ts";
import type { View } from "./geometry.ts";

type Span = readonly [number, number];
/** Skin spans per row (index 0 = texel row 6) for the front/back view. */
const FRONT: Record<CharacterLook["face"]["shape"], Span[]> = {
  round: [
    [9, 22],
    [7, 24],
    ...Array.from({ length: 13 }, () => [6, 25] as const),
    [7, 24],
    [8, 23],
    [10, 21],
  ],
  oval: [
    [9, 22],
    [7, 24],
    ...Array.from({ length: 12 }, () => [6, 25] as const),
    [7, 24],
    [8, 23],
    [9, 22],
    [11, 20],
  ],
  narrow: [
    [10, 21],
    [8, 23],
    ...Array.from({ length: 12 }, () => [7, 24] as const),
    [7, 24],
    [8, 23],
    [9, 22],
    [11, 20],
  ],
  square: [[8, 23], ...Array.from({ length: 16 }, () => [6, 25] as const), [7, 24]],
};
const SIDE: Span[] = [
  [11, 20],
  [9, 22],
  ...Array.from({ length: 13 }, () => [8, 23] as const),
  [9, 22],
  [10, 21],
  [11, 19],
];

export const HEAD_TOP = 6;

/** Face span (inclusive) at a texel row, for the front view. */
export function faceSpan(shape: CharacterLook["face"]["shape"], row: number): Span | null {
  return FRONT[shape][row - HEAD_TOP] ?? null;
}

/** Face columns at eye level (front). */
export const faceSides = (shape: CharacterLook["face"]["shape"]) => faceSpan(shape, 15)!;

export function drawHeadSkin(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const s = L.skin;
  const spans = view === "left" ? SIDE : FRONT[L.face.shape];
  spans.forEach(([a, b], i) => {
    const y = HEAD_TOP + i + hy;
    for (let x = a; x <= b; x++) pc.set(x, y, s.base);
    if (view === "left") {
      // back of the head in shade
      pc.set(b, y, s.shadow);
    } else if (i >= 3) {
      pc.set(b, y, s.shadow); // right edge in shade (light from the upper left)
    }
  });
  const last = spans.length - 1;
  // chin / jaw shadow
  const [ca, cb] = spans[last]!;
  for (let x = ca; x <= cb; x++) pc.set(x, HEAD_TOP + last + hy, s.shadow);
  if (view !== "left") {
    const [pa, pb] = spans[last - 1]!;
    for (let x = pa; x <= pb; x++)
      if (x > (pa + pb) / 2 + 3) pc.set(x, HEAD_TOP + last - 1 + hy, s.shadow);
  }
  drawEars(pc, L, view, hy);
  if (view === "down") drawFaceFront(pc, L, hy);
  else if (view === "left") drawFaceSide(pc, L, hy);
}

function drawEars(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const s = L.skin;
  const ears = L.face.ears;
  if (ears === "hidden") return;
  // elf ears poke out through the hair: hair.ts paints them after the hair
  if (ears === "elf") return;
  if (view === "left") {
    // ear in the middle of the side head
    const x = 16;
    pc.rect(x, 14 + hy, 2, 4, s.base);
    pc.vline(x + 1, 14 + hy, 4, s.shadow);
    if (ears === "visible") {
      pc.set(x - 1, 15 + hy, s.shadow);
      pc.set(x - 1, 16 + hy, s.shadow);
      pc.set(x + 2, 15 + hy, s.shadow);
      pc.set(x + 2, 16 + hy, s.base);
    } else pc.set(x, 15 + hy, s.shadow);
    return;
  }
  const [l, r] = faceSides(L.face.shape);
  if (ears === "small") {
    pc.vline(l - 1, 14 + hy, 3, s.base);
    pc.vline(r + 1, 14 + hy, 3, s.shadow);
    return;
  }
  // visible: 2 wide, sitting close to the head, inner shade
  pc.rect(l - 2, 14 + hy, 2, 4, s.base);
  pc.set(l - 2, 13 + hy, s.base);
  pc.set(l - 1, 15 + hy, s.shadow);
  pc.set(l - 1, 16 + hy, s.shadow);
  pc.rect(r + 1, 14 + hy, 2, 4, s.shadow);
  pc.set(r + 2, 13 + hy, s.shadow);
  pc.set(r + 1, 15 + hy, mix(s.shadow, NIGHT, 0.25));
  pc.set(r + 1, 16 + hy, mix(s.shadow, NIGHT, 0.25));
}

/** Eye texels (front): two eyes, each 2 wide. Exported for the lens painter. */
export const EYE_X = [12, 18] as const;

function drawFaceFront(pc: PixelCanvas, L: CharacterLook, hy: number) {
  const f = L.face;
  const s = L.skin;
  const ec = f.eyeColor;
  for (const ex of EYE_X) drawEye(pc, f.eyes, ec, ex, hy, false);
  drawEyeshadow(pc, L, EYE_X[0], EYE_X[0] - 1, hy);
  drawEyeshadow(pc, L, EYE_X[1], EYE_X[1] + 2, hy);
  // brows
  if (f.brows !== "none") {
    const c = L.hair.ramp.shadow;
    for (const ex of EYE_X) {
      pc.hline(ex - (ex === EYE_X[0] ? 1 : 0), 11 + hy, 3, c);
      if (f.brows === "thick") pc.hline(ex - (ex === EYE_X[0] ? 1 : 0), 10 + hy, 3, c);
    }
  }
  // cheeks
  const cheekY = (f.expression === "grin" || f.expression === "big-smile" ? 17 : 18) + hy;
  if (f.cheeks === "blush") {
    const blush = mix(s.base, "#f6757a", 0.55);
    pc.hline(9, cheekY, 2, blush);
    pc.hline(21, cheekY, 2, blush);
  } else if (f.cheeks === "freckles") {
    const fr = mix(s.shadow, NIGHT, 0.2);
    for (const [x, y] of [
      [9, 0],
      [11, 1],
      [10, 2],
      [20, 0],
      [22, 1],
      [21, 2],
    ] as const)
      pc.set(x, cheekY - 1 + y, fr);
  } else drawFunCheeks(pc, L, cheekY, false);
  drawMouthFront(pc, L, hy);
  drawFacialHairFront(pc, L, hy);
}

export function drawEye(
  pc: PixelCanvas,
  kind: CharacterLook["face"]["eyes"],
  ec: string,
  ex: number,
  hy: number,
  side: boolean,
) {
  const w = side ? 2 : 2;
  switch (kind) {
    case "dot":
      pc.rect(ex, 14 + hy, w, 3, ec);
      break;
    case "round":
      pc.rect(ex, 13 + hy, w, 4, ec);
      pc.set(ex + (side ? 0 : 1), 13 + hy, WHITE);
      break;
    case "narrow":
      pc.hline(ex - (side ? 0 : 1) + (ex > 16 ? 1 : 0), 15 + hy, 3, ec);
      pc.hline(ex, 16 + hy, w, ec);
      break;
    case "happy":
      // ^ ^ closed eyes
      pc.set(ex - 1 + (side ? 1 : 0), 16 + hy, ec);
      pc.hline(ex, 15 + hy, 2, ec);
      if (!side) pc.set(ex + 2, 16 + hy, ec);
      break;
    default:
      drawFunEye(pc, kind, ec, ex, hy, side);
  }
}

const LIP = "#7a3040";

/** Makeup colours (WD1), null when the look wears none. */
const lipsOf = (L: CharacterLook): string | null => {
  const c = L.face.makeup?.lips;
  return c && c !== "none" ? c : null;
};
const shadowOf = (L: CharacterLook): string | null => {
  const c = L.face.makeup?.eyeshadow;
  return c && c !== "none" ? c : null;
};

/** Eyeshadow above an eye (front: eye at x ex..ex+1; side: x 10..11), with an outer wing. */
function drawEyeshadow(pc: PixelCanvas, L: CharacterLook, ex: number, outer: number, hy: number) {
  const c = shadowOf(L);
  if (!c) return;
  const y = (L.face.eyes === "round" || L.face.eyes === "spiral" ? 12 : 13) + hy;
  pc.hline(ex, y, 2, c);
  pc.set(outer, y, mix(c, NIGHT, 0.25));
  pc.set(outer, y + 1, mix(c, L.skin.base, 0.5));
}

function drawMouthFront(pc: PixelCanvas, L: CharacterLook, hy: number) {
  const s = L.skin;
  const lips = lipsOf(L);
  const dark = lips ? mix(lips, NIGHT, 0.15) : mix(s.shadow, LIP, 0.6);
  const y = 19 + hy;
  switch (L.face.expression) {
    case "neutral":
      if (lips) {
        pc.hline(15, y + 1, 2, lips);
        pc.hline(15, y + 2, 2, mix(lips, NIGHT, 0.3));
      } else pc.hline(15, y + 1, 2, s.shadow);
      break;
    case "serious":
      pc.hline(14, y + 1, 4, dark);
      break;
    case "smile":
      pc.set(13, y, dark);
      pc.set(18, y, dark);
      pc.hline(14, y + 1, 4, dark);
      break;
    case "big-smile":
      pc.hline(13, y, 6, dark);
      pc.hline(14, y + 1, 4, dark);
      pc.hline(15, y + 1, 2, "#e86a73");
      break;
    case "grin":
      // wide open smile showing the upper teeth
      pc.set(12, y - 1, dark);
      pc.set(19, y - 1, dark);
      pc.hline(13, y, 6, WHITE);
      pc.set(12, y, dark);
      pc.set(19, y, dark);
      pc.hline(13, y + 1, 6, dark);
      pc.hline(14, y + 1, 4, mix(dark, "#e86a73", 0.35));
      pc.hline(14, y + 2, 4, s.shadow);
      break;
    case "smirk":
      pc.hline(14, y + 1, 3, dark);
      pc.set(17, y, dark);
      break;
    case "surprised":
      pc.rect(15, y, 2, 2, dark);
      break;
    case "tongue-out":
      // open smile, the tongue hanging out over the lower lip
      pc.set(12, y - 1, dark);
      pc.set(19, y - 1, dark);
      pc.hline(13, y, 6, dark);
      pc.hline(14, y + 1, 4, TONGUE);
      pc.hline(14, y + 2, 4, TONGUE);
      pc.hline(15, y + 3, 2, TONGUE);
      pc.set(17, y + 1, TONGUE_DARK);
      pc.set(17, y + 2, TONGUE_DARK);
      pc.set(16, y + 3, TONGUE_DARK);
      pc.vline(15, y + 1, 2, mix(TONGUE, TONGUE_DARK, 0.6)); // the crease
      break;
    case "fangs":
      // a sly smile with two long vampire fangs over the lower lip
      pc.set(12, y - 1, dark);
      pc.set(19, y - 1, dark);
      pc.hline(13, y, 6, dark);
      for (const x of [14, 17]) {
        pc.set(x, y + 1, WHITE);
        pc.set(x, y + 2, FANG_TIP);
      }
      break;
  }
}

function drawFacialHairFront(pc: PixelCanvas, L: CharacterLook, hy: number) {
  const fh = L.facialHair;
  const c = fh.color;
  const sh = mix(c, NIGHT, 0.3);
  const [l, r] = faceSides(L.face.shape);
  switch (fh.style) {
    case "none":
      return;
    case "stubble":
      for (let y = 18; y <= 23; y++) {
        const sp = faceSpan(L.face.shape, y);
        if (!sp) continue;
        for (let x = sp[0] + 1; x < sp[1]; x++) {
          if (y < 20 && x > 11 && x < 20) continue;
          if (y === 19 || y === 20 ? x > 12 && x < 19 : false) continue;
          if (hash2(x, y, 5) % 3 === 0) pc.set(x, y + hy, c);
        }
      }
      return;
    case "mustache":
      pc.hline(13, 18 + hy, 6, c);
      pc.set(12, 19 + hy, c);
      pc.set(19, 19 + hy, c);
      pc.hline(14, 18 + hy, 4, sh);
      return;
    case "goatee":
      pc.hline(14, 18 + hy, 4, c);
      pc.rect(14, 21 + hy, 4, 2, c);
      pc.hline(15, 23 + hy, 2, sh);
      return;
    case "beard":
      for (let y = 17; y <= 23; y++) {
        const sp = faceSpan(L.face.shape, y);
        if (!sp) continue;
        for (let x = sp[0]; x <= sp[1]; x++) {
          const mouth = y >= 19 && y <= 20 && x >= 13 && x <= 18;
          const cheek = y < 19 && x > l + 2 && x < r - 2;
          if (mouth || cheek) continue;
          pc.set(x, y + hy, y === 23 || x === sp[1] ? sh : c);
        }
      }
      pc.hline(13, 18 + hy, 6, c);
      pc.rect(14, 24 + hy, 4, 1, sh);
      return;
    default:
      drawFunFacialHairFront(pc, L, hy);
  }
}

function drawFaceSide(pc: PixelCanvas, L: CharacterLook, hy: number) {
  const f = L.face;
  const s = L.skin;
  // nose
  pc.set(7, 15 + hy, s.base);
  pc.rect(6, 16 + hy, 2, 2, s.base);
  pc.set(6, 17 + hy, s.shadow);
  drawEye(pc, f.eyes, f.eyeColor, 10, hy, true);
  drawEyeshadow(pc, L, 10, 12, hy);
  if (f.brows !== "none") {
    pc.hline(9, 11 + hy, 3, L.hair.ramp.shadow);
    if (f.brows === "thick") pc.hline(9, 10 + hy, 3, L.hair.ramp.shadow);
  }
  const cheekY = (f.expression === "grin" || f.expression === "big-smile" ? 17 : 18) + hy;
  if (f.cheeks === "blush") pc.hline(12, cheekY, 2, mix(s.base, "#f6757a", 0.55));
  if (f.cheeks === "freckles") {
    pc.set(12, cheekY, mix(s.shadow, NIGHT, 0.2));
    pc.set(14, cheekY + 1, mix(s.shadow, NIGHT, 0.2));
  }
  drawFunCheeks(pc, L, cheekY, true);
  const lips = lipsOf(L);
  const dark = lips ? mix(lips, NIGHT, 0.15) : mix(s.shadow, LIP, 0.6);
  const y = 19 + hy;
  switch (f.expression) {
    case "grin":
      pc.hline(8, y, 3, WHITE);
      pc.set(11, y - 1, dark);
      pc.set(11, y, dark);
      pc.hline(8, y + 1, 3, dark);
      break;
    case "big-smile":
      pc.hline(8, y, 3, dark);
      pc.set(11, y - 1, dark);
      pc.set(9, y + 1, dark);
      break;
    case "smile":
    case "smirk":
      pc.hline(8, y + 1, 2, dark);
      pc.set(10, y, dark);
      break;
    case "surprised":
      pc.rect(8, y, 1, 2, dark);
      break;
    case "serious":
      pc.hline(8, y + 1, 3, dark);
      break;
    case "tongue-out":
      // the tongue sticks out past the lips
      pc.hline(8, y, 3, dark);
      pc.set(11, y - 1, dark);
      pc.hline(6, y + 1, 3, TONGUE);
      pc.set(6, y + 2, TONGUE_DARK);
      pc.set(7, y + 2, TONGUE);
      break;
    case "fangs":
      pc.hline(8, y, 3, dark);
      pc.set(11, y - 1, dark);
      pc.set(9, y + 1, WHITE);
      pc.set(9, y + 2, FANG_TIP);
      break;
    default:
      if (lips) {
        pc.hline(8, y + 1, 2, lips);
        pc.set(8, y + 2, mix(lips, NIGHT, 0.3));
      } else pc.set(8, y + 1, s.shadow);
  }
  const fh = L.facialHair;
  const c = fh.color;
  switch (fh.style) {
    case "stubble":
      for (const [x, yy] of [
        [9, 20],
        [11, 21],
        [13, 20],
        [10, 22],
        [12, 22],
        [14, 21],
      ] as const)
        pc.set(x, yy + hy, c);
      break;
    case "mustache":
      pc.hline(7, 18 + hy, 4, c);
      break;
    case "goatee":
      pc.hline(8, 18 + hy, 3, c);
      pc.rect(9, 21 + hy, 3, 2, c);
      break;
    case "beard":
      pc.hline(7, 18 + hy, 4, c);
      for (let yy = 19; yy <= 23; yy++) {
        const [a] = SIDE[yy - HEAD_TOP]!;
        for (let x = Math.max(a, 8); x <= 16; x++) {
          if (yy <= 20 && x <= 10) continue;
          pc.set(x, yy + hy, c);
        }
      }
      pc.hline(10, 24 + hy, 4, mix(c, NIGHT, 0.3));
      break;
    default:
      drawFunFacialHairSide(pc, L, hy);
  }
}

// ---- crazy wardrobe (WD12): fun eyes, mouths, cheeks, elf ears, facial hair -------------------

const TONGUE = "#f6757a";
const TONGUE_DARK = "#c4475a";
const FANG_TIP = C.silver;

/** Fun eye sprites (front: 5 wide; side: 3-4 wide). Codes: a/b/c = light/base/dark, W = white. */
const FUN_EYES: Record<
  "star" | "heart" | "spiral",
  { front: readonly string[]; side: readonly string[]; y: number; sy: number }
> = {
  star: {
    front: ["..a..", "aaWab", ".bbb.", ".b.c."],
    side: [".a.", "aWb", "b.c"],
    y: 14,
    sy: 14,
  },
  heart: {
    front: ["aa.bb", "aWbbc", ".bbc.", "..c.."],
    side: ["a.b", "bbc", ".c."],
    y: 14,
    sy: 14,
  },
  spiral: {
    front: [".cccc", "c...c", "c.c.c", "c..cc", ".cc.."],
    side: [".cc", "c.c", "cc.", "..."],
    y: 13,
    sy: 13,
  },
};

/** Unpacked "#rrggbb" of a canvas texel (null when empty). */
function texel(pc: PixelCanvas, x: number, y: number): string | null {
  const v = pc.get(x, y);
  if (v >>> 24 === 0) return null;
  return `#${[v & 255, (v >> 8) & 255, (v >> 16) & 255].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Tint what is already painted at (x, y) towards `c` (light falling on it); empty stays empty. */
function tint(pc: PixelCanvas, x: number, y: number, c: string, t: number) {
  const under = texel(pc, x, y);
  if (under) pc.set(x, y, mix(under, c, t));
}

/** A saturated, bright version of a colour (what a glowing eye shines in). */
function vivid(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const hi = Math.max(...rgb);
  const lo = Math.min(...rgb);
  if (hi - lo < 24) return lighten(C.cyan, 0.3); // grey eyes glow ghostly cyan-white
  const pure = rgb.map((v) => Math.round(((v - lo) / (hi - lo)) * 255));
  return mix(`#${pure.map((v) => v.toString(16).padStart(2, "0")).join("")}`, WHITE, 0.2);
}

function drawFunEye(
  pc: PixelCanvas,
  kind: CharacterLook["face"]["eyes"],
  ec: string,
  ex: number,
  hy: number,
  side: boolean,
) {
  // front eyes are 5 wide around the classic 2-wide eye; the side eye sits at ex
  const right = !side && ex > 16;
  if (kind === "glowing") {
    const g = vivid(ec);
    // a soft halo of light on the face around the eye, brightest close in
    for (let y = 11; y <= 18; y++)
      for (let x = ex - 2; x <= ex + 3; x++) {
        const dx = Math.abs(x + 0.5 - (ex + 1));
        const dy = Math.abs(y + 0.5 - 15);
        const d = dx * dx * 1.3 + dy * dy;
        if (d < 4) tint(pc, x, y + hy, g, 0.75);
        else if (d < 8) tint(pc, x, y + hy, g, 0.5);
        else if (d < 13) tint(pc, x, y + hy, g, 0.25);
      }
    pc.rect(ex, 13 + hy, 2, 4, g);
    const inner = side || !right ? 1 : 0;
    pc.set(ex + inner, 14 + hy, WHITE);
    pc.set(ex + inner, 15 + hy, WHITE);
    pc.set(ex + 1 - inner, 14 + hy, lighten(g, 0.6));
    return;
  }
  const e = FUN_EYES[kind as keyof typeof FUN_EYES];
  if (!e) return;
  let colors: Record<string, string>;
  if (kind === "star") colors = { a: C.lemon, b: C.amber, c: C.orange, W: WHITE };
  else if (kind === "heart") colors = { a: TONGUE, b: C.red, c: C.wine, W: WHITE };
  else {
    // dizzy swirls in the eye colour; on a face of about the same darkness they turn pale
    let c = mix(ec, NIGHT, 0.35);
    const skin = texel(pc, ex, 15 + hy);
    if (skin && Math.abs(luma(skin) - luma(c)) < 0.2)
      c = luma(skin) < 0.45 ? lighten(ec, 0.75) : NIGHT;
    colors = { c, W: WHITE };
  }
  if (side) {
    pc.sprite(ex - 1, e.sy + hy, e.side, colors);
    return;
  }
  // the spiral turns the other way on the right eye; stars and hearts keep their light
  const rows = right && kind === "spiral" ? e.front.map((r) => [...r].reverse().join("")) : e.front;
  pc.sprite(right ? ex - 1 : ex - 2, e.y + hy, rows, colors);
}

/** Whiskers, war paint and glitter on the cheeks (front: both cheeks; side: the near one). */
function drawFunCheeks(pc: PixelCanvas, L: CharacterLook, cy: number, side: boolean) {
  const s = L.skin;
  const both = (x: number, y: number, c: string) => {
    pc.set(x, y, c);
    if (!side) pc.set(31 - x, y, c);
  };
  // side view: the cheek sits a few texels further right than the front's left cheek
  const sx = side ? 3 : 0;
  switch (L.face.cheeks) {
    case "whiskers": {
      const w = mix(s.shadow, NIGHT, 0.6);
      // three cat whiskers fanning out, a little cat nose in the middle
      for (const [x, y] of [
        [7, -3],
        [8, -3],
        [9, -2],
        [10, -2],
        [6, 0],
        [7, 0],
        [8, 0],
        [9, 0],
        [10, 0],
        [7, 3],
        [8, 3],
        [9, 2],
        [10, 2],
      ] as const)
        both(x + sx, cy + y, w);
      if (!side) {
        pc.hline(15, cy - 1, 2, mix(s.shadow, NIGHT, 0.35));
        pc.set(15, cy - 2, mix(s.shadow, NIGHT, 0.2));
        pc.set(16, cy - 2, mix(s.shadow, NIGHT, 0.2));
      } else pc.set(6, cy - 2, mix(s.shadow, NIGHT, 0.35));
      return;
    }
    case "war-paint": {
      // two bold stripes on each cheek and one down the nose bridge
      const p = C.red;
      const d = C.wine;
      for (const k of [0, 3])
        for (let i = 0; i < 4; i++) {
          both(8 + i + sx, cy - 2 + k, i === 0 ? d : p);
          both(8 + i + sx, cy - 1 + k, d);
        }
      if (!side) {
        pc.vline(15, cy - 5, 4, p);
        pc.vline(16, cy - 5, 4, d);
      }
      return;
    }
    case "glitter": {
      const cols = [WHITE, C.lemon, C.cyan, C.pink, WHITE, C.neon, C.lemon, C.cyan];
      const spots = [
        [8, -1],
        [10, 0],
        [7, 1],
        [9, 2],
        [11, 2],
        [11, -2],
        [8, 3],
        [10, -3],
      ] as const;
      spots.forEach(([x, y], i) => {
        both(x + sx, cy + y, cols[i]!);
      });
      // one big twinkle per cheek
      const tx = 9 + sx;
      both(tx, cy, WHITE);
      both(tx - 1, cy, lighten(C.cyan, 0.4));
      both(tx + 1, cy, lighten(C.cyan, 0.4));
      both(tx, cy - 1, lighten(C.lemon, 0.4));
      both(tx, cy + 1, lighten(C.lemon, 0.4));
      return;
    }
    default:
  }
}

/** Long pointed elf ears: they stick out sideways and up (hair.ts paints them again over hair). */
export function drawElfEars(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  if (L.face.ears !== "elf") return;
  const s = L.skin;
  const inner = mix(s.shadow, NIGHT, 0.2);
  if (view === "left") {
    // in profile: an ear leaf pointing up and back
    pc.sprite(
      15,
      9 + hy,
      ["....bc", "...bbc", "..bbc.", ".bbIc.", "bbIIc.", "bbIc..", "bbIc..", "bbc...", ".bc..."],
      { b: s.base, c: s.shadow, I: inner },
    );
    return;
  }
  const [l, r] = faceSides(L.face.shape);
  // left ear (lit), pointing out to the viewer's left
  const ear = ["b....", "bb...", ".bb..", ".bIb.", ".bIbb", "..bIb", "..bIb", "...bb", "...bb"];
  pc.sprite(l - 5, 9 + hy, ear, { b: s.base, I: s.shadow });
  // right ear in shade, mirrored
  const mirrored = ear.map((row) => [...row].reverse().join(""));
  pc.sprite(r + 1, 9 + hy, mirrored, { b: s.shadow, I: inner });
}

/** Hair texture for beards: strand lines in shadow, a few light glints. */
function strand(pc: PixelCanvas, x: number, y: number, c: string, sh: string, hl: string) {
  pc.set(x, y, (x + (y >> 1)) % 3 === 0 ? sh : (x + y) % 7 === 0 ? hl : c);
}

/** A 3-wide plait from y0 to y1 with a gold bead near its end and a tuft below. */
function braid(
  pc: PixelCanvas,
  x: number,
  y0: number,
  y1: number,
  c: string,
  sh: string,
  hl: string,
) {
  for (let y = y0; y <= y1 - 3; y++) {
    const k = (y - y0) % 3;
    pc.hline(x, y, 3, c);
    pc.set(x + 2 - k, y, sh);
    if (k === 0) pc.set(x, y, hl);
  }
  pc.hline(x, y1 - 2, 3, C.amber);
  pc.set(x, y1 - 2, C.lemon);
  pc.set(x + 2, y1 - 2, C.orange);
  pc.hline(x, y1 - 1, 3, mix(C.amber, NIGHT, 0.35));
  pc.set(x, y1, c);
  pc.set(x + 1, y1, sh);
  pc.set(x + 2, y1, c);
}

function drawFunFacialHairFront(pc: PixelCanvas, L: CharacterLook, hy: number) {
  const fh = L.facialHair;
  const c = fh.color;
  const sh = mix(c, NIGHT, 0.3);
  const hl = lighten(c, 0.25);
  const shape = L.face.shape;
  const [l, r] = faceSides(shape);
  switch (fh.style) {
    case "handlebar": {
      // a thick waxed mustache whose ends sweep out and curl up into little loops
      pc.hline(12, 18 + hy, 8, c);
      pc.hline(14, 18 + hy, 4, hl);
      pc.hline(13, 19 + hy, 6, sh);
      for (const [x, y, k] of [
        [11, 18, c],
        [10, 18, c],
        [9, 18, sh],
        [8, 17, c],
        [8, 16, c],
        [9, 15, c],
        [10, 16, sh],
        [12, 19, sh],
      ] as const) {
        pc.set(x, y + hy, k);
        pc.set(31 - x, y + hy, k === c ? sh : k);
      }
      return;
    }
    case "mutton-chops": {
      // bushy sideburns down the cheeks, joined by a mustache; the chin stays bare
      for (let y = 13; y <= 22; y++) {
        const sp = faceSpan(shape, y);
        if (!sp) continue;
        const w = y < 16 ? 3 : y < 19 ? 5 : y < 21 ? 6 : 4;
        for (let i = 0; i < w; i++) {
          strand(pc, sp[0] + i, y + hy, c, sh, hl);
          strand(pc, sp[1] - i, y + hy, sh, mix(sh, NIGHT, 0.3), c);
        }
      }
      // fluffy outer edge
      for (let y = 15; y <= 21; y += 2) {
        pc.set(l - 1, y + hy, c);
        pc.set(r + 1, y + hy, sh);
      }
      pc.hline(12, 18 + hy, 8, c);
      pc.hline(13, 18 + hy, 6, sh);
      return;
    }
    case "wizard-beard": {
      // a long wizard's beard: full at the jaw, flowing down the chest to a point
      for (let y = 17; y <= 38; y++) {
        let a: number;
        let b: number;
        if (y <= 23) {
          const sp = faceSpan(shape, y);
          if (!sp) continue;
          [a, b] = y === 23 ? [sp[0] - 1, sp[1] + 1] : sp;
        } else {
          // taper: wide under the chin down to a 2-wide tip, gently waving
          const t = (y - 24) / 14;
          const half = Math.max(1, Math.round(9 - t * 8));
          const wob = [0, 0, 1, 1, 0, 0, -1, -1][y % 8]!;
          a = 16 - half + wob;
          b = 15 + half + wob;
        }
        for (let x = a; x <= b; x++) {
          const mouth = y >= 19 && y <= 20 && x >= 13 && x <= 18;
          const cheek = y < 19 && x > l + 2 && x < r - 2;
          if (mouth || cheek) continue;
          const wave = (x + Math.floor(y / 3)) % 4 === 0;
          pc.set(x, y + hy, x >= b - 1 || wave ? sh : x === a + 1 ? hl : c);
        }
      }
      // drooping mustache over the mouth
      pc.hline(12, 18 + hy, 8, c);
      pc.hline(13, 18 + hy, 3, hl);
      pc.set(12, 19 + hy, c);
      pc.set(19, 19 + hy, sh);
      pc.set(12, 20 + hy, sh);
      pc.set(19, 20 + hy, sh);
      return;
    }
    case "viking-braids": {
      // a full beard with two plaits hanging from the chin, each tied with a bead
      for (let y = 17; y <= 24; y++) {
        const [a, b] = y === 24 ? ([10, 21] as const) : (faceSpan(shape, y) ?? ([10, 21] as const));
        for (let x = a; x <= b; x++) {
          const mouth = y >= 19 && y <= 20 && x >= 13 && x <= 18;
          const cheek = y < 19 && x > l + 2 && x < r - 2;
          if (mouth || cheek) continue;
          strand(pc, x, y + hy, c, sh, hl);
          if (x === b) pc.set(x, y + hy, sh);
        }
      }
      pc.hline(13, 18 + hy, 6, c);
      for (const bx of [11, 18]) braid(pc, bx, 25 + hy, 33 + hy, c, sh, hl);
      return;
    }
    default:
  }
}

function drawFunFacialHairSide(pc: PixelCanvas, L: CharacterLook, hy: number) {
  const fh = L.facialHair;
  const c = fh.color;
  const sh = mix(c, NIGHT, 0.3);
  const hl = lighten(c, 0.25);
  switch (fh.style) {
    case "handlebar":
      // the near end sticks out past the nose and curls up
      pc.hline(6, 18 + hy, 5, c);
      pc.hline(7, 19 + hy, 3, sh);
      pc.set(5, 17 + hy, c);
      pc.set(4, 16 + hy, c);
      pc.set(4, 15 + hy, sh);
      pc.set(5, 14 + hy, sh);
      pc.set(6, 15 + hy, sh);
      return;
    case "mutton-chops":
      for (let y = 13; y <= 21; y++) {
        const x0 = y < 16 ? 13 : y < 19 ? 11 : 10;
        for (let x = x0; x <= 15; x++) strand(pc, x, y + hy, c, sh, hl);
      }
      pc.hline(7, 18 + hy, 4, c);
      pc.set(15, 22 + hy, sh);
      return;
    case "wizard-beard":
      pc.hline(6, 18 + hy, 5, c);
      for (let y = 19; y <= 38; y++) {
        const t = Math.max(0, (y - 24) / 14);
        const front =
          y <= 23
            ? Math.max(SIDE[y - HEAD_TOP]![0], 7)
            : 6 + Math.round(t * 3) + [0, 0, 1, 1][y % 4]!;
        const back = y <= 23 ? 16 : Math.max(front + 1, 15 - Math.round(t * 7));
        for (let x = front; x <= back; x++) {
          if (y <= 20 && x <= 9) continue;
          const wave = (x + Math.floor(y / 3)) % 4 === 0;
          pc.set(x, y + hy, x === back || wave ? sh : x === front ? hl : c);
        }
      }
      return;
    case "viking-braids":
      pc.hline(7, 18 + hy, 4, c);
      for (let y = 19; y <= 24; y++) {
        const a = y <= 23 ? SIDE[y - HEAD_TOP]![0] : 10;
        for (let x = Math.max(a, 8); x <= 16; x++) {
          if (y <= 20 && x <= 10) continue;
          strand(pc, x, y + hy, c, sh, hl);
        }
      }
      braid(pc, 9, 25 + hy, 33 + hy, c, sh, hl);
      return;
    default:
  }
}
