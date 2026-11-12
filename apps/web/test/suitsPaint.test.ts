/**
 * The crazy wardrobe's extras (WD12) on the HD doll: held items, wristwear and the full-body
 * suits (banana, skeleton, mummy, knight, hotdog) draw something of their own in every view,
 * follow their tints, stay inside their frame, and leave every other look untouched.
 */
import { describe, expect, test } from "bun:test";
import * as E from "@agent-office/protocol";
import {
  type AvatarSpec,
  avatarFromSeed,
  type CharacterLook,
  lookFromCatalog,
  withWardrobe,
} from "@agent-office/protocol";
import { FH, FW } from "../src/art/avatar/geometry.ts";
import { lookFor } from "../src/art/avatar/renderLook.ts";
import { paintSheet } from "../src/art/avatar/sheet.ts";
import { SUITS, suitLook } from "../src/art/avatar/suits.ts";
import { PixelCanvas } from "../src/art/pixel.ts";

const cat = lookFromCatalog(avatarFromSeed("probe"));
const base: CharacterLook = {
  ...cat,
  hair: { ...cat.hair, cut: "buzz" },
  headwear: { ...cat.headwear, style: "none" },
  eyewear: { ...cat.eyewear, style: "none" },
};
type Extras = NonNullable<CharacterLook["extras"]>;
const withExtras = (e: Partial<Extras>, l: CharacterLook = base): CharacterLook => ({
  ...l,
  extras: { ...l.extras!, ...e },
});
const paint = (look: CharacterLook) =>
  paintSheet(lookFor({ ...avatarFromSeed("probe"), look } as AvatarSpec, "pi", null));
const frame = (pc: PixelCanvas, f: number) => {
  const out: number[] = [];
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) out.push(pc.data[y * pc.width + f * FW + x]!);
  return out.join(",");
};
/** front idle, walking left, from behind, seated at the desk, seated facing the camera */
const VIEWS = [0, 10, 30, 22, 28];
const key = (look: CharacterLook) => {
  const pc = paint(look);
  return VIEWS.map((f) => frame(pc, f));
};

const WD12_HELD = E.HELD_KINDS.slice(E.HELD_KINDS.indexOf("rubber-chicken"));
const WD12_WRIST = ["gold-cuffs", "spiked", "friendship"] as const;

describe("crazy wardrobe extras (WD12)", () => {
  test("each new value is drawn, and differently, in every view", () => {
    const groups: [string, CharacterLook[]][] = [
      ["costume", (["none", ...SUITS] as const).map((k) => withExtras({ costume: k }))],
      [
        "wrist",
        (["none", "neon-cyan", ...WD12_WRIST] as const).map((k) => withExtras({ wrist: k })),
      ],
      ["leftHand", (["none", ...WD12_HELD] as const).map((k) => withExtras({ leftHand: k }))],
      ["rightHand", (["none", ...WD12_HELD] as const).map((k) => withExtras({ rightHand: k }))],
    ];
    const same: string[] = [];
    for (const [name, looks] of groups) {
      const keys = looks.map(key);
      VIEWS.forEach((f, v) => {
        // the side view shows one hand's item; seated at the desk the back hides bracelets
        if (name === "leftHand" && f === 10) return;
        const seen = new Map<string, number>();
        keys.forEach((k, i) => {
          const prev = seen.get(k[v]!);
          if (prev !== undefined) same.push(`${name} frame ${f}: #${prev} = #${i}`);
          else seen.set(k[v]!, i);
        });
      });
    }
    expect(same).toEqual([]);
  });

  test("a suit swaps the clothes for its bodysuit; other looks stay the same object", () => {
    const full = withWardrobe(base);
    expect(suitLook(full)).toBe(full);
    expect(suitLook(withWardrobe(withExtras({ costume: "robot" })))).toEqual(
      withWardrobe(withExtras({ costume: "robot" })),
    );
    for (const s of SUITS) {
      const L = suitLook(withWardrobe(withExtras({ costume: s })));
      expect(L.outer.kind).toBe("none");
      expect(L.hair.cut).toBe("bald");
    }
  });

  test("the costume tint recolours every suit, the held tint the new items", () => {
    for (const s of SUITS) {
      const a = key(withExtras({ costume: s }));
      const b = key(withExtras({ costume: s, costumeTint: "#63c74d" }));
      expect(a[0]).not.toBe(b[0]);
      expect(a[2]).not.toBe(b[2]);
    }
    for (const k of WD12_HELD) {
      const a = key(withExtras({ rightHand: k }));
      const b = key(withExtras({ rightHand: k, rightTint: "#b55088" }));
      expect(`${k} ${a[0] !== b[0]}`).toBe(`${k} true`);
    }
    for (const k of WD12_WRIST) {
      const a = key(withExtras({ wrist: k }));
      const b = key(withExtras({ wrist: k, wristTint: "#b55088" }));
      expect(`${k} ${a[0] !== b[0]}`).toBe(`${k} true`);
    }
  });

  test("suits and items stay inside their frame on every body, pose and height", () => {
    const proto = PixelCanvas.prototype;
    const origSet = proto.set;
    const origPut = proto.put;
    const bad = new Set<string>();
    const check = (pc: PixelCanvas, x: number, y: number, what: string) => {
      const c = pc.clip;
      if (!c) return;
      const px = x + pc.ox;
      const py = y + pc.oy;
      if (px < c.x0 || px >= c.x1 || py < c.y0 || py >= c.y1) bad.add(`${what}: x=${x} y=${y}`);
    };
    let what = "";
    proto.set = function (this: PixelCanvas, x, y, h, a) {
      check(this, x, y, what);
      origSet.call(this, x, y, h, a);
    };
    proto.put = function (this: PixelCanvas, x, y, v) {
      check(this, x, y, what);
      origPut.call(this, x, y, v);
    };
    try {
      let i = 0;
      for (const build of E.BUILDS)
        for (const height of E.HEIGHTS)
          for (const figure of E.FIGURES) {
            const hands = E.HAND_POSES[i % E.HAND_POSES.length]!;
            const suit = SUITS[i % SUITS.length]!;
            const held = WD12_HELD[i % WD12_HELD.length]!;
            const held2 = WD12_HELD[(i + 3) % WD12_HELD.length]!;
            const wrist = WD12_WRIST[i % WD12_WRIST.length]!;
            i++;
            what = `${build}/${height}/${figure}/${hands}/${suit}/${held}/${held2}/${wrist}`;
            paint({
              ...withExtras({ costume: suit, leftHand: held, rightHand: held2, wrist }),
              build,
              body: { height, figure },
              pose: { ...base.pose, hands },
            });
          }
    } finally {
      proto.set = origSet;
      proto.put = origPut;
    }
    expect([...bad].slice(0, 10)).toEqual([]);
  });
});
