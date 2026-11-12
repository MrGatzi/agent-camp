/**
 * Full-body costumes of the crazy wardrobe (WD12), drawn on the HD doll only (they have no 1×
 * catalog art): banana, skeleton, mummy, knight and hotdog. A suit first swaps the clothes for a
 * plain bodysuit in its fabric (`suitLook`, before painting: hair under the hood, no coat), then
 * paints its details in three passes, all at their place in the layer order of sheet.ts:
 *   - head: hood, helmet or wraps (after the hair, before glasses and hats),
 *   - body: the costume shell over torso and legs (after the torso, before the arms),
 *   - limbs: bones, wraps and plates on the arms and legs (after the arms, before held items).
 * `extras.costumeTint` recolours the costume's main colour (peel, bones, wraps, armour, bun).
 */
import { type CharacterLook, type FullLook, type Ramp, rampFrom } from "@agent-office/protocol";
import { type PixelCanvas, packColor } from "../pixel.ts";
import type { Ctx } from "./ctx.ts";
import { HEADROOM, type View } from "./geometry.ts";
import { EYE_X } from "./head.ts";
import type { TorsoBox } from "./torso.ts";

export const SUITS = ["banana", "skeleton", "mummy", "knight", "hotdog"] as const;
export type Suit = (typeof SUITS)[number];

/** The look's full-body costume, or null (none or a catalog costume). */
export function suitOf(L: CharacterLook): Suit | null {
  const k = L.extras?.costume;
  return k && (SUITS as readonly string[]).includes(k) ? (k as Suit) : null;
}

const ramp = (base: string, shadow: string, light: string): Ramp => ({ base, shadow, light });
/** OptHex tint: missing / "none" / a bad value = the costume's own colours. */
const tintOf = (t: string | undefined): string | null =>
  t && t !== "none" && /^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : null;

const PEEL = ramp("#fee761", "#e8a93a", "#fff6b4");
const STEM = ramp("#733e39", "#3e2731", "#b86f50");
const BONE = ramp("#f2ecdc", "#bdb6a4", "#ffffff");
const SUIT_BLACK = ramp("#2e2a3a", "#211d2b", "#433d55");
const WRAP = ramp("#e4d6b4", "#ab9a78", "#faf2dc");
const STEEL = ramp("#a9b6cb", "#66738c", "#e2e9f2");
const BUN = ramp("#dc9a58", "#a8643a", "#f4cc8c");
const SAUSAGE = ramp("#c44a3c", "#86292e", "#e8735c");
const MUSTARD = ramp("#fee761", "#feae34", "#fff6b4");
/** dark gaps: eye sockets, visor slit, the mummy's eye slit */
const GAP = "#1f1a2b";

/** Colours of one suit: `main` follows the costume tint. */
type Pal = { main: Ramp; fabric: Ramp };
function palette(L: CharacterLook, s: Suit): Pal {
  const t = tintOf(L.extras?.costumeTint);
  const tinted = (r: Ramp) => (t ? rampFrom(t) : r);
  switch (s) {
    case "banana": {
      const main = tinted(PEEL);
      return { main, fabric: main };
    }
    case "skeleton":
      return { main: tinted(BONE), fabric: SUIT_BLACK };
    case "mummy": {
      const main = tinted(WRAP);
      return { main, fabric: main };
    }
    case "knight": {
      const main = tinted(STEEL);
      return { main, fabric: main };
    }
    case "hotdog":
      return { main: tinted(BUN), fabric: tinted(BUN) };
  }
}

/**
 * The look as the suit's wearer: clothes swapped for a plain bodysuit in the suit's fabric,
 * hair (and earrings) under the hood, no coat. Banana and hotdog are shells over the person's
 * own trousers and shoes (the hotdog's bun-coloured sleeves vanish in the bun, the hands poke
 * out); skeleton, mummy and knight cover the legs and hands too.
 */
export function suitLook(L: FullLook): FullLook {
  const s = suitOf(L);
  if (!s) return L;
  const p = palette(L, s);
  const plain = (r: Ramp) => ({ kind: "none" as const, a: r.base, b: "none" as const });
  const f = p.fabric;
  let out: FullLook = {
    ...L,
    hair: { ...L.hair, cut: "bald", clips: "none" },
    earrings: { ...L.earrings, style: "none" },
    vest: { ...L.vest, kind: "none" },
    outer: { ...L.outer, kind: "none" },
    apron: { ...L.apron, kind: "none" },
  };
  out.shirt = {
    ...L.shirt,
    kind: "longsleeve",
    ramp: f,
    pattern: plain(f),
    collar: "none",
    collarColor: "none",
    neckwear: "none",
    sleeves: "long",
    buttons: { ...L.shirt.buttons, count: 0 },
    peeksAtWaist: false,
    length: "tucked",
  };
  if (s === "banana" || s === "hotdog" || s === "knight")
    out.headwear = { ...L.headwear, style: "none" };
  if (s === "skeleton" || s === "mummy" || s === "knight") {
    out.bottoms = {
      ...L.bottoms,
      kind: "leggings",
      ramp: f,
      pattern: plain(f),
      flap: false,
      embroidery: { ...L.bottoms.embroidery, motif: "none", stitching: "none" },
      buttons: { ...L.bottoms.buttons, count: 0 },
      suspenders: "none",
      belt: "none",
      hem: "plain",
    };
    out.legwear = { ...L.legwear, kind: "none" };
    // bony, wrapped or armoured hands, unless the look brings its own gloves
    if (L.accessories.gloves.kind === "none")
      out.accessories = {
        ...L.accessories,
        gloves: { kind: "short", color: s === "skeleton" ? p.main.base : f.base },
      };
  }
  if (s === "knight") {
    out = {
      ...out,
      eyewear: { ...L.eyewear, style: "none" },
      facialHair: { ...L.facialHair, style: "none" },
      shoes: { ...L.shoes, kind: "boots", ramp: f, sole: f.shadow, accent: "none", laces: "none" },
    };
  }
  if (s === "mummy") {
    out = {
      ...out,
      facialHair: { ...L.facialHair, style: "none" },
      shoes: {
        ...L.shoes,
        kind: "slippers",
        ramp: f,
        sole: f.shadow,
        accent: "none",
        laces: "none",
      },
    };
  }
  return out;
}

// ---- shapes ---------------------------------------------------------------------------------

type Inside = (x: number, y: number) => boolean;

/** Highest body row a costume paints: the frame's top, less the 2-texel outline. */
const TOP = 2 - HEADROOM;

/** Inside the ellipse that fills the box (x0, y0, w, h)? */
const oval =
  (x0: number, y0: number, w: number, h: number): Inside =>
  (x, y) => {
    const rx = w / 2;
    const ry = h / 2;
    const dx = (x - x0 + 0.5 - rx) / rx;
    const dy = (y - y0 + 0.5 - ry) / ry;
    return dx * dx + dy * dy <= 1;
  };

/** Rows given as inclusive [from, to] spans, starting at row `y0`. */
const spans =
  (y0: number, rows: readonly (readonly [number, number])[]): Inside =>
  (x, y) => {
    const s = rows[y - y0];
    return !!s && x >= s[0] && x <= s[1];
  };

const or =
  (...fs: Inside[]): Inside =>
  (x, y) =>
    fs.some((f) => f(x, y));

/**
 * Paint a shape with 3-step shading: lit left and top edges, shaded right edge; texels next to
 * the `hole` (a face opening) are shaded too, as the inside of a hood.
 */
function fill(
  pc: PixelCanvas,
  inside: Inside,
  r: Ramp,
  box: [number, number, number, number],
  hole: Inside = () => false,
  dy = 0,
) {
  const [x0, y0, x1, y1] = box;
  // tall people lift the head: a costume's top never leaves the headroom
  for (let y = Math.max(y0, TOP - dy); y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y) || hole(x, y)) continue;
      let col = r.base;
      if (hole(x - 1, y) || hole(x + 1, y) || hole(x, y - 1) || hole(x, y + 1)) col = r.shadow;
      else if (!inside(x + 1, y)) col = r.shadow;
      else if (!inside(x - 1, y) || !inside(x, y - 1)) col = r.light;
      pc.set(x, y + dy, col);
    }
}

// ---- head -----------------------------------------------------------------------------------

/** Hood around the head: the outer shape and the face opening per view (head rows, hy = 0). */
function hood(view: View): { outer: Inside; hole: Inside } {
  if (view === "down") return { outer: oval(4, 3, 24, 23), hole: oval(8, 9, 16, 17) };
  if (view === "left") return { outer: oval(7, 3, 19, 23), hole: oval(2, 9, 14, 17) };
  return { outer: oval(4, 3, 24, 23), hole: () => false };
}

const HEAD_BOX: [number, number, number, number] = [0, -8, 31, 26];

/** Suit head: hood, helmet or wraps. Runs after the hair (bald under a suit). */
export function drawSuitHead(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const s = suitOf(L);
  if (!s) return;
  const p = palette(L, s);
  switch (s) {
    case "banana":
      return bananaHead(pc, p, view, hy);
    case "hotdog":
      return hotdogHead(pc, p, view, hy);
    case "skeleton":
      return skeletonHead(pc, L, p, view, hy);
    case "mummy":
      return mummyHead(pc, p, view, hy);
    case "knight":
      return knightHead(pc, L, p, view, hy);
  }
}

/** The banana's top: rises over the hood and curves to one side, ending in a brown stem. */
const BANANA_TIP_FRONT = spans(-6, [
  [19, 20],
  [18, 21],
  [17, 21],
  [16, 21],
  [15, 21],
  [14, 21],
  [13, 21],
  [12, 21],
  [11, 21],
  [10, 21],
]);
const BANANA_TIP_SIDE = spans(-6, [
  [20, 21],
  [19, 22],
  [18, 22],
  [17, 22],
  [16, 22],
  [15, 22],
  [14, 22],
  [13, 22],
  [12, 22],
  [11, 22],
]);

function bananaHead(pc: PixelCanvas, p: Pal, view: View, hy: number) {
  const { outer, hole } = hood(view);
  // from behind the curve leans the other way
  const tip: Inside =
    view === "left"
      ? BANANA_TIP_SIDE
      : view === "up"
        ? (x, y) => BANANA_TIP_FRONT(31 - x, y)
        : BANANA_TIP_FRONT;
  const shape = or(outer, tip);
  fill(pc, shape, p.main, HEAD_BOX, hole, hy);
  // brown stem and a ridge down the peel
  for (let y = -6; y <= -4; y++)
    for (let x = 0; x < 32; x++)
      if (tip(x, y) && y + hy >= TOP) pc.set(x, y + hy, y === -6 ? STEM.shadow : STEM.base);
  const ridge = view === "up" ? (y: number) => 31 - ridgeX(y) : ridgeX;
  if (view !== "left") for (let y = -3; y <= 4; y++) pc.set(ridge(y), y + hy, p.main.light);
  // a couple of ripe spots
  const spots =
    view === "left"
      ? [
          [21, 6],
          [23, 12],
        ]
      : view === "up"
        ? [
            [9, 7],
            [22, 14],
            [12, 19],
          ]
        : [
            [22, 5],
            [6, 17],
          ];
  for (const [x, y] of spots) pc.set(x!, y! + hy, STEM.light);
}
const ridgeX = (y: number) => 17 + Math.floor((-y + 4) / 3);

function hotdogHead(pc: PixelCanvas, p: Pal, view: View, hy: number) {
  const bottom = 26;
  if (view === "left") {
    // the bun's near half covers the side, the face looks out of the sausage in front of it
    const sausage = oval(3, -3, 23, 36);
    const hole = oval(0, 9, 13, 17);
    fill(pc, (x, y) => sausage(x, y) && y <= bottom, SAUSAGE, HEAD_BOX, hole, hy);
    const bun = (x: number, y: number) => y <= bottom && oval(13, 2, 12, 30)(x, y);
    fill(pc, bun, p.main, HEAD_BOX, undefined, hy);
    return;
  }
  const sausage = oval(9, -3, 14, 34);
  const hole = view === "down" ? oval(10, 9, 12, 16) : () => false;
  fill(pc, (x, y) => sausage(x, y) && y <= bottom, SAUSAGE, HEAD_BOX, hole, hy);
  if (view === "down") mustard(pc, -1, 6, hy);
  const bunL = (x: number, y: number) => y <= bottom && oval(3, 2, 8, 30)(x, y);
  const bunR = (x: number, y: number) => y <= bottom && oval(21, 2, 8, 30)(x, y);
  fill(pc, bunL, p.main, HEAD_BOX, undefined, hy);
  fill(pc, bunR, p.main, HEAD_BOX, undefined, hy);
}

/** A mustard zigzag down the middle of the sausage, rows y0..y0+h-1. */
function mustard(pc: PixelCanvas, y0: number, h: number, dy: number) {
  const zig = [0, 1, 2, 2, 1, 0, -1, -1];
  for (let y = y0; y < y0 + h; y++) {
    const x = 15 + zig[((y % 8) + 8) % 8]!;
    pc.set(x, y + dy, MUSTARD.base);
    pc.set(x + 1, y + dy, MUSTARD.shadow);
  }
}

function skeletonHead(pc: PixelCanvas, L: CharacterLook, p: Pal, view: View, hy: number) {
  const { outer, hole } = hood(view);
  if (view !== "up") {
    // skull face paint: skin -> bone, dark sockets and nose, teeth
    const s = L.skin;
    const map = new Map([
      [packColor(s.base), p.main.base],
      [packColor(s.shadow), p.main.shadow],
      [packColor(s.light), p.main.light],
    ]);
    for (let y = 6; y <= 24; y++)
      for (let x = 0; x < 32; x++) {
        const to = map.get(pc.get(x, y + hy));
        if (to) pc.set(x, y + hy, to);
      }
    const bone = new Set([p.main.base, p.main.shadow, p.main.light].map((h) => packColor(h)));
    const socket = (x: number, y: number) => {
      if (bone.has(pc.get(x, y + hy))) pc.set(x, y + hy, GAP);
    };
    const eyes = view === "down" ? EYE_X : ([10] as const);
    for (const ex of eyes)
      for (let y = 12; y <= 17; y++)
        for (let x = ex - 1; x <= ex + 2; x++)
          if (!((y === 12 || y === 17) && (x === ex - 1 || x === ex + 2))) socket(x, y);
    if (view === "down") {
      socket(15, 18);
      socket(16, 18);
      for (let x = 12; x <= 19; x++) {
        pc.set(x, 20 + hy, x % 2 ? p.main.light : GAP);
        pc.set(x, 21 + hy, x % 2 ? p.main.base : GAP);
      }
    } else {
      socket(7, 18);
      for (let x = 7; x <= 11; x++) pc.set(x, 21 + hy, x % 2 ? p.main.light : GAP);
    }
  }
  fill(pc, outer, p.fabric, HEAD_BOX, hole, hy);
  if (view === "up") {
    // a little skull printed on the back of the hood
    pc.rect(13, 9 + hy, 6, 4, p.main.base);
    pc.hline(14, 8 + hy, 4, p.main.light);
    pc.hline(14, 13 + hy, 4, p.main.shadow);
    pc.rect(14, 10 + hy, 1, 2, GAP);
    pc.rect(17, 10 + hy, 1, 2, GAP);
  }
}

function mummyHead(pc: PixelCanvas, p: Pal, view: View, hy: number) {
  const w = p.main;
  const head = view === "left" ? oval(6, 4, 19, 22) : oval(4, 4, 24, 22);
  // a gap between two wraps shows the eyes in the shadow underneath
  const slit =
    view === "down"
      ? (x: number, y: number) => y >= 12 && y <= 17 && x >= 9 && x <= 22
      : view === "left"
        ? (x: number, y: number) => y >= 12 && y <= 17 && x <= 13
        : () => false;
  for (let y = 3; y <= 25; y++)
    for (let x = 0; x < 32; x++) {
      if (!head(x, y)) continue;
      if (slit(x, y)) {
        // dark above and below the eyes, the eyes themselves stay
        if (y === 12 || y === 17) pc.set(x, y + hy, GAP);
        continue;
      }
      pc.set(x, y + hy, wrapAt(w, x, y, !head(x + 1, y), !head(x - 1, y) || !head(x, y - 1)));
    }
}

/**
 * Bandage texel: wraps 3 texels wide, slanting a texel every 5 columns, with a dark seam
 * between them and a lit upper edge; `right` / `lit` shade the silhouette.
 */
function wrapAt(w: Ramp, x: number, y: number, right: boolean, lit: boolean): string {
  const k = (((y + Math.floor((x + 3 * Math.floor(y / 8)) / 5)) % 4) + 4) % 4;
  if (k === 0) return w.shadow;
  if (right) return w.shadow;
  if (k === 1 || lit) return w.light;
  return w.base;
}

function knightHead(pc: PixelCanvas, L: CharacterLook, p: Pal, view: View, hy: number) {
  const st = p.main;
  const plume = rampFrom(L.extras?.accent ?? "#e43b44");
  // the crest: a plume of feathers rising from the top, swept back
  const crest =
    view === "left"
      ? spans(-3, [
          [17, 21],
          [15, 23],
          [13, 24],
          [12, 25],
          [12, 25],
          [13, 25],
          [14, 21],
        ])
      : spans(-4, [
          [15, 17],
          [14, 18],
          [14, 18],
          [14, 18],
          [14, 18],
          [14, 18],
          [15, 17],
          [15, 17],
        ]);
  fill(pc, crest, plume, HEAD_BOX, undefined, hy);
  const helm =
    view === "left"
      ? or(oval(6, 3, 19, 23), spans(12, Array(10).fill([5, 12])))
      : oval(4, 3, 24, 23);
  fill(pc, helm, st, HEAD_BOX, undefined, hy);
  if (view === "down") {
    // visor slit with a nose guard, breathing holes on one cheek
    pc.hline(7, 14 + hy, 18, GAP);
    pc.hline(8, 15 + hy, 16, GAP);
    pc.vline(15, 12 + hy, 11, st.light);
    pc.vline(16, 12 + hy, 11, st.shadow);
    for (const [x, y] of [
      [19, 18],
      [21, 18],
      [20, 20],
      [22, 20],
    ])
      pc.set(x!, y! + hy, GAP);
    pc.hline(6, 11 + hy, 20, st.shadow);
  } else if (view === "left") {
    pc.hline(5, 14 + hy, 9, GAP);
    pc.hline(5, 15 + hy, 8, GAP);
    for (const [x, y] of [
      [7, 18],
      [9, 18],
      [8, 20],
    ])
      pc.set(x!, y! + hy, GAP);
    pc.hline(6, 11 + hy, 18, st.shadow);
  } else {
    pc.vline(15, 4 + hy, 20, st.light);
    pc.vline(16, 4 + hy, 20, st.shadow);
    pc.hline(5, 11 + hy, 22, st.shadow);
  }
  // rivets along the brow band
  for (const x of view === "left" ? [10, 14, 18, 22] : [7, 11, 20, 24])
    pc.set(x, 12 + hy, st.light);
}

// ---- body -----------------------------------------------------------------------------------

/** Last row of a costume shell: mid-thigh standing, the lap seated. */
const shellEnd = (c: Ctx, b: TorsoBox, standing: number) =>
  b.seated ? b.end + 1 : c.legRow(standing);

/** Suit details on the body: after the torso and legs, before the arms. */
export function drawSuitBody(c: Ctx, b: TorsoBox) {
  const s = suitOf(c.L);
  if (!s) return;
  const p = palette(c.L, s);
  switch (s) {
    case "banana":
      return bananaBody(c, b, p);
    case "hotdog":
      return hotdogBody(c, b, p);
    case "skeleton":
      return skeletonBody(c, b, p);
    case "mummy":
      return;
    case "knight":
      return knightBody(c, b, p);
  }
}

function bananaBody(c: Ctx, b: TorsoBox, p: Pal) {
  const end = shellEnd(c, b, 38);
  const T = b.T;
  const side = c.view === "left";
  const x0 = side ? c.tl - 1 : c.tl;
  const x1 = side ? c.tr + 1 : c.tr;
  // a tube with a rounded bottom; from the side it curves back like the fruit
  const lean = (y: number) => (side ? Math.max(0, Math.floor((y - T - 4) / 3)) : 0);
  const tube: Inside = (x, y) => {
    if (y < T - 2 || y > end) return false;
    const l = x0 + lean(y) + (y >= end - 1 ? (end - y === 0 ? 3 : 1) : 0);
    const r = x1 + lean(y) - (y >= end - 1 ? (end - y === 0 ? 3 : 1) : 0);
    return x >= l && x <= r;
  };
  fill(c.pc, tube, p.main, [0, T - 2, 31, end]);
  // ridges along the peel and the dark tip at the bottom
  if (!side) {
    for (let y = T; y < end - 1; y++) {
      c.pc.set(x0 + 4, y, p.main.light);
      c.pc.set(x1 - 4, y, p.main.shadow);
    }
    c.pc.rect(15, end, 2, 2, STEM.base);
    c.pc.set(16, end + 1, STEM.shadow);
  } else {
    for (let y = T; y < end - 1; y++) c.pc.set(x0 + 3 + lean(y), y, p.main.light);
    const lx = x0 + lean(end) + 4;
    c.pc.rect(lx, end, 2, 2, STEM.base);
  }
  const spots =
    c.view === "up"
      ? [
          [x0 + 3, T + 3],
          [x1 - 2, T + 8],
        ]
      : [
          [x1 - 3, T + 2],
          [x0 + 2, T + 7],
          [x1 - 6, T + 10],
        ];
  for (const [x, y] of spots)
    if (y! < end - 1) c.pc.set(x! + (side ? lean(y!) : 0), y!, STEM.light);
}

function hotdogBody(c: Ctx, b: TorsoBox, p: Pal) {
  const end = shellEnd(c, b, 40);
  const T = b.T;
  if (c.view === "left") {
    const sausage = (x: number, y: number) => {
      const k = y > end ? y - end : 0;
      return y >= T - 2 && y <= end + 2 && x >= 4 + k && x <= 25 - k;
    };
    fill(c.pc, sausage, SAUSAGE, [0, T - 2, 31, end + 2]);
    const bun = (x: number, y: number) =>
      y >= T - 2 && y <= end && x >= 13 && x <= 24 && !(y >= end - 1 && (x === 13 || x === 24));
    fill(c.pc, bun, p.main, [0, T - 2, 31, end]);
    return;
  }
  const sausage = (x: number, y: number) =>
    y >= T - 2 &&
    y <= end + 2 &&
    x >= 9 + (y > end ? y - end : 0) &&
    x <= 22 - (y > end ? y - end : 0);
  fill(c.pc, sausage, SAUSAGE, [0, T - 2, 31, end + 2]);
  if (c.view === "down") mustard(c.pc, T, end - T, 0);
  const bun = (l: number) => (x: number, y: number) =>
    y >= T - 2 &&
    y <= end &&
    x >= l &&
    x <= l + 7 &&
    !(y >= end - 1 && (x === l || x === l + 7)) &&
    !(y === end && (x === l + 1 || x === l + 6));
  fill(c.pc, bun(3), p.main, [0, T - 2, 31, end]);
  fill(c.pc, bun(21), p.main, [0, T - 2, 31, end]);
}

function skeletonBody(c: Ctx, b: TorsoBox, p: Pal) {
  const bone = p.main;
  const T = b.T;
  const pc = c.pc;
  if (c.view === "left") {
    // ribs curving round the side, spine down the back
    for (let k = 0; k < 4; k++) {
      const y = T + 1 + k * 2;
      pc.hline(c.tl + 2, y, 5 - (k === 3 ? 1 : 0), bone.base);
      pc.set(c.tl + 1, y + 1, bone.shadow);
    }
    for (let y = T + 1; y < b.W + 1; y += 2) pc.set(c.tr - 1, y, bone.light);
    pc.hline(c.tl + 2, b.W + 1, 6, bone.shadow);
    return;
  }
  const mid = 15;
  if (c.view === "down") {
    // sternum and four pairs of ribs
    pc.rect(mid, T + 1, 2, 7, bone.light);
    for (let k = 0; k < 4; k++) {
      const y = T + 1 + k * 2;
      const w = k === 3 ? 4 : 5;
      pc.hline(mid - 1 - w, y, w, bone.base);
      pc.hline(mid + 3, y, w, bone.shadow);
      pc.set(mid - 1 - w, y + 1, bone.shadow);
      pc.set(mid + 2 + w, y + 1, bone.shadow);
    }
  } else {
    // spine, shoulder blades and short ribs from behind
    for (let y = T; y < b.W; y++) pc.hline(mid, y, 2, y % 2 ? bone.light : bone.shadow);
    for (const x of [c.tl + 2, mid + 4]) {
      pc.hline(x, T + 1, 4, bone.base);
      pc.hline(x + 1, T + 2, 3, bone.base);
      pc.set(x + 2, T + 3, bone.shadow);
    }
    for (let k = 0; k < 2; k++) {
      pc.hline(mid - 5, T + 5 + k * 2, 4, bone.shadow);
      pc.hline(mid + 3, T + 5 + k * 2, 4, bone.shadow);
    }
  }
  // spine below the ribs and the hip bones
  if (c.view === "down")
    for (let y = T + 8; y < b.W; y++) pc.hline(mid, y, 2, y % 2 ? bone.light : bone.shadow);
  const py = b.W;
  pc.hline(mid - 5, py, 4, bone.base);
  pc.hline(mid + 3, py, 4, bone.base);
  pc.hline(mid - 4, py + 1, 3, bone.shadow);
  pc.hline(mid + 3, py + 1, 3, bone.shadow);
  pc.rect(mid, py, 2, 2, bone.light);
}

function knightBody(c: Ctx, b: TorsoBox, p: Pal) {
  const st = p.main;
  const T = b.T;
  const pc = c.pc;
  const W = b.W;
  if (c.view === "left") {
    // breastplate bulging forward, plates at the hip
    pc.vline(c.tl, T + 1, W - T - 1, st.light);
    pc.vline(c.tl - 1, T + 2, W - T - 3, st.base);
    pc.hline(c.tl, W - 1, c.tr - c.tl + 1, st.shadow);
    pc.hline(c.tl, W + 1, c.tr - c.tl + 1, st.shadow);
    return;
  }
  if (c.view === "down") {
    // a ridge down the breastplate, the plate edge and tassets over the hips
    pc.vline(15, T + 1, W - T - 2, st.light);
    pc.vline(16, T + 1, W - T - 2, st.base);
    pc.vline(17, T + 2, W - T - 3, st.shadow);
    pc.hline(c.tl + 1, T + 1, 4, st.light);
    // the agent's colours on a little shield (the armour hides any agent-coloured jacket)
    const a = c.r.agentRamp;
    pc.rect(c.tl + 3, T + 3, 4, 3, a.base);
    pc.hline(c.tl + 4, T + 6, 2, a.shadow);
    pc.set(c.tl + 3, T + 3, a.light);
  } else {
    pc.vline(15, T + 1, W - T - 2, st.shadow);
    pc.vline(16, T + 1, W - T - 2, st.light);
  }
  pc.hline(c.tl, W - 1, c.tr - c.tl + 1, st.shadow);
  if (!b.seated) {
    pc.hline(c.tl, W + 1, c.tr - c.tl + 1, st.shadow);
    pc.hline(c.tl, W + 3, c.tr - c.tl + 1, st.shadow);
  }
}

// ---- limbs ----------------------------------------------------------------------------------

/** Rows of the frame's texels in one of the suit's fabric colours, as [x0, x1] runs. */
function runsOf(c: Ctx, y: number, fabric: Set<number>, x0 = 0, x1 = 31): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const on = x <= x1 && fabric.has(c.pc.get(x, y));
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      out.push([start, x - 1]);
      start = -1;
    }
  }
  return out;
}

/** Suit details on arms and legs: after the arms, before the held items. */
export function drawSuitLimbs(c: Ctx, b: TorsoBox, phase: number) {
  const s = suitOf(c.L);
  if (!s || s === "banana" || s === "hotdog") return;
  const p = palette(c.L, s);
  const f = p.fabric;
  const fabric = new Set([f.base, f.shadow, f.light].map((h) => packColor(h)));
  const T = b.T;
  const pc = c.pc;
  if (s === "mummy") {
    // wrap every bodysuit texel in bandages
    for (let y = T - 1; y < 48; y++)
      for (let x = 0; x < 32; x++) {
        const v = pc.get(x, y);
        if (!fabric.has(v)) continue;
        const right = !fabric.has(pc.get(x + 1, y));
        const lit = !fabric.has(pc.get(x - 1, y));
        pc.set(x, y, wrapAt(f, x, y, right, lit));
      }
    // a loose end flapping from one arm
    const tick = (c.f.bob + c.f.phase) % 2;
    const ax = c.view === "left" ? 18 : c.view === "up" ? c.tl - 3 : c.tr + 3;
    const dir = c.view === "up" ? -1 : 1;
    for (let k = 0; k < 6; k++) {
      const x = ax + dir * (k > 2 ? tick : 0);
      const col = k % 3 === 2 ? f.shadow : f.light;
      pc.set(x, T + 3 + k, col);
      pc.set(x + dir, T + 3 + k, k % 3 === 2 ? f.shadow : f.base);
    }
    return;
  }
  // arms: from the shoulders to the wrists, outside the torso (front, back) or the side arm
  const armRows = (y: number): [number, number][] =>
    c.view === "left"
      ? (() => {
          const ax = phase === 1 ? -1 : phase === 3 ? 1 : 0;
          const k = y - T;
          const off = k < 4 ? 0 : k < 8 ? ax * 2 : ax * 4;
          return k >= 0 && k < 10 ? [[14 + off, 17 + off]] : [];
        })()
      : [...runsOf(c, y, fabric, 0, c.tl - 1), ...runsOf(c, y, fabric, c.tr + 1, 31)];
  const legTop = b.seated ? b.end - 1 : b.W + 3;
  for (let y = T; y < legTop; y++)
    for (const [a, z] of armRows(y)) {
      const k = y - T;
      if (s === "skeleton") {
        const x = c.view === "left" ? a + 1 : a + Math.floor((z - a) / 2);
        if (k > 0) pc.set(x, y, k === 4 || k === 5 ? p.main.light : p.main.base);
        if (k === 4 && z > a) pc.set(x + 1, y, p.main.shadow);
      } else if (s === "knight") {
        if (k % 3 === 2) for (let x = a; x <= z; x++) pc.set(x, y, f.shadow);
        if (k === 5) pc.set(a, y, f.light);
      }
    }
  if (s === "knight") pauldrons(c, b, f);
  // legs: runs below the hips
  for (let y = legTop; y < 46; y++) {
    const rs = runsOf(c, y, fabric);
    for (const [a, z] of rs) {
      const w = z - a + 1;
      if (w < 3) continue;
      const xs =
        w >= 10 ? [a + Math.floor(w / 4), z - Math.floor(w / 4)] : [a + Math.floor((w - 1) / 2)];
      for (const x of xs) {
        if (s === "skeleton") {
          const knee = y === c.legRow(39);
          pc.set(x, y, knee ? p.main.light : p.main.base);
          if (knee) pc.set(x + 1, y, p.main.base);
        } else if (y === c.legRow(39) || y === c.legRow(39) + 1) {
          pc.hline(x - 1, y, 3, y === c.legRow(39) ? f.light : f.shadow);
        }
      }
    }
  }
}

/** Shoulder plates over the tops of the arms. */
function pauldrons(c: Ctx, b: TorsoBox, f: Ramp) {
  const T = b.T;
  const plate = (x0: number) => {
    const shape = oval(x0, T - 2, 7, 6);
    fill(c.pc, (x, y) => shape(x, y) && y <= T + 2, f, [x0, T - 2, x0 + 6, T + 2]);
    c.pc.hline(x0 + 1, T + 1, 5, f.shadow);
  };
  if (c.view === "left") plate(12);
  else {
    plate(c.tl - 4);
    plate(c.tr - 2);
  }
}
