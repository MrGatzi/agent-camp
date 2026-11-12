import { describe, expect, test } from "bun:test";
import {
  applyPreset,
  avatarFromSeed,
  CharacterLook,
  OUTFIT_PRESETS,
  randomLook,
} from "@agent-office/protocol";
import { LOOK_FIXTURES } from "@agent-office/protocol/fixtures";
import {
  DESIGN_SECTIONS,
  type Draft,
  draftKey,
  draftOf,
  visibleColors,
  visibleRows,
} from "../src/ui/studio/design.ts";

const strict = (d: Draft) => {
  const r = CharacterLook.safeParse(d.look);
  if (!r.success) throw new Error(r.error.message);
  // nothing silently dropped by .catch()
  for (const k of ["body", "underwear", "apron", "accessories", "extras"] as const)
    expect(r.data[k]).toBeDefined();
};

describe("look studio: Design it", () => {
  const drafts: Draft[] = [
    draftOf(avatarFromSeed("anna")), // catalog look
    draftOf(LOOK_FIXTURES.tracht), // AI look
    ...Array.from({ length: 40 }, (_, i) =>
      draftOf({ ...avatarFromSeed(`p${i}`), look: randomLook(i) }),
    ),
    ...OUTFIT_PRESETS.map((p) =>
      draftOf({ ...avatarFromSeed("x"), look: applyPreset(randomLook(3), p.id) }),
    ),
  ];

  test("a draft is the look worn now, every wardrobe section filled", () => {
    const d = draftOf(LOOK_FIXTURES.tracht);
    expect(d.look.shirt).toEqual(LOOK_FIXTURES.tracht.look!.shirt);
    expect(d.look.body.height).toBe("average");
    strict(d);
  });

  test("every row shows its current value among its choices", () => {
    for (const d of drafts)
      for (const s of DESIGN_SECTIONS)
        for (const r of visibleRows(s, d)) {
          if (!r.options.length) continue;
          const v = r.get(d);
          if (!r.options.some((o) => o.id === v)) throw new Error(`${r.id}: ${v} not a choice`);
        }
  });

  test("every choice of every row keeps the look valid", () => {
    const base = drafts[1]!;
    for (const s of DESIGN_SECTIONS)
      for (const r of s.rows)
        for (const o of r.options) {
          const d = structuredClone(base);
          r.set(d, o.id);
          // emptying a desk slot moves the later props up (desk props hold no gaps)
          if (!r.id.startsWith("desk")) expect(r.get(d)).toBe(o.id);
          strict(d);
        }
  });

  test("every colour chip takes a colour (and none where allowed)", () => {
    const base = drafts[1]!;
    for (const s of DESIGN_SECTIONS)
      for (const r of s.rows)
        for (const c of r.colors ?? []) {
          const d = structuredClone(base);
          c.set(d, "#12ab34");
          expect(c.get(d)).toBe("#12ab34");
          strict(d);
          if (c.none) {
            c.set(d, "none");
            expect(c.get(d)).toBe("none");
            strict(d);
          }
        }
  });

  test("colour chips hide while their part is not worn", () => {
    const d = structuredClone(drafts[1]!);
    const hat = DESIGN_SECTIONS.flatMap((s) => s.rows).find((r) => r.id === "hat")!;
    hat.set(d, "none");
    expect(visibleColors(hat, d)).toEqual([]);
    hat.set(d, "top-hat");
    expect(visibleColors(hat, d).length).toBe(2);
  });

  test("desk items never repeat and the draft key notices changes", () => {
    const d = structuredClone(drafts[0]!);
    const key = draftKey(d);
    const rows = DESIGN_SECTIONS.find((s) => s.id === "desk")!.rows;
    rows[0]!.set(d, "lamp");
    expect(rows[1]!.skip!(d).has("lamp")).toBe(true);
    expect(draftKey(d)).not.toBe(key);
  });
});
