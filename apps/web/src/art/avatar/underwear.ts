/**
 * The body under the clothes (WD5): bare skin of the torso and hips in the skin ramp, then the
 * underwear (`look.underwear`). Garments are painted over it, so whatever a `none` garment
 * leaves uncovered shows skin or underwear. With nothing on, the body is a smooth, featureless
 * doll body (no anatomical detail): skin base, the far edge in the skin shadow, nothing else
 * but a soft shadow line under the chest for curvy / muscular figures.
 *
 * The torso is painted with the lifted ctx before the torso garments (rows T..W-1, so it never
 * touches the waistband of the bottoms); the hips and the underwear on the thighs belong to the
 * leg layer (rows W..37 standing, W..end seated) and are stretched with the legs.
 */
import type { FullLook, Ramp } from "@agent-office/protocol";
import { optOrNull } from "./color.ts";
import { type Ctx, torsoSpan } from "./ctx.ts";
import { type Fabric, fabricAt } from "./patterns.ts";
import type { TorsoBox } from "./torso.ts";

type Underwear = FullLook["underwear"];
type Span = readonly [number, number];

/** Standing: the first leg row (legs.ts split) and the last hip row. */
const SPLIT = 38;
const HIP_BOTTOM = SPLIT - 1;

const fabric = (ramp: Ramp, u: Underwear, salt: number): Fabric => ({
  ramp,
  pattern: u.pattern,
  salt,
});

/** Paint a span with a fabric (right edge in the shadow). */
function fill(c: Ctx, f: Fabric, y: number, a: number, z: number, oy: number) {
  for (let x = a; x <= z; x++) c.pc.set(x, y, x === z ? f.ramp.shadow : fabricAt(f, x, y - oy));
}

/** Clip spans to [l, r] and paint them. */
function paintSpans(
  c: Ctx,
  f: Fabric,
  y: number,
  spans: readonly Span[],
  l: number,
  r: number,
  oy: number,
  color?: string,
) {
  for (const [a0, z0] of spans) {
    const a = Math.max(a0, l);
    const z = Math.min(z0, r);
    if (a > z) continue;
    if (color) c.pc.hline(a, y, z - a + 1, color);
    else fill(c, f, y, a, z, oy);
  }
}

// ---- torso ------------------------------------------------------------------------------------

/**
 * Where an underwear top covers row k (k = y - T) of the torso [l, r]: spans, and whether the
 * row is a band (drawn in the trim colour, or the ramp shadow).
 */
function topRow(
  kind: Underwear["top"],
  view: Ctx["view"],
  k: number,
  l: number,
  r: number,
): { spans: Span[]; band?: boolean } {
  const straps = (w: number, inset: number): Span[] =>
    view === "left"
      ? [[l + inset, l + inset + w - 1]]
      : [
          [l + inset, l + inset + w - 1],
          [r - inset - w + 1, r - inset],
        ];
  const full: Span[] = [[l, r]];
  if (view === "down") {
    switch (kind) {
      case "undershirt":
        if (k === 0) return { spans: straps(3, 2) };
        if (k === 1)
          return {
            spans: [
              [l + 2, 13],
              [18, r - 2],
            ],
          };
        if (k === 2) return { spans: [[l + 1, r - 1]] };
        return { spans: full };
      case "tank":
        if (k <= 2) return { spans: straps(2, 3) };
        if (k === 3) return { spans: [[l + 2, r - 2]] };
        if (k === 4) return { spans: [[l + 1, r - 1]] };
        return { spans: full };
      case "bra":
        if (k <= 2) return { spans: straps(1, 4) };
        if (k === 3)
          return {
            spans: [
              [l + 3, 14],
              [17, r - 3],
            ],
          };
        if (k === 4)
          return {
            spans: [
              [l + 2, 14],
              [17, r - 2],
            ],
          };
        if (k === 5) return { spans: [[l + 1, r - 1]], band: true };
        return { spans: [] };
      case "sports-bra":
        if (k <= 1) return { spans: straps(2, 3) };
        if (k === 2)
          return {
            spans: [
              [l + 3, 13],
              [18, r - 3],
            ],
          };
        if (k <= 5) return { spans: [[l + 1, r - 1]] };
        if (k === 6) return { spans: [[l + 1, r - 1]], band: true };
        return { spans: [] };
      case "bikini-top":
        if (k <= 1)
          return {
            spans: [
              [13, 13],
              [18, 18],
            ],
            band: true,
          };
        if (k === 2)
          return {
            spans: [
              [12, 12],
              [19, 19],
            ],
          };
        if (k === 3)
          return {
            spans: [
              [11, 13],
              [18, 20],
            ],
          };
        if (k === 4)
          return {
            spans: [
              [10, 14],
              [17, 21],
            ],
          };
        return { spans: [] };
      case "swimsuit":
        if (k <= 1) return { spans: straps(2, 3) };
        if (k === 2)
          return {
            spans: [
              [l + 3, 13],
              [18, r - 3],
            ],
          };
        return { spans: full };
      default:
        return { spans: [] };
    }
  }
  if (view === "up") {
    switch (kind) {
      case "undershirt":
        if (k === 0) return { spans: [[l + 2, r - 2]] };
        if (k === 1) return { spans: [[l + 1, r - 1]] };
        return { spans: full };
      case "tank":
        if (k <= 1) return { spans: straps(2, 3) };
        if (k === 2) return { spans: [[l + 2, r - 2]] };
        if (k === 3) return { spans: [[l + 1, r - 1]] };
        return { spans: full };
      case "bra":
        if (k <= 3) return { spans: straps(1, 4) };
        if (k === 4) return { spans: full };
        if (k === 5) return { spans: full, band: true };
        return { spans: [] };
      case "sports-bra":
        // racerback: the straps meet between the shoulder blades
        if (k === 0) return { spans: straps(2, 3) };
        if (k === 1) return { spans: straps(2, 5) };
        if (k === 2) return { spans: [[13, 18]] };
        if (k <= 5) return { spans: [[l + 1, r - 1]] };
        if (k === 6) return { spans: [[l + 1, r - 1]], band: true };
        return { spans: [] };
      case "bikini-top":
        if (k === 3) return { spans: [[15, 16]] };
        if (k === 4) return { spans: full, band: true };
        if (k === 5) return { spans: [[15, 16]] };
        return { spans: [] };
      case "swimsuit":
        // low back: the straps run down to the waist
        if (k <= 1) return { spans: straps(2, 3) };
        if (k <= 4) return { spans: straps(2, 5) };
        return { spans: full };
      default:
        return { spans: [] };
    }
  }
  // side view, facing left: the front is at l
  switch (kind) {
    case "undershirt":
      return { spans: k === 0 ? [[l + 2, r - 2]] : full };
    case "tank":
      if (k <= 1) return { spans: straps(2, 3) };
      return { spans: k === 2 ? [[l + 1, r - 1]] : full };
    case "bra":
      if (k <= 2) return { spans: straps(1, 4) };
      if (k <= 4) return { spans: [[l, l + 3]] };
      if (k === 5) return { spans: full, band: true };
      return { spans: [] };
    case "sports-bra":
      if (k <= 1) return { spans: straps(2, 3) };
      if (k <= 5) return { spans: full };
      if (k === 6) return { spans: full, band: true };
      return { spans: [] };
    case "bikini-top":
      if (k === 3) return { spans: [[l, l + 2]] };
      if (k === 4)
        return {
          spans: [
            [l, l + 2],
            [l + 3, r],
          ],
        };
      return { spans: [] };
    case "swimsuit":
      if (k <= 1) return { spans: straps(3, 3) };
      return { spans: full };
    default:
      return { spans: [] };
  }
}

/** Bare torso (+ underwear top), painted before the shirt. */
export function drawBodyTorso(c: Ctx, b: TorsoBox): void {
  const L = c.L;
  const sk = L.skin;
  const T = b.T;
  const W = b.W;
  const fig = L.body.figure;
  const side = c.view === "left";
  const spans: Span[] = [];
  for (let y = T; y < W; y++) {
    let [l, r] = torsoSpan(c, y, T, W);
    // a doll's waist: the last row tapers in toward the hips
    if (y === W - 1 && fig !== "curvy") {
      if (side) r -= 1;
      else {
        l += 1;
        r -= 1;
      }
    }
    // curvy from the side: a soft bust line
    if (side && fig === "curvy" && (y === T + 3 || y === T + 4)) l -= 1;
    spans.push([l, r]);
    for (let x = l; x <= r; x++) c.pc.set(x, y, x === r ? sk.shadow : sk.base);
  }
  // a soft shadow under the chest (no anatomical detail)
  if ((fig === "curvy" || fig === "muscular") && c.view === "down") {
    const [l, r] = spans[4] ?? [c.tl, c.tr];
    const y = T + 4;
    c.pc.hline(l + 2, y, 4, sk.shadow);
    c.pc.hline(r - 5, y, 4, sk.shadow);
  }
  // underwear top
  const u = L.underwear;
  if (u.top === "none") return;
  const f = fabric(u.topRamp, u, 21);
  const trim = optOrNull(u.trim);
  for (let y = T; y < W; y++) {
    const [l, r] = spans[y - T]!;
    const row = topRow(u.top, c.view, y - T, l, r);
    const band = row.band ? (trim ?? u.topRamp.shadow) : undefined;
    paintSpans(c, f, y, row.spans, l, r, T, band);
  }
  // straps / necklines in the trim colour
  if (trim && u.top !== "bikini-top" && c.view === "down") {
    const k0 = u.top === "bra" ? 3 : u.top === "sports-bra" ? 2 : 1;
    const [l, r] = spans[k0] ?? [c.tl, c.tr];
    const row = topRow(u.top, c.view, k0, l, r);
    for (const [a, z] of row.spans) {
      c.pc.set(Math.max(a, l), T + k0, trim);
      c.pc.set(Math.min(z, r), T + k0, trim);
    }
  }
}

// ---- hips -------------------------------------------------------------------------------------

/** Hip columns of the current frame (the bottoms' hip block). */
function hipCols(c: Ctx): Span {
  if (c.f.seat !== "none") return [c.tl + 1, c.tr - 1];
  if (c.view === "left") return [c.tl + 2, c.tr - 2];
  const wide = c.posed && c.L.pose.stance === "wide";
  return wide ? [9, 22] : [10, 21];
}

/** Underwear bottom kinds that reach down onto the thighs, and their last standing row. */
const THIGH_END: Partial<Record<Underwear["bottom"], number>> = {
  boxers: 39,
  "boxer-briefs": 39,
  "swim-trunks": 40,
};

/** Bottoms under which the underwear on the thighs shows. */
const BARE_THIGHS = new Set<FullLook["bottoms"]["kind"]>(["none", "tutu", "mini-skirt"]);

/** The underwear bottom in effect: a one-piece swimsuit replaces it. */
function bottomKind(u: Underwear): Underwear["bottom"] | "swimsuit" {
  return u.top === "swimsuit" ? "swimsuit" : u.bottom;
}

/**
 * Coverage of an underwear bottom on hip row y (top = W, bottom = last hip row): spans inside
 * [ha, hz]. Briefs, panties and bikinis are cut high at the legs (a V toward the bottom row).
 */
function bottomRow(
  kind: Underwear["bottom"] | "swimsuit",
  view: Ctx["view"],
  seated: boolean,
  y: number,
  W: number,
  bottom: number,
  ha: number,
  hz: number,
): Span[] {
  const start =
    kind === "panties" ? W + 1 : kind === "bikini" ? W + 2 : kind === "none" ? Infinity : W;
  if (y < start) return [];
  const full: Span[] = [[ha, hz]];
  if (seated || kind === "boxers" || kind === "boxer-briefs" || kind === "swim-trunks") return full;
  const d = bottom - y;
  const cut = (steps: readonly number[]): Span[] => {
    const i = steps.length - 1 - d;
    if (d >= steps.length) return full;
    const inset = steps[Math.max(0, i)]!;
    return inset < 0 ? [] : [[ha + inset, hz - inset]];
  };
  // insets from the row two up the cut to the bottom row
  if (view === "left") {
    switch (kind) {
      case "briefs":
        return cut([1]);
      case "panties":
      case "swimsuit":
        return cut([1, 2]);
      case "bikini":
        return cut([2, -1]);
      default:
        return full;
    }
  }
  const back = view === "up";
  switch (kind) {
    case "briefs":
      return back ? cut([2]) : cut([2, 4]);
    case "panties":
    case "swimsuit":
      return back ? cut([1, 3]) : cut([1, 3, 5]);
    case "bikini":
      return back ? cut([2, 4]) : cut([2, 4, 5]);
    default:
      return full;
  }
}

/** Bare hips (+ underwear bottom), painted in the leg layer before the bottoms. */
export function drawBodyHips(c: Ctx, b: TorsoBox): void {
  const L = c.L;
  const sk = L.skin;
  const seated = c.f.seat !== "none";
  const W = b.W;
  const bottom = seated ? b.end : HIP_BOTTOM;
  const [ha0, hz0] = hipCols(c);
  const curvy = L.body.figure === "curvy";
  const side = c.view === "left";
  const colsAt = (y: number): Span => {
    if (!curvy || y < W + 1) return [ha0, hz0];
    return side ? [ha0, hz0 + 1] : [ha0 - 1, hz0 + 1];
  };
  for (let y = W; y <= bottom; y++) {
    const [ha, hz] = colsAt(y);
    for (let x = ha; x <= hz; x++) c.pc.set(x, y, x === hz ? sk.shadow : sk.base);
  }
  // where the legs part: a soft shadow, nothing more
  if (!seated && !side) {
    c.pc.set(15, bottom, sk.shadow);
    c.pc.set(16, bottom, sk.shadow);
  }
  const u = L.underwear;
  const kind = bottomKind(u);
  if (kind === "none") return;
  const ramp = kind === "swimsuit" ? u.topRamp : u.bottomRamp;
  const f = fabric(ramp, u, 23);
  const trim = optOrNull(u.trim);
  for (let y = W; y <= bottom; y++) {
    const [ha, hz] = colsAt(y);
    paintSpans(c, f, y, bottomRow(kind, c.view, seated, y, W, bottom, ha, hz), ha, hz, W);
  }
  // waistband / details
  const [ha, hz] = colsAt(W);
  const top = kind === "panties" ? W + 1 : kind === "bikini" ? W + 2 : W;
  if (kind !== "swimsuit") {
    const band =
      kind === "panties" || kind === "bikini" ? (trim ?? ramp.light) : (trim ?? ramp.shadow);
    const [a, z] = colsAt(top);
    c.pc.hline(a, top, z - a + 1, band);
  }
  if (kind === "bikini" && !side) {
    // side ties
    const tie = trim ?? ramp.light;
    c.pc.set(ha - 1, top, tie);
    c.pc.set(ha - 1, top + 1, tie);
    c.pc.set(hz + 1, top, tie);
    c.pc.set(hz + 1, top + 1, tie);
  } else if (kind === "bikini") {
    c.pc.set(ha + 4, top + 1, trim ?? ramp.light);
  }
  if (c.view === "down") {
    if (kind === "boxers") c.pc.vline(15, W + 1, Math.min(3, bottom - W), ramp.shadow); // fly
    if (kind === "swim-trunks") {
      // drawstring
      c.pc.set(15, W + 1, ramp.light);
      c.pc.set(16, W + 1, ramp.light);
      c.pc.set(15, W + 2, ramp.light);
    }
  }
  // loose legs (boxers, swim trunks) stand off the thigh when nothing is worn over them
  if (
    !seated &&
    !side &&
    L.bottoms.kind === "none" &&
    (kind === "boxers" || kind === "swim-trunks")
  ) {
    const end = THIGH_END[kind]!;
    for (let y = SPLIT; y <= end; y++) {
      c.pc.set(ha0 - 1, y, fabricAt(f, ha0 - 1, y - W));
      c.pc.set(hz0 + 1, y, ramp.shadow);
    }
  }
}

/**
 * Underwear colour of a leg texel (standing rows; seated thighs pass their standing row), or
 * null when the underwear does not reach this row. Painted under the bottoms and over legwear.
 */
export function underwearLegAt(c: Ctx, row: number, x: number, dark: boolean): string | null {
  const u = c.L.underwear;
  if (u.top === "swimsuit") return null;
  // only under bottoms that leave the thighs bare: never peeking below a hem
  if (!BARE_THIGHS.has(c.L.bottoms.kind)) return null;
  const end = THIGH_END[u.bottom];
  if (end === undefined || row > end || row < SPLIT) return null;
  const r = u.bottomRamp;
  if (row === end && u.bottom === "boxer-briefs") return optOrNull(u.trim) ?? r.shadow;
  if (dark) return r.shadow;
  return fabricAt(fabric(r, u, 23), x, row - SPLIT);
}
