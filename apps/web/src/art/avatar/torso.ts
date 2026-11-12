/**
 * Upper body, inside out: shirt -> suspenders/bib -> neckwear -> vest -> outer garment.
 * Front, back and side views. Each layer leaves its neck opening (and, when worn
 * open, its front) unpainted so the layers below show through.
 */
import { type Buttons, buttons, type CharacterLook, type Ramp } from "@agent-office/protocol";
import { drawApronBack, drawApronFront, drawApronSide } from "./apron.ts";
import { luma, mix, NIGHT, opt, optOrNull, WHITE } from "./color.ts";
import { type Ctx, torsoSpan } from "./ctx.ts";
import { type Fabric, fabricAt } from "./patterns.ts";

/** Torso rows for the current frame. */
export type TorsoBox = {
  /** first torso row (shoulders) */
  T: number;
  /** waistband row of the bottoms */
  W: number;
  /** last row of a hip-length garment */
  end: number;
  seated: boolean;
};

export function torsoBox(c: Ctx): TorsoBox {
  const T = 24 + c.dy;
  const seated = c.f.seat !== "none";
  return seated ? { T, W: T + 6, end: T + 9, seated } : { T, W: T + 7, end: T + 11, seated };
}

/**
 * One-texel trim (piping, small buttons) vanishes at zoom 2 when it is dark: lift dark trim a
 * little toward white, keeping its hue.
 */
function lift(hex: string, t = 0.16): string {
  return luma(hex) < 0.5 ? mix(hex, "#ffffff", t) : hex;
}

const CX0 = 15; // the two centre columns
const CX1 = 16;

export function outerEnd(c: Ctx, b: TorsoBox): number {
  switch (c.L.outer.length) {
    case "cropped":
      return b.W - 1;
    case "waist":
      return b.W + 1;
    case "hip":
      return b.end;
    case "thigh":
      return b.seated ? b.end : b.end + 3;
    case "knee":
      return b.seated ? b.end : c.legRow(39);
    case "ankle":
      return b.seated ? b.end : c.legRow(42);
  }
}

/** Shirts that hang over the waistband instead of being tucked in. */
const UNTUCKED = new Set(["hoodie", "sweater", "tshirt", "longsleeve", "polo", "tank", "jersey"]);

export function shirtEnd(c: Ctx, b: TorsoBox): number {
  const kind = c.L.shirt.kind;
  // cropped tops end where they end, whatever the length says
  if (kind === "dirndl-blouse") return b.T + 4; // cropped under the bust
  if (kind === "crop-top") return b.W - 3; // the midriff stays bare
  if (c.L.bottoms.kind === "dress" || c.L.bottoms.kind === "gown") return b.W - 1;
  switch (c.L.shirt.length) {
    case "tucked":
      return b.W - 1;
    case "untucked":
      return b.W + 1;
    case "long":
      return b.end;
    default:
      return UNTUCKED.has(kind) ? b.W + 1 : b.W - 1;
  }
}

/** Torso columns of row `y`, following the body's figure (WD4; neutral = c.tl..c.tr). */
const rowSpan = (c: Ctx, b: TorsoBox, y: number): [number, number] => torsoSpan(c, y, b.T, b.W);

/** Long outer garments (knee, ankle) flare out a little below the hip, a texel per 4 rows. */
function hemFlare(c: Ctx, b: TorsoBox, y: number): number {
  const len = c.L.outer.length;
  if (b.seated || (len !== "knee" && len !== "ankle") || y <= b.end) return 0;
  return Math.min(2, 1 + Math.floor((y - b.end - 1) / 4));
}

/** Last row of the outer garment that carries pockets and buttons (hip height on long coats). */
const detailEnd = (b: TorsoBox, end: number) => Math.min(end, b.end + 3);

/** Outer kinds the wardrobe added (WD1): their collars and details are drawn here. */
const NEW_OUTER = new Set<CharacterLook["outer"]["kind"]>([
  "tuxedo",
  "tailcoat",
  "trench-coat",
  "parka",
  "puffer-jacket",
  "rain-jacket",
  "varsity",
  "track-jacket",
  "kimono",
  "bathrobe",
  "cape",
  "poncho",
]);

/**
 * The collar an outer garment is drawn with. New kinds wear their own collar when the look
 * names none: lapels on tuxedo / tailcoat / trench, a shawl on the bathrobe, a hood on the
 * parka and rain jacket, a stand-up band on puffer and track jackets, a wrap on the kimono.
 */
export function outerCollar(o: CharacterLook["outer"]): string {
  const c = o.collar;
  if (!NEW_OUTER.has(o.kind)) return o.kind === "jacket" && c === "none" && !o.open ? "none" : c;
  const plain = c === "none" || c === "crew" || c === "shirt";
  switch (o.kind) {
    case "tuxedo":
    case "tailcoat":
    case "trench-coat":
      return plain ? "lapel" : c;
    case "bathrobe":
      return plain ? "shawl" : c;
    case "kimono":
      return "kimono";
    case "parka":
    case "rain-jacket":
      return c === "none" || c === "crew" ? "hood" : c;
    case "puffer-jacket":
    case "track-jacket":
      return plain ? "stand-up" : c;
    case "varsity":
      return plain ? "crew" : c;
    default:
      return c;
  }
}

/** Contrast colour of varsity sleeves, track-jacket stripes and similar trim. */
export function trimColor(o: CharacterLook["outer"]): string {
  if (o.kind === "track-jacket") return opt(o.piping, WHITE);
  return opt(o.collarColor, "#f4f4f2");
}

/** Kimono sash (obi): the piping colour, else a dark shade of the kimono. */
const obiColor = (o: CharacterLook["outer"]) => opt(o.piping, mix(o.ramp.base, NIGHT, 0.4));

export function vestEnd(c: Ctx, b: TorsoBox): number {
  return c.L.shirt.peeksAtWaist ? b.W - 2 : b.W - 1 + (c.L.vest.kind === "sweater-vest" ? 1 : 0);
}

const fab = (ramp: Ramp, pattern: CharacterLook["shirt"]["pattern"], salt = 0): Fabric => ({
  ramp,
  pattern,
  salt,
});

/** Paint one garment span on a row with its fabric, shading the right edge. */
function span(c: Ctx, f: Fabric, y: number, a: number, z: number, oy: number, shadeRight = true) {
  for (let x = a; x <= z; x++) {
    let col = fabricAt(f, x, y - oy);
    if (shadeRight && x >= z - 1 && x === z) col = f.ramp.shadow;
    c.pc.set(x, y, col);
  }
}

/** Half-width of the neck opening below the collar line (front), per collar style and row k. */
function neckHole(collar: string, k: number, kind: string): number {
  switch (collar) {
    case "v-neck":
      return [3, 2, 2, 1, 1, 0][k] ?? 0;
    case "lapel":
      return [3, 3, 2, 2, 1, 1, 0][k] ?? 0;
    case "shawl":
      return [3, 3, 2, 2, 2, 1, 1, 0][k] ?? 0;
    case "shirt":
      return kind === "outer" ? ([2, 2, 1, 1][k] ?? 0) : 0;
    case "none":
      return kind === "outer" ? ([2, 2, 2, 2, 2, 2, 1, 1][k] ?? 0) : 0;
    default:
      return 0;
  }
}

/** Buttons down a column. Large = 2 wide (light + rim/shadow below). */
function buttonColumn(
  c: Ctx,
  btn: Buttons,
  x: number,
  y0: number,
  y1: number,
  fallbackRim: string,
) {
  if (btn.count <= 0) return;
  const rows = y1 - y0 + 1;
  const n = Math.min(btn.count, Math.ceil(rows / 2));
  if (n <= 0) return;
  // spread the buttons over the column, at least one row of cloth between two buttons
  const step = Math.max(2, rows / n);
  const rim = opt(btn.rim, fallbackRim);
  for (let i = 0; i < n; i++) {
    const y = y0 + Math.floor(i * step);
    if (btn.size === "large") {
      c.pc.set(x, y, btn.color);
      c.pc.set(x + 1, y, rim);
    } else {
      c.pc.set(x, y, btn.color);
    }
  }
}

// ---- collars ----------------------------------------------------------------------------------
/** A collar band around the neck (front view), spanning columns a..z on rows y0..y1. */
function collarFront(
  c: Ctx,
  style: string,
  color: string,
  shade: string,
  piping: string | null,
  T: number,
  outer: boolean,
  open: boolean,
) {
  const pc = c.pc;
  switch (style) {
    case "crew":
      pc.hline(13, T, 6, shade);
      break;
    case "turtleneck":
      pc.rect(12, T - 1, 8, 3, color);
      for (let x = 12; x < 20; x += 2) pc.vline(x, T - 1, 3, shade);
      break;
    case "stand-up": {
      if (outer && open) {
        // two collar blocks standing up beside the jaw, piped on top and along the front
        // a band standing up beside the jaw: light top edge, a rolled mid-tone, piped front edge
        const hi = mix(color, "#ffffff", 0.35);
        const mid = mix(color, "#ffffff", 0.15);
        const pipe = piping ? lift(piping) : null;
        for (const [x0, dir] of [
          [c.tl, 1],
          [c.tr, -1],
        ] as const) {
          for (let i = 0; i < 4; i++) {
            const y = T - 1 + i;
            for (let k = 0; k < 4; k++) {
              const x = x0 + dir * k;
              let col = i === 0 ? hi : k === 2 ? mid : color;
              if (k === 0 && dir < 0 && i > 0) col = shade;
              if (k === 3 && pipe) col = pipe;
              pc.set(x, y, col);
            }
          }
          if (pipe) for (let k = 1; k < 4; k++) pc.set(x0 + dir * k, T - 2, pipe);
        }
        break;
      }
      // closed stand-up collar: band hugging the neck, piped on top
      const a = outer ? 11 : 12;
      const z = outer ? 20 : 19;
      pc.rect(a, T - 1, z - a + 1, 2, color);
      pc.set(z, T - 1, shade);
      pc.set(z, T, shade);
      if (piping) pc.hline(a, T - 2, z - a + 1, piping);
      // small front opening
      pc.set(CX0, T, shade);
      pc.set(CX1, T, shade);
      break;
    }
    case "shirt":
    case "polo": {
      // two collar points
      const pts: [number, number][] = [
        [12, T - 1],
        [13, T - 1],
        [12, T],
        [13, T],
        [14, T],
        [13, T + 1],
        [14, T + 1],
        [18, T - 1],
        [19, T - 1],
        [17, T],
        [18, T],
        [19, T],
        [17, T + 1],
        [18, T + 1],
      ];
      for (const [x, y] of pts) pc.set(x, y, x > 16 ? shade : color);
      if (style === "polo") {
        pc.vline(CX0, T + 1, 3, shade);
        pc.set(CX1, T + 2, shade);
      }
      break;
    }
    case "hood": {
      // hood bunched behind the neck
      pc.rect(9, T - 3, 14, 3, color);
      pc.hline(9, T - 1, 14, shade);
      pc.set(14, T + 1, WHITE);
      pc.set(14, T + 2, WHITE);
      pc.set(17, T + 1, WHITE);
      pc.set(17, T + 2, WHITE);
      break;
    }
    case "lapel":
    case "shawl": {
      // lapel triangles along the V
      for (let k = 0; k < 7; k++) {
        const hw = neckHole(style, k, "outer");
        if (hw <= 0) break;
        pc.set(CX0 - hw, T + k, color);
        pc.set(CX0 - hw - 1, T + k, style === "shawl" ? color : shade);
        pc.set(CX1 + hw, T + k, shade);
        pc.set(CX1 + hw + 1, T + k, style === "shawl" ? shade : color);
      }
      if (style === "lapel") {
        pc.set(CX0 - 4, T + 1, NIGHT);
        pc.set(CX1 + 4, T + 1, NIGHT);
      }
      break;
    }
    default:
  }
}

// ---- layers -----------------------------------------------------------------------------------
/** Neckline + straps of the new light tops (front view): what is left unpainted shows skin. */
function newTopFront(c: Ctx, b: TorsoBox, end: number) {
  const s = c.L.shirt;
  const pc = c.pc;
  const sk = c.L.skin;
  const T = b.T;
  switch (s.kind) {
    case "camisole": {
      // thin straps over bare shoulders, a low straight neckline with a light edge
      const [l, r] = rowSpan(c, b, T);
      for (let y = T; y < T + 3; y++) {
        pc.hline(l, y, r - l + 1, y === T + 2 ? sk.shadow : sk.base);
        pc.set(l + 4, y, s.ramp.base);
        pc.set(r - 4, y, s.ramp.shadow);
      }
      pc.hline(l + 3, T + 3, r - l - 5, s.ramp.light);
      break;
    }
    case "dirndl-blouse": {
      // low round neckline gathered on a drawstring, puffed and cropped under the bust
      const hole = [5, 4, 3];
      for (let k = 0; k < hole.length; k++) {
        const hw = hole[k]!;
        for (let x = CX0 - hw + 1; x <= CX1 + hw - 1; x++) pc.set(x, T + k, sk.base);
        pc.set(CX0 - hw, T + k, s.ramp.light);
        pc.set(CX1 + hw, T + k, s.ramp.light);
      }
      pc.hline(CX0 - 2, T + 3, 4, s.ramp.light);
      // gathers along the neckline and a soft shadow under the bust
      for (let x = CX0 - 5; x <= CX1 + 5; x += 2) pc.set(x, T + 3, s.ramp.shadow);
      const [l, r] = rowSpan(c, b, end);
      pc.hline(l, end, r - l + 1, s.ramp.shadow);
      break;
    }
    case "crop-top": {
      const [l, r] = rowSpan(c, b, end);
      pc.hline(l, end, r - l + 1, s.ramp.shadow);
      pc.hline(13, T, 6, s.ramp.shadow);
      break;
    }
    case "jersey": {
      // sporty: contrasting V collar band, side panels in the light tone
      const band = s.ramp.light;
      for (let k = 0; k < 3; k++) {
        const hw = 2 - k;
        for (let x = CX0 - hw; x <= CX1 + hw; x++)
          pc.set(x, T + k, x === CX0 - hw || x === CX1 + hw ? band : sk.base);
      }
      pc.set(CX0, T + 3, band);
      pc.set(CX1, T + 3, band);
      for (let y = T + 2; y <= end; y++) {
        const [l, r] = rowSpan(c, b, y);
        pc.set(l + 1, y, band);
        pc.set(r - 1, y, s.ramp.shadow);
      }
      break;
    }
    default:
  }
}

function drawShirtFront(c: Ctx, b: TorsoBox) {
  const s = c.L.shirt;
  const dress = c.L.bottoms.kind === "dress";
  const body = dress ? c.L.bottoms : s;
  const f = fab(body.ramp, body.pattern, 1);
  const end = shirtEnd(c, b);
  // no shirt: the bare body (or underwear) painted under the clothes shows; neckwear still sits
  if (s.kind !== "none" || dress) {
    for (let y = b.T; y <= end; y++) {
      const [l, r] = rowSpan(c, b, y);
      span(c, f, y, l, r, b.T);
    }
  }
  if (s.kind === "none" && !dress) {
    drawNeckwearFront(c, b);
    return;
  }
  if (
    s.kind === "camisole" ||
    s.kind === "dirndl-blouse" ||
    s.kind === "crop-top" ||
    s.kind === "jersey"
  ) {
    newTopFront(c, b, end);
    if (s.kind === "camisole" || s.kind === "dirndl-blouse") {
      drawNeckwearFront(c, b);
      return;
    }
  }
  if (s.kind === "tank") {
    // bare shoulders
    c.pc.rect(c.tl, b.T, 3, 2, c.L.skin.base);
    c.pc.rect(c.tr - 2, b.T, 3, 2, c.L.skin.shadow);
    c.pc.hline(c.tl + 3, b.T, c.tr - c.tl - 5, c.L.skin.base);
  }
  if (s.kind === "sweater" || s.kind === "hoodie") {
    for (let x = c.tl; x <= c.tr; x += 2) c.pc.set(x, end, s.ramp.shadow); // ribbed hem
  }
  if (s.kind === "hoodie") {
    // kangaroo pocket
    c.pc.hline(c.tl + 3, b.W - 2, c.tr - c.tl - 5, s.ramp.shadow);
    c.pc.vline(c.tl + 3, b.W - 2, 3, s.ramp.shadow);
    c.pc.vline(c.tr - 3, b.W - 2, 3, s.ramp.shadow);
  }
  const collarC = opt(s.collarColor, s.ramp.light);
  if (s.kind === "trachten-shirt") {
    // pin-tuck pleats either side of the placket
    c.pc.vline(13, b.T + 1, end - b.T - 1, s.ramp.light);
    c.pc.vline(18, b.T + 1, end - b.T - 1, s.ramp.shadow);
  }
  if (s.kind === "polo") {
    c.pc.vline(CX0, b.T + 1, 3, s.ramp.shadow);
    c.pc.set(CX1, b.T + 1, s.buttons.color);
    c.pc.set(CX1, b.T + 3, s.buttons.color);
  }
  if (s.collar === "v-neck") {
    for (let k = 0; k < 4; k++) {
      const hw = [3, 2, 1, 0][k]!;
      for (let x = CX0 - hw; x <= CX1 + hw; x++)
        c.pc.set(x, b.T + k, x === CX0 - hw || x === CX1 + hw ? s.ramp.shadow : c.L.skin.base);
    }
  }
  if (s.kind === "shirt" || s.kind === "trachten-shirt" || s.kind === "blouse") {
    // placket + buttons
    c.pc.vline(CX1, b.T + 1, end - b.T, s.ramp.shadow);
    buttonColumn(c, s.buttons, CX0, b.T + 2, end - 1, s.ramp.shadow);
  }
  if (s.kind === "blouse") {
    // soft rounded collar
    c.pc.hline(12, b.T, 3, collarC);
    c.pc.hline(17, b.T, 3, collarC);
    c.pc.set(12, b.T + 1, collarC);
    c.pc.set(19, b.T + 1, collarC);
  } else if (s.kind !== "jersey") {
    collarFront(c, s.collar, collarC, s.ramp.shadow, null, b.T, false, false);
  }
  drawNeckwearFront(c, b);
}

function drawNeckwearFront(c: Ctx, b: TorsoBox) {
  const s = c.L.shirt;
  const nw = s.neckwearColor;
  switch (s.neckwear) {
    case "tie":
      c.pc.rect(CX0, b.T, 2, 1, mix(nw, NIGHT, 0.2));
      c.pc.rect(CX0, b.T + 1, 2, 4, nw);
      c.pc.set(CX1, b.T + 2, mix(nw, NIGHT, 0.3));
      c.pc.rect(CX0, b.T + 5, 2, 1, mix(nw, NIGHT, 0.3));
      break;
    case "bow-tie":
      c.pc.hline(13, b.T, 6, nw);
      c.pc.hline(13, b.T + 1, 2, nw);
      c.pc.hline(17, b.T + 1, 2, nw);
      c.pc.set(CX0, b.T, mix(nw, NIGHT, 0.3));
      c.pc.set(CX1, b.T, mix(nw, NIGHT, 0.3));
      break;
    case "scarf":
      c.pc.rect(11, b.T - 1, 10, 2, nw);
      c.pc.hline(11, b.T, 10, mix(nw, NIGHT, 0.25));
      c.pc.rect(17, b.T + 1, 2, 5, nw);
      c.pc.set(18, b.T + 5, mix(nw, NIGHT, 0.25));
      break;
    case "bandana":
      c.pc.hline(12, b.T, 8, nw);
      c.pc.hline(13, b.T + 1, 6, nw);
      c.pc.hline(14, b.T + 2, 4, nw);
      c.pc.hline(15, b.T + 3, 2, mix(nw, NIGHT, 0.25));
      c.pc.set(14, b.T + 1, WHITE);
      break;
    default:
  }
}

/** A jumpsuit's top half: the whole torso in the bottoms' cloth, zip and collar points. */
function drawJumpsuitFront(c: Ctx, b: TorsoBox) {
  const bt = c.L.bottoms;
  const f = fab(bt.ramp, bt.pattern, 3);
  for (let y = b.T; y < b.W; y++) {
    const [l, r] = rowSpan(c, b, y);
    const hw = y - b.T < 3 ? 2 - (y - b.T) : -1;
    if (hw >= 0) {
      span(c, f, y, l, CX0 - hw - 1, b.T, false);
      span(c, f, y, CX1 + hw + 1, r, b.T);
    } else span(c, f, y, l, r, b.T);
  }
  c.pc.vline(CX0, b.T + 3, b.W - b.T - 3, "#c0cbdc"); // zip
  c.pc.hline(c.tl, b.T, 3, bt.ramp.light);
  c.pc.set(CX0 - 4, b.T, bt.ramp.light); // collar points
  c.pc.set(CX1 + 4, b.T, bt.ramp.shadow);
  c.pc.rect(c.tr - 5, b.T + 3, 3, 2, bt.ramp.shadow); // chest pocket
  const belt = optOrNull(bt.belt);
  if (belt) c.pc.hline(c.tl, b.W - 1, c.tr - c.tl + 1, belt);
}

function drawSuspendersFront(c: Ctx, b: TorsoBox) {
  const bt = c.L.bottoms;
  if (bt.kind === "jumpsuit") {
    drawJumpsuitFront(c, b);
    return;
  }
  if (bt.kind === "overalls") {
    const f = fab(bt.ramp, bt.pattern, 3);
    for (let y = b.T + 3; y < b.W; y++) span(c, f, y, c.tl + 3, c.tr - 3, b.T, false);
    c.pc.hline(c.tl + 3, b.T + 3, c.tr - c.tl - 5, bt.ramp.light);
    c.pc.rect(13, b.T + 5, 6, 2, bt.ramp.shadow); // bib pocket
    c.pc.vline(c.tl + 3, b.T, 3, bt.ramp.base);
    c.pc.vline(c.tr - 3, b.T, 3, bt.ramp.shadow);
    c.pc.set(c.tl + 3, b.T + 3, opt(bt.buttons.color, WHITE));
    c.pc.set(c.tr - 3, b.T + 3, opt(bt.buttons.color, WHITE));
    return;
  }
  if (bt.suspenders === "none") return;
  const col = bt.suspendersColor;
  const dk = mix(col, NIGHT, 0.3);
  c.pc.vline(c.tl + 3, b.T, b.W - b.T, col);
  c.pc.vline(c.tr - 3, b.T, b.W - b.T, dk);
  if (bt.suspenders === "h-bridge") {
    c.pc.hline(c.tl + 3, b.T + 4, c.tr - c.tl - 5, col);
    c.pc.hline(c.tl + 3, b.T + 5, c.tr - c.tl - 5, dk);
    c.pc.set(CX0, b.T + 4, bt.embroidery.color);
    c.pc.set(CX1, b.T + 4, bt.embroidery.color);
  }
}

/** Criss-cross lacing down the centre (columns CX0-1..CX1+1), rows y0..y1. */
function lacing(c: Ctx, y0: number, y1: number, lace: string, gap: string) {
  for (let y = y0; y <= y1; y++) {
    const inner = (y - y0) % 2 === 1;
    c.pc.set(CX0, y, inner ? lace : gap);
    c.pc.set(CX1, y, inner ? lace : gap);
    c.pc.set(CX0 - 1, y, inner ? gap : lace);
    c.pc.set(CX1 + 1, y, inner ? gap : lace);
  }
}

/**
 * Dirndl bodice (Mieder): shoulder straps, a low square neckline that shows the blouse, a laced
 * front; corset: starts under the bust, nipped waist, boning lines and a front busk.
 */
function drawBodiceFront(c: Ctx, b: TorsoBox) {
  const v = c.L.vest;
  const f = fab(v.ramp, v.pattern, 5);
  const end = vestEnd(c, b);
  const pc = c.pc;
  const trim = v.piping === "none" ? v.ramp.light : lift(v.piping);
  const corset = v.kind === "corset";
  const top = b.T + (corset ? 2 : 3);
  for (let y = b.T; y <= end; y++) {
    let [l, r] = rowSpan(c, b, y);
    if (corset && y >= b.W - 3 && y < end) {
      l += 1;
      r -= 1;
    }
    if (y < top) {
      if (corset) continue;
      // straps over the shoulders
      span(c, f, y, l, l + 2, b.T, false);
      span(c, f, y, r - 2, r, b.T);
      pc.set(l + 2, y, trim);
      pc.set(r - 2, y, trim);
      continue;
    }
    span(c, f, y, l, r, b.T);
  }
  const [l, r] = rowSpan(c, b, top);
  pc.hline(l, top, r - l + 1, trim);
  pc.hline(c.tl, end, c.tr - c.tl + 1, trim);
  if (corset) {
    // a sweetheart dip in the middle of the top edge, boning, a busk with its studs
    pc.set(CX0, top, c.L.shirt.kind === "none" ? c.L.skin.shadow : c.L.shirt.ramp.shadow);
    pc.set(CX1, top, c.L.shirt.kind === "none" ? c.L.skin.shadow : c.L.shirt.ramp.shadow);
    for (const x of [c.tl + 2, c.tl + 5, c.tr - 5, c.tr - 2])
      pc.vline(x, top + 1, end - top - 1, v.ramp.shadow);
    pc.vline(CX1, top + 1, end - top - 1, v.ramp.light);
    for (let y = top + 2; y < end; y += 2) pc.set(CX0, y, lift(v.buttons.color, 0.28));
    return;
  }
  // laced front panel, hooks / buttons either side of it
  lacing(c, top + 1, end - 1, trim, v.ramp.shadow);
  if (v.buttons.count > 0) {
    const half = { ...v.buttons, count: Math.ceil(v.buttons.count / 2) };
    buttonColumn(c, half, CX0 - 2, top + 1, end - 1, v.ramp.shadow);
    buttonColumn(c, half, CX1 + 2, top + 1, end - 1, v.ramp.shadow);
  }
}

function drawVestFront(c: Ctx, b: TorsoBox) {
  const v = c.L.vest;
  if (v.kind === "none") return;
  if (v.kind === "dirndl-bodice" || v.kind === "corset") {
    drawBodiceFront(c, b);
    return;
  }
  const f = fab(v.ramp, v.pattern, 5);
  const end = vestEnd(c, b);
  const piping = v.piping === "none" ? null : lift(v.piping);
  for (let y = b.T; y <= end; y++) {
    const [l, r] = rowSpan(c, b, y);
    const hw = neckHole(v.collar === "stand-up" ? "none-vest" : v.collar, y - b.T, "vest");
    if (hw > 0) {
      span(c, f, y, l, CX0 - hw, b.T, false);
      span(c, f, y, CX1 + hw, r, b.T);
      if (piping) {
        c.pc.set(CX0 - hw, y, piping);
        c.pc.set(CX1 + hw, y, piping);
      }
    } else span(c, f, y, l, r, b.T);
  }
  // shading under the arms
  c.pc.vline(c.tr, b.T, end - b.T + 1, v.ramp.shadow);
  if (v.kind === "puffer-vest") {
    for (let y = b.T + 2; y <= end; y += 3) c.pc.hline(c.tl, y, c.tr - c.tl + 1, v.ramp.shadow);
    c.pc.vline(CX0, b.T + 1, end - b.T, v.ramp.light);
  }
  if (v.kind === "sweater-vest") {
    for (let x = c.tl; x <= c.tr; x += 2) c.pc.set(x, end, v.ramp.shadow);
  }
  if (v.kind === "waistcoat") {
    // welt pockets + pointed hem
    c.pc.hline(c.tl + 1, end - 3, 3, v.ramp.shadow);
    c.pc.hline(c.tr - 3, end - 3, 3, v.ramp.shadow);
    c.pc.set(CX0, end + 1, v.ramp.base);
    c.pc.set(CX1, end + 1, v.ramp.shadow);
  }
  if (piping) {
    c.pc.hline(c.tl, end, c.tr - c.tl + 1, piping);
  }
  // front closure: placket line + button column
  if (v.kind !== "sweater-vest") {
    const top = b.T + (v.collar === "v-neck" ? 5 : 2);
    if (v.buttons.count === 0) c.pc.vline(CX1, top, end - top, piping ?? v.ramp.shadow);
    buttonColumn(
      c,
      { ...v.buttons, color: lift(v.buttons.color, 0.28) },
      CX0,
      top,
      end - 1,
      v.ramp.shadow,
    );
  }
  if (v.collar === "stand-up") {
    collarFront(c, "stand-up", v.ramp.base, v.ramp.shadow, piping, b.T, false, false);
    // let the shirt's own collar show inside the vest collar
    const s = c.L.shirt;
    if (s.collar === "stand-up" || s.collar === "shirt") {
      const col = opt(s.collarColor, s.ramp.base);
      c.pc.hline(13, b.T - 1, 6, col);
      c.pc.hline(14, b.T, 4, col);
      c.pc.set(18, b.T - 1, s.ramp.shadow);
    }
  } else if (v.collar !== "v-neck" && v.collar !== "none") {
    collarFront(c, v.collar, v.ramp.light, v.ramp.shadow, piping, b.T, false, false);
  }
}

/** Open outer garment: left/right front panels (inclusive columns). */
export function panels(c: Ctx): { lz: number; ra: number } {
  const w = c.tr - c.tl + 1;
  const pw = w >= 16 ? 5 : 4;
  return { lz: c.tl + pw - 1, ra: c.tr - pw + 1 };
}

/** Two rows of buttons either side of the closed front (double-breasted). */
function drawDoubleRows(c: Ctx, b: TorsoBox, collar: string, end: number) {
  const o = c.L.outer;
  // looks stored before `layout` existed keep their coat exactly as it was
  const legacyCoat = o.kind === "coat" && o.buttons.layout === undefined;
  const perRow = legacyCoat ? Math.max(o.buttons.count, 3) : Math.ceil(o.buttons.count / 2);
  if (perRow <= 0) return;
  // start below the collar opening so the rows sit on cloth
  let top = b.T + 7;
  if (!legacyCoat) {
    let k = 0;
    while (k < 8 && neckHole(collar, k, "outer") >= 2) k++;
    top = b.T + k + 1;
  }
  const btn: Buttons = legacyCoat
    ? { ...o.buttons, count: perRow, size: "small" }
    : { ...o.buttons, count: perRow };
  const y1 = legacyCoat ? end - 1 : Math.min(end - 1, top + perRow * 2 - 2);
  buttonColumn(c, btn, CX0 - 2, top, y1, o.ramp.shadow);
  buttonColumn(c, btn, CX1 + 2, top, y1, o.ramp.shadow);
}

/** Clamp a column so the 2-texel outline still fits in the frame. */
const clampX = (x: number) => Math.max(2, Math.min(29, x));

/** Cape, front: the cape hangs behind; its edges show outside the arms, a clasp at the neck. */
function drawCapeFront(c: Ctx, b: TorsoBox) {
  const o = c.L.outer;
  const pc = c.pc;
  const end = outerEnd(c, b);
  const lining = opt(o.collarColor, mix(o.ramp.base, NIGHT, 0.35));
  for (let y = b.T; y <= end; y++) {
    const fl = hemFlare(c, b, y) + (y > b.T + 5 ? 1 : 0);
    const [l, r] = rowSpan(c, b, y);
    // two texels of cape outside each arm, the lining inside once it swings out
    pc.set(clampX(l - 4 - fl), y, o.ramp.base);
    pc.set(clampX(l - 3 - fl), y, fl > 0 ? lining : o.ramp.base);
    pc.set(clampX(r + 3 + fl), y, fl > 0 ? lining : o.ramp.shadow);
    pc.set(clampX(r + 4 + fl), y, o.ramp.shadow);
  }
  // cords from the shoulders to a clasp at the throat
  const cord = mix(o.ramp.base, NIGHT, 0.25);
  pc.hline(c.tl, b.T, CX0 - c.tl, cord);
  pc.hline(CX1 + 1, b.T, c.tr - CX1, cord);
  const clasp = opt(o.piping, "#feae34");
  pc.set(CX0, b.T, clasp);
  pc.set(CX1, b.T, mix(clasp, NIGHT, 0.3));
  if (o.collar === "stand-up" || o.collar === "turtleneck") {
    // a tall collar flaring up behind the head
    const cc = opt(o.collarColor, o.ramp.light);
    for (let k = 1; k <= 5; k++) {
      pc.hline(clampX(c.tl - 1 - (k >> 1)), b.T - k, 2, cc);
      pc.hline(clampX(c.tr + (k >> 1)), b.T - k, 2, mix(cc, NIGHT, 0.3));
    }
  }
}

/** Poncho, front: a triangle widening from the neck over the arms, fringe along the hem. */
function drawPonchoFront(c: Ctx, b: TorsoBox, back: boolean) {
  const o = c.L.outer;
  const pc = c.pc;
  const f = fab(o.ramp, o.pattern, 7);
  const end = outerEnd(c, b);
  const h = Math.max(1, end - b.T);
  for (let y = b.T; y <= end; y++) {
    const grow = Math.round((3 * (y - b.T)) / h) + hemFlare(c, b, y);
    const [l, r] = rowSpan(c, b, y);
    const a = clampX(l - grow);
    const z = clampX(r + grow);
    const hw = back ? 0 : ([3, 2, 1][y - b.T] ?? 0);
    if (hw > 0) {
      span(c, f, y, a, CX0 - hw, b.T, false);
      span(c, f, y, CX1 + hw, z, b.T);
    } else span(c, f, y, a, z, b.T);
  }
  // woven bands across, then a fringe under the hem
  if (o.pattern.kind === "none") {
    for (const k of [4, 8]) {
      const y = b.T + k;
      if (y >= end) continue;
      const grow = Math.round((3 * k) / h);
      pc.hline(clampX(c.tl - grow), y, c.tr - c.tl + 1 + 2 * grow, opt(o.piping, o.ramp.light));
    }
  }
  const [l, r] = rowSpan(c, b, end);
  for (let x = clampX(l - 3); x <= clampX(r + 3); x += 2) pc.set(x, end + 1, o.ramp.shadow);
  pc.hline(clampX(l - 3), end, clampX(r + 3) - clampX(l - 3) + 1, o.ramp.shadow);
}

/** Details of the outer kinds the wardrobe added (front view). */
function newOuterFront(c: Ctx, b: TorsoBox, end: number, open: boolean) {
  const o = c.L.outer;
  const pc = c.pc;
  const T = b.T;
  const W = b.W;
  switch (o.kind) {
    case "tuxedo":
      if (!open) pc.vline(CX1, T + 7, detailEnd(b, end) - T - 7, o.ramp.shadow);
      break;
    case "tailcoat": {
      // cut away below the waist: tails behind the legs, a hem on each
      pc.hline(c.tl, W + 1, CX0 - c.tl - 2, o.ramp.shadow);
      pc.hline(CX1 + 3, W + 1, c.tr - CX1 - 2, o.ramp.shadow);
      break;
    }
    case "trench-coat": {
      // epaulettes, a storm flap on the chest, two rows of buttons, a buckled belt
      pc.hline(c.tl, T, 3, o.ramp.light);
      pc.hline(c.tr - 2, T, 3, o.ramp.light);
      pc.hline(c.tl + 1, T + 4, CX0 - c.tl - 3, o.ramp.shadow);
      if (!open && o.buttons.count === 0) {
        const btn = buttons(3, mix(o.ramp.base, NIGHT, 0.45));
        buttonColumn(c, btn, CX0 - 2, T + 5, W - 2, o.ramp.shadow);
        buttonColumn(c, btn, CX1 + 2, T + 5, W - 2, o.ramp.shadow);
      }
      const belt = mix(o.ramp.base, NIGHT, 0.3);
      const [l, r] = rowSpan(c, b, W);
      if (open) {
        const { lz, ra } = panels(c);
        pc.hline(l, W, lz - l + 1, belt);
        pc.hline(ra, W, r - ra + 1, belt);
      } else {
        pc.hline(l, W, r - l + 1, belt);
        pc.rect(CX0 - 1, W - 1, 4, 3, o.ramp.light);
        pc.rect(CX0, W, 2, 1, belt);
      }
      break;
    }
    case "parka": {
      if (!open) {
        pc.vline(CX0, T + 1, end - T, "#c0cbdc");
        for (let y = T + 2; y < end; y += 3) pc.set(CX1, y, o.ramp.light); // toggles
      }
      pc.set(CX0 - 2, W, WHITE); // waist drawcord
      pc.set(CX1 + 2, W, WHITE);
      const py = detailEnd(b, end) - 3;
      pc.rect(c.tl + 1, py, 4, 3, o.ramp.shadow);
      pc.hline(c.tl + 1, py, 4, o.ramp.light);
      pc.rect(c.tr - 4, py, 4, 3, o.ramp.shadow);
      pc.hline(c.tr - 4, py, 4, o.ramp.light);
      break;
    }
    case "puffer-jacket": {
      for (let y = T + 2; y < end; y += 3) {
        const [l, r] = rowSpan(c, b, y);
        pc.hline(l, y, r - l + 1, o.ramp.shadow);
        pc.hline(l + 1, y - 1, 3, o.ramp.light);
      }
      if (!open) pc.vline(CX0, T + 1, end - T - 1, "#c0cbdc");
      break;
    }
    case "rain-jacket": {
      const gloss = mix(o.ramp.light, WHITE, 0.5);
      pc.vline(c.tl + 2, T + 2, Math.max(1, end - T - 4), gloss);
      pc.vline(c.tr - 3, T + 3, 2, gloss);
      if (!open) {
        pc.vline(CX0, T + 1, end - T - 1, o.ramp.shadow);
        for (let y = T + 2; y < end; y += 3) pc.set(CX1, y, o.ramp.light); // snaps
      }
      pc.set(c.tl + 1, end - 1, WHITE);
      pc.set(c.tr - 1, end - 1, WHITE);
      break;
    }
    case "varsity": {
      const tc = trimColor(o);
      // ribbed hem and collar in the trim colour, snaps, a chest letter
      const [l, r] = rowSpan(c, b, end);
      pc.hline(l, end - 1, r - l + 1, tc);
      for (let x = l; x <= r; x++) pc.set(x, end, x % 2 ? tc : o.ramp.shadow);
      if (!open) {
        for (let y = T + 2; y < end - 1; y += 2) pc.set(CX0, y, WHITE);
        // a block letter on the wearer's left chest
        const lx = c.tr - 6;
        pc.vline(lx, T + 2, 4, tc);
        pc.vline(lx + 2, T + 2, 4, tc);
        pc.set(lx + 1, T + 2, tc);
        pc.set(lx + 1, T + 4, tc);
        pc.vline(lx + 3, T + 3, 3, mix(tc, NIGHT, 0.45));
      }
      break;
    }
    case "track-jacket": {
      const tc = trimColor(o);
      for (let y = T + 1; y <= end; y++) {
        const [l, r] = rowSpan(c, b, y);
        pc.set(l + 1, y, tc);
        pc.set(r - 2, y, tc);
      }
      if (!open) pc.vline(CX0, T + 1, end - T, "#c0cbdc");
      pc.hline(c.tl, end, c.tr - c.tl + 1, mix(o.ramp.base, NIGHT, 0.3));
      break;
    }
    case "kimono": {
      const cc = opt(o.collarColor, mix(o.ramp.light, WHITE, 0.55));
      const obi = obiColor(o);
      if (open) {
        const { lz, ra } = panels(c);
        pc.vline(lz, T, end - T + 1, cc);
        pc.vline(ra, T, end - T + 1, cc);
      } else {
        // wrapped left over right: the collar band runs from the wearer's left shoulder down
        // to the right hip, the under-collar shows in a small V at the throat
        pc.set(CX0 - 1, T, cc);
        pc.set(CX0, T + 1, cc);
        for (let k = 0; k <= 8; k++) {
          const x = CX1 + 3 - k;
          const y = T + k;
          if (y > end) break;
          pc.set(x, y, cc);
          pc.set(x - 1, y, mix(o.ramp.base, NIGHT, 0.25));
        }
        pc.vline(CX1 + 3 - 8, T + 9, Math.max(0, end - T - 8), mix(o.ramp.base, NIGHT, 0.25));
      }
      // obi sash with a cord across
      for (let y = W - 2; y <= W; y++) {
        const [l, r] = rowSpan(c, b, y);
        pc.hline(l, y, r - l + 1, obi);
      }
      pc.hline(CX0 - 3, W - 1, 8, mix(obi, WHITE, 0.45));
      break;
    }
    case "bathrobe": {
      // tie belt in the robe's cloth, knotted in front, ends hanging down
      const belt = mix(o.ramp.base, NIGHT, 0.12);
      const [l, r] = rowSpan(c, b, W);
      pc.hline(l, W, r - l + 1, belt);
      pc.rect(CX0, W - 1, 2, 3, o.ramp.light);
      pc.vline(CX0 - 1, W + 1, 3, belt);
      pc.vline(CX1 + 1, W + 1, 4, o.ramp.shadow);
      break;
    }
    default:
  }
}

function drawOuterFront(c: Ctx, b: TorsoBox) {
  const o = c.L.outer;
  if (o.kind === "none") return;
  if (o.kind === "cape") {
    drawCapeFront(c, b);
    return;
  }
  if (o.kind === "poncho") {
    drawPonchoFront(c, b, false);
    return;
  }
  const f = fab(o.ramp, o.pattern, 7);
  const end = outerEnd(c, b);
  const open = o.open;
  const { lz, ra } = panels(c);
  const collar = outerCollar(o);
  const tails = o.kind === "tailcoat";
  // a tailcoat's tails reach the knee whatever its length says
  const tailEnd = tails && !b.seated ? Math.max(end, c.legRow(39)) : end;
  for (let y = b.T; y <= tailEnd; y++) {
    const k = y - b.T;
    const [l, r] = rowSpan(c, b, y);
    const fl = hemFlare(c, b, y);
    if (tails && y > b.W) {
      // cut away in front: the tails show either side of the legs
      if (y === b.W + 1) {
        span(c, f, y, l, CX0 - 3, b.T, false);
        span(c, f, y, CX1 + 3, r, b.T);
      } else {
        span(c, f, y, l - fl, l + 1, b.T, false);
        span(c, f, y, r - 1, r + fl, b.T);
      }
      continue;
    }
    if (open) {
      const flare = y >= end - 1 ? 1 : 0;
      span(c, f, y, l - fl, lz - flare, b.T, false);
      span(c, f, y, ra + flare, r + fl, b.T);
      continue;
    }
    const hw = neckHole(collar, k, "outer");
    if (hw > 0) {
      span(c, f, y, l - fl, CX0 - hw, b.T, false);
      span(c, f, y, CX1 + hw, r + fl, b.T);
    } else span(c, f, y, l - fl, r + fl, b.T);
  }
  const pc = c.pc;
  const fe = hemFlare(c, b, end);
  // classic shading: light shoulders, darker hem
  pc.hline(c.tl, b.T, 2, o.ramp.light);
  if (!open && (collar === "none" || collar === "crew")) {
    pc.set(CX0 - 3, b.T, o.ramp.light);
    pc.set(CX1 + 3, b.T, o.ramp.light);
  }
  if (tails) {
    pc.vline(c.tr - 1, b.T + 1, b.W - b.T, o.ramp.shadow);
    pc.hline(c.tl, tailEnd, 2, o.ramp.shadow);
    pc.hline(c.tr - 1, tailEnd, 2, o.ramp.shadow);
  } else {
    pc.vline(c.tr - 1, b.T + 1, end - b.T, o.ramp.shadow);
    pc.hline(c.tl - fe, end, open ? lz - c.tl + fe : c.tr - c.tl + 1 + 2 * fe, o.ramp.shadow);
    if (open) pc.hline(ra + 1, end, c.tr - ra + fe, o.ramp.shadow);
  }
  // kind details
  const piping = optOrNull(o.piping);
  switch (o.kind) {
    case "jacket":
      if (!open) pc.vline(CX1, b.T + 8, end - b.T - 8, o.ramp.shadow);
      break;
    case "blazer":
    case "coat":
      if (!open) pc.vline(CX1, b.T + 7, end - b.T - 7, o.ramp.shadow);
      break;
    case "cardigan":
      for (let x = c.tl; x <= c.tr; x += 2) pc.set(x, end, o.ramp.light);
      break;
    case "zip-hoodie":
      if (!open) pc.vline(CX0, b.T + 1, end - b.T, "#c0cbdc");
      pc.hline(c.tl + 2, end - 3, 4, o.ramp.shadow);
      pc.hline(c.tr - 5, end - 3, 4, o.ramp.shadow);
      break;
    case "hoodie":
      // pullover: no zip, two white drawstrings under the hood
      pc.vline(CX0 - 2, b.T + 1, 3, WHITE);
      pc.vline(CX1 + 2, b.T + 1, 3, WHITE);
      break;
    case "denim-jacket": {
      const st = o.ramp.light;
      pc.hline(c.tl, b.T + 3, c.tr - c.tl + 1, st);
      pc.rect(c.tl + 2, b.T + 4, 3, 2, o.ramp.shadow);
      pc.rect(c.tr - 4, b.T + 4, 3, 2, o.ramp.shadow);
      pc.hline(c.tl, end - 1, c.tr - c.tl + 1, st);
      if (!open) pc.vline(CX1, b.T + 1, end - b.T, st);
      break;
    }
    case "leather-jacket":
      if (!open) {
        for (let k = 0; k < end - b.T; k++)
          pc.set(Math.max(c.tl + 2, CX1 + 3 - Math.floor(k / 2)), b.T + 1 + k, "#c0cbdc");
      }
      pc.vline(c.tl + 1, b.T + 2, 3, o.ramp.light);
      pc.hline(c.tl + 2, end - 2, 3, o.ramp.light);
      break;
    case "bomber":
      pc.hline(c.tl, end, c.tr - c.tl + 1, o.ramp.shadow);
      for (let x = c.tl; x <= c.tr; x += 2) pc.set(x, end - 1, o.ramp.shadow);
      if (!open) pc.vline(CX0, b.T + 1, end - b.T - 1, "#c0cbdc");
      pc.rect(c.tl + 1, b.T + 2, 2, 1, opt(o.collarColor, o.ramp.light));
      break;
    case "lab-coat":
      pc.rect(c.tr - 4, b.T + 3, 3, 1, o.ramp.shadow);
      pc.set(c.tr - 3, b.T + 2, "#0099db"); // pen
      break;
    case "janker":
      break;
    default:
      newOuterFront(c, b, end, open);
  }
  // buttons and pockets sit at hip height even on a long coat
  const de = detailEnd(b, end);
  // double-breasted: two rows of buttons on a closed garment (a coat without a stated layout
  // is double-breasted, as before). Painted here, before piping and pockets, where the coat's
  // rows always were, so stored coats stay pixel-identical.
  const layout = o.buttons.layout ?? (o.kind === "coat" ? "double" : "single");
  if (!open && layout === "double") drawDoubleRows(c, b, collar, tails ? b.W : de);
  // the vest's piped edges show inside an open jacket
  const vp = optOrNull(c.L.vest.piping);
  if (open && vp && c.L.vest.kind !== "none") {
    const ve = vestEnd(c, b);
    pc.hline(lz + 1, ve, ra - lz - 1, lift(vp));
    pc.hline(lz + 1, b.T + 1, ra - lz - 1, lift(vp));
  }
  // front edge piping
  if (piping) {
    if (open) {
      pc.vline(lz, b.T, end - b.T + 1, piping);
      pc.vline(ra, b.T, end - b.T + 1, piping);
    }
    if (!tails) pc.hline(c.tl - fe, end, c.tr - c.tl + 1 + 2 * fe, piping);
  }
  // pockets
  if (o.pockets !== "none" && !tails) {
    const pp = opt(o.pocketPiping, o.ramp.shadow);
    const py = de - 3;
    const lA = c.tl + 1;
    const rZ = c.tr - 1;
    const pwid = open ? 2 : 4;
    switch (o.pockets) {
      case "flap":
        if (!(open && o.buttons.count > 0)) {
          pc.hline(lA, py, pwid + 1, pp);
          pc.hline(lA, py + 1, pwid, o.ramp.shadow);
        }
        pc.hline(rZ - pwid, py, pwid + 1, pp);
        pc.hline(rZ - pwid + 1, py + 1, pwid, o.ramp.shadow);
        break;
      case "patch":
        pc.rect(lA, py - 1, pwid, 3, pp);
        pc.rect(lA, py, pwid, 2, o.ramp.base);
        pc.rect(rZ - pwid + 1, py - 1, pwid, 3, pp);
        pc.rect(rZ - pwid + 1, py, pwid, 2, o.ramp.base);
        break;
      case "welt":
        pc.hline(lA, py, pwid, pp);
        pc.hline(rZ - pwid + 1, py, pwid, pp);
        break;
      case "kangaroo":
        if (!open) {
          pc.hline(c.tl + 3, py - 1, c.tr - c.tl - 5, pp);
          pc.vline(c.tl + 3, py - 1, 3, pp);
          pc.vline(c.tr - 3, py - 1, 3, pp);
        }
        break;
    }
  }
  // single row: along the wearer's right front edge (viewer's left) when open, down the centre
  // when closed (a coat without a stated layout has no single row, as before)
  if (
    (open || layout === "single") &&
    o.buttons.count > 0 &&
    (o.kind !== "coat" || o.buttons.layout !== undefined)
  ) {
    const bx = open ? lz - 2 : CX0;
    const top = open && collar === "stand-up" ? b.T + 2 : b.T + 1;
    buttonColumn(
      c,
      o.buttons,
      bx,
      top,
      Math.min((tails ? b.W : de) - 1, top + o.buttons.count * 2 - 2),
      o.ramp.shadow,
    );
  }
  // collar
  let cc = opt(o.collarColor, o.ramp.light);
  let cs = o.collarColor === "none" ? o.ramp.shadow : mix(o.collarColor, NIGHT, 0.3);
  if (o.kind === "tuxedo" || o.kind === "tailcoat") {
    // satin lapels: a glossy tone of the cloth unless a colour is named
    cc = opt(o.collarColor, mix(o.ramp.base, WHITE, 0.22));
    // a glossy edge along each lapel, so satin reads even on a black jacket
    cs = mix(cc, WHITE, 0.3);
  } else if (NEW_OUTER.has(o.kind) && collar === "hood") {
    cc = o.ramp.base;
    cs = o.ramp.shadow;
  } else if (o.kind === "track-jacket" && collar === "stand-up") {
    cc = trimColor(o);
  }
  if (collar !== "none") {
    collarFront(c, collar, cc, cs, optOrNull(o.collarPiping), b.T, true, open);
  }
  if (o.kind === "parka" && collar === "hood") {
    // a fur rim around the hood opening
    const fur = mix(o.ramp.light, WHITE, 0.6);
    for (let x = 9; x <= 22; x++) pc.set(x, b.T - 3, x % 2 ? fur : o.ramp.light);
    pc.vline(9, b.T - 3, 3, fur);
    pc.vline(22, b.T - 3, 3, o.ramp.light);
  }
  if (o.kind === "varsity" && collar === "crew") {
    const tc = trimColor(o);
    pc.hline(12, b.T, 8, tc);
    for (let x = 12; x < 20; x += 2) pc.set(x, b.T, mix(tc, NIGHT, 0.3));
  }
}

/**
 * The agent mark on clothes that are not agent coloured, as on main's 1× renderer: a 4×4
 * badge (2×2 at 1×) on the chest — centred on the shirt when the outer layer is open or
 * missing and no vest is in the way, else on the wearer's left chest (viewer's right) — a 2×2
 * dot at the front edge from the side, and
 * from behind (how seated people are mostly seen) a wide patch across the shoulders.
 * A bare torso (no shirt and no outer layer: underwear only, or nothing) carries no mark, so
 * no agent colour lands on skin.
 */
export function agentMark(c: Ctx): boolean {
  if (!c.r.accent) return false;
  return !(c.L.shirt.kind === "none" && c.L.bottoms.kind !== "dress" && c.L.outer.kind === "none");
}

function drawAgentBadge(c: Ctx, b: TorsoBox) {
  if (!agentMark(c)) return;
  const a = c.r.agentRamp;
  const o = c.L.outer;
  const centre = (o.kind === "none" || o.open) && c.L.vest.kind === "none";
  // off-centre: against the side seam, high on the chest, clear of buttons on short torsos
  const x = centre ? CX0 - 1 : c.tr - 4;
  const y = b.T + (centre ? 3 : 2);
  c.pc.rect(x, y, 4, 4, a.base);
  c.pc.rect(x, y, 2, 2, a.light);
}

function drawAgentPatch(c: Ctx, b: TorsoBox) {
  if (!agentMark(c)) return;
  const a = c.r.agentRamp;
  const w = c.tr - c.tl - 3;
  c.pc.rect(c.tl + 2, b.T + 2, w, 4, a.base);
  c.pc.hline(c.tl + 2, b.T + 2, w, a.light);
}

function drawAgentDot(c: Ctx, b: TorsoBox) {
  if (!agentMark(c)) return;
  c.pc.rect(c.tl, b.T + 2, 2, 2, c.r.agentRamp.base);
}

export function drawTorsoFront(c: Ctx, b: TorsoBox) {
  drawShirtFront(c, b);
  drawSuspendersFront(c, b);
  drawVestFront(c, b);
  drawApronFront(c, b);
  drawOuterFront(c, b);
  drawAgentBadge(c, b);
}

/** First shirt row from behind / the side: camisoles show bare shoulders above their straps. */
const shirtTop = (c: Ctx, b: TorsoBox) => (c.L.shirt.kind === "camisole" ? b.T + 2 : b.T);
/** No shirt (and no dress standing in for it): the bare body shows. */
const bareTop = (c: Ctx) => c.L.shirt.kind === "none" && c.L.bottoms.kind !== "dress";
/** Tops whose back neckline is their own (no collar band behind the neck). */
const OWN_NECK = new Set(["none", "camisole", "dirndl-blouse", "jersey"]);

/** A cape seen from behind: it covers the back (and the arms) from the shoulders down. */
function drawCapeBack(c: Ctx, b: TorsoBox) {
  const o = c.L.outer;
  const pc = c.pc;
  const f = fab(o.ramp, o.pattern, 7);
  const end = outerEnd(c, b);
  for (let y = b.T - 1; y <= end; y++) {
    const fl = hemFlare(c, b, y) + (y > b.T + 5 ? 1 : 0);
    const [l, r] = rowSpan(c, b, Math.max(b.T, y));
    span(c, f, y, clampX(l - 2 - fl), clampX(r + 2 + fl), b.T);
  }
  // soft folds, a darker hem
  for (const x of [CX0 - 5, CX1 + 1, CX1 + 6])
    pc.vline(x, b.T + 4, Math.max(0, end - b.T - 4), o.ramp.shadow);
  pc.vline(CX0 - 4, b.T + 5, Math.max(0, end - b.T - 6), o.ramp.light);
  const [l, r] = rowSpan(c, b, end);
  const fe = hemFlare(c, b, end) + 1;
  pc.hline(clampX(l - 2 - fe), end, clampX(r + 2 + fe) - clampX(l - 2 - fe) + 1, o.ramp.shadow);
  if (o.collar === "stand-up" || o.collar === "turtleneck") {
    const cc = opt(o.collarColor, o.ramp.light);
    pc.rect(c.tl - 1, b.T - 5, c.tr - c.tl + 3, 4, cc);
    pc.hline(c.tl - 1, b.T - 5, c.tr - c.tl + 3, mix(cc, WHITE, 0.3));
  }
}

/** New outer kinds from behind. */
function newOuterBack(c: Ctx, b: TorsoBox, end: number) {
  const o = c.L.outer;
  const pc = c.pc;
  const T = b.T;
  const W = b.W;
  switch (o.kind) {
    case "trench-coat": {
      const [l, r] = rowSpan(c, b, W);
      pc.hline(l, W, r - l + 1, mix(o.ramp.base, NIGHT, 0.3)); // belt
      pc.hline(c.tl, T + 4, c.tr - c.tl + 1, o.ramp.shadow); // back storm shield
      pc.hline(c.tl, T, 3, o.ramp.light);
      pc.hline(c.tr - 2, T, 3, o.ramp.light);
      break;
    }
    case "puffer-jacket":
      for (let y = T + 2; y < end; y += 3) {
        const [l, r] = rowSpan(c, b, y);
        pc.hline(l, y, r - l + 1, o.ramp.shadow);
        pc.hline(l + 1, y - 1, 3, o.ramp.light);
      }
      break;
    case "rain-jacket":
      pc.vline(c.tl + 2, T + 4, Math.max(1, end - T - 6), mix(o.ramp.light, WHITE, 0.5));
      break;
    case "varsity": {
      const tc = trimColor(o);
      const [l, r] = rowSpan(c, b, end);
      pc.hline(l, end - 1, r - l + 1, tc);
      for (let x = l; x <= r; x++) pc.set(x, end, x % 2 ? tc : o.ramp.shadow);
      // an arched name band across the shoulders
      pc.hline(CX0 - 3, T + 4, 8, tc);
      pc.hline(CX0 - 1, T + 3, 4, tc);
      break;
    }
    case "track-jacket": {
      const tc = trimColor(o);
      for (let y = T; y <= end; y++) {
        const [l, r] = rowSpan(c, b, y);
        pc.set(l + 1, y, tc);
        pc.set(r - 2, y, tc);
      }
      break;
    }
    case "kimono": {
      // obi with a big flat knot (taiko) on the back
      const obi = obiColor(o);
      for (let y = W - 2; y <= W; y++) {
        const [l, r] = rowSpan(c, b, y);
        pc.hline(l, y, r - l + 1, obi);
      }
      pc.rect(CX0 - 3, W - 5, 8, 5, obi);
      pc.hline(CX0 - 3, W - 5, 8, mix(obi, WHITE, 0.35));
      pc.vline(CX1 + 4, W - 5, 5, mix(obi, NIGHT, 0.3));
      break;
    }
    case "bathrobe": {
      const [l, r] = rowSpan(c, b, W);
      pc.hline(l, W, r - l + 1, mix(o.ramp.base, NIGHT, 0.12));
      pc.set(l + 2, W - 1, o.ramp.shadow); // belt loops
      pc.set(r - 2, W - 1, o.ramp.shadow);
      break;
    }
    default:
  }
}

// ---- back view --------------------------------------------------------------------------------
export function drawTorsoBack(c: Ctx, b: TorsoBox) {
  const L = c.L;
  const pc = c.pc;
  const sEnd = shirtEnd(c, b);
  const s = L.bottoms.kind === "dress" ? L.bottoms : L.shirt;
  const sf = fab(s.ramp, s.pattern, 1);
  const bare = bareTop(c);
  if (!bare)
    for (let y = shirtTop(c, b); y <= sEnd; y++) {
      const [l, r] = rowSpan(c, b, y);
      span(c, sf, y, l, r, b.T);
    }
  const sk = L.shirt.kind;
  if (sk === "camisole") {
    pc.vline(c.tl + 4, b.T, 2, L.shirt.ramp.base);
    pc.vline(c.tr - 4, b.T, 2, L.shirt.ramp.shadow);
  } else if (sk === "jersey") {
    // a big number on the back, the collar band in the light tone
    const n = L.shirt.ramp.shadow;
    pc.hline(CX0 - 1, b.T + 2, 4, n);
    pc.set(CX1 + 1, b.T + 3, n);
    pc.set(CX1, b.T + 4, n);
    pc.vline(CX0, b.T + 5, 2, n);
    pc.hline(12, b.T, 8, L.shirt.ramp.light);
  } else if (sk === "dirndl-blouse" || sk === "crop-top") {
    const [l, r] = rowSpan(c, b, sEnd);
    pc.hline(l, sEnd, r - l + 1, L.shirt.ramp.shadow);
  }
  if (!bare && !OWN_NECK.has(sk)) {
    if (L.shirt.collar === "hood" || sk === "hoodie") {
      pc.rect(11, b.T - 2, 10, 5, L.shirt.ramp.base);
      pc.hline(11, b.T + 2, 10, L.shirt.ramp.shadow);
    } else if (L.shirt.collar !== "none") {
      pc.hline(12, b.T, 8, opt(L.shirt.collarColor, L.shirt.ramp.light));
    }
  }
  const bt = L.bottoms;
  if (bt.kind === "jumpsuit") {
    const jf = fab(bt.ramp, bt.pattern, 3);
    for (let y = b.T; y < b.W; y++) {
      const [l, r] = rowSpan(c, b, y);
      span(c, jf, y, l, r, b.T);
    }
    pc.hline(12, b.T, 8, bt.ramp.light);
    const belt = optOrNull(bt.belt);
    if (belt) pc.hline(c.tl, b.W - 1, c.tr - c.tl + 1, belt);
  } else if (bt.suspenders !== "none" || bt.kind === "overalls") {
    const col = bt.kind === "overalls" ? bt.ramp.base : bt.suspendersColor;
    for (let y = b.T; y < b.W; y++) {
      const t = y - b.T;
      const k = Math.min(t, 4);
      pc.set(c.tl + 3 + k, y, col);
      pc.set(c.tr - 3 - k, y, col);
    }
  }
  const v = L.vest;
  if (v.kind === "dirndl-bodice" || v.kind === "corset") {
    const vEnd = vestEnd(c, b);
    const vf = fab(v.ramp, v.pattern, 5);
    const corset = v.kind === "corset";
    const top = b.T + (corset ? 2 : 1);
    const trim = v.piping === "none" ? v.ramp.light : lift(v.piping);
    for (let y = top; y <= vEnd; y++) {
      let [l, r] = rowSpan(c, b, y);
      if (corset && y >= b.W - 3 && y < vEnd) {
        l += 1;
        r -= 1;
      }
      span(c, vf, y, l, r, b.T);
    }
    pc.hline(c.tl, top, c.tr - c.tl + 1, trim);
    pc.hline(c.tl, vEnd, c.tr - c.tl + 1, trim);
    if (corset) lacing(c, top + 1, vEnd - 1, trim, v.ramp.shadow);
    else {
      pc.vline(c.tl + 3, top + 1, vEnd - top - 1, v.ramp.shadow); // princess seams
      pc.vline(c.tr - 3, top + 1, vEnd - top - 1, v.ramp.shadow);
    }
  } else if (v.kind !== "none") {
    const vEnd = vestEnd(c, b);
    const vf = fab(v.ramp, v.pattern, 5);
    for (let y = b.T; y <= vEnd; y++) {
      const [l, r] = rowSpan(c, b, y);
      span(c, vf, y, l, r, b.T);
    }
    if (v.collar === "stand-up") {
      pc.rect(12, b.T - 1, 8, 2, v.ramp.base);
      if (v.piping !== "none") pc.hline(12, b.T - 2, 8, v.piping);
    }
    if (v.kind === "waistcoat") pc.hline(c.tl + 3, b.T + 3, c.tr - c.tl - 5, v.ramp.shadow); // strap
  }
  drawApronBack(c, b);
  const o = L.outer;
  if (o.kind === "cape") drawCapeBack(c, b);
  else if (o.kind === "poncho") drawPonchoFront(c, b, true);
  else if (o.kind !== "none") {
    const end = outerEnd(c, b);
    const of = fab(o.ramp, o.pattern, 7);
    const collar = outerCollar(o);
    const tails = o.kind === "tailcoat";
    const tailEnd = tails && !b.seated ? Math.max(end, c.legRow(39)) : end;
    for (let y = b.T; y <= tailEnd; y++) {
      const [l, r] = rowSpan(c, b, y);
      const fl = hemFlare(c, b, y);
      if (tails && y > b.W + 1) {
        // two tails with a split between them
        span(c, of, y, l - fl, CX0 - 1, b.T, false);
        span(c, of, y, CX1 + 1, r + fl, b.T);
      } else span(c, of, y, l - fl, r + fl, b.T);
    }
    const fe = hemFlare(c, b, tailEnd);
    pc.vline(c.tr - 1, b.T, tailEnd - b.T + 1, o.ramp.shadow);
    pc.hline(c.tl - fe, tailEnd, c.tr - c.tl + 1 + 2 * fe, o.ramp.shadow);
    pc.vline(CX0, b.T + 1, (tails ? b.W + 1 : end) - b.T - 1, o.ramp.shadow); // back seam
    if (tails) {
      pc.vline(CX0 - 1, b.W + 2, tailEnd - b.W - 2, o.ramp.shadow);
      pc.hline(c.tl, b.W + 1, c.tr - c.tl + 1, o.ramp.shadow);
      pc.set(CX0 - 2, b.W + 1, o.ramp.light); // buttons at the top of the tails
      pc.set(CX1 + 2, b.W + 1, o.ramp.light);
    }
    if (o.yoke) {
      // yoke seam across the shoulders, dipping in the middle
      for (let x = c.tl; x <= c.tr; x++) {
        const d = Math.abs(x - 15.5) < 4 ? 1 : 0;
        pc.set(x, b.T + 3 + d, o.ramp.shadow);
        pc.set(x, b.T + 2 + d, o.ramp.light);
      }
    }
    if (o.piping !== "none") pc.hline(c.tl - fe, tailEnd, c.tr - c.tl + 1 + 2 * fe, o.piping);
    if (o.kind === "bomber" || o.kind === "cardigan") {
      for (let x = c.tl; x <= c.tr; x += 2) pc.set(x, end - 1, o.ramp.shadow);
    }
    newOuterBack(c, b, end);
    if (o.kind === "zip-hoodie" || o.kind === "hoodie" || collar === "hood") {
      pc.rect(11, b.T - 2, 10, 6, o.ramp.base);
      pc.hline(11, b.T + 3, 10, o.ramp.shadow);
      pc.vline(20, b.T - 2, 6, o.ramp.shadow);
      if (o.kind === "parka") {
        const fur = mix(o.ramp.light, WHITE, 0.6);
        for (let x = 11; x <= 20; x++) pc.set(x, b.T - 2, x % 2 ? fur : o.ramp.light);
      }
    }
    if (o.kind === "denim-jacket") pc.hline(c.tl, b.T + 4, c.tr - c.tl + 1, o.ramp.light);
    // collar band from behind (the head covers everything above the shoulders)
    if (collar !== "none" && collar !== "hood" && collar !== "crew") {
      const cc =
        o.kind === "kimono"
          ? opt(o.collarColor, mix(o.ramp.light, WHITE, 0.55))
          : opt(o.collarColor, o.ramp.light);
      const tall = collar === "stand-up" || collar === "turtleneck";
      const h = tall ? 2 : 1;
      pc.rect(c.tl + 2, b.T, c.tr - c.tl - 3, h, cc);
      pc.hline(c.tl + 2, b.T, c.tr - c.tl - 3, mix(cc, "#ffffff", 0.35));
      pc.vline(c.tr - 2, b.T, h, mix(cc, NIGHT, 0.3));
    }
    if (o.kind === "varsity") pc.hline(12, b.T, 8, trimColor(o));
  }
  if (L.shirt.collar === "turtleneck" && o.kind === "none" && !bare)
    pc.rect(12, b.T - 2, 8, 2, L.shirt.ramp.base);
  drawAgentPatch(c, b);
}

// ---- side view (facing left) ------------------------------------------------------------------
/** New outer kinds from the side (front edge = `front`, the back is toward c.tr). */
function newOuterSide(c: Ctx, b: TorsoBox, end: number, front: number) {
  const o = c.L.outer;
  const pc = c.pc;
  const T = b.T;
  const W = b.W;
  const mid = Math.floor((c.tl + c.tr) / 2);
  switch (o.kind) {
    case "tuxedo":
    case "tailcoat":
      pc.vline(front + 1, T, 5, opt(o.collarColor, mix(o.ramp.base, WHITE, 0.22)));
      break;
    case "trench-coat":
      pc.hline(front, W, c.tr - front + 1, mix(o.ramp.base, NIGHT, 0.3));
      pc.set(front + 1, W, o.ramp.light);
      break;
    case "puffer-jacket":
      for (let y = T + 2; y < end; y += 3) pc.hline(front, y, c.tr - front + 1, o.ramp.shadow);
      break;
    case "rain-jacket":
      pc.vline(front + 2, T + 2, Math.max(1, end - T - 4), mix(o.ramp.light, WHITE, 0.5));
      break;
    case "varsity": {
      const tc = trimColor(o);
      pc.hline(front, end - 1, c.tr - front + 1, tc);
      for (let x = front; x <= c.tr; x++) pc.set(x, end, x % 2 ? tc : o.ramp.shadow);
      break;
    }
    case "track-jacket":
      pc.vline(mid, T + 1, end - T, trimColor(o));
      break;
    case "kimono": {
      const obi = obiColor(o);
      for (let y = W - 2; y <= W; y++) pc.hline(front, y, c.tr - front + 1, obi);
      pc.rect(c.tr - 1, W - 5, 3, 5, obi); // the knot on the back
      pc.vline(front, T, W - T - 2, opt(o.collarColor, mix(o.ramp.light, WHITE, 0.55)));
      break;
    }
    case "bathrobe":
      pc.hline(front, W, c.tr - front + 1, mix(o.ramp.base, NIGHT, 0.12));
      pc.vline(front, W + 1, 3, mix(o.ramp.base, NIGHT, 0.12));
      break;
    default:
  }
}

/** A cape from the side: hanging from the shoulders and flowing out behind. */
function drawCapeSide(c: Ctx, b: TorsoBox) {
  const o = c.L.outer;
  const pc = c.pc;
  const f = fab(o.ramp, o.pattern, 7);
  const end = outerEnd(c, b);
  for (let y = b.T; y <= end; y++) {
    const out = hemFlare(c, b, y) + Math.floor((y - b.T) / 4);
    const [, r] = rowSpan(c, b, y);
    span(c, f, y, r - 2, clampX(r + 1 + out), b.T);
  }
  pc.hline(c.tl + 1, b.T, c.tr - c.tl - 1, mix(o.ramp.base, NIGHT, 0.25)); // cord
  pc.set(c.tl + 1, b.T, opt(o.piping, "#feae34"));
  if (o.collar === "stand-up" || o.collar === "turtleneck")
    pc.rect(c.tr - 3, b.T - 5, 4, 5, opt(o.collarColor, o.ramp.light));
}

export function drawTorsoSide(c: Ctx, b: TorsoBox) {
  const L = c.L;
  const pc = c.pc;
  const s = L.bottoms.kind === "dress" ? L.bottoms : L.shirt;
  const sEnd = shirtEnd(c, b);
  const sf = fab(s.ramp, s.pattern, 1);
  const bare = bareTop(c);
  if (!bare)
    for (let y = shirtTop(c, b); y <= sEnd; y++) {
      const [l, r] = rowSpan(c, b, y);
      span(c, sf, y, l, r, b.T);
    }
  const sk = L.shirt.kind;
  if (sk === "camisole") pc.vline(c.tl + 3, b.T, 2, L.shirt.ramp.base);
  if (sk === "dirndl-blouse" || sk === "crop-top") {
    const [l, r] = rowSpan(c, b, sEnd);
    pc.hline(l, sEnd, r - l + 1, L.shirt.ramp.shadow);
  }
  if (sk === "dirndl-blouse") pc.rect(c.tl, b.T, 3, 2, L.skin.base); // low neckline
  if (!bare && !OWN_NECK.has(sk) && L.shirt.collar !== "none")
    pc.hline(c.tl + 1, b.T, 4, opt(L.shirt.collarColor, L.shirt.ramp.light));
  if (sk === "jersey") pc.hline(c.tl + 1, b.T, 4, L.shirt.ramp.light);
  const v = L.vest;
  if (v.kind !== "none") {
    const vEnd = vestEnd(c, b);
    const vf = fab(v.ramp, v.pattern, 5);
    const fitted = v.kind === "dirndl-bodice" || v.kind === "corset";
    const top = b.T + (v.kind === "corset" ? 2 : 0);
    for (let y = top; y <= vEnd; y++) {
      const [l, r] = rowSpan(c, b, y);
      span(c, vf, y, l, r, b.T);
    }
    if (fitted) {
      const trim = v.piping === "none" ? v.ramp.light : lift(v.piping);
      if (v.kind === "dirndl-bodice") pc.rect(c.tl, b.T, 3, 3, L.shirt.ramp.base); // neckline
      pc.hline(c.tl, top + (v.kind === "corset" ? 0 : 3), 4, trim);
      for (let y = top + 4; y < vEnd; y += 2) pc.set(c.tl, y, trim); // lacing at the front
    }
    if (v.piping !== "none") pc.hline(c.tl, vEnd, c.tr - c.tl + 1, v.piping);
    if (v.buttons.count > 0 && !fitted)
      for (let y = b.T + 2; y < vEnd; y += 2) pc.set(c.tl, y, v.buttons.color);
  }
  const bt = L.bottoms;
  if (bt.kind === "jumpsuit") {
    const jf = fab(bt.ramp, bt.pattern, 3);
    for (let y = b.T; y < b.W; y++) {
      const [l, r] = rowSpan(c, b, y);
      span(c, jf, y, l, r, b.T);
    }
    pc.hline(c.tl + 1, b.T, 4, bt.ramp.light);
    pc.vline(c.tl, b.T + 2, b.W - b.T - 2, "#c0cbdc");
  } else if (bt.suspenders !== "none" || bt.kind === "overalls") {
    const col = bt.kind === "overalls" ? bt.ramp.base : bt.suspendersColor;
    pc.vline(c.tl + 3, b.T, b.W - b.T, col);
  }
  drawApronSide(c, b);
  const o = L.outer;
  if (o.kind === "cape") drawCapeSide(c, b);
  else if (o.kind === "poncho") {
    const f = fab(o.ramp, o.pattern, 7);
    const end = outerEnd(c, b);
    const h = Math.max(1, end - b.T);
    for (let y = b.T; y <= end; y++) {
      const grow = Math.round((2 * (y - b.T)) / h) + hemFlare(c, b, y);
      const [l, r] = rowSpan(c, b, y);
      span(c, f, y, clampX(l - grow), clampX(r + grow), b.T);
    }
    const [l, r] = rowSpan(c, b, end);
    for (let x = clampX(l - 2); x <= clampX(r + 2); x += 2) pc.set(x, end + 1, o.ramp.shadow);
  } else if (o.kind !== "none") {
    const end = outerEnd(c, b);
    const of = fab(o.ramp, o.pattern, 7);
    const collar = outerCollar(o);
    const tails = o.kind === "tailcoat";
    const tailEnd = tails && !b.seated ? Math.max(end, c.legRow(39)) : end;
    const front = o.open ? c.tl + 2 : c.tl;
    for (let y = b.T; y <= tailEnd; y++) {
      const [l, r] = rowSpan(c, b, y);
      const fl = hemFlare(c, b, y);
      const fr = (o.open ? l + 2 : l) - (fl > 1 ? 1 : 0);
      if (tails && y > b.W + 1) span(c, of, y, r - 3, r + fl, b.T);
      else span(c, of, y, fr, r + fl, b.T);
    }
    const fe = hemFlare(c, b, tailEnd);
    pc.vline(c.tr - 1, b.T + 1, tailEnd - b.T, o.ramp.shadow);
    if (tails) pc.hline(c.tr - 3, tailEnd, 4 + fe, o.ramp.shadow);
    else pc.hline(front - (fe > 1 ? 1 : 0), end, c.tr - front + 1 + fe, o.ramp.shadow);
    if (o.piping !== "none") pc.vline(front, b.T, end - b.T + 1, o.piping);
    // buttons along the front edge
    if (o.buttons.count > 0) {
      const n = Math.min(o.buttons.count, 5);
      for (let i = 0; i < n; i++) {
        const y = b.T + 1 + i * 2;
        if (y >= end) break;
        pc.set(front, y, o.buttons.color);
        pc.set(front + 1, y, o.buttons.color);
        if (o.buttons.size === "large") pc.set(front + 1, y + 1, opt(o.buttons.rim, o.ramp.shadow));
      }
    }
    if (o.pockets !== "none" && o.pockets !== "kangaroo" && !tails) {
      const pp = opt(o.pocketPiping, o.ramp.shadow);
      const de = detailEnd(b, end);
      pc.hline(front + 3, de - 3, 4, pp);
      if (o.pockets === "flap") pc.hline(front + 3, de - 2, 4, o.ramp.shadow);
    }
    newOuterSide(c, b, end, front);
    if (o.kind === "zip-hoodie" || o.kind === "hoodie" || collar === "hood") {
      pc.rect(c.tl + 5, b.T - 2, 6, 4, o.ramp.base);
      if (o.kind === "parka") pc.hline(c.tl + 5, b.T - 2, 6, mix(o.ramp.light, WHITE, 0.6));
    }
    if (collar !== "none" && collar !== "crew" && collar !== "hood" && collar !== "kimono") {
      const cc =
        o.kind === "tuxedo" || o.kind === "tailcoat"
          ? opt(o.collarColor, mix(o.ramp.base, WHITE, 0.22))
          : opt(o.collarColor, o.ramp.light);
      const tall = collar === "stand-up" || collar === "turtleneck";
      const y0 = b.T - 1;
      const h = tall ? 4 : 2;
      pc.rect(front, y0, 9, h, cc);
      pc.hline(front, y0, 9, mix(cc, "#ffffff", 0.35));
      pc.vline(front + 8, y0, h, mix(cc, NIGHT, 0.3));
      if (o.collarPiping !== "none") pc.vline(front, y0, h, o.collarPiping);
    }
  } else if (!bare && (L.shirt.collar === "stand-up" || L.shirt.collar === "turtleneck")) {
    pc.rect(c.tl + 1, b.T - 2, 7, 2, opt(L.shirt.collarColor, L.shirt.ramp.base));
  }
  drawAgentDot(c, b);
}
