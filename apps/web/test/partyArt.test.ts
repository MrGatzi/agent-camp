import { describe, expect, test } from "bun:test";
import {
  ACCENT_COLORS,
  ACCESSORIES,
  type AvatarSpec as Avatar,
  AvatarSpec,
  avatarFromSeed,
  HELD_ITEMS,
  OUTFITS,
  VEHICLES,
  WRISTWEAR,
} from "@agent-office/protocol";
import { FH, FW } from "../src/art/avatar/geometry.ts";
import { lookFor, lookKey, paintSheet } from "../src/art/characters.ts";
import { vehiclePixels } from "../src/art/party.ts";

const base = {
  ...avatarFromSeed("anna"),
  accessory: "none" as const,
  leftHand: "none" as const,
  rightHand: "none" as const,
};
const signature = (avatar: Avatar) =>
  Array.from(paintSheet(lookFor(avatar, "codex", null)).data).join(",");
const frame = (avatar: Avatar, index: number) => {
  const sheet = paintSheet(lookFor(avatar, "codex", null));
  const pixels: number[] = [];
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) pixels.push(sheet.data[y * sheet.width + index * FW + x]!);
  return pixels.join(",");
};

describe("integrated avatar costumes", () => {
  test("each catalog option has distinct paper-doll artwork", () => {
    for (const [slot, entries] of [
      ["accessory", ACCESSORIES],
      ["outfit", OUTFITS],
      ["leftHand", HELD_ITEMS],
      ["rightHand", HELD_ITEMS],
      ["wrist", WRISTWEAR],
    ] as const) {
      expect(new Set(entries.map(({ id }) => signature({ ...base, [slot]: id }))).size).toBe(
        entries.length,
      );
    }
    expect(
      new Set(
        ACCENT_COLORS.map(({ id }) =>
          signature({ ...base, leftHand: "lightsaber", accentColor: id }),
        ),
      ).size,
    ).toBe(ACCENT_COLORS.length);
    expect(
      new Set(
        VEHICLES.map(({ id }) =>
          Array.from(vehiclePixels({ ...base, vehicle: id }).data).join(","),
        ),
      ).size,
    ).toBe(VEHICLES.length);
  });

  test("cat ears and neon bands remain visible across front, back, side and seated frames", () => {
    for (const index of [0, 6, 10, 14, 18, 24])
      for (const [slot, value] of [
        ["accessory", "cat-ears"],
        ["wrist", "neon-pink"],
        ["outfit", "cat"],
      ] as const) {
        expect(frame({ ...base, [slot]: value }, index)).not.toBe(frame(base, index));
      }
  });

  test("held items remain visible in either hand while facing away and sitting", () => {
    for (const hand of ["leftHand", "rightHand"] as const)
      for (const item of HELD_ITEMS.filter((e) => e.id !== "none"))
        for (const index of [0, 6, 10, 14, 18]) {
          expect(frame({ ...base, [hand]: item.id }, index)).not.toBe(frame(base, index));
        }
  });

  test("old avatar payloads receive neutral defaults", () => {
    const { wrist: _w, accentColor: _a, vehicle: _v, ...legacy } = avatarFromSeed("anna");
    const parsed = AvatarSpec.parse(legacy);
    expect([parsed.wrist, parsed.accentColor, parsed.vehicle]).toEqual(["none", "cyan", "none"]);
    expect(lookKey(lookFor(parsed, "codex", null))).not.toBe(
      lookKey(lookFor({ ...parsed, wrist: "rainbow" }, "codex", null)),
    );
  });
});
