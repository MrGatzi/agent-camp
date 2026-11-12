/**
 * Crazy wardrobe shoes (WD12): clown shoes, bunny slippers, flippers, moon boots, ice skates and
 * rocket boots. Same conventions as the shoe painters in legs.ts: feet stand on texel row 43
 * (y1), a front/back foot covers columns x..x+w-1, a side foot runs from its toe to the heel at
 * `hx` (facing left). Rocket flames reach below the feet, into the rows under the outline.
 */
import { lighten, luma, mix, NIGHT, optOrNull } from "./color.ts";
import type { Ctx } from "./ctx.ts";

const FEET = 43;
const SILVER = "#c0cbdc";
const STEEL = "#8b9bb4";
const GUNMETAL = "#5a6988";
const PINK = "#f6757a";
const FLAME = ["#fee761", "#feae34", "#f77622", "#e43b44"] as const;

/** A sole colour that does not vanish into the outline. */
const soleOf = (sole: string, fallback: string) => (luma(sole) < 0.15 ? fallback : sole);

/** WD12 shoe kinds painted here. */
export const CRAZY_SHOES = new Set([
  "clown-shoes",
  "bunny-slippers",
  "flippers",
  "moon-boots",
  "ice-skates",
  "rocket-boots",
]);

/**
 * Rocket flames under a sole spanning x..x+w-1 (row y = the first row below the sole). Seated
 * feet sit two rows lower, so their flames are a short puff that keeps the outline in frame.
 */
function flames(c: Ctx, x: number, w: number, y: number) {
  const pc = c.pc;
  const flick = (c.f.phase + (c.f.bob ? 1 : 0)) % 2;
  const short = c.f.seat !== "none";
  pc.hline(x, y, w, FLAME[1]);
  pc.hline(x + 1, y, w - 2, FLAME[0]);
  if (short) return;
  pc.hline(x + 1, y + 1, w - 2, FLAME[2]);
  pc.set(x + 1 + flick, y + 1, FLAME[1]);
  pc.set(x + 1 + ((w - 3 + flick) % (w - 2)), y + 2, FLAME[3]);
}

/**
 * Front/back WD12 shoe for one foot. `toe` = -1 points left, +1 right, 0 straight; `dark` is
 * the foot on the viewer's right (it bulges right, the other one left).
 */
export function crazyShoeFront(
  c: Ctx,
  x: number,
  w: number,
  toe: number,
  back: boolean,
  dark: boolean,
) {
  const s = c.L.shoes;
  const r = s.ramp;
  const pc = c.pc;
  const acc = optOrNull(s.accent);
  const laces = optOrNull(s.laces);
  const base = dark ? r.shadow : r.base;
  const y1 = FEET;
  const y0 = FEET - 1;
  /** -1 = this foot's outer side is on the left */
  const out = toe !== 0 ? toe : dark ? 1 : -1;
  switch (s.kind) {
    case "clown-shoes": {
      // huge round toes bulging outward and toward the viewer (one row below the feet), a big
      // lace bow on the instep
      const a = out < 0 ? x - 5 : x - 1;
      const z = out < 0 ? x + w : x + w + 4;
      const sole = soleOf(s.sole, r.shadow);
      if (back) {
        // from behind: the heels, the bulbs peeking out at the sides
        pc.hline(a + 1, y0 - 2, z - a - 1, r.shadow);
        pc.hline(a, y0 - 1, z - a + 1, r.shadow);
        pc.hline(a, y0, z - a + 1, r.shadow);
        pc.hline(a, y1, z - a + 1, sole);
        for (let y = y0 - 3; y <= y0; y++) pc.hline(x, y, w, mix(r.shadow, NIGHT, 0.2));
        pc.hline(x, y0 - 3, w, acc ?? r.base);
        return;
      }
      pc.hline(x, y0 - 3, w, base);
      pc.hline(a + 1, y0 - 2, z - a - 1, base);
      for (let y = y0 - 1; y <= y1; y++) pc.hline(a, y, z - a + 1, base);
      pc.hline(a, y1, z - a + 1, dark ? mix(r.shadow, NIGHT, 0.2) : r.shadow);
      pc.hline(a + 1, y1 + 1, z - a - 1, sole);
      // shine on the bulb
      const sx = out < 0 ? a + 1 : z - 3;
      pc.set(sx + 1, y0 - 2, lighten(r.light, 0.5));
      pc.set(sx, y0 - 1, lighten(r.light, 0.5));
      pc.set(sx + 1, y0 - 1, r.light);
      pc.set(sx + 2, y0 - 2, r.light);
      pc.set(sx, y0, r.light);
      const bow = laces ?? acc ?? "#ffffff";
      const knot = mix(bow, NIGHT, 0.25);
      pc.set(x, y0 - 3, bow);
      pc.set(x + w - 1, y0 - 3, bow);
      pc.set(x + 1, y0 - 3, knot);
      pc.set(x + 2, y0 - 3, knot);
      pc.set(x, y0 - 2, bow);
      pc.set(x + w - 1, y0 - 2, bow);
      return;
    }
    case "bunny-slippers": {
      // fluffy bunny heads: long ears up the shin, eyes, a pink nose; a cotton tail behind
      const fur = back ? mix(r.base, r.shadow, 0.5) : r.base;
      const inner = acc ?? PINK;
      const a = x - 1;
      const z = x + w;
      pc.hline(a + 1, y0 - 2, w, fur);
      pc.hline(a, y0 - 1, w + 2, fur);
      pc.hline(a, y0, w + 2, fur);
      pc.hline(a, y1, w + 2, mix(r.base, r.shadow, 0.6));
      pc.set(a, y1, r.shadow);
      pc.set(z, y1, r.shadow);
      // ears: the outer one stands up, the inner one flops over
      const ox = out < 0 ? x : x + w - 1;
      const ix = out < 0 ? x + w - 1 : x;
      const fl = out < 0 ? 1 : -1;
      pc.vline(ox, y0 - 5, 3, fur);
      pc.vline(ix, y0 - 4, 2, fur);
      pc.set(ix + fl, y0 - 5, fur);
      if (!back) {
        pc.vline(ox, y0 - 4, 2, inner);
        pc.set(ix, y0 - 3, inner);
        pc.set(x, y0 - 1, NIGHT);
        pc.set(x + w - 1, y0 - 1, NIGHT);
        pc.set(x + 1, y0, inner);
        pc.set(x + 2, y0, inner);
        pc.set(out < 0 ? a : z, y0 - 1, r.light);
      } else {
        // pom-pom tail
        pc.set(x + 1, y0 - 1, "#ffffff");
        pc.set(x + 2, y0 - 1, "#ffffff");
        pc.set(x + 1, y0, lighten(r.light, 0.5));
        pc.set(x + 2, y0, lighten(r.light, 0.5));
      }
      return;
    }
    case "flippers": {
      // diving fins: a foot pocket, then a long blade reaching toward the viewer (below the
      // feet; a seated foot is already two rows lower, so its blade is shorter)
      const a = out < 0 ? x - 3 : x - 1;
      const z = out < 0 ? x + w : x + w + 2;
      const rib = mix(r.base, r.shadow, 0.7);
      const tip = c.f.seat === "none" ? y1 + 2 : y1 + 1;
      pc.hline(x, y0 - 1, w, acc ?? r.shadow);
      pc.hline(x, y0, w, back ? r.shadow : r.base);
      if (back) {
        pc.hline(x, y0, w, mix(r.shadow, NIGHT, 0.25)); // heel strap
        pc.hline(a + 1, y1, z - a - 1, r.shadow);
        pc.set(a, y1, r.shadow);
        pc.set(z, y1, r.shadow);
        return;
      }
      pc.hline(x - 1, y1, w + 2, r.base);
      for (let y = y1 + 1; y <= tip; y++) pc.hline(a, y, z - a + 1, y === tip ? r.light : r.base);
      for (let y = y1; y < tip; y++)
        for (let i = a + 1; i < z; i += 2) if (i >= x - 1 && i <= x + w) pc.set(i, y, rib);
      for (let y = y1 + 1; y < tip; y++) for (let i = a + 1; i < z; i += 2) pc.set(i, y, rib);
      pc.set(out < 0 ? a + 1 : z - 1, tip, lighten(r.light, 0.4));
      return;
    }
    case "moon-boots": {
      // big puffy quilted boots on a thick sole
      const a = x - 1;
      const z = x + w;
      const top = FEET - 6;
      const sole = soleOf(s.sole, SILVER);
      pc.hline(a + 1, top, w, acc ?? r.light);
      for (let y = top + 1; y <= y0; y++) pc.hline(a, y, w + 2, base);
      pc.hline(a, top + 1, w + 2, acc ?? r.light);
      // quilting
      const seam = dark ? mix(r.shadow, NIGHT, 0.25) : r.shadow;
      pc.hline(a, top + 3, w + 2, seam);
      if (!dark) pc.vline(a, top + 2, 3, r.light);
      pc.set(z, top + 2, seam);
      pc.hline(a, y1, w + 2, sole);
      pc.hline(a, y0, w + 2, mix(sole, NIGHT, 0.12));
      pc.set(a, y1, mix(sole, NIGHT, 0.3));
      pc.set(z, y1, mix(sole, NIGHT, 0.3));
      if (!back) {
        // a velcro strap
        pc.hline(x, top + 4, w, laces ?? mix(r.light, "#ffffff", 0.3));
        pc.set(x + w - 1, top + 4, laces ? mix(laces, NIGHT, 0.3) : r.shadow);
      }
      return;
    }
    case "ice-skates": {
      // lace-up boots lifted on a steel blade
      const top = FEET - 6;
      for (let y = top; y <= y0 - 1; y++) pc.hline(x, y, w, base);
      pc.hline(x, top, w, acc ?? r.light);
      if (!back) {
        const lc = laces ?? mix(base, NIGHT, 0.3);
        for (let y = top + 2; y < y0 - 1; y += 2) pc.hline(x + 1, y, 2, lc);
        pc.hline(x, y0 - 1, w, dark ? r.shadow : r.base);
        pc.set(x + (toe < 0 ? 0 : w - 1), y0 - 1, r.light);
      } else pc.hline(x + 1, y0 - 1, 2, mix(base, NIGHT, 0.3)); // heel
      // the blade runs toward the viewer: one row longer than the foot when standing
      pc.hline(x + 1, y0, 2, STEEL); // blade holder
      const tip = c.f.seat === "none" ? y1 + 1 : y1;
      for (let y = y1; y <= tip; y++) pc.hline(x + 1, y, 2, SILVER);
      pc.set(x + 1, y1, "#ffffff");
      return;
    }
    case "rocket-boots": {
      // chunky metal boots with fins, nozzles and fire coming out of the soles
      const top = FEET - 5;
      for (let y = top; y <= y0; y++) pc.hline(x, y, w, base);
      pc.hline(x, top, w, r.light);
      if (!dark) pc.vline(x + 1, top + 1, 3, lighten(r.base, 0.35));
      const fin = acc ?? "#e43b44";
      const fx = out < 0 ? x - 1 : x + w;
      pc.vline(fx, y0 - 2, 3, fin);
      pc.set(fx, y0 - 3, mix(fin, "#ffffff", 0.3));
      if (!back) pc.hline(x, top + 2, w, laces ?? fin);
      pc.hline(x, y1, w, GUNMETAL);
      pc.set(x, y1, mix(GUNMETAL, NIGHT, 0.4));
      pc.set(x + w - 1, y1, mix(GUNMETAL, NIGHT, 0.4));
      flames(c, x, w, y1 + 1);
      return;
    }
    default:
  }
}

/** Side WD12 shoe (facing left), heel at `hx`, `len` = an ordinary shoe's length. */
export function crazyShoeSide(c: Ctx, hx: number, len: number) {
  const s = c.L.shoes;
  const r = s.ramp;
  const pc = c.pc;
  const acc = optOrNull(s.accent);
  const laces = optOrNull(s.laces);
  const y1 = FEET;
  const y0 = y1 - 1;
  const walking = len < 8;
  switch (s.kind) {
    case "clown-shoes": {
      // twice as long, ending in a big round bulb
      const tx = hx - len - (walking ? 4 : 5);
      const sole = soleOf(s.sole, r.shadow);
      pc.hline(hx - 3, y0 - 2, 4, r.base);
      pc.hline(tx + 4, y0 - 1, hx - tx - 3, r.base);
      pc.hline(tx, y0, hx - tx + 1, r.base);
      pc.hline(tx, y1, hx - tx + 1, sole);
      // the bulb rises at the toe
      pc.hline(tx + 1, y0 - 3, 3, r.base);
      pc.hline(tx, y0 - 2, 5, r.base);
      pc.hline(tx, y0 - 1, 5, r.base);
      pc.set(tx + 1, y0 - 2, lighten(r.light, 0.4));
      pc.set(tx + 2, y0 - 3, r.light);
      pc.set(tx + 1, y0 - 1, r.light);
      pc.hline(tx + 1, y0, hx - tx - 1, r.shadow);
      const bow = laces ?? acc ?? "#ffffff";
      pc.set(hx - 3, y0 - 2, bow);
      pc.set(hx - 4, y0 - 3, bow);
      pc.set(hx - 2, y0 - 3, bow);
      pc.set(hx - 3, y0 - 3, mix(bow, NIGHT, 0.25));
      pc.set(hx, y1, mix(sole, NIGHT, 0.3));
      return;
    }
    case "bunny-slippers": {
      const tx = hx - len + 1;
      const inner = acc ?? PINK;
      pc.hline(tx + 1, y0 - 1, len - 2, r.base);
      pc.hline(tx, y0, len, r.base);
      pc.hline(tx, y1, len, mix(r.base, r.shadow, 0.6));
      // ears up and back from the toe, eye, nose, tail
      pc.vline(tx + 2, y0 - 4, 3, r.base);
      pc.vline(tx + 3, y0 - 4, 3, inner);
      pc.set(tx + 4, y0 - 3, r.base);
      pc.set(tx + 4, y0 - 2, r.base);
      pc.set(tx + 1, y0, NIGHT);
      pc.set(tx, y0, inner);
      pc.set(hx + 1, y0, "#ffffff");
      pc.set(hx + 1, y0 - 1, "#ffffff");
      return;
    }
    case "flippers": {
      // a long flat blade far ahead of the toes
      const tx = hx - len - (walking ? 4 : 5);
      pc.hline(hx - 4, y0 - 1, 5, acc ?? r.shadow);
      pc.hline(hx - 5, y0, 6, r.base);
      pc.hline(tx, y1, hx - tx + 1, r.base);
      pc.hline(tx, y0, 3, r.light); // the tip flips up a little
      pc.set(tx, y0 - 1, r.light);
      for (let i = tx + 3; i < hx - 4; i += 2) pc.set(i, y1, mix(r.base, r.shadow, 0.7));
      pc.set(hx, y1, mix(r.base, NIGHT, 0.3));
      return;
    }
    case "moon-boots": {
      const tx = hx - len;
      const top = y1 - 6;
      const sole = soleOf(s.sole, SILVER);
      for (let y = top + 1; y <= y0 - 2; y++) pc.hline(hx - 4, y, 6, r.base);
      pc.hline(hx - 3, top, 4, acc ?? r.light);
      pc.hline(hx - 4, top + 1, 6, acc ?? r.light);
      pc.hline(tx + 1, y0 - 1, hx - tx + 1, r.base);
      pc.hline(tx, y0, hx - tx + 2, mix(sole, NIGHT, 0.12));
      pc.hline(tx, y1, hx - tx + 2, sole);
      pc.hline(hx - 4, top + 3, 6, r.shadow);
      pc.set(tx + 1, y0 - 1, r.light);
      pc.hline(hx - 3, top + 4, 3, laces ?? mix(r.light, "#ffffff", 0.3));
      return;
    }
    case "ice-skates": {
      const tx = hx - len + 1;
      const top = y1 - 6;
      for (let y = top; y <= y0 - 1; y++)
        pc.hline(y >= y0 - 2 ? tx + 1 : hx - 3, y, y >= y0 - 2 ? len - 1 : 4, r.base);
      pc.hline(hx - 3, top, 4, acc ?? r.light);
      for (let y = top + 1; y < y0 - 1; y++) pc.set(hx - 3, y, laces ?? r.light);
      pc.set(tx + 1, y0 - 2, r.light);
      pc.set(tx + 2, y0, STEEL); // blade holders
      pc.set(hx - 1, y0, STEEL);
      pc.hline(tx, y1, len + 1, SILVER);
      pc.set(tx - 1, y0, SILVER); // curled toe pick
      pc.set(tx + 3, y1, "#ffffff");
      return;
    }
    case "rocket-boots": {
      const tx = hx - len + 1;
      const fin = acc ?? "#e43b44";
      for (let y = y1 - 5; y <= y0; y++)
        pc.hline(y >= y0 - 1 ? tx : hx - 3, y, y >= y0 - 1 ? len : 4, r.base);
      pc.hline(hx - 3, y1 - 5, 4, r.light);
      pc.vline(hx + 1, y0 - 3, 4, fin); // tail fin
      pc.set(hx + 2, y0 - 1, fin);
      pc.set(hx + 2, y0, fin);
      pc.set(tx, y0 - 1, r.light);
      pc.hline(tx + 1, y1, len - 2, GUNMETAL);
      flames(c, hx - 4, 4, y1 + 1);
      return;
    }
    default:
  }
}
