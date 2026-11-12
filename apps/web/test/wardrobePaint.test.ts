/**
 * The wardrobe on the HD doll (WD1-WD8): every new kind draws something of its own, height
 * moves the head but not the feet, a naked body is skin only, presets and random looks paint.
 */
import { describe, expect, test } from "bun:test";
import * as E from "@agent-office/protocol";
import {
  type AvatarSpec,
  applyPreset,
  avatarFromSeed,
  type CharacterLook,
  type FullLook,
  lookFromCatalog,
  OUTFIT_PRESETS,
  randomLook,
  withWardrobe,
} from "@agent-office/protocol";
import { FH, FW, HEADROOM } from "../src/art/avatar/geometry.ts";
import { lookFor } from "../src/art/avatar/renderLook.ts";
import { paintSheet } from "../src/art/avatar/sheet.ts";
import type { PixelCanvas } from "../src/art/pixel.ts";

const hex = (v: number) =>
  `#${[v & 255, (v >> 8) & 255, (v >> 16) & 255].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
const NIGHT = "#181425";

const frameBytes = (pc: PixelCanvas, frame: number) => {
  const out: number[] = [];
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) out.push(pc.data[y * pc.width + frame * FW + x]!);
  return out.join(",");
};
/** First opaque row of a frame (full-frame rows, headroom included). */
const topRow = (pc: PixelCanvas, frame: number) => {
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) if (pc.data[y * pc.width + frame * FW + x]! >>> 24) return y;
  return FH;
};
const row = (pc: PixelCanvas, frame: number, y: number) =>
  Array.from({ length: FW }, (_, x) => pc.data[y * pc.width + frame * FW + x]!).join(",");

const cat = lookFromCatalog(avatarFromSeed("probe"));
/** A plain probe: buzz cut, nothing on the head, a closed outer layer. */
const base: FullLook = withWardrobe({
  ...cat,
  hair: { ...cat.hair, cut: "buzz" },
  eyewear: { ...cat.eyewear, style: "none" },
  headwear: { ...cat.headwear, style: "none" },
  facialHair: { ...cat.facialHair, style: "none" },
  outer: { ...cat.outer, open: false },
});
const spec = (look: CharacterLook): AvatarSpec => ({ ...avatarFromSeed("probe"), look });
const paint = (look: CharacterLook) => paintSheet(lookFor(spec(look), "pi", null));
const bare = (l: FullLook): FullLook => ({
  ...l,
  shirt: { ...l.shirt, kind: "none" },
  outer: { ...l.outer, kind: "none" },
  vest: { ...l.vest, kind: "none" },
  bottoms: { ...l.bottoms, kind: "none" },
});
const RED = E.rampFrom("#e43b44");

type Variant = [string, (l: FullLook, v: string) => FullLook, readonly string[]];
const variants: Variant[] = [
  ["body.height", (l, v) => ({ ...l, body: { ...l.body, height: v as never } }), E.HEIGHTS],
  ["body.figure", (l, v) => ({ ...bare(l), body: { ...l.body, figure: v as never } }), E.FIGURES],
  [
    "underwear.top",
    (l, v) => ({ ...bare(l), underwear: { ...l.underwear, top: v as never, topRamp: RED } }),
    E.UNDERWEAR_TOPS,
  ],
  [
    "underwear.bottom",
    (l, v) => ({
      ...bare(l),
      underwear: { ...l.underwear, bottom: v as never, bottomRamp: RED },
    }),
    E.UNDERWEAR_BOTTOMS,
  ],
  [
    "apron.kind",
    (l, v) => ({
      ...l,
      bottoms: { ...l.bottoms, kind: "dirndl-skirt" },
      apron: { ...l.apron, kind: v as never, ramp: RED },
    }),
    E.APRON_KINDS,
  ],
  [
    "apron.bow",
    (l, v) => ({
      ...l,
      bottoms: { ...l.bottoms, kind: "dirndl-skirt" },
      apron: { ...l.apron, kind: "dirndl", ramp: RED, bow: v as never },
    }),
    E.APRON_BOWS,
  ],
  ...(["mask", "wings", "tail", "gloves", "necklace", "bag"] as const).map(
    (k): Variant => [
      `accessories.${k}`,
      (l, v) => ({
        ...l,
        accessories: { ...l.accessories, [k]: { kind: v, color: "#e43b44" } },
      }),
      {
        mask: E.MASKS,
        wings: E.WINGS,
        tail: E.TAILS,
        gloves: E.GLOVES,
        necklace: E.NECKLACES,
        bag: E.BAGS,
      }[k],
    ],
  ),
  [
    "face.makeup.lips",
    (l, v) => ({ ...l, face: { ...l.face, makeup: { lips: v, eyeshadow: "none" } } }),
    ["none", "#a22633"],
  ],
  [
    "face.makeup.eyeshadow",
    (l, v) => ({ ...l, face: { ...l.face, makeup: { lips: "none", eyeshadow: v } } }),
    ["none", "#0099db"],
  ],
  [
    "hair.tips",
    (l, v) => ({ ...l, hair: { ...l.hair, cut: "long", tips: v } }),
    ["none", "#0099db"],
  ],
  [
    "extras.rightTint",
    (l, v) => ({
      ...l,
      extras: { ...l.extras!, rightHand: "coffee", rightTint: v },
    }),
    ["none", "#63c74d"],
  ],
  [
    "extras.leftTint",
    (l, v) => ({
      ...l,
      extras: { ...l.extras!, leftHand: "umbrella", leftTint: v },
    }),
    ["none", "#63c74d"],
  ],
  [
    "extras.wristTint",
    (l, v) => ({ ...l, extras: { ...l.extras!, wrist: "neon-cyan", wristTint: v } }),
    ["none", "#feae34"],
  ],
  [
    "extras.costumeTint",
    (l, v) => ({ ...l, extras: { ...l.extras!, costume: "robot", costumeTint: v } }),
    ["none", "#63c74d"],
  ],
];

describe("wardrobe on the HD doll", () => {
  test("every new value draws a different character (front, side, back)", () => {
    const same: string[] = [];
    for (const [name, apply, values] of variants) {
      const seen = new Map<string, string>();
      for (const v of values) {
        const pc = paint(apply(base, v));
        const key = [0, 10, 30].map((f) => frameBytes(pc, f)).join("|");
        const prev = seen.get(key);
        if (prev !== undefined) same.push(`${name}: ${prev} = ${v}`);
        else seen.set(key, v);
      }
    }
    expect(same).toEqual([]);
  });

  test("height moves the head, never the feet", () => {
    const tops: number[] = [];
    let feet: string | undefined;
    for (const h of E.HEIGHTS) {
      const pc = paint({ ...base, body: { ...base.body, height: h } });
      tops.push(topRow(pc, 0));
      const shoes = row(pc, 0, HEADROOM + 43);
      feet ??= shoes;
      expect(shoes).toBe(feet);
    }
    // petite .. very tall: each step at least one texel higher
    for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeLessThan(tops[i - 1]!);
    // seated at the desk, a tall person still sits a little higher
    const sitTall = paint({ ...base, body: { ...base.body, height: "very-tall" } });
    const sitShort = paint({ ...base, body: { ...base.body, height: "petite" } });
    expect(topRow(sitTall, 22)).toBeLessThan(topRow(sitShort, 22));
  });

  test("with nothing on, the body is skin (and outline) only", () => {
    const naked = withWardrobe(applyPreset(base, "naked"));
    const pc = paint({
      ...naked,
      extras: { ...naked.extras!, leftHand: "none", rightHand: "none" },
    });
    const sk = naked.skin;
    const ok = new Set([sk.base, sk.shadow, sk.light, NIGHT]);
    for (const frame of [0, 10, 30]) {
      let skin = 0;
      let other = 0;
      // torso and legs: body rows 26..42
      for (let y = HEADROOM + 26; y <= HEADROOM + 42; y++)
        for (let x = 0; x < FW; x++) {
          const v = pc.data[y * pc.width + frame * FW + x]!;
          if (!(v >>> 24)) continue;
          if (ok.has(hex(v))) skin++;
          else other++;
        }
      expect(other / (skin + other)).toBeLessThan(0.05);
    }
  });

  test("tall hats use the headroom", () => {
    for (const style of ["top-hat", "chef-hat", "witch-hat"] as const) {
      const pc = paint({ ...base, headwear: { ...base.headwear, style } });
      expect(topRow(pc, 0)).toBeLessThan(HEADROOM);
    }
  });

  test("every outfit preset and 200 random looks paint without throwing", () => {
    for (const p of OUTFIT_PRESETS) paint(applyPreset(base, p.id));
    for (let s = 0; s < 200; s++) paint(randomLook(s));
  });
});
