/**
 * Arms and hands for every view, the standing poses (front idle + the free arm while waving),
 * raised/waving hands, the reading book and the mug.
 */
import { type Ramp, rampFrom } from "@agent-office/protocol";
import { C } from "../palette.ts";
import { luma, mix, NIGHT, WHITE } from "./color.ts";
import type { Ctx } from "./ctx.ts";
import { heldFront } from "./extras.ts";
import { type Arms, BODY_ROWS } from "./geometry.ts";
import { agentMark, type TorsoBox, trimColor } from "./torso.ts";

/** Rightmost texel column a part may use so the 2-texel outline still fits in the frame. */
const MAX_X = 29;

/** Sleeve colour of row `k` below the shoulder; null = bare skin. */
function sleeveAt(c: Ctx, k: number): Ramp | null {
  const L = c.L;
  const o = L.outer;
  if (o.kind !== "none" && o.kind !== "cape") {
    // varsity jackets have sleeves in the contrast colour
    return o.kind === "varsity" ? rampFrom(trimColor(o)) : c.sleeve;
  }
  // a cape lies over the shoulders, the shirt's sleeves (or bare arms) come out under it
  if (o.kind === "cape" && k < 2) return c.sleeve;
  const s = L.shirt;
  const sl = o.kind === "none" ? c.sleeve : s.ramp;
  if (s.kind === "tank" || s.kind === "none" || s.kind === "camisole") return null;
  if (s.sleeves === "none") return null;
  // mesh top: skin shows between the rows of netting
  if (s.kind === "mesh-top" && k % 2 === 1) return null;
  if (s.sleeves === "puff") return k < 3 ? sl : null;
  if (s.sleeves === "short") return k < 4 ? sl : null;
  if (s.sleeves === "rolled") return k < 7 ? sl : null;
  return sl;
}

/** Puffed shoulder of a puff sleeve (no outer layer with its own sleeves over it). */
const puffAt = (c: Ctx, k: number) =>
  k < 3 &&
  c.L.shirt.sleeves === "puff" &&
  (c.L.outer.kind === "none" || c.L.outer.kind === "cape") &&
  sleeveAt(c, k) !== null;

/** Arms under a poncho: only the hands show below it. */
const hiddenArms = (c: Ctx) => c.L.outer.kind === "poncho";

/**
 * Sleeve colour of the bent arms of a pose (hands on hips, arms crossed, waving, a raised
 * hand): the outer garment's or shirt's sleeve, as before; bare skin for the wardrobe's
 * sleeveless tops (no shirt, camisole, sleeves "none" / "puff"), the cape's shirt underneath.
 */
function poseSleeve(c: Ctx): Ramp {
  const o = c.L.outer;
  if (o.kind !== "none" && o.kind !== "cape") return sleeveAt(c, 5) ?? c.sleeve;
  const s = c.L.shirt;
  const bare =
    s.kind === "none" || s.kind === "camisole" || s.sleeves === "none" || s.sleeves === "puff";
  if (bare) return c.L.skin;
  return o.kind === "cape" ? s.ramp : c.sleeve;
}

/** Colours of the hands: gloves (WD6) or skin. */
function handRamp(c: Ctx): Ramp {
  const g = c.L.accessories.gloves;
  // crazy wardrobe (WD12): cartoon gloves are white, the foam finger sits on one bare hand
  if (g.kind === "cartoon") return CARTOON;
  if (g.kind === "foam-finger") return c.L.skin;
  return g.kind === "none" ? c.L.skin : rampFrom(g.color);
}

// ---- crazy gloves (WD12) --------------------------------------------------------------------

const CARTOON: Ramp = { base: "#f4f4f2", shadow: "#c0cbdc", light: WHITE };
const BLADE = { light: WHITE, base: "#c0cbdc" };

/** Giant foam hand, the "1" finger pointing down (hanging arm) or up (raised arm). */
const FOAM_DOWN = [
  ".LLL.",
  "LhWhH",
  "hWWhH",
  "hhWhH",
  "hhWhH",
  "hWWWH",
  "hhhhH",
  ".hhH.",
  "..hH.",
  "..hH.",
  "..HH.",
];
const FOAM_UP = [
  "..LH.",
  "..hH.",
  "..hH.",
  ".hhhH",
  "LhWhH",
  "hWWhH",
  "hhWhH",
  "hhWhH",
  "hWWWH",
  "hhhhH",
  ".HHH.",
];

/** The hanging foam hand from row `top`, its finger cut short where the frame ends. */
const foamDown = (top: number) => FOAM_DOWN.slice(0, Math.max(0, LAST_ROW + 1 - top));

function foamColors(c: Ctx): Record<string, string> {
  const r = rampFrom(c.L.accessories.gloves.color);
  return { h: r.base, H: r.shadow, L: r.light, W: luma(r.base) > 0.7 ? NIGHT : WHITE };
}

/** Is this the hand with the foam finger? The person's left: viewer's right from the front. */
const foamHand = (c: Ctx, out: -1 | 1) =>
  c.L.accessories.gloves.kind === "foam-finger" && (c.view === "up" ? out < 0 : out > 0);

/** Last body row a hand may paint on (the frame ends there). */
const LAST_ROW = BODY_ROWS - 1;

/** Three talons fanning out from (x, y) in direction dy, painted over the outline. */
function claws(c: Ctx, x: number, y: number, dy: 1 | -1) {
  const pc = c.pc;
  c.after.push(() => {
    for (const [x0, x1] of [
      [x, x - 1],
      [x + 1, x + 1],
      [x + 2, x + 3],
    ] as const)
      for (let k = 0; k < 5; k++) {
        if (y + dy * k > LAST_ROW) break;
        const xx = k < 2 ? x0 : x1;
        pc.set(xx, y + dy * k, k === 4 ? BLADE.light : BLADE.base);
      }
  });
}

/** A ribbed cartoon cuff (three lines in the glove colour), `w` wide. */
function cartoonCuff(c: Ctx, x: number, y: number, w: number) {
  const line = mix(rampFrom(c.L.accessories.gloves.color).base, CARTOON.shadow, 0.3);
  for (let i = 0; i < w; i++) c.pc.set(x + i, y, i % 2 ? CARTOON.light : line);
}

/** Quilting over an oven mitt. */
function quilt(c: Ctx, x: number, y: number, w: number, h: number, r: Ramp) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if ((i + j) % 3 === 0) c.pc.set(x + i, y + j, r.shadow);
}

/** Hanging hand for the crazy gloves; false = paint the usual hand. */
function drawCrazyHand(c: Ctx, x: number, y: number, out: -1 | 1): boolean {
  const g = c.L.accessories.gloves;
  const pc = c.pc;
  switch (g.kind) {
    case "foam-finger":
      if (!foamHand(c, out)) return false;
      pc.rect(x, y, 2, 2, c.L.skin.base);
      pc.sprite(out < 0 ? x - 2 : x - 1, y - 1, foamDown(y - 1), foamColors(c));
      return true;
    case "cartoon": {
      // puffy white hand under a flared, ribbed cuff
      const mx = out < 0 ? x - 2 : x;
      cartoonCuff(c, out < 0 ? mx : mx - 1, y - 1, 5);
      pc.rect(mx, y, 4, 3, CARTOON.base);
      pc.set(mx, y, CARTOON.light);
      pc.vline(mx + 3, y + 1, 2, CARTOON.shadow);
      pc.hline(mx + 1, y + 2, 3, CARTOON.shadow);
      pc.set(out < 0 ? mx + 4 : mx - 1, y + 1, CARTOON.base); // thumb
      return true;
    }
    case "claws": {
      const h = rampFrom(g.color);
      pc.rect(x, y, 2, 2, h.base);
      pc.set(x + 1, y + 1, h.shadow);
      claws(c, out < 0 ? x - 1 : x - 1, y + 2, 1);
      return true;
    }
    case "oven-mitts": {
      const h = rampFrom(g.color);
      const mx = out < 0 ? x - 2 : x;
      pc.rect(mx, y - 1, 4, 5, h.base);
      quilt(c, mx, y, 4, 4, h);
      pc.hline(mx, y - 1, 4, h.light); // cuff
      pc.vline(mx + 3, y, 4, h.shadow);
      pc.rect(out < 0 ? mx + 4 : mx - 1, y + 1, 1, 2, h.base); // thumb
      return true;
    }
    default:
      return false;
  }
}

/** Extra glove detail on a big hand (raised / waving), its rect x, y, w, h, fingers up. */
function decorateBigHand(c: Ctx, x: number, y: number, w: number, h: number) {
  const g = c.L.accessories.gloves;
  switch (g.kind) {
    case "foam-finger":
      // only the foam hand waves and raises (viewer's right)
      c.pc.sprite(x - 1 + Math.floor((w - 4) / 2), y + h - FOAM_UP.length, FOAM_UP, foamColors(c));
      return;
    case "cartoon":
      cartoonCuff(c, x - 1, y + h, w + 1);
      return;
    case "claws":
      claws(c, x, y - 1, -1);
      return;
    case "oven-mitts": {
      const r = rampFrom(g.color);
      const mx = Math.min(x - 1, MAX_X - (w + 1)); // keep the mitt (and outline) in the frame
      c.pc.rect(mx, y - 1, w + 2, h + 1, r.base);
      quilt(c, mx, y - 1, w + 2, h + 1, r);
      c.pc.hline(mx, y + h, w + 2, r.light);
      return;
    }
    default:
  }
}

/** A 2x2 hand at (x, y) (a 3x3 mitt in boxing gloves), `out` = the side away from the body. */
function drawHand(c: Ctx, x: number, y: number, out: -1 | 1) {
  if (drawCrazyHand(c, x, y, out)) return;
  const h = handRamp(c);
  if (c.L.accessories.gloves.kind === "boxing") {
    const mx = out < 0 ? x - 1 : x;
    c.pc.rect(mx, y, 3, 3, h.base);
    c.pc.set(mx + 1, y, h.light);
    c.pc.vline(mx + 2, y + 1, 2, h.shadow);
    c.pc.hline(mx, y + 2, 2, h.shadow);
    return;
  }
  c.pc.rect(x, y, 2, 2, h.base);
  c.pc.set(x + 1, y + 1, h.shadow);
}

/** Cuff row: rolled sleeves (light band) or knitted cuffs of long sleeves. */
function isCuff(c: Ctx, k: number): boolean {
  const s = c.L.shirt;
  if (c.L.outer.kind === "varsity") return k === 9;
  if (c.L.outer.kind !== "none" && c.L.outer.kind !== "cape")
    return c.L.outer.kind === "bomber" && k === 9;
  if (s.sleeves === "rolled") return k === 6;
  return (
    s.sleeves === "long" &&
    k === 9 &&
    (s.kind === "longsleeve" || s.kind === "sweater" || s.kind === "hoodie")
  );
}

/** A straight 2-texel arm column from row y0 for `len` rows, hand below. */
function armColumn(c: Ctx, x: number, y0: number, len: number, dark: boolean, hand = true) {
  const skin = c.L.skin;
  const out: -1 | 1 = x < 16 ? -1 : 1;
  const ox = out < 0 ? x - 1 : x + 2;
  const o = c.L.outer;
  const g = c.L.accessories.gloves;
  const glove = g.kind === "long" && len >= 6 ? rampFrom(g.color) : null;
  const hidden = hiddenArms(c);
  for (let k = 0; k < len; k++) {
    if (hidden) continue;
    const y = y0 + k;
    if (glove && k >= len - 4) {
      // long gloves up the forearm
      c.pc.set(x, y, dark ? glove.shadow : glove.base);
      c.pc.set(x + 1, y, glove.shadow);
      continue;
    }
    const sl = sleeveAt(c, k);
    if (!sl) {
      c.pc.set(x, y, dark ? skin.shadow : skin.base);
      c.pc.set(x + 1, y, skin.shadow);
      continue;
    }
    const col = isCuff(c, k) ? sl.light : dark ? sl.shadow : sl.base;
    c.pc.set(x, y, col);
    c.pc.set(x + 1, y, dark ? sl.shadow : k < 2 ? sl.base : sl.shadow);
    if (puffAt(c, k)) c.pc.set(ox, y, k === 0 ? sl.light : sl.base);
    // kimono, wizard robe: wide sleeves hang below the arm
    else if ((o.kind === "kimono" || o.kind === "wizard-robe") && k >= 3)
      c.pc.set(ox, y, k === len - 1 ? sl.shadow : sl.base);
    // fur coat: shaggy sleeves; chainmail: rings
    else if (o.kind === "fur-coat" && (k + x) % 3 === 0) c.pc.set(ox, y, sl.light);
    if (o.kind === "chainmail") c.pc.set(x + (k % 2), y, sl.light);
    // track jacket: a stripe down the outside of the sleeve
    if (o.kind === "track-jacket") c.pc.set(out < 0 ? x : x + 1, y, trimColor(o));
  }
  if (hand) drawHand(c, x, y0 + len, out);
}

/** Front-view arm on the viewer's left (`side` -1) or right (+1) in the look's pose. */
function posedArm(c: Ctx, b: TorsoBox, side: -1 | 1, dark: boolean) {
  const pose = c.L.pose.hands;
  const T = b.T;
  const x = side < 0 ? c.tl - 2 : c.tr + 1;
  // a hand that holds something hangs relaxed (extras.ts draws the item at its hand); under a
  // poncho the arms hang too
  if (heldFront(c.L, side) !== "none" || hiddenArms(c)) {
    armColumn(c, x, T, 10, dark);
    return;
  }
  const inPocket = pose === "hands-in-pockets" || (pose === "hand-in-pocket" && side < 0);
  if (inPocket) {
    // upper arm hangs, elbow slightly out, forearm angles in, only knuckles show
    armColumn(c, x, T, 6, dark, false);
    const sl = sleeveAt(c, 7) ?? c.L.skin;
    const inward = -side; // toward the body
    const col = dark ? sl.shadow : sl.base;
    c.pc.set(x, T + 6, col);
    c.pc.set(x + 1, T + 6, sl.shadow);
    c.pc.set(x + (inward > 0 ? 1 : 0), T + 7, col);
    c.pc.set(x + (inward > 0 ? 2 : -1), T + 7, sl.shadow);
    const kx = side < 0 ? c.tl : c.tr - 1;
    c.pc.set(kx, T + 8, sl.shadow);
    c.pc.set(kx + inward, T + 8, col);
    // knuckles at the pocket opening
    const sk = handRamp(c);
    c.pc.set(kx + inward, T + 9, sk.base);
    c.pc.set(kx + 2 * inward, T + 9, sk.shadow);
    c.pc.set(kx + 2 * inward, T + 8, sk.base);
    return;
  }
  if (pose === "hands-on-hips") {
    const out = side;
    const sl = poseSleeve(c);
    armColumn(c, x, T, 3, dark, false);
    for (let k = 3; k < 6; k++) {
      const ox = x + out * (k - 2);
      c.pc.set(ox, T + k, dark ? sl.shadow : sl.base);
      c.pc.set(ox + 1, T + k, sl.shadow);
    }
    for (let k = 6; k < 8; k++) {
      const ox = x + out * (8 - k);
      c.pc.set(ox, T + k, dark ? sl.shadow : sl.base);
      c.pc.set(ox + 1, T + k, sl.shadow);
    }
    const hx = side < 0 ? c.tl - 1 : c.tr;
    c.pc.rect(hx, T + 7, 2, 2, handRamp(c).base);
    return;
  }
  if (pose === "arms-crossed") {
    armColumn(c, x, T, 5, dark, false);
    const sl = poseSleeve(c);
    const y = T + 5 + (side < 0 ? 0 : 1);
    const a = side < 0 ? c.tl - 2 : 15;
    const z = side < 0 ? 16 : c.tr + 2;
    for (let xx = a; xx <= z; xx++) {
      c.pc.set(xx, y, dark ? sl.shadow : sl.base);
      c.pc.set(xx, y + 1, sl.shadow);
    }
    const hx = side < 0 ? z - 1 : a;
    c.pc.rect(hx, y, 2, 2, handRamp(c).base);
    return;
  }
  armColumn(c, x, T, 10, dark);
}

export function drawArmsFront(c: Ctx, b: TorsoBox, arms: Arms, phase: number) {
  const T = b.T;
  const posed = c.posed;
  const waving = arms === "wave0" || arms === "wave1";
  // viewer's left arm
  if (posed || waving) posedArm(c, b, -1, false);
  else armColumn(c, c.tl - 2, T, phase === 1 ? 8 : 10, false);
  // viewer's right arm
  const rx = c.tr + 1;
  if (arms === "raise0" || arms === "raise1" || waving) {
    armColumn(c, rx, T, 3, true, false);
    if (!waving) return;
    const sl = poseSleeve(c);
    const sk = handRamp(c);
    if (arms === "wave0") {
      c.pc.rect(rx + 2, T - 13, 2, 16, sl.shadow);
      c.pc.vline(rx + 2, T - 13, 14, sl.base);
      c.pc.rect(rx + 1, T - 18, 4, 5, sk.base);
      c.pc.set(rx, T - 16, sk.base);
      c.pc.vline(rx + 4, T - 17, 4, sk.shadow);
      decorateBigHand(c, rx + 1, T - 18, 4, 5);
    } else {
      // hand swung outward; keep it (and its 2-texel outline) inside the frame
      const hx = rx - Math.max(0, rx + 7 - MAX_X);
      c.pc.rect(rx + 2, T - 9, 2, 11, sl.shadow);
      c.pc.vline(rx + 2, T - 9, 9, sl.base);
      c.pc.rect(hx + 4, T - 12, 2, 4, sl.shadow);
      c.pc.rect(hx + 4, T - 17, 4, 5, sk.base);
      c.pc.set(hx + 3, T - 15, sk.base);
      c.pc.vline(hx + 7, T - 16, 4, sk.shadow);
      decorateBigHand(c, hx + 4, T - 17, 4, 5);
    }
    return;
  }
  if (posed && c.L.pose.hands !== "relaxed" && c.L.pose.hands !== "hand-in-pocket") {
    posedArm(c, b, 1, true);
    return;
  }
  armColumn(c, rx, T, phase === 3 ? 8 : 10, true);
}

/** Raised hand drawn over the head's edge so it reads at a glance ("waiting for you!"). */
export function drawRaisedHand(c: Ctx, b: TorsoBox, arms: Arms) {
  if (arms !== "raise0" && arms !== "raise1") return;
  const sl = poseSleeve(c);
  const sk = handRamp(c);
  const lift = arms === "raise0" ? 0 : 2;
  const x = Math.min(c.tr + 3, MAX_X - 3); // old x13 -> 26 for an average torso
  const T = b.T;
  c.pc.rect(x, T - 6 + lift, 2, 8 - lift, sl.shadow);
  c.pc.rect(x + 2, T - 14 + lift, 2, 12, sl.base);
  c.pc.vline(x + 3, T - 14 + lift, 12, sl.shadow);
  c.pc.rect(x, T - 20 + lift, 4, 6, sk.base);
  c.pc.vline(x + 3, T - 19 + lift, 5, sk.shadow);
  c.pc.rect(x - 2, T - 18 + lift, 2, 2, sk.base); // thumb
  decorateBigHand(c, x, T - 20 + lift, 4, 6);
}

export function drawArmsBack(c: Ctx, b: TorsoBox, arms: Arms, phase: number) {
  const T = b.T;
  let lenL = phase === 3 ? 8 : 10;
  let lenR = phase === 1 ? 8 : 10;
  if (arms === "type0") {
    lenL = 6;
    lenR = 8;
  } else if (arms === "type1") {
    lenL = 8;
    lenR = 6;
  }
  const lx = c.tl - 2;
  const rx = c.tr + 1;
  // a cape covers the arms from behind
  const cape = c.L.outer.kind === "cape";
  if (!cape) armColumn(c, lx, T, lenL, true, arms === "down");
  if (arms === "book0" || arms === "book1") {
    const sk = handRamp(c);
    armColumn(c, rx, T, 3, true, false);
    c.pc.rect(rx - 2, T - 2, 4, 2, sk.base);
    const bx = rx - 2;
    const by = T - 12;
    c.pc.rect(bx, by, 8, 8, C.wine);
    c.pc.rect(bx, by, 2, 8, C.red);
    c.pc.hline(bx, by - 2, 8, C.cream);
    c.pc.hline(bx, by - 1, 8, C.cream);
    if (arms === "book1") {
      c.pc.rect(bx + 4, by - 4, 2, 2, C.cream);
      c.pc.rect(bx + 6, by - 6, 2, 4, C.white);
    }
    return;
  }
  if (!cape) armColumn(c, rx, T, lenR, true, arms === "down");
}

export function drawArmSide(c: Ctx, b: TorsoBox, phase: number) {
  const ax = phase === 1 ? -1 : phase === 3 ? 1 : 0;
  const T = b.T;
  const x = 14;
  const sk = c.L.skin;
  const o = c.L.outer;
  const g = c.L.accessories.gloves;
  const glove = g.kind === "long" ? rampFrom(g.color) : null;
  const hidden = hiddenArms(c);
  for (let k = 0; k < 10; k++) {
    if (hidden) continue;
    const off = k < 4 ? 0 : k < 8 ? ax * 2 : ax * 4;
    const sl = glove && k >= 6 ? glove : sleeveAt(c, k);
    const xx = x + off;
    if (!sl) {
      c.pc.hline(xx, T + k, 3, sk.base);
      c.pc.set(xx + 3, T + k, sk.shadow);
      continue;
    }
    const base = isCuff(c, k) && sl !== glove ? sl.light : sl.base;
    c.pc.set(xx, T + k, k < 3 ? sl.light : base);
    c.pc.hline(xx + 1, T + k, 2, base);
    c.pc.set(xx + 3, T + k, sl.shadow);
    if (puffAt(c, k)) {
      c.pc.set(xx - 1, T + k, sl.base);
      c.pc.set(xx + 4, T + k, sl.shadow);
    }
    if ((o.kind === "kimono" || o.kind === "wizard-robe") && k >= 4)
      c.pc.set(xx + 4, T + k, sl.shadow);
    if (o.kind === "fur-coat" && k % 3 === 1) c.pc.set(xx + 4, T + k, sl.light);
    if (o.kind === "chainmail" && sl !== glove) c.pc.set(xx + 1 + (k % 2), T + k, sl.light);
    if (o.kind === "track-jacket" && sl !== glove) c.pc.set(xx + 1, T + k, trimColor(o));
  }
  const h = handRamp(c);
  const boxing = g.kind === "boxing";
  c.pc.rect(x + ax * 4, T + 10, 4, boxing ? 3 : 2, h.base);
  c.pc.set(x + ax * 4 + 3, T + 11, h.shadow);
  if (boxing) {
    c.pc.hline(x + ax * 4, T + 12, 4, h.shadow);
    c.pc.set(x + ax * 4 + 1, T + 10, h.light);
  }
  if (!hidden) drawCrazySideHand(c, x + ax * 4, T + 10);
  if (agentMark(c) && !hidden) {
    const a = c.r.agentRamp;
    c.pc.hline(x, T + 4, 4, a.base);
    c.pc.hline(x, T + 5, 3, a.base);
    c.pc.set(x + 3, T + 5, a.shadow);
  }
}

export function drawMug(c: Ctx, x: number, y: number) {
  c.pc.rect(x, y + 1, 4, 5, C.white);
  c.pc.hline(x, y, 4, C.silver);
  c.pc.vline(x + 3, y + 1, 5, C.silver);
  c.pc.vline(x + 4, y + 2, 2, C.white);
  c.pc.hline(x + 1, y + 1, 2, C.cocoa);
}

/** Side view (WD12): the near hand is the left one, so it wears the foam finger. */
function drawCrazySideHand(c: Ctx, x: number, y: number) {
  const g = c.L.accessories.gloves;
  const pc = c.pc;
  switch (g.kind) {
    case "foam-finger":
      pc.sprite(x - 1, y - 1, foamDown(y - 1), foamColors(c));
      return;
    case "cartoon":
      cartoonCuff(c, x - 1, y - 1, 5);
      pc.rect(x, y, 4, 3, CARTOON.base);
      pc.set(x, y, CARTOON.light);
      pc.vline(x + 3, y + 1, 2, CARTOON.shadow);
      pc.hline(x, y + 2, 3, CARTOON.shadow);
      return;
    case "claws":
      claws(c, x, y + 2, 1);
      return;
    case "oven-mitts": {
      const r = rampFrom(g.color);
      pc.rect(x - 1, y - 1, 5, 5, r.base);
      quilt(c, x - 1, y, 5, 4, r);
      pc.hline(x - 1, y - 1, 5, r.light);
      pc.vline(x + 3, y, 4, r.shadow);
      pc.rect(x - 2, y + 1, 1, 2, r.base); // thumb
      return;
    }
    default:
  }
}
