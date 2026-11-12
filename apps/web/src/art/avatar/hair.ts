/**
 * Hair cuts. The classic catalog cuts reuse the 1× ASCII layers of the original characters,
 * upscaled with Scale2x (rounds diagonals), so catalog people keep their silhouette.
 * New cuts are authored at 2× directly. Codes: h base, H shadow, L light (sheen), R ribbon.
 */
import type { CharacterLook } from "@agent-office/protocol";
import type { PixelCanvas } from "../pixel.ts";
import { hash2, mix, NIGHT } from "./color.ts";
import type { View } from "./geometry.ts";

type Layer = readonly string[];

/** Scale2x / EPX upscale of an ASCII layer ('.' = empty). */
export function scale2x(rows: Layer, width = 16): string[] {
  const at = (x: number, y: number) => {
    const r = rows[y];
    if (!r || x < 0 || x >= width) return ".";
    const c = r[x];
    return c === undefined || c === " " ? "." : c;
  };
  const out: string[] = [];
  for (let y = 0; y < rows.length; y++) {
    let r0 = "";
    let r1 = "";
    for (let x = 0; x < width; x++) {
      const P = at(x, y);
      const A = at(x, y - 1);
      const B = at(x + 1, y);
      const C = at(x - 1, y);
      const D = at(x, y + 1);
      // only round off silhouette corners (into or out of empty space), keep interior shading
      const ok = (q: string) => q === "." || P === ".";
      const e0 = C === A && C !== D && A !== B && ok(A) ? A : P;
      const e1 = A === B && A !== C && B !== D && ok(B) ? B : P;
      const e2 = D === C && D !== B && C !== A && ok(C) ? C : P;
      const e3 = B === D && B !== A && D !== C && ok(D) ? D : P;
      r0 += e0 + e1;
      r1 += e2 + e3;
    }
    out.push(r0, r1);
  }
  return out;
}

// ---- 1× layers of the original characters (16 wide, rows from y=0) ---------------------------
const SHORT_TOP = [
  "................",
  "................",
  "....hhhhhhhh....",
  "...hhLLhhhhhh...",
  "..hhLhhhhhhhHh..",
  "..hhhhhhhhhhHh..",
];
const CLASSIC: Record<
  "short" | "buzz" | "long" | "bun" | "curly" | "ponytail" | "mohawk" | "bald",
  Record<View, Layer>
> = {
  short: {
    down: [...SHORT_TOP, "..hhhh....hhHh..", "..h..........H.."],
    up: [
      ...SHORT_TOP,
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "...HhhhhhhhhH...",
      "....HHHHHHHH....",
    ],
    left: [
      "................",
      "................",
      ".....hhhhhh.....",
      "....hLLhhhhhh...",
      "...hhhhhhhhhhh..",
      "...hhhhhhhhhHh..",
      "...hh.hhhhhhHh..",
      ".........hhhHh..",
      ".........hhhHh..",
      ".........hhhH...",
      "..........HH....",
    ],
  },
  buzz: {
    down: ["", "", "", "....HHHHHHHH....", "...HhHhHhHhHH...", "...H........H..."],
    up: [
      "",
      "",
      "",
      "....HHHHHHHH....",
      "...HhHhHhHhHH...",
      "...hHhHhHhHhH...",
      "...HhHhHhHhHH...",
      "...hHhHhHhHhH...",
      "...HhHhHhHhHH...",
      "....HHHHHHHH....",
    ],
    left: [
      "",
      "",
      "",
      ".....HHHHHH.....",
      "....HhHhHhHH....",
      "....H...hHhH....",
      ".........HhH....",
      ".........HhH....",
      "..........HH....",
    ],
  },
  long: {
    down: [
      ...SHORT_TOP,
      "..hhhh....hhHh..",
      "..hh........Hh..",
      "..hh........Hh..",
      "..hh........Hh..",
      "..hh........Hh..",
      "..hh........Hh..",
      "..hh........Hh..",
      "..Hh........hH..",
      "..H..........H..",
    ],
    up: [
      ...SHORT_TOP,
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..HhhhhhhhhhHH..",
      "...HHhHHhHHhH...",
    ],
    left: [
      "................",
      "................",
      ".....hhhhhh.....",
      "....hLLhhhhhh...",
      "...hhhhhhhhhhh..",
      "...hhhhhhhhhHh..",
      "...hh.hhhhhhHh..",
      "........hhhhHh..",
      "........hhhhHh..",
      "........hhhhHh..",
      "........hhhhHh..",
      "........hhhhHh..",
      "........hhhhHh..",
      ".........hhhHh..",
      ".........hhHH...",
    ],
  },
  bun: {
    down: [
      "......hhhh......",
      ".....hLhhhH.....",
      ...SHORT_TOP.slice(2),
      "..hhhh....hhHh..",
      "..h..........H..",
    ],
    up: [
      "......hhhh......",
      ".....hLhhhH.....",
      ...SHORT_TOP.slice(2),
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "...HhhhhhhhhH...",
      "....HHHHHHHH....",
    ],
    left: [
      ".........hhh....",
      "........hLhhH...",
      ".....hhhhhhH....",
      "....hLLhhhhhh...",
      "...hhhhhhhhhhh..",
      "...hhhhhhhhhHh..",
      "...hh.hhhhhhHh..",
      ".........hhhHh..",
      ".........hhhHh..",
      ".........hhhH...",
      "..........HH....",
    ],
  },
  curly: {
    down: [
      "................",
      "....hh.hh.hh....",
      "..hhhhhhhhhhhh..",
      ".hhhLhhhhLhhhhh.",
      ".hhLhhhhhhhhhHh.",
      ".hhhhhhhhhhhhHh.",
      ".hhhhh.hh.hhhHh.",
      ".hhh........hHh.",
      ".hh..........Hh.",
      "..h..........H..",
    ],
    up: [
      "................",
      "....hh.hh.hh....",
      "..hhhhhhhhhhhh..",
      ".hhhLhhhhLhhhhh.",
      ".hhLhhhhhhhhhHh.",
      ".hhhhhhhhhhhhHh.",
      ".hhhhhhhhhhhhHh.",
      ".hhhhhhhhhhhhHh.",
      ".hhhhhhhhhhhhHh.",
      ".hhhhhhhhhhhhHh.",
      "..hhhhhhhhhhHh..",
      "...H.HH.HH.H....",
    ],
    left: [
      "................",
      ".....hh.hh......",
      "...hhhhhhhhhh...",
      "..hhhLhhhhhhhh..",
      "..hhLhhhhhhhhHh.",
      "..hhhhhhhhhhhHh.",
      "..hh.hhhhhhhhHh.",
      "..h......hhhhHh.",
      ".........hhhhHh.",
      ".........hhhhH..",
      "..........HHH...",
    ],
  },
  ponytail: {
    down: [
      ...SHORT_TOP,
      "..hhh......hHh..",
      "..h..........hH.",
      ".............hH.",
      ".............Hh.",
      "..............H.",
    ],
    up: [
      ...SHORT_TOP,
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "..hhhhhhhhhhHh..",
      "...HhhhRRhhhH...",
      "....HHHhhHHH....",
      ".......hH.......",
      ".......hH.......",
      ".......hH.......",
      "........H.......",
    ],
    left: [
      "................",
      "................",
      ".....hhhhhh.....",
      "....hLLhhhhhh...",
      "...hhhhhhhhhhh..",
      "...hhhhhhhhhHhR.",
      "...hh.hhhhhhHhhh",
      ".........hhhH.hH",
      ".........hhhH.hH",
      ".........hhhH..H",
      "..........HH....",
    ],
  },
  mohawk: {
    down: [
      ".......hh.......",
      "......hLhh......",
      "......hhhh......",
      "....HHhhhhHH....",
      "...H..hhhh..H...",
      "...H........H...",
    ],
    up: [
      ".......hh.......",
      "......hLhh......",
      "......hhhh......",
      "....HHhhhhHH....",
      "...HHHhhhhHHH...",
      "...HHHhhhhHHH...",
      "...HHHhhhhHHH...",
      "...HHHhhhhHHH...",
      "....HHhhhhHH....",
      "......hhhh......",
    ],
    left: [
      ".......hhh......",
      "......hLhhh.....",
      ".....hhhhhhh....",
      "....HHHHhhhhh...",
      "....H...HHhH....",
      ".........HHH....",
      ".........HHH....",
      "..........H.....",
    ],
  },
  bald: {
    down: ["", "", "", "", ".....LL........."],
    up: ["", "", "", "", "......LL........", ".....L.........."],
    left: ["", "", "", "", ".....LL........."],
  },
};

// ---- 2× authored cuts (32 wide, rows from y=0) -------------------------------------------------
const SLICKED: Record<View, Layer> = {
  // high, smooth volume combed straight back; short dark sides; forehead free
  // front: high hairline (forehead free), comb lines fanning back over the top, short dark sides
  down: [
    "................................",
    "............HhhhhhhH............",
    "..........HhhhLLLhhhhH..........",
    ".........HhhhLLhhHhhhhH.........",
    "........HhHhhLhhhhHhhhhH........",
    "........HhhHhhhhhhHhhhHH........",
    ".......HhhhHhhhhhhhHhhhHH.......",
    ".......HhhhhHhhhhhhHhhhHH.......",
    "......HHhhhhHhLLLhhhhhhHHH......",
    "......HH...HhhhhhhhhH...HH......",
    "......HH................HH......",
    "......HH................HH......",
    ".......H................H.......",
  ],
  up: [
    "................................",
    "...........HHhhhhhhHH...........",
    ".........HhhhhLLLhhhhhH.........",
    "........HhhhhLLhhhhhhhhH........",
    ".......HhhhhLhhhhhhhhhhhH.......",
    ".......HhhhhhhhhhhhhhhhhH.......",
    "......HhhhhhhHhhhhHhhhhhHH......",
    "......HhhhhhhHhhhhHhhhhhHH......",
    "......HHhhhhhhHhhhHhhhhhHH......",
    "......HHhhhhhhHhhhhHhhhhHH......",
    "......HHhhhhhhhhhhhHhhhhHH......",
    "......HHHhhhhhhhhhhhhhhHHH......",
    "......HHHhhhhhhhhhhhhhhHHH......",
    "......HHHhhhhhhhhhhhhhhHHH......",
    ".......HHhhhhhhhhhhhhhhHH.......",
    ".......HHHhhhhhhhhhhhhHHH.......",
    "........HHHhhhhhhhhhhHHH........",
    "........HHHHhhhhhhhhHHHH........",
    ".........HHHHHhhhhHHHHH.........",
    "..........HHHHHHHHHHHH..........",
    "............HHHHHHHH............",
  ],
  left: [
    "................................",
    "...........hhhhhhH..............",
    ".........hLLLhhhhhhhH...........",
    "........hLhhhhhhhhhhhhH.........",
    "........hhhhhHHHhhhhhhhhH.......",
    "........HhhhhhhhhhHHHhhhhH......",
    ".........HhhhhhhhhhhhhhhhH......",
    "..........HHhhhhhhhhhhhhhH......",
    "...........HHHHHhhhhhhhhhH......",
    "............HHHHHHhhhhhhhH......",
    "............HHHHHHHhhhhhhH......",
    "............HHHH..HHhhhhhH......",
    "............HH.....HhhhhhH......",
    "...................HhhhhhH......",
    "...................HhhhhhH......",
    "...................HHhhhhH......",
    "....................HHhhHH......",
    ".....................HHHH.......",
  ],
};

const SIDE_PART: Record<View, Layer> = {
  down: [
    "................................",
    "................................",
    "................................",
    ".......hhhhH.hhhhhhhhhhhh.......",
    "......hhhLhH.hhhhhLLhhhhhh......",
    ".....hhhhhhH.hhhhLhhhhhhhhh.....",
    "....hhhhhhhHhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhHHh....",
    "....hhhh.......hhhhhhhhhhHHh....",
    "....hhh..............hhhhHh.....",
    "....hh..................HHh.....",
    "....h.....................H.....",
  ],
  up: [
    "................................",
    "................................",
    "................................",
    ".......hhhhhhhhhhhhhhhhh........",
    "......hhhhhhhhhhLLhhhhhhh.......",
    ".....hhhhhhhhhhLhhhhhhhhhh......",
    "....hhhhhhhhhhhhhhhhhhhhhHh.....",
    "....hhhhhhhhhhhhhhhhhhhhhHh.....",
    "....hhhhhhhhhhhhhhhhhhhhhHh.....",
    "....hhhhhhhhhhhhhhhhhhhhhHh.....",
    "....hhhhhhhhhhhhhhhhhhhhhHh.....",
    "....hhhhhhhhhhhhhhhhhhhhhHh.....",
    ".....hhhhhhhhhhhhhhhhhhhHh......",
    "......HhhhhhhhhhhhhhhhhHH.......",
    ".......HHHHHHHHHHHHHHHHH........",
  ],
  left: [
    "................................",
    "................................",
    "................................",
    "..........hhhhhhhhhh............",
    "........hhhLLhhhhhhhhh..........",
    ".......hhLhhhhhhhhhhhhhh........",
    "......hhhhhhhhhhhhhhhhhhh.......",
    "......hhhhhhhhhhhhhhhhhhHh......",
    "......hhhhh..hhhhhhhhhhhHh......",
    "......hhh.....hhhhhhhhhhHh......",
    "..............HhhhhhhhhhHh......",
    "................hhhhhhhhHh......",
    "..................hhhhhhH.......",
    "..................HHhhhHH.......",
    "....................HHH.........",
  ],
};

const BOB: Record<View, Layer> = {
  down: [
    "................................",
    "................................",
    "................................",
    "........hhhhhhhhhhhhhhhh........",
    "......hhhhLLhhhhhhhhhhhhhh......",
    ".....hhhhLhhhhhhhhhhhhhhhhh.....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhHHh....",
    "....hhhhhHhhhHhhhhHhhhHhhHHh....",
    "....hhhh..............hhhHHh....",
    "....hhh.................hHHh....",
    "....hhh.................hHHh....",
    "....hhh.................hHHh....",
    "....hhh.................hHHh....",
    "....hhh.................hHHh....",
    "....hhh.................hHHh....",
    "....HHh.................hHHH....",
    "....HHH.................HHHH....",
  ],
  up: [
    "................................",
    "................................",
    "................................",
    "........hhhhhhhhhhhhhhhh........",
    "......hhhhLLhhhhhhhhhhhhhh......",
    ".....hhhhLhhhhhhhhhhhhhhhhh.....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhHHh....",
    "....hhhhhhhhhhhhhhhhhhhhhHHh....",
    "....HhhhhhhhhhhhhhhhhhhhhHHH....",
    "....HHHHHHHHHHHHHHHHHHHHHHHH....",
  ],
  left: [
    "................................",
    "................................",
    "................................",
    "..........hhhhhhhhhhh...........",
    "........hhhLLhhhhhhhhhh.........",
    ".......hhLhhhhhhhhhhhhhhh.......",
    "......hhhhhhhhhhhhhhhhhhhh......",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhh.hhhhhhhhhhhhhhHh.....",
    "......hh.......hhhhhhhhhhHh.....",
    "...............hhhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................HhhhhhhhhHH.....",
    "................HHHHHHHHHHH.....",
  ],
};

/** Shoulder length, centre parting, curtain fringe framing the face, ends flipped outwards. */
const FLIP: Record<View, Layer> = {
  down: [
    "................................",
    "................................",
    "................................",
    "........hhhhhhhHHhhhhhHh........",
    "......hhhhLLhhhHHhhhhhhhHh......",
    ".....hhhhLhhhhhHHhhhhhhhhHh.....",
    "....hhhhhhhhhhhHHhhhhhhhhhHh....",
    "....hhhhhhhhhhH..HhhhhhhhhHh....",
    "....hhhhhhhhhH....HhhhhhhhHh....",
    "....hhhhhhhhH......HhhhhhhHh....",
    "....hhhhhhhhH......HhhhhhhHh....",
    "....hhhhhhhH........HhhhhhHh....",
    "....hhhhhH............HhhhHh....",
    "....hhh..................hHh....",
    "....hhh..................hHh....",
    "....hhh..................hHh....",
    "....hhh..................hHh....",
    "....hhh..................hHh....",
    "....hhhh................hhHh....",
    "...hhhhH................HhhHh...",
    "..hhhH....................HhHh..",
    ".hhH........................HHh.",
  ],
  up: [
    "................................",
    "................................",
    "................................",
    "........hhhhhhhhhhhhhhHh........",
    "......hhhhLLhhhhhhhhhhhhHh......",
    ".....hhhhLhhhhhhhhhhhhhhhHh.....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "....hhhhhhhhhhhhhhhhhhhhhhHh....",
    "...hhhhhhhhhhhhhhhhhhhhhhhhHh...",
    "..hhhHHhhhhhhhhhhhhhhhhhhHHhHh..",
    ".hhH..HHHHHHHHHHHHHHHHHHHH..HHh.",
  ],
  left: [
    "................................",
    "................................",
    "................................",
    "..........hhhhhhhhhhh...........",
    "........hhhLLhhhhhhhhhh.........",
    ".......hhLhhhhhhhhhhhhhhh.......",
    "......hhhhhhhhhhhhhhhhhhhh......",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhhhhhhhhhhhhhhhhhHh.....",
    "......hhhh.hhhhhhhhhhhhhhHh.....",
    "......hh.......hhhhhhhhhhHh.....",
    "...............hhhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhHh.....",
    "................hhhhhhhhhhHh....",
    "................hhhhhhhhhhhHh...",
    "................HhhhhhhhhHHhHh..",
    "................HHHHHHHHH..HHh..",
  ],
};

const UPSCALED = new Map<string, string[]>();
function classic(cut: keyof typeof CLASSIC, view: View): string[] {
  const k = `${cut}/${view}`;
  let v = UPSCALED.get(k);
  if (!v) {
    v = scale2x(CLASSIC[cut][view]);
    UPSCALED.set(k, v);
  }
  return v;
}

/**
 * Afro: a big round cloud around the head, face cut out. As character rows (L = sheen, which
 * the sprite maps to the base colour without sheen), so the tips pass can recolour it.
 */
function afroRows(view: View): string[] {
  const cx = view === "left" ? 17 : 15.5;
  const cy = 11;
  const rx = view === "left" ? 12.5 : 13.5;
  const ry = 10;
  const out: string[] = [];
  for (let y = 0; y <= 23; y++) {
    let row = "";
    for (let x = 0; x < 32; x++) {
      const dx = (x + 0.5 - cx - 0.5) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const bump = (hash2(x, y, 3) % 5) / 40;
      const outside =
        dx * dx + dy * dy > 1 - bump ||
        (view === "down" && y >= 10 && x >= 8 && x <= 23) ||
        (view === "down" && y >= 16) ||
        (view === "left" && y >= 10 && x <= 15) ||
        (view === "left" && y >= 18 && x < 20) ||
        (view === "up" && y >= 21);
      if (outside) {
        row += ".";
        continue;
      }
      const h = hash2(x, y, 9) % 9;
      const shade = x > cx + rx * 0.45 || y > cy + ry * 0.6 || h === 0;
      row += h === 1 && y < cy && x < cx && !shade ? "L" : shade ? "H" : "h";
    }
    out.push(row);
  }
  return out;
}

// ---- wardrobe cuts (WD1): built at 2× as character grids -----------------------------------
// Codes as above, plus R = hair tie, S = shaved stubble (undercut), T / U = dyed tips.

type Grid = string[][];
const GW = 32;
function grid(rows: readonly string[], h = 34): Grid {
  return Array.from({ length: Math.max(h, rows.length) }, (_, y) =>
    Array.from({ length: GW }, (_, x) => {
      const c = rows[y]?.[x];
      return c === undefined || c === " " ? "." : c;
    }),
  );
}
const put = (g: Grid, x: number, y: number, ch: string) => {
  if (y >= 0 && y < g.length && x >= 0 && x < GW) g[y]![x] = ch;
};
const fillRow = (g: Grid, y: number, x0: number, x1: number, ch: string) => {
  for (let x = x0; x <= x1; x++) put(g, x, y, ch);
};
/** A hair run on a row: base, its right end in shadow. */
const run = (g: Grid, y: number, x0: number, x1: number) => {
  fillRow(g, y, x0, x1, "h");
  put(g, x1, y, "H");
};
const clearRows = (g: Grid, y0: number, y1: number, x0 = 0, x1 = GW - 1) => {
  for (let y = y0; y <= y1; y++) fillRow(g, y, x0, x1, ".");
};
const isHair = (c: string | undefined) => c === "h" || c === "H" || c === "L";
const rowsOf = (g: Grid) => g.map((r) => r.join("").replace(/\.+$/, ""));

/** Centre parting line down the top of the head (front and back). */
function centrePart(g: Grid, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) if (isHair(g[y]![15])) put(g, 15, y, "H");
}

/** A plait from (x, y0) down to y1, 3 wide: alternating knots, a tie, a tuft. */
function plait(g: Grid, x: number, y0: number, y1: number) {
  for (let y = y0; y <= y1 - 3; y++) {
    const k = (y - y0) % 3;
    fillRow(g, y, x, x + 2, "h");
    put(g, x + 2 - k, y, "H");
  }
  fillRow(g, y1 - 2, x, x + 2, "R");
  fillRow(g, y1 - 1, x, x + 2, "h");
  put(g, x + 2, y1 - 1, "H");
  put(g, x + 1, y1, "H");
}

/** A round bun: centre (cx, cy), radius r; light upper left, shadow lower right. */
function bun(g: Grid, cx: number, cy: number, r: number) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      put(g, x, y, dx + dy > r * 0.6 ? "H" : dx + dy < -r * 0.9 ? "L" : "h");
    }
  put(g, Math.round(cx), Math.round(cy), "H");
}

function pixie(view: View): Grid {
  const g = grid(classic("short", view));
  if (view === "down") {
    clearRows(g, 12, 15);
    // wispy fringe across the forehead, points falling between the eyes
    for (let x = 6; x <= 25; x++) if ((x - 6) % 4 !== 3) put(g, x, 12, x >= 24 ? "H" : "h");
    for (const x of [7, 10, 15, 21, 24]) put(g, x, 13, "H");
    // short sideburns hugging the head
    fillRow(g, 12, 4, 5, "h");
    fillRow(g, 13, 4, 5, "h");
    put(g, 5, 14, "H");
    fillRow(g, 12, 26, 27, "H");
    fillRow(g, 13, 26, 27, "H");
    put(g, 26, 14, "H");
  } else if (view === "up") {
    clearRows(g, 16, 22);
    run(g, 16, 5, 26);
    run(g, 17, 7, 24);
    for (let x = 8; x <= 23; x++) if ((x - 8) % 4 < 2) put(g, x, 18, "H");
  } else {
    clearRows(g, 17, 22);
    // nape cropped short, wisps at the forehead
    run(g, 17, 18, 24);
    for (const x of [19, 22]) put(g, x, 18, "H");
    put(g, 6, 13, "H");
    put(g, 8, 13, "H");
    put(g, 7, 14, "H");
  }
  return g;
}

/** Shaved stubble: a flat fade with a few darker specks. */
const stubble = (x: number, y: number) => (hash2(x, y, 11) % 5 === 0 ? "Z" : "S");

function undercut(view: View): Grid {
  const g = grid([]);
  if (view === "down") {
    // long top swept over to the viewer's right, falling past the brow
    run(g, 1, 11, 20);
    run(g, 2, 9, 22);
    run(g, 3, 8, 23);
    for (let y = 4; y <= 9; y++) run(g, y, 7, 24);
    for (let y = 2; y <= 5; y++) put(g, 9 + y, y, "L");
    run(g, 10, 13, 25);
    run(g, 11, 16, 25);
    run(g, 12, 19, 24);
    put(g, 23, 13, "H");
    // swoop line
    for (let x = 10; x <= 18; x++) put(g, x, 8 - Math.floor((x - 10) / 3), "H");
    // shaved sides
    for (let y = 6; y <= 15; y++) for (const x of [5, 6, 25, 26]) put(g, x, y, stubble(x, y));
  } else if (view === "up") {
    run(g, 1, 11, 20);
    run(g, 2, 9, 22);
    run(g, 3, 8, 23);
    for (let y = 4; y <= 9; y++) run(g, y, 7, 24);
    for (let x = 8; x <= 23; x++) put(g, x, 10, (x + 1) % 3 ? "h" : "H");
    // shaved back and sides
    for (let y = 10; y <= 20; y++)
      for (let x = 6; x <= 25; x++) if (!isHair(g[y]![x])) put(g, x, y, stubble(x, y));
  } else {
    run(g, 1, 11, 21);
    run(g, 2, 9, 24);
    for (let y = 3; y <= 9; y++) run(g, y, 7, 25);
    // the swept top falls forward over the brow
    run(g, 10, 5, 12);
    run(g, 11, 6, 10);
    for (let y = 3; y <= 6; y++) put(g, 9 + y, y, "L");
    for (let y = 10; y <= 20; y++)
      for (let x = 13; x <= 24; x++)
        if (!(x >= 16 && x <= 17 && y >= 14 && y <= 17)) put(g, x, y, stubble(x, y)); // ear
  }
  return g;
}

function mullet(view: View): Grid {
  const g = grid(classic("short", view));
  if (view === "down") {
    // business in front, party behind: the long back shows beside the neck
    for (let y = 16; y <= 26; y++) {
      put(g, 4, y, "h");
      put(g, 5, y, y > 21 ? "H" : "h");
      put(g, 26, y, y > 21 ? "H" : "h");
      put(g, 27, y, "H");
    }
    for (const x of [4, 27]) put(g, x, 27, "H");
  } else if (view === "up") {
    for (let y = 18; y <= 28; y++) run(g, y, 8, 23);
    for (let x = 8; x <= 23; x++) if (x % 3 === 0) put(g, x, 29, "H");
    for (let y = 18; y <= 28; y++) if (y % 3 === 0) put(g, 15, y, "H");
  } else {
    for (let y = 14; y <= 28; y++) run(g, y, 17, 25);
    for (const x of [18, 21, 24]) put(g, x, 29, "H");
  }
  return g;
}

function pigtails(view: View): Grid {
  const g = grid(classic("short", view));
  /** a tail sticking out sideways from the tie at x0; dir -1 = to the viewer's left */
  const tail = (x0: number, dir: -1 | 1) => {
    const at = (dx: number) => x0 + dir * dx;
    put(g, at(0), 12, "R");
    put(g, at(0), 13, "R");
    for (let y = 11; y <= 14; y++) for (let dx = 1; dx <= 3; dx++) put(g, at(dx), y, "h");
    for (let y = 15; y <= 18; y++) for (let dx = 2; dx <= 4; dx++) put(g, at(dx), y, "h");
    for (let y = 19; y <= 20; y++) for (let dx = 3; dx <= 4; dx++) put(g, at(dx), y, "H");
    for (let y = 12; y <= 18; y++) put(g, at(dir < 0 ? 4 : 2), y, "H");
  };
  if (view === "down" || view === "up") {
    centrePart(g, 4, view === "up" ? 19 : 9);
    tail(5, -1);
    tail(26, 1);
  } else {
    put(g, 24, 11, "R");
    put(g, 24, 12, "R");
    for (let y = 10; y <= 13; y++) fillRow(g, y, 25, 27, "h");
    for (let y = 14; y <= 18; y++) fillRow(g, y, 26, 28, "h");
    for (let y = 10; y <= 18; y++) put(g, y < 14 ? 27 : 28, y, "H");
    fillRow(g, 19, 27, 28, "H");
  }
  return g;
}

function braids(view: View): Grid {
  const g = grid(classic("short", view));
  if (view === "down") {
    centrePart(g, 4, 9);
    // curtains framing the face down to the jaw
    for (let y = 12; y <= 19; y++) {
      fillRow(g, y, 4, 6, "h");
      fillRow(g, y, 25, 27, "h");
      put(g, 27, y, "H");
    }
    plait(g, 5, 20, 32);
    plait(g, 24, 20, 32);
  } else if (view === "up") {
    centrePart(g, 4, 19);
    plait(g, 4, 20, 30);
    plait(g, 25, 20, 30);
  } else {
    plait(g, 12, 19, 31);
  }
  return g;
}

function dreadlocks(view: View): Grid {
  const g = grid(classic("short", view));
  /** a lock: 2 wide, base then shadow column, from y0 down to y1, a darker end */
  const lock = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      put(g, x, y, "h");
      put(g, x + 1, y, "H");
    }
    put(g, x, y1 + 1, "H");
  };
  const ends = [27, 25, 28, 26, 24, 27];
  if (view === "down") {
    for (let i = 0; i < 3; i++) {
      lock(2 + 2 * i, 10, ends[i]!);
      lock(24 + 2 * i, 10, ends[i + 3]!);
    }
    // locks in the fringe
    lock(10, 11, 12);
    lock(20, 11, 12);
  } else if (view === "up") {
    for (let x = 4; x <= 26; x += 2) lock(x, 6, 24 + ((x * 7) % 5));
  } else {
    for (let x = 14; x <= 26; x += 2) lock(x, 8, 22 + ((x * 3) % 6));
    lock(6, 11, 13);
  }
  // rope texture over the top
  for (let y = 4; y <= 11; y++)
    for (let x = 0; x < GW; x++)
      if (g[y]![x] === "h" && (x + (y >> 1)) % 3 === 0) put(g, x, y, "H");
  return g;
}

function spaceBuns(view: View): Grid {
  const g = grid(classic("short", view));
  if (view === "left") {
    bun(g, 21, 3.5, 3.5);
    bun(g, 15, 2.5, 3);
  } else {
    centrePart(g, 4, 9);
    bun(g, 8.5, 3.5, 3.5);
    bun(g, 22.5, 3.5, 3.5);
  }
  return g;
}

function longWavy(view: View): Grid {
  const g = grid(classic("long", view));
  const wave = (y: number) => [0, 1, 1, 0, -1, -1][y % 6]!;
  for (let y = 12; y < g.length; y++) {
    const row = g[y]!;
    const xs = row.flatMap((c, x) => (isHair(c) ? [x] : []));
    if (xs.length < 3) continue;
    const a = xs[0]!;
    const z = xs.at(-1)!;
    const w = wave(y);
    if (w > 0) {
      put(g, a - 1, y, "h");
      put(g, z + 1, y, "H");
    } else if (w < 0) {
      put(g, a, y, ".");
      put(g, z, y, ".");
    }
    // wave lines inside the hair
    if (w !== 0) {
      if (isHair(row[a + 1])) put(g, a + 1, y, "H");
      if (isHair(row[z - 1])) put(g, z - 1, y, "H");
    }
  }
  return g;
}

const NEW_CUTS: Partial<Record<CharacterLook["hair"]["cut"], (view: View) => Grid>> = {
  pixie,
  undercut,
  mullet,
  pigtails,
  braids,
  dreadlocks,
  "space-buns": spaceBuns,
  "long-wavy": longWavy,
};

const BUILT = new Map<string, string[]>();
function built(key: string, make: () => string[]): string[] {
  let v = BUILT.get(key);
  if (!v) {
    v = make();
    BUILT.set(key, v);
  }
  return v;
}

/** The character rows of a cut in a view. */
function hairRows(cut: CharacterLook["hair"]["cut"], view: View): readonly string[] {
  switch (cut) {
    case "afro":
      return built(`afro/${view}`, () => afroRows(view));
    case "slicked-back":
      return SLICKED[view];
    case "side-part":
      return SIDE_PART[view];
    case "bob":
      return BOB[view];
    case "flip":
      return FLIP[view];
    default: {
      const make = NEW_CUTS[cut];
      if (make) return built(`${cut}/${view}`, () => rowsOf(make(view)));
      return classic(cut as keyof typeof CLASSIC, view);
    }
  }
}

/**
 * Dyed tips (WD1): in every column the lowest hair texels (up to 3) take the tips colour, the
 * very last one a step darker: ends of long hair, tails and braids, the fringe of short cuts.
 */
function withTips(rows: readonly string[]): string[] {
  const g = grid(rows, rows.length);
  const lowest = (x: number) => {
    let y = g.length - 1;
    while (y >= 0 && !isHair(g[y]![x])) y--;
    return y;
  };
  // only ends that reach down near the bottom of the cut (long hair: not its forehead fringe)
  const bottom = Math.max(...Array.from({ length: GW }, (_, x) => lowest(x)));
  for (let x = 0; x < GW; x++) {
    const y = lowest(x);
    if (y < 0 || y < bottom - 6) continue;
    put(g, x, y, "U");
    for (let k = 1; k <= 2 && isHair(g[y - k]?.[x]); k++) put(g, x, y - k, "T");
  }
  return rowsOf(g);
}

export function drawHair(pc: PixelCanvas, L: CharacterLook, view: View, hy: number) {
  const { cut, ramp, sheen } = L.hair;
  // a hijab covers all of the hair (only the face shows)
  if (L.headwear.style === "hijab") return;
  const tips = L.hair.tips && L.hair.tips !== "none" && cut !== "bald" ? L.hair.tips : null;
  const plain = hairRows(cut, view);
  const rows = tips ? built(`tips/${cut}/${view}`, () => withTips(plain)) : plain;
  const light = cut === "bald" ? L.skin.light : sheen ? ramp.light : ramp.base;
  pc.sprite(0, hy, rows, {
    h: ramp.base,
    H: ramp.shadow,
    L: light,
    R: "#e43b44",
    S: mix(L.skin.base, ramp.shadow, 0.3),
    Z: mix(L.skin.shadow, ramp.shadow, 0.55),
    T: tips ?? ramp.base,
    U: tips ? mix(tips, NIGHT, 0.3) : ramp.shadow,
  });
}
