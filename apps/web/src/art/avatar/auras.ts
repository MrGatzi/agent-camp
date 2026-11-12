/**
 * Auras (WD12, `look.accessories.aura`): an effect around the whole character, tinted by its
 * colour. A missing part (looks stored before WD12) or "none" paints nothing.
 *
 * Auras are painted after the sheet outline (`Ctx.after`), so they stay thin and glowy:
 *   behind = only into empty texels, i.e. behind the body and its outline;
 *   front  = over everything (a few particles in front of the body).
 * Shapes that need an edge (hearts, cloud, bees, bolts) bring their own one-texel ink ring.
 * The rain cloud and the bees use the headroom; everything stays inside the frame.
 * Particles move with the idle beat (bob, walk phase, typing hand), deterministic per frame.
 */
import { type Accessories, rampFrom } from "@agent-office/protocol";
import { darken, hash2, lighten, mix, NIGHT, WHITE } from "./color.ts";
import type { Ctx } from "./ctx.ts";
import { BODY_ROWS, FW, HEADROOM } from "./geometry.ts";
import { beat } from "./pets.ts";
import type { TorsoBox } from "./torso.ts";

type AuraKind = Exclude<NonNullable<Accessories["aura"]>["kind"], "none">;

const TOP = -HEADROOM;
const inside = (x: number, y: number) => x >= 0 && x < FW && y >= TOP && y < BODY_ROWS;

/** A small set of texels to stamp at once (so the ring can go around the whole shape). */
class Layer {
  readonly px = new Map<number, string>();
  private key = (x: number, y: number) => (y - TOP) * FW + x;
  set(x: number, y: number, col: string) {
    if (inside(x, y)) this.px.set(this.key(x, y), col);
  }
  has(x: number, y: number) {
    return inside(x, y) && this.px.has(this.key(x, y));
  }
  sprite(x0: number, y0: number, rows: readonly string[], col: Record<string, string>) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        const v = col[ch];
        if (v) this.set(x0 + i, y0 + j, v);
      });
    });
  }
  /**
   * Paint it: `front` over everything, else only into empty texels. `ring` adds a one-texel
   * edge of that colour around the shape (same rule).
   */
  stamp(c: Ctx, front: boolean, ring?: string) {
    const pc = c.pc;
    const free = (x: number, y: number) => front || pc.get(x, y) >>> 24 === 0;
    const todo: [number, number, string][] = [];
    for (const [k, col] of this.px) {
      const x = k % FW;
      const y = Math.floor(k / FW) + TOP;
      if (free(x, y)) todo.push([x, y, col]);
      if (!ring) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (inside(nx, ny) && !this.has(nx, ny) && free(nx, ny)) todo.push([nx, ny, ring]);
      }
    }
    // ring first, shape over it
    for (const [x, y, col] of todo) if (col === ring && !this.has(x, y)) pc.set(x, y, col);
    for (const [x, y, col] of todo) if (this.has(x, y)) pc.set(x, y, col);
  }
}

/** Where the head and body are this frame. */
type Anchor = {
  /** head offset (row 6 + hy = top of the head) */
  hy: number;
  /** shoulder row */
  T: number;
  /** lowest body row worth decorating (feet standing, knees/lap seated) */
  low: number;
};

// ---- sparkles -------------------------------------------------------------------------------

const STAR_BIG = ["..o..", "..m..", "omcmo", "..m..", "..o.."];
const STAR_SMALL = [".m.", "mcm", ".m."];

type Spot = [x: number, y: number, size: 0 | 1, front: boolean];

function sparkles(c: Ctx, a: Anchor, color: string, k: number) {
  const r = rampFrom(color);
  const col = { o: r.base, m: lighten(r.light, 0.45), c: WHITE };
  const { hy, T, low } = a;
  // two sets that take turns being big: a twinkle
  const spots: Spot[] = [
    [2, 6 + hy, 1, false],
    [28, 2 + hy, 0, false],
    [27, T + 4, 1, false],
    [3, T + 9, 0, false],
    [22, -3 + hy, 1, false],
    [2, low - 3, 1, false],
    [28, low - 6, 0, false],
    [8, T + 6, 0, true],
    [20, low - 9, 0, true],
  ];
  spots.forEach(([x, y, size, front], i) => {
    const big = (size + i + k) % 2 === 0;
    const l = new Layer();
    if (big) l.sprite(x - 2, y - 2, STAR_BIG, col);
    else if (front) l.set(x, y, col.c);
    else l.sprite(x - 1, y - 1, STAR_SMALL, col);
    l.stamp(c, front, front ? undefined : darken(r.shadow, 0.35));
  });
}

// ---- fire -----------------------------------------------------------------------------------

function fire(c: Ctx, a: Anchor, color: string, k: number) {
  const pc = c.pc;
  const r = rampFrom(color);
  // hot core to cool tips
  const shades = [lighten(r.light, 0.7), lighten(r.light, 0.3), r.base, r.shadow];
  const solid = new Uint8Array(FW * (BODY_ROWS - TOP));
  const at = (x: number, y: number) => (y - TOP) * FW + x;
  for (let y = TOP; y < BODY_ROWS; y++)
    for (let x = 0; x < FW; x++) if (pc.get(x, y) >>> 24) solid[at(x, y)] = 1;
  const isSolid = (x: number, y: number) => inside(x, y) && solid[at(x, y)] === 1;
  const l = new Layer();
  // flames rise above the silhouette: each column has its own tongue height, flickering
  for (let x = 0; x < FW; x++) {
    const tongue = 2 + (hash2(x >> 1, k, 7) % 5) + ((x >> 1) % 3 === k % 3 ? 2 : 0);
    for (let y = TOP; y < a.low; y++) {
      if (isSolid(x, y)) continue;
      // texels of empty space between here and the body below / beside
      let dv = 0;
      for (let d = 1; d <= tongue && y + d < BODY_ROWS; d++)
        if (isSolid(x, y + d)) {
          dv = d;
          break;
        }
      let dh = 0;
      for (let d = 1; d <= 3 && !dh; d++) if (isSolid(x - d, y) || isSolid(x + d, y)) dh = d;
      // licking up the sides: a sawtooth of slanted tongues, 1-3 texels out
      const reach = 1 + Math.floor(((y + 2 * k + (x < 16 ? 0 : 2)) % 6) / 2);
      let t = -1;
      if (dv) t = (dv - 1) / tongue;
      if (dh && dh <= reach && y < a.low - 1) t = Math.min(t < 0 ? 1 : t, (dh - 1) / 3);
      if (t < 0) continue;
      l.set(x, y, shades[Math.min(3, Math.floor(t * 4))]!);
    }
  }
  l.stamp(c, false, darken(r.shadow, 0.45));
  // a few embers drifting up in front
  const em = lighten(r.light, 0.6);
  for (const [x, y] of [
    [6 + k, a.T - 2 - k * 2],
    [24 - k, a.hy + 2 + k],
    [11, a.T + 10 - k],
  ] as const) {
    const e = new Layer();
    e.set(x, y, em);
    e.stamp(c, false);
  }
}

// ---- rain cloud -----------------------------------------------------------------------------

const CLOUD = [
  "......LLL.......",
  "...LLLhhhL.LLL..",
  "..LhhhhhhhLhhhL.",
  ".LhhhhhhhhhhhhhL",
  "hhhhhhhhhhhhhhhh",
  ".HHHHhhHHHHhhHH.",
  "..HHHHHHHHHHHH..",
];

function rainCloud(c: Ctx, a: Anchor, color: string, k: number) {
  // a dark cloud of the chosen colour
  const base = mix(color, "#3a4466", 0.55);
  const col = { h: base, H: darken(base, 0.35), L: lighten(base, 0.3) };
  const rain = lighten(color, 0.55);
  // the bottom of the cloud a few rows over the hair; never out of the frame
  const y0 = Math.max(TOP + 1, a.hy - 8);
  const x0 = c.view === "left" ? 9 : 8;
  // slanted streaks under the cloud, falling one texel per beat, over the hair
  const bottom = y0 + CLOUD.length;
  const drops = new Layer();
  for (let i = 0; i < 5; i++) {
    const x = x0 + 2 + i * 3;
    const y = bottom + 1 + ((i * 2 + k) % 3);
    drops.set(x, y, rain);
    drops.set(x - 1, y + 1, rain);
    if (y + 5 <= a.hy + 8) {
      drops.set(x - 1, y + 4, rain);
      drops.set(x - 2, y + 5, rain);
    }
  }
  drops.stamp(c, true);
  const cloud = new Layer();
  cloud.sprite(x0, y0, CLOUD, col);
  cloud.stamp(c, true, NIGHT);
}

// ---- hearts ---------------------------------------------------------------------------------

const HEART_BIG = ["hh.hh", "hLhhh", "hhhhH", ".hhH.", "..H.."];
const HEART_SMALL = ["h.h", "hhH", ".H."];

function hearts(c: Ctx, a: Anchor, color: string, k: number) {
  const r = rampFrom(color);
  const col = { h: r.base, H: r.shadow, L: lighten(r.light, 0.6) };
  const { hy, T } = a;
  // they float up: one texel per beat
  const list: [number, number, boolean, boolean][] = [
    [0, 4 + hy, true, false],
    [26, -2 + hy, true, false],
    [28, T + 3, false, false],
    [1, T + 12, false, false],
    [20, T + 5, false, true],
  ];
  for (const [x, y, big, front] of list) {
    const l = new Layer();
    l.sprite(x, y - k, big ? HEART_BIG : HEART_SMALL, col);
    l.stamp(c, front, NIGHT);
  }
}

// ---- bees -----------------------------------------------------------------------------------

/** facing right (stinger, stripes, dark head); frame 2 has the wings down */
const BEE = [
  ["..ww..", "..ww..", "kykyk.", ".ykyk."],
  ["......", "......", "kykyk.", "wykyk.", "ww...."],
];

function bees(c: Ctx, a: Anchor, color: string, k: number) {
  const r = rampFrom(color);
  const col = { y: lighten(r.base, 0.1), k: NIGHT, w: mix(WHITE, "#c0cbdc", 0.4) };
  const trail = lighten(r.light, 0.3);
  const { hy } = a;
  // around the head: [x, y, facing right]
  const list: [number, number, boolean][] = [
    [0, 9 + hy, true],
    [26, 2 + hy, false],
    [9, -4 + hy, true],
  ];
  list.forEach(([x, y, right], i) => {
    const bx = x + (right ? k : -k);
    const by = y + ((i + k) % 2);
    const art = BEE[(i + k) % 2]!.map((s) => (right ? s : [...s].reverse().join("")));
    const l = new Layer();
    l.sprite(bx, by - 2, art, col);
    l.stamp(c, i === 2, NIGHT);
    // dotted flight path behind it
    const t = new Layer();
    for (let d = 1; d <= 3; d++)
      t.set(right ? bx - 1 - 2 * d : bx + 6 + 2 * d, by + 1 + (d % 2), trail);
    t.stamp(c, false);
  });
}

// ---- lightning ------------------------------------------------------------------------------

/** zigzag points of a bolt, top to bottom (x offsets from its column, y offsets from its top) */
const BOLTS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [3, 0],
    [0, 5],
    [3, 6],
    [0, 12],
  ],
  [
    [0, 0],
    [3, 4],
    [0, 6],
    [3, 11],
  ],
];
const SPARK = [".c.", "cmc", ".c."];

function lightning(c: Ctx, a: Anchor, color: string, k: number) {
  const r = rampFrom(color);
  const core = lighten(r.light, 0.75);
  const glow = r.base;
  const { hy, T } = a;
  const bolt = (x0: number, y0: number, pts: readonly (readonly [number, number])[]) => {
    const l = new Layer();
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= n; s++) {
        const x = x0 + Math.round(ax + ((bx - ax) * s) / n);
        const y = y0 + Math.round(ay + ((by - ay) * s) / n);
        l.set(x + 1, y, glow);
        l.set(x, y, core);
      }
    }
    l.stamp(c, false, NIGHT);
  };
  // two bolts strike on alternate beats, beside the head and beside the body
  if (k === 0) {
    bolt(0, hy, BOLTS[0]!);
    bolt(26, T, BOLTS[1]!);
  } else {
    bolt(26, hy - 2, BOLTS[1]!);
    bolt(0, T + 2, BOLTS[0]!);
  }
  // crackles: one above the head, one in front of the body
  const sp = { c: glow, m: core };
  const top = new Layer();
  top.sprite(k ? 19 : 10, hy - 4, SPARK, sp);
  top.stamp(c, false);
  const front = new Layer();
  front.sprite(k ? 8 : 21, T + 8, SPARK, sp);
  front.stamp(c, true);
}

const PAINT: Record<AuraKind, (c: Ctx, a: Anchor, color: string, k: number) => void> = {
  sparkles,
  fire,
  "rain-cloud": rainCloud,
  hearts,
  bees,
  lightning,
};

/** Queue the aura after the outline (call before the held items queue theirs). */
export function drawAura(c: Ctx, b: TorsoBox): void {
  const aura = c.L.accessories.aura;
  if (!aura || aura.kind === "none") return;
  const anchor: Anchor = {
    hy: c.dy + (c.f.bow ?? 0),
    T: b.T,
    low: b.seated ? Math.min(BODY_ROWS - 4, b.end + 6) : 44,
  };
  const k = beat(c);
  const paint = PAINT[aura.kind];
  c.after.push(() => paint(c, anchor, aura.color, k));
}
