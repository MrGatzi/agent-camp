import { describe, expect, test } from "bun:test";
import {
  applyPreset,
  avatarFromSeed,
  CharacterLook,
  lookFromCatalog,
  OUTFIT_PRESETS,
  rampFrom,
  randomLook,
  repairLook,
  withWardrobe,
} from "../src/index.ts";
import { LOOK_FIXTURES } from "../src/lookFixtures.ts";

const luma = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

describe("wardrobe", () => {
  test("rampFrom: shadow darker, light lighter, all #rrggbb", () => {
    for (const base of ["#e43b44", "#000000", "#ffffff", "#ABCDEF"]) {
      const r = rampFrom(base);
      for (const c of [r.base, r.shadow, r.light]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(luma(r.shadow)).toBeLessThanOrEqual(luma(r.base) + 0.06);
      expect(luma(r.light)).toBeGreaterThanOrEqual(luma(r.base));
    }
  });

  test("stored looks without wardrobe sections still parse and get defaults", () => {
    const tracht = LOOK_FIXTURES.tracht.look!;
    expect(CharacterLook.safeParse(tracht).success).toBe(true);
    const full = withWardrobe(tracht);
    expect(full.body).toEqual({ height: "average", figure: "neutral" });
    expect(full.underwear.top).toBe("none");
    expect(full.apron.kind).toBe("none");
    expect(full.accessories.wings.kind).toBe("none");
  });

  test("a bad wardrobe section drops only that section", () => {
    const base = lookFromCatalog(avatarFromSeed("x"));
    const parsed = CharacterLook.parse({ ...base, body: { height: "giant", figure: "curvy" } });
    expect(parsed.body).toBeUndefined();
    expect(parsed.shirt).toEqual(base.shirt);
  });

  test("every preset applies to a valid look, keeping body, face and hair", () => {
    const base = { ...randomLook(7), body: { height: "tall" as const, figure: "curvy" as const } };
    for (const p of OUTFIT_PRESETS) {
      const look = applyPreset(base, p.id);
      const r = CharacterLook.safeParse(look);
      if (!r.success) throw new Error(`${p.id}: ${r.error.message}`);
      expect(look.face).toEqual(base.face);
      expect(look.hair).toEqual(base.hair);
      expect(look.body).toEqual(base.body);
    }
    expect(new Set(OUTFIT_PRESETS.map((p) => p.id)).size).toBe(OUTFIT_PRESETS.length);
  });

  test("naked preset leaves nothing on", () => {
    const look = withWardrobe(applyPreset(randomLook(1), "naked"));
    expect(look.shirt.kind).toBe("none");
    expect(look.bottoms.kind).toBe("none");
    expect(look.outer.kind).toBe("none");
    expect(look.underwear.top).toBe("none");
    expect(look.underwear.bottom).toBe("none");
    expect(look.shoes.kind).toBe("none");
    expect(look.legwear.kind).toBe("none");
  });

  test("an outfit hat comes off with the next outfit, an ordinary one stays", () => {
    const witch = applyPreset(randomLook(3), "witch");
    expect(witch.headwear.style).toBe("witch-hat");
    expect(applyPreset(witch, "casual").headwear.style).toBe("none");
    const capped = { ...witch, headwear: { ...witch.headwear, style: "beanie" as const } };
    expect(applyPreset(capped, "casual").headwear.style).toBe("beanie");
  });

  test("randomLook is valid and deterministic for 500 seeds", () => {
    for (let s = 0; s < 500; s++) {
      const r = CharacterLook.safeParse(randomLook(s));
      if (!r.success) throw new Error(`seed ${s}: ${r.error.message}`);
      // nothing dropped by .catch: every wardrobe section survives the parse
      expect(r.data.body).toBeDefined();
      expect(r.data.underwear).toBeDefined();
      expect(r.data.accessories).toBeDefined();
    }
    expect(randomLook(42)).toEqual(randomLook(42));
  });

  test("repairLook keeps valid wardrobe sections of a partly broken look", () => {
    const good = randomLook(9);
    const broken = { ...good, shirt: { ...good.shirt, kind: "toga" } };
    const fixed = repairLook(broken, lookFromCatalog(avatarFromSeed("y")))!;
    expect(fixed.body).toEqual(good.body);
    expect(fixed.accessories).toEqual(good.accessories);
  });
});
