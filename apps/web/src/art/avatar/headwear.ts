/**
 * Headwear, earrings and the sibling-session hat. Catalog headwear (beanie, cap, bow,
 * headphones) reuses the original 1× layers through Scale2x so it looks like before.
 */
import type { CharacterLook } from "@agent-office/protocol";
import { C } from "../palette.ts";
import type { PixelCanvas } from "../pixel.ts";
import { mix, NIGHT } from "./color.ts";
import { drawNoveltyHeadwear } from "./extras.ts";
import type { View } from "./geometry.ts";
import { scale2x } from "./hair.ts";
import { faceSides } from "./head.ts";

type Layer = readonly string[];
const ACC: Record<"headphones" | "beanie" | "cap" | "bow", Record<View, Layer>> = {
  headphones: {
    down: [
      "",
      ".....KKKKKK.....",
      "....K......K....",
      "...K........K...",
      "..K..........K..",
      "..K..........K..",
      ".PP..........PP.",
      ".PQ..........QP.",
      ".PP..........PP.",
    ],
    up: [
      "",
      ".....KKKKKK.....",
      "....K......K....",
      "...K........K...",
      "..K..........K..",
      "..K..........K..",
      ".PP..........PP.",
      ".PQ..........QP.",
      ".PP..........PP.",
    ],
    left: [
      "",
      ".......KKK......",
      "........K.......",
      "........K.......",
      "........K.......",
      "........K.......",
      ".......PPP......",
      ".......PQP......",
      ".......PPP......",
    ],
  },
  beanie: {
    down: [
      ".......pp.......",
      ".....BBBBBB.....",
      "....BBBBBBBB....",
      "...BBBBBBBBBB...",
      "..bbbbbbbbbbbb..",
      "..bbbbbbbbbbbb..",
    ],
    up: [
      ".......pp.......",
      ".....BBBBBB.....",
      "....BBBBBBBB....",
      "...BBBBBBBBBB...",
      "..bbbbbbbbbbbb..",
      "..bbbbbbbbbbbb..",
    ],
    left: [
      "........pp......",
      ".....BBBBBB.....",
      "....BBBBBBBB....",
      "....BBBBBBBBB...",
      "...bbbbbbbbbbb..",
      "...bbbbbbbbbbb..",
    ],
  },
  cap: {
    down: [
      "",
      ".....AAAAAA.....",
      "....AaAAAAAA....",
      "...AAAAAAAAAA...",
      "...AAAAAAAAAA...",
      "..NNNNNNNNNNNN..",
    ],
    up: [
      "",
      ".....AAAAAA.....",
      "....AaAAAAAA....",
      "...AAAAAAAAAA...",
      "...AAAAAAAAAA...",
      "...AAN....NAA...",
    ],
    left: [
      "",
      ".....AAAAAA.....",
      "....AaAAAAAAA...",
      "....AAAAAAAAAA..",
      "....AAAAAAAAAA..",
      ".NNNNNN.........",
    ],
  },
  bow: {
    down: ["", "", "..........RRrRR.", "..........R.r.R."],
    up: ["", "", ".RRrRR..........", ".R.r.R.........."],
    left: ["", "", "........RRrRR...", "........R.r.R..."],
  },
};
const HAT: Record<View, Layer> = {
  down: [".....TTTTTT.....", ".....TTTTTT.....", ".....tttttt.....", ".YYYYYYYYYYYYYY."],
  up: [".....TTTTTT.....", ".....TTTTTT.....", ".....tttttt.....", ".YYYYYYYYYYYYYY."],
  left: [".....TTTTTT.....", ".....TTTTTT.....", ".....tttttt.....", "..YYYYYYYYYYYY.."],
};

const cache = new Map<string, string[]>();
function up2(key: string, rows: Layer): string[] {
  let v = cache.get(key);
  if (!v) {
    v = scale2x(rows);
    cache.set(key, v);
  }
  return v;
}

/** Wide-brim hats: crown box + brim line, drawn procedurally. */
function drawBrimHat(
  pc: PixelCanvas,
  hw: CharacterLook["headwear"],
  view: View,
  hy: number,
  felt: boolean,
) {
  const { base, shadow, light } = hw.ramp;
  const side = view === "left";
  const cl = side ? 9 : 9;
  const cr = side ? 22 : 22;
  const crownTop = felt ? 2 : 3;
  const brimY = 8;
  // crown
  for (let y = crownTop; y < brimY; y++) {
    const inset = y === crownTop ? 2 : y === crownTop + 1 && felt ? 1 : 0;
    for (let x = cl + inset; x <= cr - inset; x++) pc.set(x, y + hy, x >= cr - 1 ? shadow : base);
  }
  if (felt) pc.hline(cl + 4, crownTop + hy, cr - cl - 7, shadow); // pinched crown
  pc.set(cl + 1, crownTop + 2 + hy, light);
  // band
  pc.hline(cl, brimY - 2 + hy, cr - cl + 1, hw.accent);
  pc.hline(cl, brimY - 1 + hy, cr - cl + 1, felt ? hw.accent : base);
  if (felt) {
    // a little tuft/feather on the side
    pc.vline(side ? cr - 1 : cr - 2, crownTop - 1 + hy, 3, light);
    pc.set(side ? cr : cr - 1, crownTop - 2 + hy, light);
  }
  // brim
  if (felt) {
    pc.hline(cl - 3, brimY + hy, cr - cl + 7, shadow);
    pc.hline(cl - 2, brimY + hy, cr - cl + 5, base);
  } else {
    // bucket: sloped brim all around
    pc.hline(cl - 2, brimY + hy, cr - cl + 5, base);
    pc.hline(cl - 3, brimY + 1 + hy, cr - cl + 7, shadow);
  }
}

// ---- wardrobe hats (WD1): drawn natively at 2×; tall ones rise into the headroom ------------
type Hw = CharacterLook["headwear"];
/** Head-relative painter; `m` mirrors x (the back view of asymmetric hats). */
type P = {
  set: (x: number, y: number, c: string) => void;
  row: (x0: number, x1: number, y: number, c: string) => void;
};
function painter(pc: PixelCanvas, hy: number, m = false): P {
  const set = (x: number, y: number, c: string) => pc.set(m ? 31 - x : x, y + hy, c);
  return {
    set,
    row: (x0, x1, y, c) => {
      for (let x = x0; x <= x1; x++) set(x, y, c);
    },
  };
}
/** Rows of [x0, x1] spans keyed by row; base fill, right `sh` texels in shadow, left light. */
function spans(p: P, rows: Record<number, [number, number]>, hw: Hw, sh = 2, lit = true) {
  const { base, shadow, light } = hw.ramp;
  for (const [ys, [a, b]] of Object.entries(rows)) {
    const y = Number(ys);
    p.row(a, b, y, base);
    for (let k = 0; k < sh; k++) p.set(b - k, y, shadow);
    if (lit) p.set(a + 1, y, light);
  }
}
const DARK = "#262b44";

function topHat(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  for (let y = -6; y <= 4; y++) {
    p.row(10, 21, y, base);
    p.set(20, y, shadow);
    p.set(21, y, shadow);
    if (y > -6 && y < 2) p.set(11, y, light);
  }
  p.row(11, 19, -6, light);
  p.row(10, 21, 2, hw.accent);
  p.row(10, 21, 3, hw.accent);
  p.row(10, 21, 4, mix(hw.accent, NIGHT, 0.35));
  const w = view === "left" ? 1 : 0;
  p.row(6 - w, 25 + w, 5, base);
  p.set(25 + w, 5, shadow);
  p.row(7 - w, 24 + w, 6, shadow);
}

function chefHat(p: P, hw: Hw) {
  const { base, shadow, light } = hw.ramp;
  spans(
    p,
    { [-6]: [11, 20], [-5]: [9, 22], [-4]: [8, 23], [-3]: [7, 24], [-2]: [7, 24], [-1]: [7, 24] },
    hw,
  );
  spans(p, { 0: [7, 24], 1: [7, 24], 2: [8, 23], 3: [9, 22] }, hw);
  // puff creases
  for (const x of [11, 15, 20]) for (let y = -1; y <= 3; y++) p.set(x, y, mix(base, shadow, 0.6));
  p.row(10, 13, -5, light);
  // band
  for (let y = 4; y <= 7; y++) {
    p.row(8, 23, y, base);
    p.set(22, y, shadow);
    p.set(23, y, shadow);
  }
  p.row(8, 23, 4, mix(base, shadow, 0.5));
}

function witchHat(p: P, hw: Hw) {
  spans(
    p,
    {
      [-6]: [18, 21],
      [-5]: [16, 20],
      [-4]: [14, 19],
      [-3]: [13, 19],
      [-2]: [12, 19],
      [-1]: [11, 20],
      0: [10, 20],
      1: [10, 21],
      2: [9, 22],
    },
    hw,
  );
  p.row(9, 22, 3, hw.accent);
  p.row(9, 22, 4, mix(hw.accent, NIGHT, 0.3));
  p.set(15, 3, mix(hw.accent, "#ffffff", 0.5)); // buckle
  p.row(3, 28, 5, hw.ramp.base);
  p.row(4, 27, 6, hw.ramp.shadow);
}

function cowboyHat(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  p.row(11, 14, -1, base);
  p.row(17, 20, -1, base);
  for (let y = 0; y <= 3; y++) {
    p.row(10, 21, y, base);
    p.set(20, y, shadow);
    p.set(21, y, shadow);
    p.set(11, y, light);
  }
  // the dent down the crown
  p.row(15, 16, 0, shadow);
  p.set(15, 1, shadow);
  p.row(10, 21, 4, hw.accent);
  const w = view === "left" ? 1 : 0;
  p.row(4 - w, 27 + w, 5, base);
  p.row(6, 25, 6, shadow);
  // curled-up brim ends
  for (const x of [3 - w, 4 - w]) p.set(x, 4, base);
  p.set(3 - w, 3, light);
  for (const x of [27 + w, 28 + w]) p.set(x, 4, shadow);
  p.set(28 + w, 3, shadow);
}

function tyroleanHat(p: P, hw: Hw) {
  const { base, shadow } = hw.ramp;
  spans(p, { 0: [12, 19], 1: [11, 20], 2: [10, 21], 3: [10, 21], 4: [10, 21], 5: [10, 21] }, hw);
  p.row(14, 17, 0, shadow); // pinched crown
  // twisted cord band
  for (let x = 10; x <= 21; x++) p.set(x, 4, x % 2 ? hw.accent : mix(hw.accent, NIGHT, 0.4));
  p.row(7, 24, 6, base);
  p.set(24, 6, shadow);
  p.row(8, 23, 7, shadow);
  // a feather tucked into the band at the side, leaning back: broad vane, darker quill
  const quill = mix(hw.accent, NIGHT, 0.45);
  const vane = hw.accent;
  const edge = mix(hw.accent, "#ffffff", 0.4);
  for (let t = 0; t <= 8; t++) {
    const x = 20 + Math.round(t * 0.75);
    const y = 4 - t;
    p.set(x, y, quill);
    if (t >= 2 && t <= 7) {
      p.set(x + 1, y, vane);
      p.set(x - 1, y, t % 2 ? edge : vane);
    }
    if (t >= 3 && t <= 6) p.set(x + 2, y, t % 2 ? vane : edge);
  }
}

function beret(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  if (view === "left") {
    spans(p, { 2: [10, 20], 3: [7, 23], 4: [6, 26], 5: [6, 26], 6: [16, 27] }, hw);
  } else {
    spans(p, { 2: [10, 21], 3: [8, 25], 4: [7, 27], 5: [7, 27], 6: [20, 27] }, hw);
    p.row(9, 11, 3, light);
  }
  p.row(8, 23, 7, mix(base, shadow, 0.6));
  p.set(14, 0, shadow);
  p.set(14, 1, shadow);
}

function hardHat(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  spans(
    p,
    { 0: [12, 19], 1: [10, 21], 2: [9, 22], 3: [9, 22], 4: [9, 22], 5: [9, 22], 6: [9, 22] },
    hw,
  );
  for (let y = 0; y <= 6; y++) p.row(15, 16, y, hw.accent);
  p.set(11, 2, light);
  p.set(11, 3, light);
  p.set(12, 1, light);
  if (view === "left") {
    p.row(3, 26, 7, base);
    p.row(3, 8, 8, shadow);
  } else {
    p.row(6, 25, 7, base);
    p.set(6, 7, shadow);
    p.set(25, 7, shadow);
    if (view === "down") p.row(10, 21, 8, shadow);
  }
}

function flowerCrown(p: P, hw: Hw, view: View) {
  const greens = ["#3e8948", "#265c42"];
  const [a, b] = view === "left" ? [8, 23] : [6, 25];
  for (let x = a; x <= b; x++) {
    p.set(x, 7, greens[x % 2]!);
    if (x % 3 === 0) p.set(x, 6, greens[0]!);
  }
  const petals = [hw.accent, hw.ramp.base, hw.ramp.light];
  const centres = view === "left" ? [9, 13, 17, 21] : [7, 11, 15, 20, 24];
  centres.forEach((x, i) => {
    const c = petals[i % petals.length]!;
    p.set(x - 1, 6, c);
    p.set(x + 1, 6, c);
    p.set(x, 5, c);
    p.set(x, 7, mix(c, NIGHT, 0.2));
    p.set(x, 6, "#fee761");
  });
}

function headscarf(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  const dots = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if ((x * 3 + y * 5) % 7 === 0) p.set(x, y, light);
  };
  if (view === "left") {
    spans(
      p,
      { 3: [10, 20], 4: [8, 23], 5: [7, 25], 6: [7, 25], 7: [7, 25], 8: [7, 25], 9: [7, 25] },
      hw,
    );
    p.row(7, 13, 10, shadow);
    for (let y = 10; y <= 22; y++) p.row(14, 25, y, base);
    for (let y = 10; y <= 22; y++) p.set(25, y, shadow);
    // strap down to the knot under the chin
    for (let y = 18; y <= 23; y++) p.row(12 - (y - 18), 14, y, base);
    p.row(8, 10, 23, hw.accent);
    p.row(8, 10, 24, mix(hw.accent, NIGHT, 0.3));
    dots(8, 24, 4, 9);
    dots(15, 24, 10, 20);
    return;
  }
  spans(p, { 3: [10, 21], 4: [8, 23], 5: [6, 25] }, hw);
  for (let y = 6; y <= 10; y++) {
    p.row(5, 26, y, base);
    p.set(26, y, shadow);
  }
  if (view === "up") {
    for (let y = 11; y <= 21; y++) {
      p.row(5, 26, y, base);
      p.set(26, y, shadow);
    }
    // the corner of the triangle hangs down the back
    spans(p, { 22: [8, 23], 23: [10, 21], 24: [12, 19], 25: [14, 17] }, hw, 1, false);
    dots(6, 25, 4, 22);
    return;
  }
  p.row(6, 25, 10, shadow); // front hem
  for (let y = 11; y <= 22; y++) {
    p.row(4, 6, y, base);
    p.row(25, 27, y, shadow);
  }
  // tied under the chin
  p.row(8, 23, 23, base);
  p.row(14, 17, 23, hw.accent);
  p.row(14, 17, 24, mix(hw.accent, NIGHT, 0.3));
  p.set(13, 25, base);
  p.set(12, 26, shadow);
  p.set(18, 25, base);
  p.set(19, 26, shadow);
  dots(6, 25, 4, 9);
}

function turban(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  const span: Record<number, [number, number]> = { 0: [11, 20], 1: [9, 22] };
  for (let y = 2; y <= 9; y++) span[y] = view === "left" ? [7, 25] : [6, 25];
  for (const [ys, [a, b]] of Object.entries(span)) {
    const y = Number(ys);
    for (let x = a; x <= b; x++) {
      const k = ((view === "up" ? x + 2 * y : x - 2 * y) + 64) % 6;
      p.set(x, y, k === 0 ? shadow : k === 1 ? light : x >= b - 1 ? mix(base, shadow, 0.5) : base);
    }
  }
  p.row(view === "left" ? 7 : 6, 25, 9, shadow);
  if (view === "down") {
    p.row(15, 16, 4, hw.accent);
    p.row(15, 16, 5, mix(hw.accent, NIGHT, 0.3));
    p.set(15, 4, mix(hw.accent, "#ffffff", 0.5));
  }
}

function hijab(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  /** outer span per row and the face opening (front) */
  const outer = (y: number): [number, number] | null => {
    if (view === "left") {
      if (y < 3 || y > 29) return null;
      return y === 3 ? [10, 20] : y === 4 ? [8, 22] : y >= 24 ? [6, 27] : [7, 25];
    }
    if (y < 3 || y > 29) return null;
    if (y === 3) return [10, 21];
    if (y === 4) return [8, 23];
    if (y === 5) return [6, 25];
    if (y <= 20) return [4, 27];
    if (y <= 23) return [5, 26];
    if (y === 24) return [4, 27];
    return [3, 28];
  };
  const open = (y: number): [number, number] | null => {
    if (view === "up") return null;
    if (view === "left") return y >= 9 && y <= 22 ? [0, 13] : null;
    if (y === 9) return [11, 20];
    if (y >= 10 && y <= 19) return [8, 23];
    if (y === 20) return [9, 22];
    if (y === 21) return [10, 21];
    if (y === 22) return [11, 20];
    return null;
  };
  for (let y = 3; y <= 29; y++) {
    const o = outer(y);
    if (!o) continue;
    const hole = open(y);
    for (let x = o[0]; x <= o[1]; x++) {
      if (hole && x >= hole[0] && x <= hole[1]) continue;
      const edge = hole && (x === hole[0] - 1 || x === hole[1] + 1);
      const fold = y >= 25 && (x === 8 || x === 13 || x === 18 || x === 23);
      const c =
        edge || fold || x >= o[1] - 1 ? shadow : x <= o[0] + 1 && y > 5 && y < 16 ? light : base;
      p.set(x, y, c);
    }
  }
  if (view === "down") p.set(23, 22, hw.accent); // pin
}

function tiara(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  const [a, b] = view === "left" ? [9, 18] : [10, 21];
  p.row(a, b, 7, shadow);
  for (let x = a; x <= b; x++) p.set(x, 6, x % 2 ? light : base);
  const points = view === "left" ? [10, 13, 16] : [10, 13, 15, 16, 18, 21];
  for (const x of points) p.set(x, 5, base);
  if (view === "left") {
    p.set(13, 4, light);
    p.set(13, 5, hw.accent);
    return;
  }
  p.set(13, 4, base);
  p.set(18, 4, base);
  p.row(15, 16, 4, light);
  p.row(15, 16, 3, light);
  if (view === "down") {
    p.row(15, 16, 5, hw.accent);
    p.set(12, 6, hw.accent);
    p.set(19, 6, hw.accent);
  }
}

function santaHat(p: P, hw: Hw) {
  spans(
    p,
    {
      [-3]: [22, 26],
      [-2]: [19, 27],
      [-1]: [16, 27],
      0: [13, 27],
      1: [11, 23],
      2: [10, 22],
      3: [9, 22],
      4: [8, 23],
    },
    hw,
  );
  // the tip flops down the side
  for (let y = 1; y <= 4; y++) p.row(25, 27, y, y > 2 ? hw.ramp.shadow : hw.ramp.base);
  const fluff = mix(hw.accent, NIGHT, 0.12);
  for (let y = 5; y <= 7; y++)
    for (let x = 6; x <= 25; x++) p.set(x, y, (x + y) % 3 === 0 ? fluff : hw.accent);
  p.row(7, 24, 5, hw.accent);
  // pompom
  p.row(26, 27, 5, hw.accent);
  p.row(25, 28, 6, hw.accent);
  p.row(25, 28, 7, hw.accent);
  p.set(28, 7, fluff);
  p.row(26, 27, 8, fluff);
}

function tricorn(p: P, hw: Hw, view: View) {
  const { base, shadow } = hw.ramp;
  const trim = hw.accent;
  if (view === "left") {
    spans(p, { 0: [12, 19], 1: [10, 21], 2: [10, 21], 3: [10, 21], 4: [10, 21] }, hw);
    const top = (x: number) => (x <= 7 ? 2 : x >= 24 ? 3 : 5);
    for (let x = 3; x <= 28; x++) {
      for (let y = top(x); y <= 7; y++) p.set(x, y, y === 7 ? shadow : base);
      p.set(x, top(x), trim);
    }
    return;
  }
  // crown behind the upturned brim
  p.row(11, 20, 0, base);
  for (let y = 1; y <= 3; y++) p.row(10, 21, y, mix(base, shadow, 0.4));
  for (let x = 4; x <= 27; x++) {
    const d = Math.abs(x - 15.5);
    const top = Math.round(1 + 3 * (1 - Math.min(d, 11.5) / 11.5));
    const bottom = d < 3 ? 8 : 7;
    for (let y = top; y <= bottom; y++) p.set(x, y, y === bottom || x >= 25 ? shadow : base);
    p.set(x, top, trim);
  }
  if (view === "down") {
    // the front corner points at the viewer
    p.row(14, 17, 8, base);
    p.row(15, 16, 9, shadow);
    p.row(15, 16, 8, trim);
  }
}

function captainHat(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  if (view === "left") {
    spans(p, { 1: [9, 22], 2: [7, 24], 3: [7, 24], 4: [7, 24] }, hw);
    p.row(8, 23, 5, DARK);
    p.row(8, 23, 6, DARK);
    p.row(4, 10, 7, DARK);
    p.row(3, 8, 8, mix(DARK, NIGHT, 0.4));
    p.row(9, 10, 3, hw.accent);
    p.row(9, 10, 4, hw.accent);
    return;
  }
  p.row(8, 23, 1, light);
  for (let y = 2; y <= 4; y++) {
    p.row(6, 25, y, base);
    p.row(24, 25, y, shadow);
  }
  p.set(7, 2, light);
  p.row(8, 23, 5, DARK);
  p.row(8, 23, 6, DARK);
  if (view === "up") return;
  p.row(9, 22, 7, DARK);
  p.set(12, 7, mix(DARK, "#ffffff", 0.35));
  p.row(10, 21, 8, mix(DARK, NIGHT, 0.4));
  // gold badge
  p.row(15, 16, 3, hw.accent);
  p.row(14, 17, 4, hw.accent);
  p.row(15, 16, 5, mix(hw.accent, NIGHT, 0.25));
  p.set(15, 4, mix(hw.accent, "#ffffff", 0.5));
}

function vikingHelmet(p: P, hw: Hw, view: View) {
  const { base, shadow, light } = hw.ramp;
  const horn = hw.accent;
  const hornDark = mix(hw.accent, NIGHT, 0.3);
  const hornSide = (m: (x: number) => number) => {
    const rows: [number, number, number][] = [
      [6, 5, 7],
      [5, 4, 6],
      [4, 3, 5],
      [3, 3, 4],
      [2, 3, 4],
      [1, 3, 4],
      [0, 4, 4],
      [-1, 4, 4],
    ];
    for (const [y, a, b] of rows)
      for (let x = a; x <= b; x++) p.set(m(x), y, x === a ? hornDark : horn);
  };
  if (view === "left") {
    hornSide((x) => x + 12);
  } else {
    hornSide((x) => x);
    hornSide((x) => 31 - x);
  }
  spans(p, { 0: [11, 20], 1: [9, 22], 2: [7, 24], 3: [7, 24], 4: [7, 24], 5: [7, 24] }, hw);
  p.set(9, 2, light);
  p.set(9, 3, light);
  for (let y = 0; y <= 5; y++) p.set(15, y, light);
  const rim = mix(shadow, NIGHT, 0.2);
  p.row(7, 24, 6, rim);
  p.row(7, 24, 7, rim);
  for (let x = 8; x <= 23; x += 3) p.set(x, 6, light);
  if (view === "down") {
    // nose guard
    for (let y = 8; y <= 12; y++) {
      p.set(15, y, base);
      p.set(16, y, shadow);
    }
  }
}

/** The wardrobe hats; false = not one of them. */
function drawWardrobeHat(pc: PixelCanvas, hw: Hw, view: View, hy: number): boolean {
  const p = painter(pc, hy);
  const pm = painter(pc, hy, view === "up");
  switch (hw.style) {
    case "top-hat":
      topHat(p, hw, view);
      return true;
    case "cowboy-hat":
      cowboyHat(p, hw, view);
      return true;
    case "tyrolean-hat":
      tyroleanHat(pm, hw);
      return true;
    case "chef-hat":
      chefHat(p, hw);
      return true;
    case "witch-hat":
      witchHat(pm, hw);
      return true;
    case "beret":
      beret(pm, hw, view);
      return true;
    case "hard-hat":
      hardHat(p, hw, view);
      return true;
    case "flower-crown":
      flowerCrown(p, hw, view);
      return true;
    case "headscarf":
      headscarf(p, hw, view);
      return true;
    case "turban":
      turban(p, hw, view);
      return true;
    case "hijab":
      hijab(p, hw, view);
      return true;
    case "tiara":
      tiara(p, hw, view);
      return true;
    case "santa-hat":
      santaHat(pm, hw);
      return true;
    case "tricorn":
      tricorn(p, hw, view);
      return true;
    case "captain-hat":
      captainHat(p, hw, view);
      return true;
    case "viking-helmet":
      vikingHelmet(p, hw, view);
      return true;
    default:
      return false;
  }
}

export function drawHeadwear(
  pc: PixelCanvas,
  L: CharacterLook,
  view: View,
  hy: number,
  hat: boolean,
) {
  const hw = L.headwear;
  const { base, shadow, light } = hw.ramp;
  if (drawWardrobeHat(pc, hw, view, hy)) {
    if (hat) pc.sprite(0, hy, up2(`hat/${view}`, HAT[view]), { T: C.amber, t: C.red, Y: C.sand });
    return;
  }
  switch (hw.style) {
    case "none":
      break;
    case "beanie":
      pc.sprite(0, hy, up2(`beanie/${view}`, ACC.beanie[view]), {
        B: base,
        b: light,
        p: hw.accent,
      });
      // knit ribs on the cuff
      for (let x = 5; x < 27; x += 2) pc.set(x, 9 + hy, mix(light, shadow, 0.5));
      break;
    case "cap": {
      pc.sprite(0, hy, up2(`cap/${view}`, ACC.cap[view]), { A: base, a: light, N: hw.accent });
      // small logo on the front panel (the mint cap's white logo)
      const logo = hw.logo && hw.logo !== "none" ? hw.logo : null;
      if (logo && view === "down") pc.rect(14, 6 + hy, 4, 2, logo);
      if (logo && view === "left") pc.rect(8, 6 + hy, 2, 2, logo);
      break;
    }
    case "cap-backwards": {
      const v: View = view === "down" ? "up" : view === "up" ? "down" : "left";
      if (view === "left") {
        // the side cap without its brim, brim sticking out at the back of the head instead
        const rows = up2("cap/left", ACC.cap.left).map((r) => r.replace(/N/g, "."));
        pc.sprite(0, hy, rows, { A: base, a: light, N: hw.accent });
        pc.hline(22, 10 + hy, 8, hw.accent);
        pc.hline(24, 11 + hy, 6, mix(hw.accent, NIGHT, 0.3));
      } else {
        pc.sprite(0, hy, up2(`cap/${v}`, ACC.cap[v]), { A: base, a: light, N: hw.accent });
      }
      if (view === "down") pc.hline(13, 9 + hy, 6, hw.accent); // strap opening seen from the front
      break;
    }
    case "bucket-hat":
      drawBrimHat(pc, hw, view, hy, false);
      break;
    case "felt-hat":
      drawBrimHat(pc, hw, view, hy, true);
      break;
    case "headband": {
      const [l, r] = view === "left" ? [8, 23] : faceSides(L.face.shape);
      pc.hline(l, 9 + hy, r - l + 1, base);
      pc.hline(l, 10 + hy, r - l + 1, hw.accent);
      pc.hline(l, 11 + hy, r - l + 1, shadow);
      break;
    }
    case "bow":
      pc.sprite(0, hy, up2(`bow/${view}`, ACC.bow[view]), { R: base, r: hw.accent });
      break;
    case "cat-ears":
    case "fox-ears":
    case "bunny-ears":
    case "devil-horns":
    case "halo":
    case "crown":
    case "wizard-hat":
    case "party-hat":
    case "antenna":
      drawNoveltyHeadwear(pc, L, view, hy);
      break;
    case "headphones":
      if (!hat)
        pc.sprite(0, hy, up2(`hp/${view}`, ACC.headphones[view]), {
          K: hw.accent,
          P: base,
          Q: light,
        });
      break;
  }
  if (hat) pc.sprite(0, hy, up2(`hat/${view}`, HAT[view]), { T: C.amber, t: C.red, Y: C.sand });
}

export function drawEarrings(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const e = L.earrings;
  if (e.style === "none" || L.face.ears === "hidden") return;
  const dark = mix(e.color, NIGHT, 0.35);
  const xs: number[] =
    view === "left"
      ? [17]
      : (() => {
          const [l, r] = faceSides(L.face.shape);
          const w = L.face.ears === "visible" ? 2 : 1;
          return [l - w, r + w];
        })();
  for (const x of xs) {
    if (e.style === "stud") {
      pc.set(x, 18 + hy, e.color);
    } else {
      pc.set(x, 18 + hy, e.color);
      pc.set(x - 1, 19 + hy, e.color);
      pc.set(x + 1, 19 + hy, dark);
      pc.set(x, 20 + hy, dark);
    }
  }
}
