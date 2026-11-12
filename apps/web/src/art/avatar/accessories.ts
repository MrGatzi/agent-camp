/**
 * Accessories (WD6, `look.accessories`): mask, wings, tail, necklace, bag (gloves are painted
 * with the hands, arms.ts). Each has its own colour; ramps come from `rampFrom`.
 *   Behind = before legs and torso: wings and tail seen from the front and the side.
 *   Front  = after torso, arms and held items: wings and tail from behind, necklace, bag.
 *   Head   = on the face, after the hair and before glasses and hats: masks.
 * Side frames face left (front of the body = small x). Everything stays within x 2..29.
 */
import { type Accessories, type FullLook, type Ramp, rampFrom } from "@agent-office/protocol";
import type { PixelCanvas } from "../pixel.ts";
import { hash2, luma, mix, NIGHT, WHITE } from "./color.ts";
import type { Ctx } from "./ctx.ts";
import type { View } from "./geometry.ts";
import { drawEye, EYE_X, faceSpan } from "./head.ts";
import type { TorsoBox } from "./torso.ts";

const PEARL = "#f4f4f2";

/** Bresenham line. */
function line(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, col: string) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pc.set(x0, y0, col);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// ---- wings ----------------------------------------------------------------------------------

/**
 * The left wing (viewer's left in the front/back views), 13 wide: col 0 = the outer edge,
 * col 12 = where it meets the back. h base, H shadow, L light, w white, v dark (ribs, veins),
 * s spot (light).
 */
const WINGS: Record<Exclude<Accessories["wings"]["kind"], "none" | "jetpack">, string[]> = {
  // crazy wardrobe (WD12): taller than the others, a claw on top, finger bones in the membrane
  // (b bone, c claw)
  dragon: [
    "cc...........",
    ".cbL.........",
    ".bbbL........",
    ".bbhbL.......",
    ".bbbhbL......",
    ".bbbhhbL.....",
    ".bbbhhhbL....",
    ".bbhbhhhbL...",
    ".bbhbhhhhbL..",
    ".bhbbhhhhhbL.",
    ".bhbhbhhhhhbL",
    ".bhbhbhhhhhhb",
    "bhhbhbhhhhhhh",
    "bhhbhhbhhhhhh",
    "bhhbhhbhhhhhh",
    "bhhbhhbhhhhhh",
    "bhhbhhhbhhhhh",
    "bhhbhhhbhhhhh",
    "bhhhbhhbhhhHH",
    "bhhhbhhhbhH..",
    "bHhhbhHHbh...",
    "b.HhbH..bH...",
    "...Hb....b...",
    "....b....b...",
    "....b........",
  ],
  // flame-tongue feathers licking upward, hottest at the tips (W white-hot, Y yellow,
  // O orange, R red, D deep red)
  phoenix: [
    "W...W........",
    "Y...Y...W....",
    "YW..YW..Y....",
    "YY.WYY.WY...W",
    "OYYYOYYYO..WY",
    "OOYOOOYOOYYYO",
    "ROOOROOOROOOR",
    "RROORROORROOR",
    "DRRRDRRRDRRRR",
    ".DRRRDRRRDRRR",
    ".YDRROYRRRDRR",
    "..YORR.YORRDR",
    "..WYO...YOR.D",
    "...W.....Y...",
  ],
  angel: [
    "..LLL........",
    ".LhhhLL......",
    "LhhhhhhLL....",
    "LhhhhhhhhLL..",
    "LhhhhhhhhhhL.",
    "HhhhhhhhhhhhL",
    "HhLhhhhhhhhhh",
    ".HhLhhhhhhhhh",
    ".HhhLhhLhhhhh",
    "..HhhLhhLhhhh",
    "..HhH.HhhLhhh",
    "...H..HhH.Hhh",
    "......H.H..Hh",
    "...........H.",
  ],
  bat: [
    "v............",
    "vv...........",
    "vhv..........",
    "vhhvv........",
    "vhhhhvv......",
    "vhhhhhhvvv...",
    "vhhvhhhhhhvvv",
    "vhhhvhhhhhhhh",
    ".vhhhvhhhvhhh",
    ".vh.hhvhhhvhh",
    "..v..hhv.hhvh",
    "......hv...hh",
    ".......v.....",
  ],
  fairy: [
    "LLL..........",
    "LwLLL........",
    "LwwLLLL......",
    ".LwLLvLLL....",
    "..LLLLvvLLL..",
    "...LLLLLLvvvh",
    ".....LLLLLLvh",
    "....LLLLvvvvh",
    "..LLLvvLLL.vh",
    ".LwLLLLL.....",
    ".LLLLL.......",
    "..LL.........",
  ],
  butterfly: [
    ".HHHHH.......",
    "HhhhhhHH.....",
    "HhsshhhhHH...",
    "HhsshhhhhhHH.",
    "HhhhhhhhhhhhH",
    ".HHhhhhhhhhHv",
    "...HHhhhhHH.v",
    "..HhhhhhhH..v",
    ".HhsshhhhH...",
    ".HhsshhhH....",
    "..HhhhhH.....",
    "...HHHH......",
  ],
};

function wingColors(kind: keyof typeof WINGS, r: Ramp): Record<string, string> {
  switch (kind) {
    case "angel":
      return { h: r.base, H: r.shadow, L: r.light, w: WHITE, v: r.shadow, s: r.light };
    case "bat":
      return {
        h: r.base,
        H: r.shadow,
        L: r.light,
        w: r.light,
        v: mix(r.shadow, NIGHT, 0.35),
        s: r.light,
      };
    case "fairy":
      // a light, see-through look: mostly the light step, veins in the base colour
      return {
        h: r.shadow,
        H: r.shadow,
        L: mix(r.light, WHITE, 0.35),
        w: WHITE,
        v: r.base,
        s: r.light,
      };
    case "butterfly":
      return {
        h: r.base,
        H: r.shadow,
        L: r.light,
        w: WHITE,
        v: mix(r.shadow, NIGHT, 0.4),
        s: mix(r.light, WHITE, 0.4),
      };
    case "dragon":
      return {
        h: r.base,
        H: r.shadow,
        L: r.light,
        b: mix(r.shadow, NIGHT, 0.45),
        c: PEARL,
      };
    case "phoenix":
      // fire colours, each tinted a little toward the chosen colour
      return {
        W: mix("#fee761", WHITE, 0.45),
        Y: mix("#fee761", r.light, 0.2),
        O: mix("#feae34", r.base, 0.2),
        R: mix("#f77622", r.base, 0.35),
        D: mix("#e43b44", r.shadow, 0.4),
      };
  }
}

/** Rows a tall wing starts above the usual wing top (crazy wardrobe, WD12). */
const WING_RISE: Partial<Record<keyof typeof WINGS, number>> = { dragon: 15, phoenix: 1 };

// ---- jetpack (crazy wardrobe, WD12) ---------------------------------------------------------

const FLAME = {
  W: mix("#fee761", WHITE, 0.5),
  Y: "#fee761",
  O: "#feae34",
  F: "#f77622",
  R: "#e43b44",
};
const METAL = { light: "#c0cbdc", base: "#8b9bb4", shadow: "#5a6988", dark: "#3a4466" };

/** One 5-wide tank (rounded top) at x, top row y, `h` rows; nozzle and flame below. */
function jetTank(pc: PixelCanvas, x: number, y: number, h: number, r: Ramp, long: boolean) {
  // nose cone
  pc.set(x + 2, y - 2, mix(r.light, WHITE, 0.4));
  pc.hline(x + 1, y - 1, 3, r.base);
  pc.set(x + 1, y - 1, r.light);
  pc.set(x + 3, y - 1, r.shadow);
  pc.hline(x + 1, y, 3, r.light);
  pc.rect(x, y + 1, 5, h - 1, r.base);
  pc.vline(x + 1, y + 1, h - 2, r.light);
  pc.vline(x + 4, y + 1, h - 1, r.shadow);
  // rivet bands
  pc.hline(x, y + 3, 5, r.shadow);
  pc.hline(x, y + h - 3, 5, r.shadow);
  pc.set(x + 1, y + 3, mix(r.light, WHITE, 0.4));
  // nozzle
  pc.hline(x + 1, y + h, 3, METAL.shadow);
  pc.hline(x, y + h + 1, 5, METAL.dark);
  pc.set(x + 1, y + h + 1, METAL.base);
  // flame
  const flame = long
    ? ["WYYYW", ".YWY.", ".OYO.", ".FOF.", "..F..", "..R.."]
    : ["WYYYW", ".OWO.", ".FOF.", "..R.."];
  pc.sprite(x, y + h + 2, flame, FLAME);
}

function drawJetpack(c: Ctx, b: TorsoBox, behind: boolean, r: Ramp) {
  const pc = c.pc;
  const T = b.T;
  const long = !b.seated;
  if (c.view === "left") {
    if (!behind) return;
    // one tank behind the back, its strap over the shoulder
    jetTank(pc, c.tr - 1, T - 3, 11, r, long);
    return;
  }
  if (c.view === "down") {
    if (!behind) return;
    // front: the tanks stand out beside the shoulders, flames under them
    jetTank(pc, 2, T - 3, 11, r, long);
    jetTank(pc, 25, T - 3, 11, r, long);
    return;
  }
  if (behind) return;
  // back: the pack on a frame, two tanks, straps
  pc.rect(11, T + 1, 10, 8, METAL.shadow);
  pc.hline(11, T + 1, 10, METAL.base);
  pc.rect(14, T + 3, 4, 3, METAL.dark); // control box
  pc.set(14, T + 3, "#63c74d");
  pc.set(16, T + 3, FLAME.R);
  // seated, the tanks are shorter so the flames stay above the chair (and in the frame)
  const h = b.seated ? 8 : 12;
  jetTank(pc, 6, T - 2, h, r, long);
  jetTank(pc, 21, T - 2, h, r, long);
}

const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""));

/** Both wings, outer edges at x 2 and 29, top `y`. */
function drawWingPair(pc: PixelCanvas, kind: keyof typeof WINGS, r: Ramp, y: number) {
  const rows = WINGS[kind];
  const col = wingColors(kind, r);
  pc.sprite(2, y, rows, col);
  pc.sprite(17, y, mirror(rows), col);
}

function drawWings(c: Ctx, b: TorsoBox, behind: boolean) {
  const w = c.L.accessories.wings;
  if (w.kind === "none") return;
  const r = rampFrom(w.color);
  if (w.kind === "jetpack") {
    drawJetpack(c, b, behind, r);
    return;
  }
  const rise = WING_RISE[w.kind] ?? 0;
  if (c.view === "left") {
    if (!behind) return;
    // one wing behind the back edge (the far one hidden by the near one)
    const rows = mirror(WINGS[w.kind]);
    c.pc.sprite(c.tr - 5, b.T - 4 - rise, rows, wingColors(w.kind, r));
    return;
  }
  // front: behind the body, peeking out beside shoulders and arms; back: over the back,
  // starting just under the head
  if ((c.view === "down") !== behind) return;
  // from behind, tall wings sit lower so the membrane spreads over the back, not the head
  const back = w.kind === "dragon" ? 10 : rise;
  drawWingPair(c.pc, w.kind, r, c.view === "down" ? b.T - 4 - rise : b.T - 1 - back);
}

// ---- tail -----------------------------------------------------------------------------------

type Pt = readonly [number, number];

/** Dense centre points along a polyline. */
function along(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k < n; k++)
      out.push([Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n)]);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

type PathTail = "cat" | "devil" | "dino" | "fox";
const TAIL_WIDTH: Record<PathTail, [number, number]> = {
  cat: [2, 2],
  devil: [2, 2],
  dino: [5, 2],
  fox: [3, 5],
};

// ---- crazy wardrobe tails (WD12) -------------------------------------------------------------

const EYE_GOLD = "#feae34";
const EYE_TEAL = "#2ce8f5";
const EYE_BLUE = "#124e89";

/**
 * A peacock fan: an elliptic sector around (cx, cy) with radii rx/ry, angles a0..a1 (0 = to
 * the right, PI/2 = up). Feathers fan out from the centre, an eye spot near each tip.
 */
function peacockFan(
  pc: PixelCanvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  r: Ramp,
) {
  const eyeAt = 0.86;
  const arc = (a1 - a0) * eyeAt * ((rx + ry) / 2);
  const n = Math.max(2, Math.round(arc / 5));
  const eyes = Array.from({ length: n }, (_, k) => {
    const a = a0 + ((k + 0.5) * (a1 - a0)) / n;
    return [cx + eyeAt * rx * Math.cos(a), cy - eyeAt * ry * Math.sin(a)] as const;
  });
  const dark = mix(EYE_BLUE, NIGHT, 0.35);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx;
      const v = (cy - (y + 0.5)) / ry;
      // a squarish super-ellipse, so the fan fills the space beside the head too
      const d = Math.cbrt(Math.abs(u) ** 3 + Math.abs(v) ** 3);
      const a = Math.atan2(v, u);
      if (d > 1 || a < a0 || a > a1) continue;
      const fk = ((a - a0) / (a1 - a0)) * n;
      const k = Math.min(n - 1, Math.floor(fk));
      const [ex, ey] = eyes[k]!;
      const e = Math.hypot(x + 0.5 - ex, y + 0.5 - ey);
      let col: string;
      if (e < 0.9) col = dark;
      else if (e < 1.6) col = EYE_TEAL;
      else if (e < 2.3) col = EYE_GOLD;
      else if (d > 0.95) col = r.light;
      else if (Math.abs(fk - k - 0.5) * (a1 - a0) * d * ((rx + ry) / 2 / n) < 0.5)
        col = mix(r.light, EYE_GOLD, 0.3); // the shaft
      else col = d < 0.45 ? r.shadow : r.base;
      pc.set(x, y, col);
    }
}

/** A tail stroke: a `w`-wide square brush along points, shaded on its lower/right edge. */
function stroke(pc: PixelCanvas, pts: readonly Pt[], w: number, base: string, shade: string) {
  for (const [cx, cy] of pts) {
    const x0 = cx - Math.floor((w - 1) / 2);
    const y0 = cy - Math.floor((w - 1) / 2);
    for (let yy = 0; yy < w; yy++)
      for (let xx = 0; xx < w; xx++)
        pc.set(x0 + xx, y0 + yy, yy === w - 1 || (w > 2 && xx === w - 1) ? shade : base);
  }
}

/** A bushy squirrel tail: round brush of varying radius, light fluffy rim, dark core. */
function bushy(pc: PixelCanvas, path: readonly Pt[], r: Ramp) {
  const pts = along(path);
  const n = pts.length;
  const rad = (i: number) => {
    const k = n > 1 ? i / (n - 1) : 0;
    return 1.5 + 2.4 * Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) - (k > 0.85 ? 0.8 : 0);
  };
  const disc = (cx: number, cy: number, rr: number, col: (x: number, y: number) => string) => {
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++)
      for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++)
        if (Math.hypot(x - cx, y - cy) <= rr) pc.set(x, y, col(x, y));
  };
  // fur fringe (ragged), then the body, then a darker core
  pts.forEach(([x, y], i) => {
    disc(x, y, rad(i) + 0.6, (xx, yy) => (hash2(xx, yy, 7) % 3 ? r.light : r.base));
  });
  pts.forEach(([x, y], i) => {
    disc(x, y, rad(i) - 0.5, () => r.base);
  });
  pts.forEach(([x, y], i) => {
    if (rad(i) > 2.5) disc(x + 0.5, y + 0.5, rad(i) - 2.2, () => r.shadow);
  });
}

/** Robot tail: a segmented cable along the points, a plug pointing down at the end. */
function robotTail(pc: PixelCanvas, path: readonly Pt[], r: Ramp) {
  const pts = along(path);
  pts.forEach(([x, y], i) => {
    const joint = i % 4 === 3;
    pc.set(x, y, joint ? r.shadow : i % 4 < 2 ? r.light : r.base);
    pc.set(x + 1, y, joint ? mix(r.shadow, NIGHT, 0.3) : r.shadow);
    pc.set(x, y + 1, joint ? r.shadow : r.base);
    pc.set(x + 1, y + 1, r.shadow);
  });
  const [ex, ey] = pts[pts.length - 1]!;
  const body = mix(r.shadow, NIGHT, 0.35);
  pc.rect(ex - 1, ey + 2, 4, 3, body);
  pc.hline(ex - 1, ey + 2, 4, r.base);
  pc.set(ex - 1, ey + 3, r.light);
  pc.set(ex - 1, ey + 5, METAL.light);
  pc.set(ex + 2, ey + 5, METAL.light);
}

/** The crazy tails (WD12). */
function drawTailCrazy(
  c: Ctx,
  b: TorsoBox,
  behind: boolean,
  kind: Exclude<Accessories["tail"]["kind"], "none" | PathTail>,
  r: Ramp,
) {
  const pc = c.pc;
  const W = b.W;
  const side = c.view === "left";
  const tr = c.tr;
  switch (kind) {
    case "peacock":
      // the fan opens behind the body in every view, a halo of eyes around the person
      if (!behind) return;
      if (side) peacockFan(pc, tr - 1, W + 1, 9.4, 29, 0.1, Math.PI / 2 + 0.3, r);
      else peacockFan(pc, 16, W + 2, 13.9, 30, -0.12, Math.PI + 0.12, r);
      return;
    case "monkey": {
      if (side ? !behind : (c.view === "down") !== behind) return;
      // a long thin tail rising high behind, curled at the end above the head
      const x = side ? Math.min(tr + 6, 27) : 27;
      const curl: Pt[] = [
        [x - 1, W - 22],
        [x - 2, W - 27],
        [x - 4, W - 30],
        [x - 7, W - 31],
        [x - 9, W - 29],
        [x - 9, W - 26],
        [x - 7, W - 24],
        [x - 5, W - 25],
        [x - 5, W - 27],
      ];
      const root: Pt[] = side
        ? [
            [tr - 1, W + 1],
            [tr + 3, W + 3],
            [x, W + 1],
            [x + 1, W - 4],
          ]
        : c.view === "down"
          ? [
              [21, W + 5],
              [25, W + 5],
              [x, W + 2],
              [x + 1, W - 4],
            ]
          : [
              [16, W + 1],
              [17, W + 4],
              [22, W + 5],
              [x, W + 2],
              [x + 1, W - 4],
            ];
      const pts = along([...root, [x + 1, W - 12], ...curl]);
      stroke(pc, pts, 2, r.base, r.shadow);
      // a lighter underside near the end of the curl
      for (const [px, py] of pts.slice(-6)) pc.set(px, py, r.light);
      return;
    }
    case "squirrel": {
      if (side ? !behind : (c.view === "down") !== behind) return;
      // big bushy S-curve up behind the back, its tip flipping over above the head
      const x = side ? Math.min(tr + 3, 24) : 24;
      const start: Pt[] = side
        ? [
            [tr - 1, W],
            [tr + 2, W + 1],
          ]
        : c.view === "down"
          ? [
              [21, W + 3],
              [24, W + 2],
            ]
          : [
              [16, W + 1],
              [20, W + 2],
            ];
      bushy(
        pc,
        [
          ...start,
          [x + 1, W - 2],
          [x, W - 8],
          [x - 1, W - 13],
          [x, W - 19],
          [x + 1, W - 24],
          [x - 1, W - 29],
          [x - 4, W - 31],
          [x - 7, W - 30],
        ],
        r,
      );
      return;
    }
    case "robot": {
      if (side ? !behind : (c.view === "down") !== behind) return;
      if (c.view === "down" && c.f.seat === "front") return;
      // the cable droops to the floor, the plug dangling at its end
      const floor = b.seated ? b.end - 2 : 38;
      const path: Pt[] = side
        ? [
            [tr - 1, W + 1],
            [tr + 3, W + 2],
            [tr + 5, W + 5],
            [tr + 5, floor],
          ]
        : c.view === "down"
          ? [
              [21, W + 5],
              [24, W + 5],
              [26, W + 7],
              [26, floor],
            ]
          : [
              [15, W + 1],
              [15, W + 4],
              [18, W + 6],
              [20, floor],
            ];
      robotTail(pc, path, r);
      return;
    }
  }
}

function drawTail(c: Ctx, b: TorsoBox, behind: boolean) {
  const t = c.L.accessories.tail;
  if (t.kind === "none") return;
  if (t.kind === "peacock" || t.kind === "monkey" || t.kind === "squirrel" || t.kind === "robot") {
    drawTailCrazy(c, b, behind, t.kind, rampFrom(t.color));
    return;
  }
  const pc = c.pc;
  const W = b.W;
  let path: Pt[];
  if (c.view === "left") {
    if (!behind) return;
    const x = c.tr;
    path =
      t.kind === "dino"
        ? [
            [x - 2, W],
            [x + 2, W + 2],
            [x + 5, W + 4],
            [x + 8, W + 6],
          ]
        : [
            [x - 1, W + 1],
            [x + 2, W + 2],
            [x + 4, W + 2],
            [x + 6, W],
            [x + 7, W - 3],
            [x + 6, W - 5],
          ];
  } else if (c.view === "down") {
    if (!behind || c.f.seat === "front") return;
    // peeks out beside the leg on the viewer's right, curling up
    path =
      t.kind === "dino"
        ? [
            [20, W + 3],
            [24, W + 6],
            [28, W + 9],
          ]
        : [
            [21, W + 5],
            [24, W + 5],
            [26, W + 3],
            [27, W],
            [27, W - 3],
            [26, W - 5],
          ];
  } else {
    if (behind) return;
    // from behind: hangs from the hips over the bottoms
    const end = b.seated ? b.end + 1 : W + 9;
    path =
      t.kind === "dino"
        ? [
            [15, W + 1],
            [16, Math.min(end, W + 6)],
            [19, end],
            [23, end + 1],
          ]
        : [
            [15, W + 1],
            [15, W + 3],
            [16, end - 4],
            [18, end - 1],
            [21, end],
            [23, end - 2],
            [23, end - 4],
          ];
  }
  const r = rampFrom(t.color);
  const pts = along(path);
  const [w0, w1] = TAIL_WIDTH[t.kind];
  const n = pts.length;
  pts.forEach(([cx, cy], i) => {
    const k = n > 1 ? i / (n - 1) : 0;
    // fox: bushy toward the tip, dino: thick at the root
    const w = Math.max(
      1,
      Math.round(w0 + (w1 - w0) * (t.kind === "fox" ? Math.sin(k * Math.PI * 0.8) * 1.1 : k)),
    );
    const x0 = cx - Math.floor((w - 1) / 2);
    const y0 = cy - Math.floor((w - 1) / 2);
    const tip = t.kind === "fox" && i >= n - 3;
    for (let yy = 0; yy < w; yy++)
      for (let xx = 0; xx < w; xx++) {
        const edge = yy === w - 1 || (w > 2 && xx === w - 1);
        const col = tip ? (edge ? "#c0cbdc" : PEARL) : edge ? r.shadow : r.base;
        pc.set(x0 + xx, y0 + yy, col);
      }
    if (w >= 3 && !tip) pc.set(x0, y0, r.light);
    // dino spikes: every third step, a darker plate on top
    if (t.kind === "dino" && i % 3 === 1 && i < n - 1) {
      const sp = mix(r.shadow, NIGHT, 0.2);
      if (c.view === "up") pc.set(cx, cy, sp);
      else {
        pc.set(cx, y0 - 1, sp);
        pc.set(cx + 1, y0 - 1, sp);
        pc.set(cx, y0 - 2, sp);
      }
    }
  });
  if (t.kind === "devil") {
    // spade tip at the end of the tail
    const [ex, ey] = pts[n - 1]!;
    const sp =
      c.view === "up" ? [".X.", "XXX", "XXX", ".X."] : ["..X..", ".XXX.", "XXXXX", "..X.."];
    const off = Math.floor(sp[0]!.length / 2);
    pc.sprite(ex - off, ey - (c.view === "up" ? 0 : 3), sp, { X: r.base });
    pc.set(ex - off + 1, ey - (c.view === "up" ? -1 : 2), r.light);
  }
}

// ---- necklace -------------------------------------------------------------------------------

// crazy wardrobe (WD12)
const BELL = { light: "#fee761", base: "#feae34", shadow: "#f77622", slit: "#3e2731" };
/** A 3×7 dollar sign. */
const DOLLAR = [".X.", "LXX", "L..", "LXX", "..X", "XXH", ".X."];
/** A thick chain dipping onto the chest: x 11..20, deepest `drop` rows below T. */
const chainArc = (T: number, drop: number): Pt[] =>
  Array.from({ length: 10 }, (_, i) => {
    const x = 11 + i;
    return [x, T + Math.round(drop * (1 - ((x - 15.5) / 4.5) ** 2))] as const;
  });

function drawNecklaceCrazy(
  c: Ctx,
  b: TorsoBox,
  kind: "bling" | "ruff" | "bell-collar" | "dog-tags",
  r: Ramp,
) {
  const pc = c.pc;
  const T = b.T;
  const x = c.tl + 1; // side view: the front of the neck
  switch (kind) {
    case "bling":
      if (c.view === "up") {
        for (let i = 0; i < 8; i++) {
          pc.set(12 + i, T, i % 2 ? r.light : r.base);
          pc.set(12 + i, T + 1, i % 2 ? r.base : r.shadow);
        }
        return;
      }
      if (c.view === "left") {
        line(pc, x + 3, T, x, T + 4, r.light);
        line(pc, x + 4, T, x + 1, T + 4, r.shadow);
        pc.rect(x - 1, T + 5, 2, 6, r.base);
        pc.vline(x - 1, T + 5, 6, r.light);
        pc.set(x - 1, T + 6, WHITE);
        return;
      }
      // a huge chain and a big $ pendant
      chainArc(T, 5).forEach(([px, py], i) => {
        pc.set(px, py, i % 2 ? r.light : r.base);
        pc.set(px, py + 1, i % 2 ? r.base : r.shadow);
      });
      pc.sprite(14, T + 6, DOLLAR, { X: r.base, L: r.light, H: r.shadow });
      pc.set(14, T + 7, WHITE); // sparkle
      return;
    case "ruff": {
      // pleated disc around the neck: alternating folds, a scalloped edge
      const pleats = (a: number, z: number) => {
        for (let px = a; px <= z; px++) {
          const fold = px % 2 === 0;
          pc.set(px, T - 1, fold ? r.light : r.base);
          pc.set(px, T, fold ? r.light : r.base);
          pc.set(px, T + 1, fold ? r.base : r.shadow);
          if (fold) pc.set(px, T + 2, r.shadow);
        }
      };
      if (c.view === "left") pleats(c.tl - 3, c.tr - 3);
      else pleats(6, 25);
      return;
    }
    case "bell-collar": {
      if (c.view === "up") {
        pc.hline(12, T, 8, r.base);
        pc.hline(12, T + 1, 8, r.shadow);
        pc.rect(15, T, 2, 2, BELL.light); // buckle
        pc.set(16, T + 1, BELL.shadow);
        return;
      }
      const bell = (bx: number, by: number) =>
        pc.sprite(bx, by, [".Ly.", "LLyo", "Lyyo", "oooo", ".ss."], {
          L: BELL.light,
          y: BELL.base,
          o: BELL.shadow,
          s: BELL.slit,
        });
      if (c.view === "left") {
        pc.hline(x, T, 6, r.base);
        pc.hline(x, T + 1, 6, r.shadow);
        bell(x - 2, T + 1);
        return;
      }
      pc.hline(11, T, 10, r.base);
      pc.hline(11, T + 1, 10, r.shadow);
      pc.set(11, T, r.light);
      bell(14, T + 2);
      return;
    }
    case "dog-tags": {
      const tag = mix(METAL.base, r.base, 0.3);
      const tagCols = { t: tag, T: mix(tag, WHITE, 0.4), s: mix(tag, NIGHT, 0.35) };
      if (c.view === "up") {
        for (let i = 0; i < 6; i++) pc.set(13 + i, T, i % 2 ? METAL.shadow : METAL.light);
        return;
      }
      if (c.view === "left") {
        for (let i = 0; i < 5; i++) pc.set(x + 3 - i, T + i, i % 2 ? METAL.shadow : METAL.light);
        pc.sprite(x - 2, T + 5, ["Tt", "ts", "ts", "ss"], tagCols);
        return;
      }
      // a ball chain and two stamped tags hanging on the chest
      const ball: Pt[] = [
        [12, T],
        [13, T + 1],
        [13, T + 2],
        [14, T + 3],
        [14, T + 4],
        [17, T + 4],
        [17, T + 3],
        [18, T + 2],
        [18, T + 1],
        [19, T],
      ];
      for (const [i, [px, py]] of ball.entries())
        pc.set(px, py, i % 2 ? METAL.shadow : METAL.light);
      pc.sprite(14, T + 5, ["TTt.", "Tsts", "ttTt", "tsts", "ttts", ".sss"], tagCols);
      return;
    }
  }
}

function drawNecklace(c: Ctx, b: TorsoBox) {
  const n = c.L.accessories.necklace;
  if (n.kind === "none") return;
  if (
    n.kind === "bling" ||
    n.kind === "ruff" ||
    n.kind === "bell-collar" ||
    n.kind === "dog-tags"
  ) {
    drawNecklaceCrazy(c, b, n.kind, rampFrom(n.color));
    return;
  }
  const pc = c.pc;
  const r = rampFrom(n.color);
  const T = b.T;
  if (c.view === "up") {
    // from behind only the chain/clasp at the neck shows
    pc.hline(13, T, 6, n.kind === "pearls" ? PEARL : n.kind === "lei" ? r.base : r.shadow);
    if (n.kind === "lei") pc.hline(13, T + 1, 6, r.light);
    return;
  }
  if (c.view === "left") {
    const x = c.tl + 1;
    const pts: Pt[] = [
      [x + 3, T],
      [x + 2, T + 1],
      [x + 1, T + 2],
      [x, T + 3],
    ];
    pts.forEach(([px, py], i) => {
      const col =
        n.kind === "pearls"
          ? i % 2
            ? r.light
            : PEARL
          : n.kind === "lei"
            ? i % 2
              ? r.base
              : PEARL
            : i % 2
              ? r.light
              : r.base;
      pc.set(px, py, col);
      if (n.kind === "lei") pc.set(px + 1, py, i % 2 ? r.light : r.base);
    });
    if (n.kind === "medal") {
      pc.rect(x - 1, T + 4, 2, 2, r.base);
      pc.set(x - 1, T + 4, r.light);
    }
    return;
  }
  // front: an arc from shoulder to shoulder dipping onto the chest
  const arc: Pt[] = [
    [12, T],
    [13, T + 1],
    [14, T + 2],
    [15, T + 3],
    [16, T + 3],
    [17, T + 2],
    [18, T + 1],
    [19, T],
  ];
  switch (n.kind) {
    case "chain":
      for (const [i, [x, y]] of arc.entries()) pc.set(x, y, i % 2 ? r.light : r.base);
      return;
    case "pearls":
      for (const [i, [x, y]] of arc.entries())
        pc.set(x, y, i % 2 ? mix(PEARL, r.base, 0.25) : PEARL);
      pc.set(15, T + 4, PEARL);
      pc.set(16, T + 4, mix(PEARL, r.base, 0.25));
      return;
    case "medal": {
      const ribbon = r.shadow;
      line(pc, 12, T, 15, T + 3, ribbon);
      line(pc, 19, T, 16, T + 3, ribbon);
      pc.sprite(14, T + 4, [".hh.", "hLhh", "hhhH", ".HH."], {
        h: r.base,
        H: r.shadow,
        L: r.light,
      });
      return;
    }
    case "lei": {
      const cols = [r.base, PEARL, r.light, r.base, PEARL, r.light];
      const wide: Pt[] = [
        [10, T],
        [11, T + 1],
        [12, T + 2],
        [13, T + 3],
        [14, T + 3],
        [15, T + 4],
        [16, T + 4],
        [17, T + 3],
        [18, T + 3],
        [19, T + 2],
        [20, T + 1],
        [21, T],
      ];
      wide.forEach(([x, y], i) => {
        pc.set(x, y, cols[i % cols.length]!);
        pc.set(x, y + 1, cols[(i + 3) % cols.length]!);
      });
      return;
    }
  }
}

// ---- bag ------------------------------------------------------------------------------------

/** A shaded box: light top-left, shadow right column and bottom row. */
function box(pc: PixelCanvas, x: number, y: number, w: number, h: number, r: Ramp) {
  pc.rect(x, y, w, h, r.base);
  pc.vline(x + w - 1, y, h, r.shadow);
  pc.hline(x, y + h - 1, w, r.shadow);
  pc.set(x, y, r.light);
}

// crazy wardrobe (WD12)
const WOOD = { light: "#e4a672", base: "#be7b4a", shadow: "#8a4836", dark: "#3e2731" };
const CRUST = { light: "#eab06a", base: "#c97c45", shadow: "#8f4e2e", score: "#f6dca4" };

/** A baguette from its bottom (x0, y0) to its tip (x1, y1), 3 wide, with diagonal scores. */
function baguette(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number) {
  const pts = along([
    [x0, y0],
    [x1, y1],
  ]);
  pts.forEach(([x, y], i) => {
    const tip = i === pts.length - 1;
    if (!tip) pc.set(x, y, CRUST.light);
    pc.set(x + 1, y, i % 3 === 1 ? CRUST.score : CRUST.base);
    pc.set(x + 2, y, i % 3 === 2 ? CRUST.score : CRUST.shadow);
  });
}

/** Guitar body: two bouts and a sound hole, lower bout centred on (x, y). */
function guitarBody(pc: PixelCanvas, x: number, y: number, dx: -1 | 1, r: Ramp) {
  pc.ellipse(x - 5, y - 5, 11, 11, r.shadow);
  pc.ellipse(x - 5, y - 5, 10, 10, r.base);
  pc.ellipse(x - 4 + dx * 4, y - 9, 8, 8, r.shadow);
  pc.ellipse(x - 4 + dx * 4, y - 9, 7, 7, r.base);
  pc.set(x - 2 + dx * 4, y - 8, r.light);
  pc.hline(x - 3, y - 4, 2, r.light);
  pc.set(x - 4, y - 3, r.light);
  pc.rect(x + dx * 2 - (dx > 0 ? 0 : 1), y - 4, 2, 2, NIGHT); // sound hole
  pc.hline(x - 2 - dx, y + 2, 3, WOOD.dark); // bridge
}

/** Guitar neck from the body (x0, y0) up to the headstock at (x1, y1). */
function guitarNeck(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number) {
  for (const [x, y] of along([
    [x0, y0],
    [x1, y1],
  ])) {
    pc.set(x, y, WOOD.light);
    pc.set(x + 1, y, WOOD.base);
    pc.set(x + 1, y + 1, WOOD.shadow);
  }
  pc.rect(x1 - 1, y1 - 4, 3, 4, WOOD.shadow);
  pc.vline(x1 - 1, y1 - 4, 4, WOOD.base);
  pc.set(x1 - 2, y1 - 3, METAL.light);
  pc.set(x1 - 2, y1 - 1, METAL.light);
  pc.set(x1 + 2, y1 - 2, METAL.light);
}

/** Turtle shell from behind: rim, plates and the hexagon seams. */
function turtleShell(pc: PixelCanvas, x: number, y: number, w: number, h: number, r: Ramp) {
  const rim = mix(r.base, "#e4a672", 0.55);
  pc.ellipse(x, y, w, h, mix(rim, NIGHT, 0.2));
  pc.ellipse(x + 1, y, w - 2, h - 1, rim);
  pc.ellipse(x + 2, y + 1, w - 4, h - 3, r.base);
  const cx = x + w / 2;
  const cy = y + Math.floor(h / 2);
  const seam = r.shadow;
  const hx = [
    [cx - 3, cy - 3],
    [cx + 2, cy - 3],
    [cx + 4, cy],
    [cx + 2, cy + 3],
    [cx - 3, cy + 3],
    [cx - 5, cy],
  ].map(([a, bb]) => [Math.round(a!), bb!] as const);
  // the centre plate, a bit lighter
  pc.rect(hx[0]![0] + 1, cy - 2, 4, 5, mix(r.base, r.light, 0.6));
  hx.forEach(([a, bb], i) => {
    const [a2, b2] = hx[(i + 1) % hx.length]!;
    line(pc, a, bb, a2, b2, seam);
  });
  // seams out to the rim
  line(pc, hx[0]![0], hx[0]![1], hx[0]![0] - 2, y + 2, seam);
  line(pc, hx[1]![0], hx[1]![1], hx[1]![0] + 2, y + 2, seam);
  line(pc, hx[2]![0], hx[2]![1], x + w - 3, cy, seam);
  line(pc, hx[3]![0], hx[3]![1], hx[3]![0] + 2, y + h - 3, seam);
  line(pc, hx[4]![0], hx[4]![1], hx[4]![0] - 2, y + h - 3, seam);
  line(pc, hx[5]![0], hx[5]![1], x + 2, cy, seam);
}

/** Bags that stick out behind the body (front and side views): guitar, turtle shell. */
function drawBagBehind(c: Ctx, b: TorsoBox) {
  const bag = c.L.accessories.bag;
  if (bag.kind !== "guitar" && bag.kind !== "turtle-shell") return;
  if (c.view === "up") return;
  const pc = c.pc;
  const r = rampFrom(bag.color);
  const { T, W } = b;
  if (bag.kind === "guitar") {
    if (c.view === "left") {
      // on the back: the body's edge, the neck rising past the shoulder behind the head
      guitarNeck(pc, c.tr + 2, T + 4, c.tr + 4, T - 9);
      pc.round(c.tr - 2, T + 3, 6, 10, r.shadow);
      pc.round(c.tr - 2, T + 3, 5, 9, r.base);
      pc.vline(c.tr - 1, T + 4, 7, r.light);
      return;
    }
    // front: headstock over the viewer's left shoulder, body peeking out at the right hip
    guitarNeck(pc, 15, T + 4, 4, T - 6);
    guitarBody(pc, 24, W + 2, -1, r);
    return;
  }
  // turtle shell: its rim stands out round the body
  if (c.view === "left") {
    turtleShellSide(pc, c.tr - 3, T - 2, r, b.seated);
    return;
  }
  const rim = mix(r.base, "#e4a672", 0.55);
  pc.ellipse(3, T - 3, 26, b.seated ? 15 : 18, mix(rim, NIGHT, 0.2));
  pc.ellipse(4, T - 2, 24, b.seated ? 13 : 16, rim);
}

function turtleShellSide(pc: PixelCanvas, x: number, y: number, r: Ramp, seated: boolean) {
  const h = seated ? 13 : 16;
  const rim = mix(r.base, "#e4a672", 0.55);
  pc.ellipse(x, y, 10, h, mix(rim, NIGHT, 0.2));
  pc.ellipse(x + 1, y + 1, 8, h - 2, r.base);
  pc.vline(x + 8, y + 2, h - 4, rim);
  for (const k of [0.33, 0.66]) pc.hline(x + 3, y + Math.round(h * k), 5, r.shadow);
  pc.vline(x + 5, y + 2, h - 4, r.shadow);
  pc.set(x + 3, y + 3, r.light);
}

function drawBag(c: Ctx, b: TorsoBox) {
  const bag = c.L.accessories.bag;
  if (bag.kind === "none") return;
  const pc = c.pc;
  const r = rampFrom(bag.color);
  const strap = r.shadow;
  const { T, W } = b;
  switch (bag.kind) {
    // crazy wardrobe (WD12)
    case "fanny-pack": {
      const belt = mix(r.shadow, NIGHT, 0.3);
      if (c.view === "left") {
        pc.hline(c.tl, W, c.tr - c.tl + 1, belt);
        pc.round(c.tl - 3, W - 1, 6, 5, r.base);
        pc.hline(c.tl - 2, W - 1, 4, r.light);
        pc.hline(c.tl - 2, W + 3, 4, r.shadow);
        pc.hline(c.tl - 2, W + 1, 4, r.shadow); // zip
        return;
      }
      pc.hline(c.tl, W, c.tr - c.tl + 1, belt);
      if (c.view === "up") {
        pc.rect(14, W - 1, 4, 3, METAL.base); // buckle
        pc.hline(14, W - 1, 4, METAL.light);
        pc.set(15, W, METAL.dark);
        pc.set(16, W, METAL.dark);
        return;
      }
      pc.round(11, W - 2, 10, 6, r.base);
      pc.hline(12, W - 2, 8, r.light);
      pc.hline(12, W + 3, 8, r.shadow);
      pc.vline(20, W - 1, 4, r.shadow);
      pc.hline(12, W, 8, r.shadow); // zip
      pc.set(19, W + 1, METAL.light); // zip pull
      return;
    }
    case "guitar": {
      const st = mix(r.shadow, NIGHT, 0.45);
      if (c.view === "down") {
        line(pc, 10, T, 21, W + 1, st); // strap across the chest
        return;
      }
      if (c.view === "left") {
        line(pc, c.tl + 2, T, c.tr - 2, W, st);
        return;
      }
      // from behind: the whole guitar across the back, neck up past the right shoulder
      line(pc, 9, T + 9, 20, T, st);
      guitarNeck(pc, 17, T + 2, 26, T - 6);
      guitarBody(pc, 12, T + 9, 1, r);
      return;
    }
    case "turtle-shell": {
      const st = mix(mix(r.base, "#e4a672", 0.55), NIGHT, 0.3);
      if (c.view === "down") {
        pc.vline(10, T, 6, st);
        pc.vline(21, T, 6, st);
        return;
      }
      if (c.view === "left") return;
      turtleShell(pc, 6, T - 2, 20, b.seated ? 13 : 16, r);
      return;
    }
    case "baguettes":
      if (c.view === "down") {
        line(pc, 21, T, 23, W - 2, strap);
        line(pc, 22, T, 26, W - 2, strap);
        baguette(pc, 22, W, 22, W - 9);
        baguette(pc, 25, W, 26, W - 7);
        box(pc, 22, W - 1, 6, 6, r);
        pc.hline(22, W - 1, 6, r.light);
      } else if (c.view === "up") {
        line(pc, 10, T, 8, W - 2, strap);
        line(pc, 9, T, 5, W - 2, strap);
        baguette(pc, 6, W, 6, W - 9);
        baguette(pc, 3, W, 2, W - 7);
        box(pc, 4, W - 1, 6, 6, r);
        pc.hline(4, W - 1, 6, r.light);
      } else {
        line(pc, 15, T, 13, W - 2, strap);
        line(pc, 16, T, 17, W - 2, strap);
        baguette(pc, 12, W, 12, W - 9);
        baguette(pc, 15, W, 17, W - 8);
        box(pc, 12, W - 1, 7, 6, r);
        pc.hline(12, W - 1, 7, r.light);
      }
      return;
    case "backpack":
      if (c.view === "down") {
        for (const x of [10, 20]) {
          pc.vline(x, T, 7, strap);
          pc.vline(x + 1, T, 7, r.base);
          pc.set(x + 1, T + 4, r.light);
        }
      } else if (c.view === "up") {
        box(pc, 10, T + 1, 12, 10, r);
        pc.hline(11, T + 3, 10, r.shadow); // flap edge
        pc.hline(11, T + 1, 9, r.light);
        pc.rect(12, T + 6, 8, 4, mix(r.base, r.shadow, 0.5)); // front pocket
        pc.hline(12, T + 6, 8, r.light);
        pc.rect(15, T + 3, 2, 2, mix(r.light, WHITE, 0.4)); // buckle
      } else {
        box(pc, c.tr - 1, T + 1, 5, 10, r);
        pc.hline(c.tr - 1, T + 3, 4, r.shadow);
        pc.vline(c.tl + 3, T, 7, strap);
      }
      return;
    case "tote":
      if (c.view === "down") {
        line(pc, 21, T, 23, W - 2, strap);
        line(pc, 22, T, 26, W - 2, strap);
        box(pc, 22, W - 1, 6, 6, r);
        pc.hline(22, W - 1, 6, r.light);
      } else if (c.view === "up") {
        line(pc, 10, T, 8, W - 2, strap);
        line(pc, 9, T, 5, W - 2, strap);
        box(pc, 4, W - 1, 6, 6, r);
        pc.hline(4, W - 1, 6, r.light);
      } else {
        line(pc, 15, T, 13, W - 2, strap);
        line(pc, 16, T, 17, W - 2, strap);
        box(pc, 12, W - 1, 7, 6, r);
        pc.hline(12, W - 1, 7, r.light);
      }
      return;
    case "crossbody":
      if (c.view === "down") {
        line(pc, 21, T, 10, W - 2, strap);
        box(pc, 6, W - 1, 6, 4, r);
        pc.hline(6, W - 1, 6, r.shadow); // flap
        pc.set(8, W, r.light); // clasp
      } else if (c.view === "up") {
        line(pc, 10, T, 21, W - 2, strap);
        box(pc, 20, W - 1, 6, 4, r);
        pc.hline(20, W - 1, 6, r.shadow);
      } else {
        pc.vline(c.tl + 3, T, W - T - 1, strap);
        box(pc, c.tl - 1, W - 1, 5, 4, r);
        pc.hline(c.tl - 1, W - 1, 5, r.shadow);
        pc.set(c.tl, W, r.light);
      }
      return;
  }
}

// ---- masks ----------------------------------------------------------------------------------

/** Contrast trim of a luchador mask: gold on dark and mid colours, deep shade on light ones. */
const luchaTrim = (r: Ramp) => (luma(r.base) > 0.6 ? mix(r.shadow, NIGHT, 0.5) : "#fee761");
const BRASS = "#be7b4a";
const MUSTACHE = "#2a1d26";

/** A round goggle lens (size×size): rim, glass, glint top-left. */
function lens(pc: PixelCanvas, x: number, y: number, size: number, rim: string, glass: string) {
  pc.round(x, y, size, size, rim);
  pc.rect(x + 1, y + 1, size - 2, size - 2, glass);
  pc.set(x + 1, y + 1, WHITE);
}

/** Skin of the eye slit / mask holes (the face below was already painted). */
function drawMaskFront(pc: PixelCanvas, L: FullLook, hy: number) {
  const m = L.accessories.mask;
  const r = rampFrom(m.color);
  switch (m.kind) {
    case "eye-mask": {
      for (let y = 13; y <= 16; y++) {
        const sp = faceSpan(L.face.shape, y);
        if (!sp) continue;
        for (let x = sp[0]; x <= sp[1]; x++) {
          // eye holes a texel wider than the eye, so a bit of skin frames it
          const hole = EYE_X.some((ex) => x >= ex - 1 && x <= ex + 2) && y >= 14 && y <= 15;
          if (hole) continue;
          pc.set(x, y + hy, y === 13 ? r.light : x === sp[1] || y === 16 ? r.shadow : r.base);
        }
      }
      // knot ends sticking out at the sides
      pc.set(4, 15 + hy, r.shadow);
      pc.set(27, 15 + hy, r.shadow);
      return;
    }
    case "ninja": {
      for (let y = 4; y <= 23; y++) {
        const sp: readonly [number, number] =
          y < 6 ? [10 - (5 - y) * 0, 21] : (faceSpan(L.face.shape, y) ?? [9, 22]);
        const a = y < 6 ? 9 + (5 - y) * 2 : Math.max(5, sp[0] - 1);
        const z = y < 6 ? 22 - (5 - y) * 2 : Math.min(26, sp[1] + 1);
        for (let x = a; x <= z; x++) {
          const slit = y >= 13 && y <= 16 && x >= 9 && x <= 22;
          if (slit) continue;
          pc.set(
            x,
            y + hy,
            x >= z - 1 || y === 23 ? r.shadow : y <= 6 && x <= a + 2 ? r.light : r.base,
          );
        }
      }
      // the slit: skin and eyes
      for (let y = 13; y <= 16; y++)
        for (let x = 9; x <= 22; x++) pc.set(x, y + hy, x >= 21 ? L.skin.shadow : L.skin.base);
      for (const ex of EYE_X) drawEye(pc, L.face.eyes, L.face.eyeColor, ex, hy, false);
      pc.hline(9, 12 + hy, 14, r.light); // lifted edge above the slit
      return;
    }
    case "clown-nose":
      pc.sprite(14, 16 + hy, [".hh.", "hLhh", "hhhH", ".HH."], {
        h: r.base,
        H: r.shadow,
        L: mix(r.light, WHITE, 0.5),
      });
      return;
    case "surgical": {
      for (let y = 17; y <= 21; y++) {
        const sp = faceSpan(L.face.shape, y) ?? [7, 24];
        for (let x = Math.max(sp[0] + 2, 9); x <= Math.min(sp[1] - 2, 22); x++)
          pc.set(
            x,
            y + hy,
            y === 17
              ? r.light
              : y === 19 || y === 21 || x === Math.min(sp[1] - 2, 22)
                ? r.shadow
                : r.base,
          );
      }
      // ear loops
      line(pc, 8, 17 + hy, 7, 15 + hy, r.shadow);
      line(pc, 23, 17 + hy, 24, 15 + hy, r.shadow);
      return;
    }
    // crazy wardrobe (WD12)
    case "luchador": {
      const t = luchaTrim(r);
      const eyeHole = (x: number, y: number) =>
        y >= 13 && y <= 16 && EYE_X.some((ex) => x >= ex - 1 && x <= ex + 2);
      const eyeRim = (x: number, y: number) =>
        y >= 12 && y <= 17 && EYE_X.some((ex) => x >= ex - 2 && x <= ex + 3);
      const mouthHole = (x: number, y: number) => y >= 19 && y <= 21 && x >= 14 && x <= 17;
      const mouthRim = (x: number, y: number) => y >= 18 && y <= 22 && x >= 13 && x <= 18;
      for (let y = 4; y <= 23; y++) {
        const sp = faceSpan(L.face.shape, y) ?? [9, 22];
        const a = y === 4 ? 11 : y === 5 ? 8 : Math.max(5, sp[0] - 1);
        const z = y === 4 ? 20 : y === 5 ? 23 : Math.min(26, sp[1] + 1);
        for (let x = a; x <= z; x++) {
          // the face shows through the holes (painted before)
          if (eyeHole(x, y) || mouthHole(x, y)) continue;
          const wide = y >= 8 ? 1 : 0;
          const stripe = y <= 10 && x >= 15 - wide && x <= 16 + wide;
          const col =
            eyeRim(x, y) || mouthRim(x, y) || stripe
              ? t
              : x >= z - 1 || y === 23
                ? r.shadow
                : y <= 6 && x <= a + 2
                  ? r.light
                  : r.base;
          pc.set(x, y + hy, col);
        }
      }
      // flared corners of the eye trim
      pc.set(9, 11 + hy, t);
      pc.set(22, 11 + hy, t);
      return;
    }
    case "gas-mask": {
      // rubber face piece over the lower face
      for (let y = 12; y <= 22; y++) {
        const a = y === 12 || y === 21 ? 9 : y === 22 ? 11 : 8;
        const z = y === 12 || y === 21 ? 22 : y === 22 ? 20 : 23;
        for (let x = a; x <= z; x++)
          pc.set(x, y + hy, x >= z - 1 || y === 22 ? r.shadow : y === 12 ? r.light : r.base);
      }
      // straps round the head
      pc.hline(5, 14 + hy, 3, r.shadow);
      pc.hline(24, 14 + hy, 3, r.shadow);
      pc.hline(6, 19 + hy, 2, r.shadow);
      pc.hline(24, 19 + hy, 2, r.shadow);
      // goggle eyes
      lens(pc, 10, 12 + hy, 5, METAL.dark, METAL.base);
      lens(pc, 17, 12 + hy, 5, METAL.dark, METAL.base);
      // filter snout: a round canister with a grille
      pc.round(13, 17 + hy, 6, 6, METAL.shadow);
      pc.round(14, 18 + hy, 4, 4, METAL.base);
      pc.hline(14, 19 + hy, 4, METAL.dark);
      pc.hline(14, 21 + hy, 4, METAL.dark);
      pc.set(14, 18 + hy, METAL.light);
      return;
    }
    case "disguise": {
      // big bushy brows, fake glasses (in the colour), a big nose and a mustache
      const frame = r.base;
      for (const x0 of [10, 17]) {
        pc.hline(x0 - 1, 10 + hy, 6, MUSTACHE);
        pc.hline(x0, 9 + hy, 4, MUSTACHE);
        // a lens ring: the eye shows through
        pc.hline(x0, 12 + hy, 5, frame);
        pc.hline(x0, 17 + hy, 5, r.shadow);
        pc.vline(x0, 13 + hy, 4, frame);
        pc.vline(x0 + 4, 13 + hy, 4, r.shadow);
      }
      pc.hline(15, 13 + hy, 2, frame); // bridge
      pc.hline(5, 13 + hy, 5, frame); // temples
      pc.hline(22, 13 + hy, 5, r.shadow);
      const nose = mix(L.skin.base, "#f6757a", 0.35);
      const noseCols = { n: nose, l: mix(nose, WHITE, 0.4), S: mix(nose, NIGHT, 0.3) };
      pc.sprite(13, 14 + hy, ["..nn..", ".lnnn.", "nlnnnS", "nnnnnS", ".SSSS."], noseCols);
      pc.sprite(11, 19 + hy, ["MMMMMMMMMM", "MM.MMMM.MM", "M........M"], { M: MUSTACHE });
      return;
    }
    case "plague-doctor": {
      // leather half mask over the upper face, glass eyes, a long beak hanging over the chest
      for (let y = 9; y <= 18; y++) {
        const sp = faceSpan(L.face.shape, y) ?? [6, 25];
        for (let x = sp[0]; x <= sp[1]; x++)
          pc.set(x, y + hy, x >= sp[1] - 1 ? r.shadow : y === 9 ? r.light : r.base);
      }
      pc.hline(4, 12 + hy, 3, r.shadow);
      pc.hline(25, 12 + hy, 3, r.shadow);
      lens(pc, 9, 11 + hy, 5, BRASS, METAL.dark);
      lens(pc, 18, 11 + hy, 5, BRASS, METAL.dark);
      // the beak: wide at the face, tapering to a point below the chin
      for (let y = 15; y <= 30; y++) {
        const half = Math.max(0, Math.round(3.6 - ((y - 15) * 3.6) / 15));
        for (let x = 15 - half; x <= 16 + half; x++)
          pc.set(x, y + hy, x === 16 + half ? r.shadow : x <= 16 - half ? r.light : r.base);
      }
      pc.vline(16, 16 + hy, 12, r.shadow); // seam
      pc.set(14, 17 + hy, mix(r.shadow, NIGHT, 0.4)); // breathing holes
      pc.set(17, 17 + hy, mix(r.shadow, NIGHT, 0.4));
      return;
    }
  }
}

function drawMaskSide(pc: PixelCanvas, L: FullLook, hy: number) {
  const m = L.accessories.mask;
  const r = rampFrom(m.color);
  switch (m.kind) {
    case "eye-mask":
      for (let y = 13; y <= 16; y++)
        for (let x = 7; x <= 23; x++) {
          if (y >= 14 && x >= 10 && x <= 11) continue; // eye hole
          pc.set(x, y + hy, y === 13 ? r.light : y === 16 ? r.shadow : r.base);
        }
      pc.rect(24, 15 + hy, 1, 4, r.shadow); // knot ends at the back
      pc.set(25, 17 + hy, r.shadow);
      return;
    case "ninja":
      for (let y = 4; y <= 23; y++) {
        const a = y < 7 ? 12 - (y - 4) : y >= 13 && y <= 16 ? 12 : 7;
        const z = y < 7 ? 21 + (y - 4) : 24;
        for (let x = a; x <= z; x++)
          pc.set(x, y + hy, x >= z - 1 || y === 23 ? r.shadow : y <= 6 ? r.light : r.base);
      }
      // slit: skin and the eye
      for (let y = 13; y <= 16; y++) for (let x = 7; x <= 11; x++) pc.set(x, y + hy, L.skin.base);
      drawEye(pc, L.face.eyes, L.face.eyeColor, 10, hy, true);
      pc.rect(25, 12 + hy, 2, 2, r.shadow); // knot
      pc.vline(26, 14 + hy, 3, r.shadow);
      return;
    case "clown-nose":
      pc.sprite(4, 15 + hy, [".hh", "hLh", "hhH", ".H."], {
        h: r.base,
        H: r.shadow,
        L: mix(r.light, WHITE, 0.5),
      });
      return;
    case "surgical":
      for (let y = 16; y <= 21; y++)
        for (let x = 6; x <= 12; x++)
          pc.set(
            x,
            y + hy,
            y === 16 ? r.light : y === 18 || y === 20 || x === 12 ? r.shadow : r.base,
          );
      line(pc, 13, 17 + hy, 16, 15 + hy, r.shadow);
      return;
    // crazy wardrobe (WD12)
    case "luchador": {
      const t = luchaTrim(r);
      for (let y = 4; y <= 23; y++) {
        const a = y < 7 ? 12 - (y - 4) : 7;
        const z = y < 7 ? 21 + (y - 4) : 24;
        for (let x = a; x <= z; x++) {
          const eyeHole = y >= 13 && y <= 16 && x >= 9 && x <= 12;
          const mouthHole = y >= 19 && y <= 20 && x <= 9;
          if (eyeHole || mouthHole) continue;
          const rim = (y >= 12 && y <= 17 && x <= 13) || (y >= 18 && y <= 21 && x <= 10) || y === 4;
          pc.set(
            x,
            y + hy,
            rim ? t : x >= z - 1 || y === 23 ? r.shadow : y <= 6 ? r.light : r.base,
          );
        }
      }
      // the nose is covered too
      pc.set(7, 15 + hy, r.base);
      pc.rect(6, 16 + hy, 1, 2, r.shadow);
      // laces at the back of the head
      for (let y = 9; y <= 20; y += 2) {
        pc.set(22, y + hy, t);
        pc.set(23, y + 1 + hy, t);
      }
      return;
    }
    case "gas-mask":
      for (let y = 12; y <= 22; y++)
        for (let x = 6; x <= 13; x++)
          pc.set(x, y + hy, x === 13 || y === 22 ? r.shadow : y === 12 ? r.light : r.base);
      // straps over the head
      line(pc, 14, 13 + hy, 23, 10 + hy, r.shadow);
      line(pc, 14, 19 + hy, 23, 19 + hy, r.shadow);
      lens(pc, 8, 12 + hy, 5, METAL.dark, METAL.base);
      // the filter canister sticks out in front
      pc.rect(2, 17 + hy, 4, 5, METAL.base);
      pc.vline(2, 17 + hy, 5, METAL.light);
      pc.hline(2, 21 + hy, 4, METAL.shadow);
      pc.vline(4, 17 + hy, 5, METAL.dark);
      pc.rect(5, 18 + hy, 1, 3, METAL.shadow);
      return;
    case "disguise": {
      pc.hline(8, 10 + hy, 5, MUSTACHE); // brow
      pc.hline(9, 9 + hy, 3, MUSTACHE);
      pc.hline(8, 12 + hy, 5, r.base); // lens ring round the eye
      pc.hline(8, 17 + hy, 5, r.shadow);
      pc.vline(8, 13 + hy, 4, r.base);
      pc.vline(12, 13 + hy, 4, r.shadow);
      pc.hline(13, 13 + hy, 4, r.base); // temple to the ear
      const nose = mix(L.skin.base, "#f6757a", 0.35);
      const noseCols = { n: nose, l: mix(nose, WHITE, 0.4), S: mix(nose, NIGHT, 0.3) };
      pc.sprite(3, 14 + hy, ["..nn.", ".lnnn", "nlnnn", "nnnnS", ".SSS."], noseCols);
      pc.sprite(4, 19 + hy, ["MMMMMMM", "M.MMMM."], { M: MUSTACHE });
      return;
    }
    case "plague-doctor": {
      for (let y = 9; y <= 21; y++)
        for (let x = 7; x <= 14; x++)
          pc.set(x, y + hy, x === 14 ? r.shadow : y === 9 ? r.light : r.base);
      line(pc, 15, 11 + hy, 23, 10 + hy, r.shadow);
      line(pc, 15, 18 + hy, 23, 18 + hy, r.shadow);
      lens(pc, 8, 11 + hy, 5, BRASS, METAL.dark);
      // the beak points forward and curves down
      const beak: [number, number, number][] = [
        [6, 15, 21],
        [5, 16, 22],
        [4, 17, 22],
        [3, 18, 23],
        [2, 20, 23],
      ];
      for (const [x, y0, y1] of beak)
        for (let y = y0; y <= y1; y++)
          pc.set(x, y + hy, y === y0 ? r.light : y === y1 ? r.shadow : r.base);
      pc.set(5, 18 + hy, mix(r.shadow, NIGHT, 0.4)); // breathing hole
      return;
    }
  }
}

function drawMaskBack(pc: PixelCanvas, L: FullLook, hy: number) {
  const m = L.accessories.mask;
  const r = rampFrom(m.color);
  switch (m.kind) {
    case "eye-mask":
      for (let x = 6; x <= 25; x++) pc.set(x, 14 + hy, r.base);
      for (let x = 6; x <= 25; x++) pc.set(x, 15 + hy, r.shadow);
      // knot with two hanging ends
      pc.rect(15, 13 + hy, 2, 3, r.light);
      pc.vline(14, 16 + hy, 4, r.base);
      pc.vline(17, 16 + hy, 3, r.shadow);
      return;
    case "ninja":
      for (let y = 4; y <= 23; y++) {
        const a = y < 6 ? 9 + (5 - y) * 2 : 5;
        const z = y < 6 ? 22 - (5 - y) * 2 : 26;
        for (let x = a; x <= z; x++)
          pc.set(x, y + hy, x >= z - 1 || y === 23 ? r.shadow : y <= 6 ? r.light : r.base);
      }
      pc.rect(14, 12 + hy, 4, 3, r.shadow); // knot
      pc.vline(14, 15 + hy, 5, r.shadow);
      pc.vline(17, 15 + hy, 4, r.shadow);
      return;
    case "surgical":
      // only the loops behind the ears
      pc.set(5, 16 + hy, r.shadow);
      pc.set(26, 16 + hy, r.shadow);
      return;
    // crazy wardrobe (WD12)
    case "luchador": {
      const t = luchaTrim(r);
      for (let y = 4; y <= 23; y++) {
        const a = y < 6 ? 9 + (5 - y) * 2 : 5;
        const z = y < 6 ? 22 - (5 - y) * 2 : 26;
        for (let x = a; x <= z; x++)
          pc.set(x, y + hy, x >= z - 1 || y === 23 ? r.shadow : y <= 6 ? r.light : r.base);
      }
      // centre stripe over the crown, then the laced opening
      pc.rect(15, 4 + hy, 2, 6, t);
      pc.rect(15, 10 + hy, 2, 12, mix(r.shadow, NIGHT, 0.5));
      for (let y = 11; y <= 20; y += 3) {
        pc.set(14, y + hy, t);
        pc.hline(15, y + 1 + hy, 2, t);
        pc.set(17, y + hy, t);
        pc.set(14, y + 2 + hy, t);
        pc.set(17, y + 2 + hy, t);
      }
      return;
    }
    case "gas-mask":
      // spider harness: a pad with four straps
      line(pc, 15, 13 + hy, 6, 10 + hy, r.shadow);
      line(pc, 16, 13 + hy, 25, 10 + hy, r.shadow);
      line(pc, 15, 15 + hy, 6, 19 + hy, r.shadow);
      line(pc, 16, 15 + hy, 25, 19 + hy, r.shadow);
      pc.round(13, 12 + hy, 6, 5, r.base);
      pc.hline(14, 12 + hy, 4, r.light);
      return;
    case "disguise":
      // only the ends of the temples hook round the ears
      pc.vline(5, 13 + hy, 3, r.base);
      pc.vline(26, 13 + hy, 3, r.shadow);
      return;
    case "plague-doctor":
      // two leather straps with buckles
      for (const y of [11, 18]) {
        pc.hline(5, y + hy, 22, r.shadow);
        pc.rect(15, y - 1 + hy, 3, 3, BRASS);
        pc.set(16, y + hy, r.shadow);
      }
      return;
    default:
  }
}

// ---- hooks ----------------------------------------------------------------------------------

export function drawAccessoriesBehind(c: Ctx, b: TorsoBox): void {
  drawWings(c, b, true);
  drawTail(c, b, true);
  drawBagBehind(c, b);
}

export function drawAccessoriesFront(c: Ctx, b: TorsoBox): void {
  drawWings(c, b, false);
  drawTail(c, b, false);
  drawNecklace(c, b);
  drawBag(c, b);
}

/**
 * After the head, seen from behind: long hair falls over the top of a backpack, not over all
 * of it, so the pack is painted again below its top rows.
 */
export function drawAccessoriesOverHair(c: Ctx, b: TorsoBox): void {
  if (c.view !== "up" || c.L.accessories.bag.kind !== "backpack") return;
  const pc = c.pc;
  const saved = pc.clip;
  const top = pc.oy + b.T + 5;
  pc.clip = saved
    ? { ...saved, y0: Math.max(saved.y0, top) }
    : { x0: 0, y0: top, x1: pc.width, y1: pc.height };
  drawBag(c, b);
  pc.clip = saved;
}

export function drawAccessoriesHead(pc: PixelCanvas, L: FullLook, view: View, hy: number): void {
  if (L.accessories.mask.kind === "none") return;
  if (view === "down") drawMaskFront(pc, L, hy);
  else if (view === "left") drawMaskSide(pc, L, hy);
  else drawMaskBack(pc, L, hy);
}
