/**
 * Lower body: bottoms (hip block + legs, lederhosen details), bare legs / legwear, shoes.
 * Standing front/back/side and the seated-front lap. Feet stand on texel row 43.
 */
import type { CharacterLook } from "@agent-office/protocol";
import { hash2, luma, mix, NIGHT, opt, optOrNull } from "./color.ts";
import type { Ctx } from "./ctx.ts";
import { type Fabric, fabricAt } from "./patterns.ts";
import type { TorsoBox } from "./torso.ts";
import { underwearLegAt } from "./underwear.ts";

type Bottoms = CharacterLook["bottoms"];

const SHORT_KINDS = new Set<Bottoms["kind"]>(["shorts", "lederhosen"]);
const SKIRTS = new Set<Bottoms["kind"]>(["skirt", "dress"]);

/**
 * Skirt-like bottoms (WD1): last standing row and how many texels each side flares out at row
 * k below the waistband. skirt / dress keep the original shape.
 */
type SkirtShape = { end: number; flare: (k: number) => number };
const SKIRT_SHAPES: Partial<Record<Bottoms["kind"], SkirtShape>> = {
  skirt: { end: 39, flare: (k) => Math.floor(k / 3) },
  dress: { end: 39, flare: (k) => Math.floor(k / 3) },
  "mini-skirt": { end: 36, flare: (k) => Math.floor(k / 3) },
  "pencil-skirt": { end: 39, flare: () => 0 },
  "pleated-skirt": { end: 39, flare: (k) => Math.min(3, Math.floor(k / 2)) },
  kilt: { end: 39, flare: (k) => Math.floor(k / 4) },
  // full and gathered: puffs out right under the waistband
  "dirndl-skirt": { end: 41, flare: (k) => (k < 1 ? 0 : Math.min(3, 1 + Math.floor((k - 1) / 3))) },
  "maxi-skirt": { end: 42, flare: (k) => Math.floor(k / 4) },
  // floor length, wide at the bottom
  gown: { end: 42, flare: (k) => Math.min(4, Math.floor((k * 2) / 5)) },
};
const skirtShape = (kind: Bottoms["kind"]): SkirtShape | undefined => SKIRT_SHAPES[kind];

/** Last row covered by the bottoms on a standing leg. */
function legEnd(bt: Bottoms): number {
  if (SHORT_KINDS.has(bt.kind)) return 38;
  if (bt.kind === "kneebund-lederhosen") return 40;
  if (SKIRTS.has(bt.kind)) return 39;
  const sk = skirtShape(bt.kind);
  if (sk) return sk.end;
  switch (bt.kind) {
    case "none":
      return 37; // nothing on the legs
    case "tutu":
      return 36;
    case "bike-shorts":
      return 39;
    case "leggings":
      return 42;
    default:
      return 41;
  }
}

const FEET = 43;

type Legs = { lx: number; rx: number; w: number };
function legCols(wide: boolean): Legs {
  return wide ? { lx: 9, rx: 19, w: 4 } : { lx: 10, rx: 18, w: 4 };
}

function fabric(bt: Bottoms): Fabric {
  return { ramp: bt.ramp, pattern: bt.pattern, salt: 13 };
}

/** Legwear/skin colour of one leg texel at `row` (rows below the bottoms). */
function legSkinOrWear(c: Ctx, row: number, dark: boolean, x: number): string {
  const lw = c.L.legwear;
  const sk = c.L.skin;
  const skin = dark ? sk.shadow : sk.base;
  const wear = dark ? mix(lw.color, NIGHT, 0.2) : lw.color;
  const acc = optOrNull(lw.accent);
  switch (lw.kind) {
    case "none":
      return skin;
    case "ankle-socks":
      return row >= FEET - 2 ? wear : skin;
    case "crew-socks":
      if (acc && row === FEET - 3) return acc;
      return row >= FEET - 3 ? wear : skin;
    case "knee-socks":
      // folded top band below the knee
      if (row === 39) return acc ?? mix(lw.color, "#ffffff", 0.25);
      return row >= 39 ? wear : skin;
    case "loferl":
      // calf warmers: knit band on the calf, bare ankle
      if (row === 39 || row === 40)
        return acc && row === 39 ? acc : (x + row) % 2 ? wear : mix(wear, NIGHT, 0.15);
      return skin;
    case "tights":
      return wear;
    case "stockings": {
      // sheer: half skin, half colour; a slightly darker welt at the top
      const sheer = mix(skin, wear, 0.5);
      return row === 38 ? mix(sheer, NIGHT, 0.12) : sheer;
    }
    case "fishnets":
      // a diamond net of the colour over the skin
      return (x + row) % 3 === 0 || (x - row + 30) % 3 === 0 ? wear : skin;
    case "thigh-highs": {
      // over the knee: a lace band at the top, just below whatever covers the thigh
      const top = thighTop(c.L.bottoms);
      if (row < top) return skin;
      if (row <= top + 1) return (x + row) % 2 ? (acc ?? mix(lw.color, "#ffffff", 0.35)) : wear;
      return wear;
    }
    case "leg-warmers":
      // bunched knit on the shins, ribbed
      if (row >= 39 && row <= 41) return row % 2 ? wear : mix(wear, NIGHT, 0.18);
      return skin;
    default:
      return wear;
  }
}

/** First standing row of the leg that the bottoms leave bare (thigh-high tops sit there). */
function thighTop(bt: Bottoms): number {
  return Math.max(36, bt.kind === "none" ? 36 : legEnd(bt) + 1);
}

/** A bare leg texel: underwear on the thighs, else legwear / skin. */
function bareLeg(c: Ctx, row: number, dark: boolean, x: number): string {
  return underwearLegAt(c, row, x, dark) ?? legSkinOrWear(c, row, dark, x);
}

// ---- shoes ------------------------------------------------------------------------------------
/** Front/back shoe for one foot. `toe` = -1 points left, +1 right, 0 straight. */
function shoeFront(c: Ctx, x: number, w: number, toe: number, back: boolean, dark: boolean) {
  const s = c.L.shoes;
  const r = s.ramp;
  const pc = c.pc;
  const acc = optOrNull(s.accent);
  const laces = optOrNull(s.laces);
  const base = dark ? r.shadow : r.base;
  const y1 = FEET;
  const y0 = FEET - 1;
  const ta = toe < 0 ? x - 1 : x;
  const tz = toe > 0 ? x + w : x + w - 1;
  switch (s.kind) {
    case "sneakers":
    case "high-tops": {
      const top = s.kind === "high-tops" ? FEET - 4 : FEET - 2;
      for (let y = top; y <= y1; y++) for (let xx = x; xx < x + w; xx++) pc.set(xx, y, base);
      pc.hline(ta, y0, tz - ta + 1, base);
      pc.hline(ta, y1, tz - ta + 1, s.sole);
      pc.set(toe > 0 ? tz : ta, y1, mix(s.sole, NIGHT, 0.15));
      if (back) {
        // heel tab + collar from behind
        if (acc) {
          pc.hline(x, top, w, acc);
          pc.rect(x + 1, top + 1, w - 2, 1, acc);
        }
      } else {
        // collar at the ankle sides, tongue + laces in the middle
        if (acc) {
          const ox = toe < 0 || (toe === 0 && !dark) ? x : x + w - 1;
          pc.set(ox, top, acc);
          pc.set(ox, top + 1, acc);
          pc.set(ox === x ? x + w - 1 : x, top, acc);
        }
        if (s.kind === "high-tops") {
          pc.set(toe < 0 ? x : x + w - 1, FEET - 2, acc ?? r.light);
          for (let y = top; y < y1; y += 2) pc.hline(x + 1, y, w - 2, laces ?? r.light);
        } else {
          pc.hline(x + 1, y0, w - 2, laces ?? r.light);
          pc.set(x + 1, y0, r.shadow);
        }
      }
      return;
    }
    case "boots": {
      const top = FEET - 5;
      for (let y = top; y <= y1; y++) for (let xx = x; xx < x + w; xx++) pc.set(xx, y, base);
      pc.hline(ta, y1, tz - ta + 1, s.sole);
      pc.hline(ta, y0, tz - ta + 1, base);
      pc.hline(x, top, w, r.light);
      if (acc) pc.hline(x, top + 1, w, acc);
      if (laces && !back) for (let y = top + 1; y < y0; y += 2) pc.set(x + 1, y, laces);
      return;
    }
    case "haferl": {
      const top = FEET - 2;
      for (let y = top; y <= y1; y++) pc.hline(x, y, w, base);
      pc.hline(ta, y0, tz - ta + 1, base);
      pc.hline(ta, y1, tz - ta + 1, s.sole);
      // side lacing on the outer side
      const lx = toe < 0 ? x : x + w - 1;
      pc.set(lx, top, laces ?? r.light);
      pc.set(lx, top + 1, acc ?? r.shadow);
      pc.set(x + 1, top, r.light);
      return;
    }
    case "loafers":
    case "heels": {
      for (let y = y0; y <= y1; y++) pc.hline(x, y, w, base);
      pc.hline(ta, y1, tz - ta + 1, base);
      pc.set(toe > 0 ? tz : ta, y1, r.shadow);
      if (s.kind === "loafers") {
        if (acc) pc.hline(x + 1, y0, w - 2, acc);
        else pc.set(x + 1, y0, r.light);
      } else {
        pc.set(x + (back ? 1 : w - 1), y1, s.sole);
        if (!back) pc.hline(x + 1, y0, w - 2, mix(base, c.L.skin.base, 0.5));
        if (acc) pc.set(x, y0, acc);
      }
      return;
    }
    case "sandals": {
      const sk = c.L.skin;
      pc.hline(ta, y0, tz - ta + 1, sk.base);
      pc.hline(x, y0, w, base);
      pc.set(x + 1, y0, sk.base);
      pc.hline(ta, y1, tz - ta + 1, s.sole);
      if (acc) pc.set(x + 2, y0, acc);
      return;
    }
    case "slippers": {
      for (let y = y0 - 1; y <= y1; y++) pc.hline(ta, y, tz - ta + 1, base);
      pc.hline(ta, y0 - 1, tz - ta + 1, r.light);
      pc.set(ta, y0 - 1, base);
      if (acc) pc.set(x + 1, y0, acc);
      return;
    }
    default:
      shoeFrontMore(c, x, w, toe, back, dark);
  }
}

/** A sole colour that does not vanish into the outline. */
const soleOf = (sole: string, fallback: string) => (luma(sole) < 0.15 ? fallback : sole);
const WOOD = "#b07a4f";

/** Wardrobe shoes (WD1), front/back, same conventions as shoeFront. */
function shoeFrontMore(c: Ctx, x: number, w: number, toe: number, back: boolean, dark: boolean) {
  const s = c.L.shoes;
  const r = s.ramp;
  const pc = c.pc;
  const sk = c.L.skin;
  const acc = optOrNull(s.accent);
  const laces = optOrNull(s.laces);
  const base = dark ? r.shadow : r.base;
  const y1 = FEET;
  const y0 = FEET - 1;
  const ta = toe < 0 ? x - 1 : x;
  const tz = toe > 0 ? x + w : x + w - 1;
  const tip = toe > 0 ? tz : ta;
  const skin = dark ? sk.shadow : sk.base;
  switch (s.kind) {
    case "none": {
      // barefoot: the foot in skin, toes a touch wider, a soft shadow between them
      pc.hline(x, y0, w, skin);
      pc.hline(ta, y1, tz - ta + 1, skin);
      if (!back) {
        pc.set(x + 1, y1, sk.shadow);
        pc.set(tip, y1, sk.light);
      } else pc.set(x + w - 1, y1, sk.shadow);
      return;
    }
    case "oxfords": {
      pc.hline(x, y0, w, base);
      pc.hline(ta, y1, tz - ta + 1, base);
      if (!back) {
        // laced vamp, polished toe cap
        pc.hline(x + 1, y0, 2, laces ?? r.shadow);
        pc.set(tip, y1, r.light);
      } else pc.hline(x, y1, w, mix(base, NIGHT, 0.25)); // heel
      if (acc) pc.set(back ? x + 1 : x, y0, acc);
      return;
    }
    case "ballet-flats": {
      // low cut: the top of the foot shows
      pc.hline(x, y0, w, back ? base : skin);
      pc.set(x, y0, base);
      pc.set(x + w - 1, y0, base);
      pc.hline(ta, y1, tz - ta + 1, base);
      pc.set(tip, y1, r.shadow);
      if (!back) pc.set(x + 1, y0, acc ?? r.light); // tiny bow
      return;
    }
    case "platforms": {
      const sole = soleOf(s.sole, r.light);
      pc.hline(x, y0 - 1, w, base);
      if (!back) pc.hline(x, y0 - 1, w, acc ?? r.light); // ankle strap
      pc.hline(ta, y0, tz - ta + 1, sole);
      pc.hline(ta, y1, tz - ta + 1, mix(sole, NIGHT, 0.2));
      pc.set(x + 1, y0 - 1, base);
      return;
    }
    case "flip-flops": {
      pc.hline(x, y0, w, skin);
      pc.hline(ta, y1, tz - ta + 1, base);
      if (!back) {
        // thong strap between the toes
        pc.set(x + 1, y0, acc ?? r.light);
        pc.set(x + 2, y0, acc ?? r.light);
      }
      return;
    }
    case "rain-boots": {
      const top = FEET - 4;
      for (let y = top; y <= y0; y++) pc.hline(x, y, w, base);
      pc.hline(ta, y1, tz - ta + 1, mix(base, NIGHT, 0.35));
      pc.hline(x, top, w, r.shadow);
      // glossy rubber
      if (!dark) pc.vline(x + 1, top + 1, 2, r.light);
      else pc.set(x + 1, top + 1, r.base);
      if (acc) pc.set(x + w - 1, top + 1, acc);
      return;
    }
    case "cowboy-boots": {
      const top = FEET - 4;
      for (let y = top; y <= y0; y++) pc.hline(x, y, w, base);
      // scalloped shaft top, decorative stitching
      pc.hline(x + 1, top, w - 2, skin);
      const st = acc ?? r.light;
      pc.set(x + 1, top + 1, st);
      pc.set(x + 2, top + 2, st);
      pc.hline(ta, y1, tz - ta + 1, base);
      if (back)
        pc.hline(x + 1, y1, 2, mix(base, NIGHT, 0.4)); // heel
      else if (toe !== 0)
        pc.set(toe > 0 ? tz + 1 : ta - 1, y1, base); // pointed toe
      else pc.set(x + 1, y1, r.light);
      return;
    }
    case "clogs": {
      pc.hline(x + 1, y0 - 1, w - 2, base);
      pc.hline(x, y0, w, base);
      pc.set(x + 1, y0 - 1, r.light);
      pc.hline(ta, y1, tz - ta + 1, WOOD);
      pc.set(tip, y1, mix(WOOD, NIGHT, 0.25));
      return;
    }
    case "crocs": {
      for (let y = y0 - 1; y <= y1; y++)
        pc.hline(y === y0 - 1 ? x : ta, y, y === y0 - 1 ? w : tz - ta + 1, base);
      const hole = mix(base, NIGHT, 0.35);
      if (back)
        pc.hline(x, y0 - 1, w, r.shadow); // heel strap
      else {
        pc.set(x + 1, y0 - 1, hole);
        pc.set(x + 2, y0, hole);
        pc.set(toe < 0 ? x + w - 1 : x, y0 - 1, r.shadow); // strap rivet
      }
      pc.hline(ta, y1, tz - ta + 1, mix(base, NIGHT, 0.15));
      return;
    }
    case "roller-skates": {
      const top = FEET - 4;
      for (let y = top; y <= y0; y++) pc.hline(x, y, w, base);
      pc.hline(x, top, w, r.light);
      if (laces && !back) pc.set(x + 1, top + 2, laces);
      pc.hline(ta, y0, tz - ta + 1, r.shadow); // the plate
      const wheel = acc ?? "#feae34";
      pc.clear(x + 1, y1);
      pc.clear(x + 2, y1);
      pc.set(x, y1, wheel);
      pc.set(x + w - 1, y1, wheel);
      return;
    }
    default:
  }
}

/** Side shoe (facing left), heel at `hx`, toe pointing left. */
function shoeSide(c: Ctx, hx: number, len: number, lift = 0) {
  const s = c.L.shoes;
  const r = s.ramp;
  const pc = c.pc;
  const acc = optOrNull(s.accent);
  const y1 = FEET - lift;
  const y0 = y1 - 1;
  const tx = hx - len + 1;
  switch (s.kind) {
    case "sneakers":
    case "high-tops": {
      const top = s.kind === "high-tops" ? y1 - 4 : y1 - 2;
      for (let y = top; y <= y1; y++)
        pc.hline(tx + (y === top ? 2 : 0), y, len - (y === top ? 2 : 0), r.base);
      pc.hline(tx, y1, len, s.sole);
      pc.set(tx, y1, mix(s.sole, NIGHT, 0.1));
      pc.hline(tx + 1, y1 - 1, 2, optOrNull(s.laces) ?? r.light);
      if (acc) {
        pc.vline(hx, top, y1 - top, acc); // heel tab
        pc.set(hx - 1, top, acc); // collar
        pc.hline(hx - 3, y0, 2, acc); // little logo
      }
      if (s.kind === "high-tops") pc.set(hx - 2, top + 1, acc ?? r.light);
      return;
    }
    case "boots": {
      for (let y = y1 - 5; y <= y1; y++)
        pc.hline(y >= y0 ? tx : hx - 3, y, y >= y0 ? len : 4, r.base);
      pc.hline(tx, y1, len, s.sole);
      pc.hline(hx - 3, y1 - 5, 4, r.light);
      return;
    }
    case "none": {
      const sk = c.L.skin;
      pc.hline(hx - 3, y0, 4, sk.base);
      pc.hline(tx, y1, len, sk.base);
      pc.set(hx, y1, sk.shadow);
      pc.set(tx, y1, sk.light);
      return;
    }
    case "oxfords":
      pc.hline(tx + 1, y0, len - 1, r.base);
      pc.hline(tx, y1, len, r.base);
      pc.set(tx, y1, r.light);
      pc.hline(hx - 3, y0, 2, optOrNull(s.laces) ?? r.shadow);
      pc.set(hx, y1, mix(r.base, NIGHT, 0.3));
      return;
    case "ballet-flats":
      pc.hline(tx + 1, y0, len - 2, c.L.skin.base);
      pc.set(hx, y0, r.base);
      pc.hline(tx, y1, len, r.base);
      pc.set(tx + 1, y0, acc ?? r.light);
      return;
    case "platforms": {
      const sole = soleOf(s.sole, r.light);
      pc.hline(tx + 1, y0 - 1, len - 1, r.base);
      pc.hline(tx, y0, len, sole);
      pc.hline(tx, y1, len, mix(sole, NIGHT, 0.2));
      if (acc) pc.set(hx - 1, y0 - 1, acc);
      return;
    }
    case "flip-flops":
      pc.hline(tx, y0, len - 1, c.L.skin.base);
      pc.hline(tx, y1, len, r.base);
      pc.set(tx + 2, y0, acc ?? r.light);
      return;
    case "rain-boots":
    case "cowboy-boots":
    case "roller-skates": {
      const skates = s.kind === "roller-skates";
      const foot = skates ? y1 - 1 : y1;
      for (let y = foot - 4; y <= foot; y++)
        pc.hline(y >= foot - 1 ? tx : hx - 3, y, y >= foot - 1 ? len : 4, r.base);
      if (s.kind === "rain-boots") {
        pc.vline(hx - 2, foot - 3, 2, r.light);
        pc.hline(tx, foot, len, mix(r.base, NIGHT, 0.35));
      }
      if (s.kind === "cowboy-boots") {
        pc.set(tx - 1, foot, r.base); // pointed toe
        pc.set(hx, foot, mix(r.base, NIGHT, 0.4)); // heel
        pc.set(hx - 2, foot - 3, acc ?? r.light);
        pc.set(hx - 1, foot - 2, acc ?? r.light);
      }
      if (skates) {
        pc.hline(hx - 3, foot - 4, 4, r.light);
        pc.hline(tx, foot, len, r.shadow);
        const wheel = acc ?? "#feae34";
        pc.set(tx + 1, y1, wheel);
        pc.set(hx - 1, y1, wheel);
      }
      return;
    }
    case "clogs":
      pc.hline(tx + 1, y0 - 1, len - 2, r.base);
      pc.hline(tx, y0, len, r.base);
      pc.set(tx + 1, y0 - 1, r.light);
      pc.hline(tx, y1, len, WOOD);
      return;
    case "crocs": {
      for (let y = y0 - 1; y <= y1; y++) pc.hline(tx, y, len, r.base);
      const hole = mix(r.base, NIGHT, 0.35);
      pc.set(tx + 2, y0 - 1, hole);
      pc.set(tx + 4, y0, hole);
      pc.vline(hx, y0 - 1, 2, r.shadow); // heel strap
      pc.hline(tx, y1, len, mix(r.base, NIGHT, 0.15));
      return;
    }
    default: {
      for (let y = y0; y <= y1; y++) pc.hline(tx, y, len, r.base);
      pc.set(tx, y0, r.light);
      pc.hline(tx, y1, len, s.kind === "sandals" ? s.sole : mix(r.base, NIGHT, 0.2));
      if (s.kind === "sandals") pc.hline(tx, y0, len - 2, c.L.skin.base);
      if (s.kind === "haferl") {
        pc.vline(hx - 2, y0 - 1, 2, optOrNull(s.laces) ?? r.light);
        pc.hline(tx + 1, y0 - 1, len - 3, r.base);
      }
      if (s.kind === "slippers") pc.hline(tx, y0 - 1, len, r.light);
      if (s.kind === "heels") pc.set(hx, y1, s.sole);
      if (acc) pc.set(hx - 1, y0, acc);
    }
  }
}

// ---- bottoms details --------------------------------------------------------------------------
function hemDetail(
  c: Ctx,
  bt: Bottoms,
  x: number,
  w: number,
  y: number,
  outer: number,
  dark: boolean,
) {
  const pc = c.pc;
  const st = opt(bt.embroidery.stitching, bt.ramp.light);
  switch (bt.hem) {
    case "cuffed":
      pc.hline(x, y, w, dark ? bt.ramp.base : bt.ramp.light);
      break;
    case "rolled":
      pc.hline(x, y, w, bt.ramp.light);
      pc.hline(x, y - 2, w, bt.ramp.light);
      break;
    case "lacing":
      // crossed lacing at the outer hem
      pc.set(outer, y - 1, st);
      pc.set(outer + (outer > x ? -1 : 1), y, st);
      pc.set(outer, y, mix(bt.ramp.shadow, NIGHT, 0.3));
      pc.set(outer + (outer > x ? -1 : 1), y - 2, st);
      break;
    case "frayed":
      for (let i = 0; i < w; i++) if (hash2(x + i, y, 4) % 2) pc.set(x + i, y, bt.ramp.light);
      break;
    default:
  }
}

/** Embroidery motif inside a small box (x0..x1, y0..y1). */
function embroider(
  c: Ctx,
  bt: Bottoms,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  flip: boolean,
) {
  const e = bt.embroidery;
  const pc = c.pc;
  const col = e.color;
  const leaf = mix(col, "#ffffff", 0.18);
  const P = (x: number, y: number, h: string) => {
    const xx = flip ? x1 - (x - x0) : x;
    if (xx >= x0 && xx <= x1 && y >= y0 && y <= y1) pc.set(xx, y, h);
  };
  const w = x1 - x0 + 1;
  switch (e.motif) {
    case "none":
      return;
    case "vine":
      // a curling tendril with little leaves
      for (let y = y0; y <= y1; y++) {
        const t = y - y0;
        const dx = [0, 1, 1, 0, 0, 1, 1, 0][t % 8]!;
        P(x0 + dx, y, col);
        if (t % 3 === 1) P(x0 + dx + 1, y, leaf);
        if (t % 4 === 3 && w > 3) P(x0 + dx + 2, y - 1, col);
      }
      return;
    case "oak-leaf":
      for (let y = y0; y <= y1; y += 3) {
        P(x0, y, col);
        P(x0 + 1, y, leaf);
        P(x0 + 1, y + 1, col);
        P(x0 + 2, y + 1, col);
      }
      return;
    case "edelweiss":
      for (let y = y0 + 1; y <= y1; y += 3) {
        P(x0 + 1, y, "#f4f4f2");
        P(x0, y, col);
        P(x0 + 2, y, col);
        P(x0 + 1, y - 1, col);
        P(x0 + 1, y + 1, col);
      }
      return;
    case "geometric":
      for (let y = y0; y <= y1; y++) P(x0 + ((y - y0) % 2), y, col);
      return;
  }
}

/** Bottoms without a waistband seam (skirts, one-pieces). */
const NO_WAISTBAND = new Set<Bottoms["kind"]>([
  ...(Object.keys(SKIRT_SHAPES) as Bottoms["kind"][]),
  "tutu",
  "jumpsuit",
]);

/** A skirt-like bottom (WD1) over the hips and legs, front or back. */
function drawSkirt(c: Ctx, b: TorsoBox, shape: SkirtShape, ha: number, hz: number, back: boolean) {
  const bt = c.L.bottoms;
  const pc = c.pc;
  const f = fabric(bt);
  const end = shape.end;
  let a = ha;
  let z = hz;
  for (let y = b.W; y <= end; y++) {
    const fl = shape.flare(y - b.W);
    a = ha - fl;
    z = hz + fl;
    for (let x = a; x <= z; x++) pc.set(x, y, fabricAt(f, x, y - b.W));
    pc.set(z, y, bt.ramp.shadow);
  }
  const fold = mix(bt.ramp.base, bt.ramp.shadow, 0.7);
  switch (bt.kind) {
    case "pleated-skirt":
    case "kilt": {
      // knife pleats: a shadow line every other column
      for (let y = b.W + 2; y <= end; y++) {
        const fl = shape.flare(y - b.W);
        for (let x = ha - fl + 1; x < hz + fl; x += 2) pc.set(x, y, fold);
      }
      if (bt.kind === "kilt" && !back) {
        // the apron edge, fringe and kilt pin
        const ex = hz - 3;
        pc.vline(ex, b.W + 1, end - b.W, bt.ramp.light);
        for (let y = b.W + 2; y <= end; y += 2) pc.set(ex + 1, y, bt.ramp.light);
        pc.set(ex - 1, end - 2, "#c0cbdc");
        pc.set(ex - 1, end - 3, "#c0cbdc");
      }
      break;
    }
    case "pencil-skirt":
      // back slit: a strip of leg at the hem
      pc.set(back ? 15 : ha + 3, end, bareLeg(c, end, false, ha + 3));
      pc.set(back ? 15 : ha + 3, end - 1, bareLeg(c, end - 1, false, ha + 3));
      pc.hline(ha, b.W, hz - ha + 1, bt.ramp.shadow);
      break;
    case "dirndl-skirt":
      // gathered at the waist
      pc.hline(ha, b.W, hz - ha + 1, bt.ramp.shadow);
      for (let x = ha - 1; x <= hz + 1; x += 2) {
        pc.set(x, b.W + 1, bt.ramp.light);
        pc.set(x, b.W + 2, fold);
      }
      break;
    case "maxi-skirt":
      for (let y = b.W + 3; y <= end; y++) pc.set(ha + 2 - shape.flare(y - b.W), y, fold);
      for (let y = b.W + 5; y <= end; y++) pc.set(hz - 2, y, fold);
      break;
    case "gown":
      // soft sheen down one side, a fold down the middle
      for (let y = b.W + 2; y <= end; y++) {
        pc.set(ha + 1 - shape.flare(y - b.W), y, bt.ramp.light);
        if (y >= b.W + 4) pc.set(16, y, fold);
      }
      break;
    default:
  }
  const belt = optOrNull(bt.belt);
  if (belt) pc.hline(ha, b.W, hz - ha + 1, belt);
  hemDetail(c, bt, a, z - a + 1, end, a, false);
}

/** Tutu: fitted over the hips, then stiff tulle layers standing out at the sides. */
function drawTutu(c: Ctx, b: TorsoBox, ha: number, hz: number) {
  const bt = c.L.bottoms;
  const pc = c.pc;
  const f = fabric(bt);
  const r = bt.ramp;
  for (let y = b.W; y <= b.W + 2; y++) {
    for (let x = ha; x <= hz; x++) pc.set(x, y, fabricAt(f, x, y - b.W));
    pc.set(hz, y, r.shadow);
  }
  const y0 = b.W + 3;
  pc.hline(ha - 2, y0, hz - ha + 5, r.light);
  pc.hline(ha - 3, y0 + 1, hz - ha + 7, r.base);
  pc.set(hz + 3, y0 + 1, r.shadow);
  for (let x = ha - 2; x <= hz + 2; x++) pc.set(x, y0 + 2, (x + y0) % 2 ? r.shadow : r.base);
  const belt = optOrNull(bt.belt);
  if (belt) pc.hline(ha, b.W, hz - ha + 1, belt);
}

/** Per-kind details on one standing trouser leg (columns x..x+w-1, rows split..e). */
function legDetail(
  c: Ctx,
  bt: Bottoms,
  x: number,
  w: number,
  split: number,
  e: number,
  left: boolean,
  back: boolean,
) {
  const pc = c.pc;
  const outer = left ? x : x + w - 1;
  switch (bt.kind) {
    case "cargo": {
      // a patch pocket with a flap on the outer thigh
      const px = left ? x : x + w - 2;
      pc.rect(px, split + 1, 2, 2, bt.ramp.shadow);
      pc.hline(px, split + 1, 2, bt.ramp.light);
      break;
    }
    case "bike-shorts":
      pc.vline(outer, split - 2, e - split + 3, bt.ramp.light); // racing stripe
      break;
    case "jumpsuit":
      pc.hline(x, e, w, back ? bt.ramp.shadow : bt.ramp.light); // cuffs
      break;
    case "leggings": {
      // skin-tight: a sheen down the shin and a slimmer calf
      pc.vline(x + 1, split, e - split, bt.ramp.light);
      const inner = left ? x + w - 1 : x;
      for (let y = 40; y <= e; y++) pc.clear(inner, y);
      break;
    }
    default:
  }
}

/**
 * Legwear that reaches past the leg columns: thigh-high tops on the bare hip rows and the
 * bunched rims of leg warmers.
 */
function drawLegwearExtras(c: Ctx, lx: number, rx: number, w: number, end: number, back: boolean) {
  const lw = c.L.legwear;
  const pc = c.pc;
  if (lw.kind === "thigh-highs") {
    const top = thighTop(c.L.bottoms);
    for (let y = Math.max(top, end + 1); y < 38; y++)
      for (const x of [lx, rx])
        for (let i = 0; i < w; i++)
          pc.set(x + i, y, legSkinOrWear(c, y, x === rx || i === w - 1, x + i));
  }
  if (lw.kind === "leg-warmers") {
    const wear = lw.color;
    const dark = mix(wear, NIGHT, 0.18);
    for (let y = Math.max(40, end + 1); y <= 41; y++) {
      pc.set(lx - 1, y, y % 2 ? wear : dark);
      pc.set(lx + w, y, dark);
      pc.set(rx - 1, y, y % 2 ? wear : dark);
      pc.set(rx + w, y, dark);
    }
  }
  void back;
}

/** Front hip block + flap details of the bottoms (rows W..). */
function hipFront(c: Ctx, b: TorsoBox, a: number, z: number, bottom: number, back: boolean) {
  const bt = c.L.bottoms;
  const f = fabric(bt);
  const pc = c.pc;
  for (let y = b.W; y <= bottom; y++) {
    for (let x = a; x <= z; x++) pc.set(x, y, fabricAt(f, x, y - b.W));
    pc.set(z, y, bt.ramp.shadow);
  }
  const belt = optOrNull(bt.belt);
  if (belt) {
    pc.hline(a, b.W, z - a + 1, belt);
    if (!back) {
      pc.set(15, b.W, "#c0cbdc");
      pc.set(16, b.W, "#c0cbdc");
    }
  } else if (bt.kind !== "skirt" && bt.kind !== "dress" && !NO_WAISTBAND.has(bt.kind)) {
    pc.hline(a, b.W, z - a + 1, mix(bt.ramp.base, bt.ramp.shadow, 0.6));
  }
  if (!belt && (bt.kind === "leggings" || bt.kind === "bike-shorts"))
    pc.hline(a, b.W, z - a + 1, bt.ramp.light); // wide elastic waistband
  if (back) {
    if (bt.kind === "jeans") {
      pc.hline(a + 1, b.W + 2, 3, bt.ramp.light);
      pc.hline(z - 4, b.W + 2, 3, bt.ramp.light);
    }
    return;
  }
  const isLeder = bt.kind === "lederhosen" || bt.kind === "kneebund-lederhosen";
  if (bt.flap || isLeder) {
    // drop-front flap (Hosentürl) outlined in stitching, embroidery inside, horn buttons on top
    const st = opt(bt.embroidery.stitching, bt.ramp.light);
    const fa = c.tl + 4;
    const fz = c.tr - 4;
    const fy0 = b.W + 1;
    const fy1 = Math.min(bottom - 1, b.W + 4);
    if (bt.flap) {
      for (let y = fy0; y <= fy1; y++) {
        pc.set(fa, y, st);
        pc.set(fz, y, st);
      }
      pc.hline(fa, fy1, fz - fa + 1, st);
      // embroidery: two mirrored tendrils curling across the flap
      const e = bt.embroidery;
      if (e.motif !== "none") {
        const leaf = mix(e.color, "#ffffff", 0.2);
        const mid = (fa + fz) / 2;
        for (let y = fy0; y < fy1; y++) {
          const t = y - fy0;
          const dx = e.motif === "geometric" ? t % 2 : [1, 2, 2, 1][t % 4]!;
          pc.set(Math.floor(mid) - dx + 1, y, e.color);
          pc.set(Math.ceil(mid) + dx - 1, y, e.color);
          if (e.motif === "edelweiss" && t === 1) {
            pc.set(Math.floor(mid), y, "#f4f4f2");
            pc.set(Math.ceil(mid), y, "#f4f4f2");
          } else if (t === 0) {
            pc.set(Math.floor(mid) - dx, y, leaf);
            pc.set(Math.ceil(mid) + dx, y, leaf);
          }
        }
      }
    }
    const btn = bt.buttons;
    if (btn.count > 0) {
      const rim = opt(btn.rim, bt.ramp.shadow);
      const xs = btn.count === 1 ? [15] : [fa, fz];
      for (const x of xs) {
        pc.set(x, b.W, btn.color);
        if (btn.size === "large") pc.set(x + 1, b.W, rim);
        else pc.set(x, b.W + 1, rim);
      }
    }
    return;
  }
  // plain fly / jeans details
  switch (bt.kind) {
    case "jeans":
      pc.vline(16, b.W + 1, 4, bt.ramp.light);
      pc.set(a + 1, b.W + 1, "#feae34"); // rivet
      pc.hline(a, b.W + 1, 3, bt.ramp.light);
      break;
    case "joggers":
      pc.set(15, b.W + 1, bt.ramp.light);
      pc.set(16, b.W + 2, bt.ramp.light);
      break;
    case "chinos":
    case "trousers":
    case "overalls":
      pc.vline(16, b.W + 1, 3, bt.ramp.shadow);
      break;
    case "cargo":
      pc.vline(16, b.W + 1, 3, bt.ramp.shadow);
      pc.set(a + 1, b.W + 1, bt.ramp.shadow); // belt loops
      pc.set(z - 1, b.W + 1, bt.ramp.shadow);
      break;
    case "jumpsuit":
      pc.vline(16, b.W, bottom - b.W + 1, bt.ramp.light); // the zip runs on down
      break;
    default:
  }
  if (bt.buttons.count > 0 && bt.kind !== "overalls") pc.set(15, b.W, bt.buttons.color);
}

/** Standing legs, front or back view. */
export function drawLegsStanding(c: Ctx, b: TorsoBox, back: boolean, phase: number) {
  const L = c.L;
  const bt = L.bottoms;
  const pc = c.pc;
  const wide = c.posed && L.pose.stance === "wide";
  const { lx, rx, w } = legCols(wide);
  const split = SHORT_KINDS.has(bt.kind) ? 37 : 38;
  const end = legEnd(bt);
  const f = fabric(bt);
  const lUp = !back && phase === 1 ? 2 : back && phase === 3 ? 2 : 0;
  const rUp = !back && phase === 3 ? 2 : back && phase === 1 ? 2 : 0;
  const ha = lx;
  const hz = rx + w - 1;
  // legs (skin/legwear) first, bottoms over them
  for (const [x, up, dark] of [
    [lx, lUp, false],
    [rx, rUp, true],
  ] as const) {
    const slim = L.build === "slim" ? 1 : 0;
    for (let y = split; y <= FEET - 2 - up; y++) {
      for (let i = 0; i < w; i++) {
        if (slim && (x === lx ? i === 0 : i === w - 1) && y > end) continue;
        const d = dark || i === w - 1;
        pc.set(x + i, y, bareLeg(c, y + up, d, x + i));
      }
    }
  }
  // shoes (a lifted foot is drawn higher, walk cycle); under a long skirt they go first
  const toe = wide ? 1 : 0;
  const shoes = () => {
    const save = pc.oy;
    pc.oy = save - lUp;
    shoeFront(c, lx, w, back ? 0 : -toe, back, false);
    pc.oy = save - rUp;
    shoeFront(c, rx, w, back ? 0 : toe, back, true);
    pc.oy = save;
  };
  const shape = skirtShape(bt.kind);
  const longSkirt = !!shape && shape.end >= 41;
  if (longSkirt) shoes();
  // bottoms: hip block + legs
  if (SKIRTS.has(bt.kind)) {
    for (let y = b.W; y <= end; y++) {
      const fl = Math.floor((y - b.W) / 3);
      for (let x = ha - fl; x <= hz + fl; x++) pc.set(x, y, fabricAt(f, x, y - b.W));
      pc.set(hz + fl, y, bt.ramp.shadow);
    }
    hemDetail(c, bt, ha - 3, hz - ha + 7, end, ha - 3, false);
    if (bt.pattern.kind === "none")
      for (let y = b.W + 2; y < end; y += 3) pc.set(ha + 2, y, bt.ramp.shadow);
  } else if (shape) {
    drawSkirt(c, b, shape, ha, hz, back);
  } else if (bt.kind === "tutu") {
    drawTutu(c, b, ha, hz);
  } else if (bt.kind === "none") {
    // nothing on: the hips are the body layer, the legs stay bare
    for (let y = split; y <= FEET; y++) for (let x = lx + w; x < rx; x++) pc.clear(x, y);
  } else {
    hipFront(c, b, ha, hz, split - 1, back);
    for (const [x, up, dark] of [
      [lx, lUp, false],
      [rx, rUp, true],
    ] as const) {
      const flare = bt.hem === "flared" || bt.kind === "lederhosen" ? 1 : 0;
      const e = end - up;
      for (let y = split; y <= e; y++) {
        const fl = y >= e - 1 ? flare : 0;
        const a = x - (x === lx ? fl : 0);
        const z = x + w - 1 + (x === rx ? fl : 0);
        for (let xx = a; xx <= z; xx++) {
          let col = fabricAt(f, xx, y - b.W);
          if (dark && col === bt.ramp.base) col = mix(bt.ramp.base, bt.ramp.shadow, 0.5);
          pc.set(xx, y, col);
        }
        pc.set(z, y, bt.ramp.shadow);
      }
      if (bt.kind === "joggers") {
        pc.hline(x, e, w, bt.ramp.shadow);
        pc.hline(x, e - 1, w, bt.ramp.light);
      }
      if (bt.kind === "jeans" && !back)
        pc.vline(x === lx ? x : x + w - 1, split, e - split, bt.ramp.light);
      if (bt.kind === "chinos" && !back) pc.vline(x + 1, split, e - split, bt.ramp.light);
      legDetail(c, bt, x, w, split, e, x === lx, back);
      const outer = x === lx ? x - flare : x + w - 1 + flare;
      hemDetail(c, bt, x - (x === lx ? flare : 0), w + flare, e, outer, dark);
      if (bt.kind === "kneebund-lederhosen") {
        pc.hline(x, e, w, bt.ramp.shadow);
        pc.set(outer, e, opt(bt.buttons.color, bt.ramp.light));
      }
    }
    // the gap between the legs
    for (let y = split; y <= FEET; y++) for (let x = lx + w; x < rx; x++) pc.clear(x, y);
    // embroidery tendrils on the thighs, below a hip-length jacket
    const e = bt.embroidery;
    if (
      !back &&
      e.motif !== "none" &&
      (bt.kind === "lederhosen" || bt.kind === "kneebund-lederhosen" || bt.flap)
    ) {
      const leaf = mix(e.color, "#ffffff", 0.2);
      const y0 = split - 1;
      pc.set(lx + 1, y0, e.color);
      pc.set(lx + 2, y0 + 1, e.color);
      pc.set(lx + 1, y0 + 1, leaf);
      pc.set(rx + w - 2, y0, e.color);
      pc.set(rx + w - 3, y0 + 1, e.color);
      pc.set(rx + w - 2, y0 + 1, leaf);
    }
  }
  drawLegwearExtras(c, lx, rx, w, end, back);
  if (!longSkirt) shoes();
}

/** Side view legs (facing left). */
export function drawLegsSide(c: Ctx, b: TorsoBox, phase: number) {
  const L = c.L;
  const bt = L.bottoms;
  const pc = c.pc;
  const f = fabric(bt);
  const end = legEnd(bt);
  const split = 38;
  const walking = phase === 1 || phase === 3;
  // hip block
  const ha = c.tl + 2;
  const hz = c.tr - 2;
  // legs: [x at split, x at feet]
  const legs: { top: number; bot: number; dark: boolean }[] = walking
    ? [
        { top: 13, bot: 9, dark: phase === 3 },
        { top: 16, bot: 19, dark: phase === 1 },
      ]
    : [{ top: 13, bot: 13, dark: false }];
  for (const leg of legs) {
    for (let y = split; y <= FEET - 2; y++) {
      const t = (y - split) / (FEET - 2 - split);
      const x = Math.round(leg.top + (leg.bot - leg.top) * t);
      const lw = walking ? 4 : 6;
      for (let i = 0; i < lw; i++) {
        const inside = y <= end;
        let col = inside
          ? fabricAt(f, x + i, y - b.W)
          : bareLeg(c, y, leg.dark || i === lw - 1, x + i);
        if (inside && (leg.dark || i === lw - 1)) col = bt.ramp.shadow;
        pc.set(x + i, y, col);
      }
      if (y === end) hemDetail(c, bt, x, lw, y, x + lw - 1, leg.dark);
    }
    const hx = leg.bot + (walking ? 3 : 5);
    shoeSide(c, hx, walking ? 6 : 8);
  }
  if (SKIRTS.has(bt.kind)) {
    for (let y = b.W; y <= end; y++) {
      const fl = Math.floor((y - b.W) / 3);
      for (let x = ha - fl; x <= hz + fl; x++) pc.set(x, y, fabricAt(f, x, y - b.W));
    }
    return;
  }
  const shape = skirtShape(bt.kind);
  if (shape) {
    const fold = mix(bt.ramp.base, bt.ramp.shadow, 0.7);
    for (let y = b.W; y <= end; y++) {
      const fl = shape.flare(y - b.W);
      for (let x = ha - fl; x <= hz + fl; x++) pc.set(x, y, fabricAt(f, x, y - b.W));
      pc.set(hz + fl, y, bt.ramp.shadow);
      if ((bt.kind === "pleated-skirt" || bt.kind === "kilt") && y >= b.W + 2)
        for (let x = ha - fl + 1; x < hz + fl; x += 2) pc.set(x, y, fold);
    }
    if (bt.kind === "dirndl-skirt" || bt.kind === "pencil-skirt")
      pc.hline(ha, b.W, hz - ha + 1, bt.ramp.shadow);
    const belt = optOrNull(bt.belt);
    if (belt) pc.hline(ha, b.W, hz - ha + 1, belt);
    return;
  }
  if (bt.kind === "tutu") {
    drawTutu(c, b, ha, hz);
    return;
  }
  if (bt.kind === "none") return; // the body layer shows the hips
  for (let y = b.W; y < split; y++) {
    for (let x = ha; x <= hz; x++) pc.set(x, y, fabricAt(f, x, y - b.W));
    pc.set(hz, y, bt.ramp.shadow);
  }
  const belt = optOrNull(bt.belt);
  pc.hline(ha, b.W, hz - ha + 1, belt ?? mix(bt.ramp.base, bt.ramp.shadow, 0.6));
  // side embroidery down the thigh
  if (bt.embroidery.motif !== "none") embroider(c, bt, ha + 3, b.W + 2, ha + 5, split - 1, false);
  if (bt.kind === "cargo") {
    pc.rect(ha + 3, split - 2, 3, 3, bt.ramp.shadow);
    pc.hline(ha + 3, split - 2, 3, bt.ramp.light);
  }
  if (bt.kind === "bike-shorts") pc.vline(ha + 4, b.W + 1, split - b.W + 1, bt.ramp.light);
  if (bt.suspenders !== "none" && bt.kind !== "overalls") pc.set(ha + 3, b.W, bt.suspendersColor);
}

/** Back view seated (at a desk): only the waistband shows above the chair. */
export function drawSeatBackHip(c: Ctx, b: TorsoBox) {
  if (c.L.bottoms.kind === "none") return; // the body layer shows
  hipFront(c, b, c.tl + 1, c.tr - 1, b.end, true);
}

/** Seated, facing the camera: lap + knees toward the viewer, shins, shoes. */
export function drawLegsSeatedFront(c: Ctx, b: TorsoBox) {
  const L = c.L;
  const bt = L.bottoms;
  const pc = c.pc;
  const f = fabric(bt);
  const none = bt.kind === "none";
  if (!none) hipFront(c, b, c.tl + 1, c.tr - 1, b.end, false);
  const shape = skirtShape(bt.kind);
  const short =
    SHORT_KINDS.has(bt.kind) ||
    SKIRTS.has(bt.kind) ||
    (!!shape && shape.end <= 41) ||
    bt.kind === "tutu" ||
    bt.kind === "bike-shorts" ||
    none;
  // knees (thighs foreshortened toward the camera)
  for (let y = 40; y <= 43; y++) {
    const fab = !none && (y <= 41 || !short);
    for (let x = 8; x <= 23; x++) {
      const knee = x <= 15 ? 0 : 1;
      if (none && y <= 41) {
        // bare thighs (underwear / legwear where they reach)
        pc.set(x, y, bareLeg(c, y - 2, knee === 1 || x === 23, x));
      } else if (fab) {
        let col = fabricAt(f, x, y);
        if (y === 41 || x === 23) col = bt.ramp.shadow;
        pc.set(x, y, col);
      } else {
        const inLeg = (x >= 9 && x <= 13) || (x >= 18 && x <= 22);
        if (inLeg) pc.set(x, y, bareLeg(c, y - 2, knee === 1 || x === 13 || x === 22, x));
        else pc.clear(x, y);
      }
    }
  }
  pc.vline(15, 40, short ? 2 : 4, none ? L.skin.shadow : bt.ramp.shadow);
  if (bt.kind === "tutu") pc.hline(c.tl - 1, b.end, c.tr - c.tl + 3, bt.ramp.light);
  if (short && !none) {
    hemDetail(c, bt, 8, 8, 41, 8, false);
    hemDetail(c, bt, 16, 8, 41, 23, true);
    if (bt.embroidery.motif !== "none") {
      pc.set(10, 40, bt.embroidery.color);
      pc.set(21, 40, bt.embroidery.color);
    }
  }
  // shoes on rows 44-45 (feet two texels lower than standing)
  const save = pc.oy;
  pc.oy = save + 2;
  shoeFront(c, 8, 4, 0, false, false);
  shoeFront(c, 20, 4, 0, false, true);
  pc.oy = save;
}
