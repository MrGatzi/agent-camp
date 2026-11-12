/**
 * The body layer under the clothes (WD5): underwear and the bare body stay hidden under
 * ordinary clothes, and show where a garment is `none`.
 */
import { describe, expect, test } from "bun:test";
import {
  avatarFromSeed,
  bottomsOf,
  type CharacterLook,
  lookFromCatalog,
  underwearOf,
  withWardrobe,
} from "@agent-office/protocol";
import { lookFor } from "../src/art/avatar/renderLook.ts";
import { paintSheet } from "../src/art/avatar/sheet.ts";

const base = withWardrobe(lookFromCatalog(avatarFromSeed("probe")));
const bytes = (look: CharacterLook) =>
  Array.from(paintSheet(lookFor({ ...avatarFromSeed("probe"), look }, "claude", null)).data).join(
    ",",
  );

describe("body layer under the clothes", () => {
  test("underwear never shows through trousers, skirts or a shirt", () => {
    const uw = underwearOf("sports-bra", "#e43b44", "swim-trunks", "#0099db", { trim: "#fee761" });
    const kinds = ["trousers", "jeans", "skirt", "dress", "lederhosen", "shorts", "kilt"] as const;
    for (const kind of kinds) {
      const dressed = { ...base, bottoms: bottomsOf(kind, "#3a4466") };
      expect(`${kind} ${bytes({ ...dressed, underwear: uw }) === bytes(dressed)}`).toBe(
        `${kind} true`,
      );
    }
  });

  test("with bottoms none, the underwear bottom shows", () => {
    const bare = { ...base, bottoms: bottomsOf("none", "#3a4466") };
    const uw = underwearOf("none", "#ffffff", "boxers", "#0099db");
    expect(bytes({ ...bare, underwear: uw })).not.toBe(bytes(bare));
  });
});
