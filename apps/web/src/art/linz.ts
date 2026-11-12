/**
 * Original static pixel art, painted into the existing clipped surround strips only.
 * Reference photos (viewed 2026-11-12): https://ars.electronica.art/center/en/,
 * https://www.lentos.at/en/ and Linz Tourism's Pöstlingberg / Hauptplatz galleries.
 * Full photo URLs and silhouette notes: docs/linz-surroundings.md. No photo assets shipped.
 */
import type { LinzLayout, LinzRect } from "../world/linzLayout.ts";
import { C } from "./palette.ts";
import type { PixelCanvas } from "./pixel.ts";
import { foliage } from "./seasons.ts";

export function paintLinz(pc: PixelCanvas, l: LinzLayout): void {
  const fill = (r: LinzRect, c: string) => pc.rect(r.x, r.y, r.w, r.h, c);
  const { north: n, river: r, hill: h, basilica: b, aec: a, lentos: t, facades: f } = l;
  // Quiet distant treeline, stepped hills and tiny copper-capped twin towers.
  fill(n, C.pine);
  for (let x = n.x; x < n.x + n.w; x += 12) {
    const lift = ((x + 192) * 7) % 19;
    pc.rect(x, -157 - lift, 13, 31 + lift, C.forest);
    pc.hline(x + 2, -155 - lift, 6, C.moss);
  }
  pc.ellipse(h.x, h.y + 12, h.w, 92, C.forest);
  pc.ellipse(h.x + 22, h.y + 15, h.w - 48, 69, C.moss);
  const leaves = foliage(0);
  for (let i = 0; i < 29; i++) {
    const x = h.x + 10 + ((i * 47) % 222);
    const y = -150 + ((i * 13) % 18);
    pc.ellipse(x, y, 14, 10, leaves?.dark ?? C.forest);
    pc.hline(x + 4, y + 1, 6, leaves?.mid ?? C.moss);
  }
  pc.rect(b.x + 8, b.y + 19, 36, 17, C.grey);
  for (let i = 0; i < 9; i++) pc.hline(b.x + 7 + i, b.y + 12 + i, 37 - i, C.dusk);
  pc.rect(b.x + 7, b.y + 27, 33, 9, C.silver);
  for (const x of [b.x, b.x + 17]) {
    pc.rect(x, b.y + 12, 10, 24, C.silver);
    pc.rect(x + 2, b.y + 13, 6, 20, C.cream);
    pc.rect(x + 4, b.y + 18, 2, 4, C.slate);
    pc.rect(x + 2, b.y + 10, 6, 3, C.dusk);
    pc.ellipse(x + 1, b.y + 5, 8, 7, C.pine);
    pc.vline(x + 5, b.y, 7, C.slate);
    pc.hline(x + 3, b.y + 2, 5, C.silver);
  }
  pc.rect(b.x + 12, b.y + 29, 3, 7, C.slate);

  fill(l.farBank, C.slate);
  pc.hline(n.x, -114, n.w, C.grey);
  fill(r, C.dusk);
  pc.rect(r.x, r.y + 3, r.w, 17, C.slate);
  pc.hline(r.x, r.y, r.w, C.silver);
  pc.hline(r.x, r.y + 2, r.w, C.pine);
  // Long sparse horizontal ripples, not noisy pond pixels or animated effects.
  for (let i = 0; i < 80; i++) {
    const x = r.x + ((i * 83) % (r.w - 36));
    const y = r.y + 7 + ((i * 17) % 39);
    pc.hline(x, y, 9 + ((i * 7) % 26), i % 4 === 0 ? C.grey : C.slate);
  }
  for (let i = 0; i < 7; i++) {
    pc.hline(a.x + 8 + i * 15, r.y + 5 + i * 5, 21 - i * 2, C.slate);
  }
  fill(l.nearBank, C.grey);
  pc.rect(n.x, -55, n.w, 5, C.slate);
  pc.hline(n.x, -58, n.w, C.silver);
  pc.hline(n.x, -49, n.w, C.silver);
  for (let x = n.x; x < n.x + n.w; x += 24) {
    pc.vline(x, -47, 39, C.slate);
    pc.hline(x, -26, 24, C.slate);
  }
  // Far-bank AEC: offset, sloping volumes with a regular LED-panel lattice.
  for (let dx = 0; dx < a.w; dx++) {
    const top = dx < 76 ? a.y + Math.floor(dx / 9) : a.y + 35 - Math.floor((dx - 76) / 7);
    pc.vline(a.x + dx, top, a.y + a.h - top, C.dusk);
    pc.set(a.x + dx, top, C.silver);
    for (let y = top + 3; y < a.y + a.h - 4; y++) {
      if (dx % 7 === 0 || (y - a.y) % 6 === 0) continue;
      const panel = Math.floor(dx / 7) + Math.floor((y - a.y) / 6);
      const c = panel % 9 === 0 ? C.plum : panel % 5 === 0 ? C.sky : C.slate;
      pc.set(a.x + dx, y, c);
    }
  }
  pc.vline(a.x + 76, a.y + 10, 55, C.ink);
  pc.rect(a.x - 3, -116, a.w + 6, 4, C.dusk);
  pc.hline(a.x, -117, a.w, C.grey);

  // Lentos: a very long glass frame; the large through-opening is NOT a door/window.
  fill(t, C.dusk);
  pc.rect(t.x + 1, t.y + 2, t.w - 2, t.h - 4, C.slate);
  for (let x = t.x + 4; x < t.x + t.w - 2; x += 6) {
    pc.vline(x, t.y + 3, t.h - 5, C.grey);
    pc.vline(x + 1, t.y + 4, 11, C.silver);
  }
  pc.hline(t.x + 2, t.y + 14, t.w - 4, C.grey);
  pc.hline(t.x, t.y, t.w, C.silver);
  const o = l.lentosOpening;
  fill(o, C.ink);
  pc.rect(o.x + 2, o.y + 3, o.w - 4, o.h - 6, C.slate);
  pc.rect(o.x + 2, o.y + 3, o.w - 4, 5, C.dusk);
  pc.hline(o.x + 2, o.y + o.h - 3, o.w - 4, C.grey);
  pc.rect(t.x + 16, t.y + 22, 13, 18, C.wine);
  pc.hline(t.x + 16, t.y + 22, 13, C.clay);

  // Contextual old-town fronts: cornices, pilasters, uneven roofs, arched shop bays.
  const fronts = [C.cream, C.tan, C.silver, C.cream, C.peach];
  for (let i = 0; i < 5; i++) {
    const x = f.x + i * 36;
    const y = f.y + [6, 0, 4, 2, 7][i]!;
    const w = i === 4 ? 40 : 36;
    pc.rect(x, y + 6, w, -8 - y - 6, fronts[i]!);
    pc.rect(x, y, w, 6, i % 2 ? C.cocoa : C.rust);
    pc.hline(x + 2, y - 1, w - 4, C.cocoa);
    pc.hline(x, y + 7, w, C.silver);
    pc.hline(x, -21, w, C.silver);
    pc.vline(x, y + 8, -8 - y - 8, C.grey);
    for (let wx = x + 6; wx < x + w - 4; wx += 10) {
      for (let wy = y + 11; wy < -23; wy += 9) {
        pc.rect(wx - 1, wy - 1, 5, 7, C.silver);
        pc.rect(wx, wy, 3, 5, C.slate);
        pc.set(wx + 1, wy + 3, C.tan);
      }
      pc.round(wx - 1, -18, 6, 10, C.cocoa);
      pc.rect(wx, -16, 4, 7, C.dusk);
    }
  }
  // A low planted bed shelters the existing night eyes inside the normal fit view.
  const v = l.nightlife.eyeVegetation;
  pc.rect(v.x, v.y + 13, v.w, 7, C.cocoa);
  const shrubs = foliage(1);
  for (let i = 0; i < 6; i++) {
    const x = v.x + 2 + i * 21;
    const y = v.y + 2 + (i % 2);
    pc.ellipse(x, y, 22, 15, C.pine);
    pc.ellipse(x + 1, y, 19, 12, shrubs?.dark ?? C.forest);
    pc.hline(x + 5, y + 2, 9, shrubs?.mid ?? C.moss);
  }
  pc.hline(v.x, v.y + v.h - 1, v.w, C.slate);

  // A few quiet benches and bollards unify the promenade, no new POIs.
  for (const { x } of l.benches) {
    pc.rect(x, -30, 18, 3, C.cocoa);
    pc.rect(x, -24, 18, 2, C.bark);
    pc.vline(x + 2, -22, 3, C.dusk);
    pc.vline(x + 15, -22, 3, C.dusk);
  }
  for (let x = n.x + 12; x < n.x + n.w; x += 48) {
    pc.rect(x, -47, 2, 4, C.dusk);
    pc.set(x, -48, C.silver);
  }
  pc.rect(n.x, -8, n.w, 8, C.pine);
  pc.hline(n.x, -8, n.w, C.slate);
}
