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
import { mix, NIGHT, WHITE } from "./color.ts";
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
const WINGS: Record<Exclude<Accessories["wings"]["kind"], "none">, string[]> = {
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
  }
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
  if (c.view === "left") {
    if (!behind) return;
    // one wing behind the back edge (the far one hidden by the near one)
    const rows = mirror(WINGS[w.kind]);
    c.pc.sprite(c.tr - 5, b.T - 4, rows, wingColors(w.kind, r));
    return;
  }
  // front: behind the body, peeking out beside shoulders and arms; back: over the back,
  // starting just under the head
  if ((c.view === "down") !== behind) return;
  drawWingPair(c.pc, w.kind, r, c.view === "down" ? b.T - 4 : b.T - 1);
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

const TAIL_WIDTH: Record<Exclude<Accessories["tail"]["kind"], "none">, [number, number]> = {
  cat: [2, 2],
  devil: [2, 2],
  dino: [5, 2],
  fox: [3, 5],
};

function drawTail(c: Ctx, b: TorsoBox, behind: boolean) {
  const t = c.L.accessories.tail;
  if (t.kind === "none") return;
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

function drawNecklace(c: Ctx, b: TorsoBox) {
  const n = c.L.accessories.necklace;
  if (n.kind === "none") return;
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

function drawBag(c: Ctx, b: TorsoBox) {
  const bag = c.L.accessories.bag;
  if (bag.kind === "none") return;
  const pc = c.pc;
  const r = rampFrom(bag.color);
  const strap = r.shadow;
  const { T, W } = b;
  switch (bag.kind) {
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
    default:
  }
}

// ---- hooks ----------------------------------------------------------------------------------

export function drawAccessoriesBehind(c: Ctx, b: TorsoBox): void {
  drawWings(c, b, true);
  drawTail(c, b, true);
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
