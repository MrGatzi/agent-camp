/**
 * Dev preview: paint looks headlessly into one upscaled PNG grid, to eyeball pixel art without a
 * browser. One row per look; columns = front idle, side, back, seated at the desk, seated front.
 *
 *   bun apps/web/scripts/look-grid.ts out.png presets            every outfit preset
 *   bun apps/web/scripts/look-grid.ts out.png random 12          12 random looks
 *   bun apps/web/scripts/look-grid.ts out.png json looks.json    [CharacterLook, ...]
 *   bun apps/web/scripts/look-grid.ts out.png vary <path> v1,v2  one field of the probe look
 *                                                               (e.g. headwear.style top-hat,beret)
 */
import { writeFileSync } from "node:fs";
import {
  applyPreset,
  avatarFromSeed,
  type CharacterLook,
  lookFromCatalog,
  OUTFIT_PRESETS,
  randomLook,
  withWardrobe,
} from "@agent-office/protocol";
import { encodePng } from "../../../tools/sim/src/png.ts";
import { FH, FW } from "../src/art/avatar/geometry.ts";
import { lookFor } from "../src/art/avatar/renderLook.ts";
import { paintSheet } from "../src/art/avatar/sheet.ts";

const [out = "look-grid.png", mode = "presets", ...rest] = process.argv.slice(2);
const SCALE = 4;
const FRAMES = [0, 10, 30, 22, 28];
const BG = [0x3a, 0x44, 0x66];
const BG2 = [0x26, 0x2b, 0x44];

const cat = lookFromCatalog(avatarFromSeed("probe"));
const probe = withWardrobe({
  ...cat,
  outer: { ...cat.outer, open: false },
  eyewear: { ...cat.eyewear, style: "none" },
});

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    o[k] = { ...(o[k] as Record<string, unknown>) };
    o = o[k] as Record<string, unknown>;
  }
  o[keys.at(-1)!] = value;
}

let looks: { label: string; look: CharacterLook }[] = [];
if (mode === "presets")
  looks = OUTFIT_PRESETS.map((p) => ({ label: p.id, look: applyPreset(probe, p.id) }));
else if (mode === "random")
  looks = Array.from({ length: Number(rest[0] ?? 12) }, (_, i) => ({
    label: `seed ${i}`,
    look: randomLook(i + Number(rest[1] ?? 0)),
  }));
else if (mode === "json")
  looks = (JSON.parse(await Bun.file(rest[0]!).text()) as CharacterLook[]).map((look, i) => ({
    label: String(i),
    look,
  }));
else if (mode === "vary") {
  const [path, values] = rest;
  looks = values!.split(",").map((v) => {
    const look = structuredClone(probe) as unknown as Record<string, unknown>;
    setPath(look, path!, v === "true" ? true : v === "false" ? false : v);
    return { label: v, look: look as unknown as CharacterLook };
  });
}

const cellW = FW * SCALE + 8;
const cellH = FH * SCALE + 8;
const W = cellW * FRAMES.length;
const H = cellH * looks.length;
const rgb = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const c = (Math.floor(x / cellW) + Math.floor(y / cellH)) % 2 ? BG : BG2;
    rgb.set(c, (y * W + x) * 3);
  }
looks.forEach(({ look }, r) => {
  const sheet = paintSheet(lookFor({ ...avatarFromSeed("probe"), look }, "claude", null));
  FRAMES.forEach((f, col) => {
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const v = sheet.data[y * sheet.width + f * FW + x]!;
        const a = v >>> 24;
        if (!a) continue;
        const px = [v & 255, (v >> 8) & 255, (v >> 16) & 255];
        for (let dy = 0; dy < SCALE; dy++)
          for (let dx = 0; dx < SCALE; dx++) {
            const X = col * cellW + 4 + x * SCALE + dx;
            const Y = r * cellH + 4 + y * SCALE + dy;
            rgb.set(px, (Y * W + X) * 3);
          }
      }
  });
});
writeFileSync(out, encodePng(W, H, rgb));
console.log(`${out}: ${looks.length} looks (${looks.map((l) => l.label).join(", ")})`);
