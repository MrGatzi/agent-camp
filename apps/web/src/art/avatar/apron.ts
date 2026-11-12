/**
 * Aprons (WD1, `look.apron`), painted after the vest and before the outer layer:
 *   dirndl   gathered waist apron down to about the skirt hem, ribbon all the way round and a
 *            bow at the wearer's left hip (single), right hip (taken), front or back
 *   kitchen  bib apron from the chest to the knee, neck strap, a pocket
 *   waist    short half apron to mid-thigh
 * "left" / "right" are the wearer's: seen from the front the left bow sits on the viewer's
 * right, from behind on the viewer's left, from the side (facing left) on the hip we see.
 */
import { mix, NIGHT } from "./color.ts";
import { type Ctx, torsoSpan } from "./ctx.ts";
import { type Fabric, fabricAt } from "./patterns.ts";
import type { TorsoBox } from "./torso.ts";

const CX0 = 15;

function fabric(c: Ctx): Fabric {
  const a = c.L.apron;
  return { ramp: a.ramp, pattern: a.pattern, salt: 11 };
}

/** Last row of the apron: the skirt hem (dirndl), the knee (kitchen) or mid-thigh (waist). */
function hemRow(c: Ctx, b: TorsoBox): number {
  const kind = c.L.apron.kind;
  if (b.seated) return kind === "waist" ? b.W + 2 : b.end;
  return c.legRow(kind === "waist" ? 36 : kind === "kitchen" ? 40 : 39);
}

const ribbon = (c: Ctx) => mix(c.L.apron.ramp.base, NIGHT, 0.2);

/** A 5-texel bow centred on column x0 at the waistband row W, tails hanging down. */
function bow(c: Ctx, x0: number, W: number) {
  const a = c.L.apron.ramp;
  const pc = c.pc;
  const knot = mix(a.base, NIGHT, 0.3);
  for (const dx of [-2, -1, 1, 2]) {
    pc.set(x0 + dx, W - 1, dx < 0 ? a.light : a.base);
    pc.set(x0 + dx, W + 1, dx < 0 ? a.base : a.shadow);
  }
  pc.set(x0 - 2, W, a.base);
  pc.set(x0 + 2, W, a.shadow);
  pc.hline(x0 - 1, W, 3, knot);
  // the ribbon ends hang long (a dirndl's show below a jacket)
  const long = c.L.apron.kind === "dirndl" ? 3 : 0;
  pc.vline(x0 - 1, W + 2, 2 + long, a.base);
  pc.vline(x0 + 1, W + 2, 1 + long, a.shadow);
  pc.set(x0 - 1, W + 4 + long, a.shadow);
  pc.set(x0 + 2, W + 3 + long, a.shadow);
}

/** Rows y0..y1 of an apron panel from column a to z, flaring a texel every 4 rows. */
function panel(c: Ctx, y0: number, y1: number, a: number, z: number, flare: boolean) {
  const f = fabric(c);
  const sh = c.L.apron.ramp.shadow;
  for (let y = y0; y <= y1; y++) {
    const fl = flare ? Math.floor((y - y0) / 4) : 0;
    for (let x = a - fl; x <= z + fl; x++)
      c.pc.set(x, y, x === z + fl ? sh : fabricAt(f, x, y - y0));
  }
}

export function drawApronFront(c: Ctx, b: TorsoBox) {
  const ap = c.L.apron;
  if (ap.kind === "none") return;
  const pc = c.pc;
  const hem = hemRow(c, b);
  const [wl, wr] = torsoSpan(c, b.W, b.T, b.W);
  const a = ap.ramp;
  if (ap.kind === "kitchen") {
    // bib on the chest with a strap round the neck
    panel(c, b.T + 2, b.W - 1, CX0 - 3, CX0 + 4, false);
    pc.hline(CX0 - 3, b.T + 2, 8, a.light);
    pc.set(CX0 - 3, b.T + 1, a.shadow);
    pc.set(CX0 - 4, b.T, a.shadow);
    pc.set(CX0 + 4, b.T + 1, a.shadow);
    pc.set(CX0 + 5, b.T, a.shadow);
  }
  const dirndl = ap.kind === "dirndl";
  const pa = dirndl ? wl + 2 : wl + 1;
  const pz = dirndl ? wr - 2 : wr - 1;
  panel(c, b.W + 1, hem, pa, pz, dirndl);
  if (dirndl) {
    // gathers under the waistband
    for (let x = pa; x <= pz; x += 2) {
      pc.set(x, b.W + 1, a.shadow);
      pc.set(x, b.W + 2, a.shadow);
    }
  } else {
    // a pocket across the front
    const py = Math.min(hem - 1, b.W + 3);
    pc.hline(CX0 - 2, py, 6, a.shadow);
  }
  const fe = dirndl ? Math.floor((hem - b.W - 1) / 4) : 0;
  pc.hline(pa - fe, hem, pz - pa + 1 + 2 * fe, a.shadow);
  // the ribbon round the waist, knotted at the chosen place
  pc.hline(wl, b.W, wr - wl + 1, ribbon(c));
  if (ap.bow === "front") bow(c, CX0, b.W);
  else if (ap.bow === "left") bow(c, wr - 2, b.W);
  else if (ap.bow === "right") bow(c, wl + 2, b.W);
}

export function drawApronBack(c: Ctx, b: TorsoBox) {
  const ap = c.L.apron;
  if (ap.kind === "none") return;
  const pc = c.pc;
  const [wl, wr] = torsoSpan(c, b.W, b.T, b.W);
  pc.hline(wl, b.W, wr - wl + 1, ribbon(c));
  if (ap.kind === "kitchen") {
    // the neck strap crosses the back
    for (let k = 0; k < 4; k++) {
      pc.set(CX0 - 3 + k, b.T + k, ribbon(c));
      pc.set(CX0 + 4 - k, b.T + k, ribbon(c));
    }
  }
  // the knot from behind: the back, or the hip it is tied at
  if (ap.bow === "back") bow(c, CX0, b.W);
  else if (ap.bow === "left") bow(c, wl + 2, b.W);
  else if (ap.bow === "right") bow(c, wr - 2, b.W);
}

export function drawApronSide(c: Ctx, b: TorsoBox) {
  const ap = c.L.apron;
  if (ap.kind === "none") return;
  const pc = c.pc;
  const hem = hemRow(c, b);
  const [wl, wr] = torsoSpan(c, b.W, b.T, b.W);
  if (ap.kind === "kitchen") panel(c, b.T + 2, b.W - 1, wl - 1, wl + 1, false);
  // the apron hangs in front of the body, a little away from the legs
  panel(c, b.W + 1, hem, wl - 1, wl + 3, ap.kind === "dirndl");
  pc.hline(wl, b.W, wr - wl + 1, ribbon(c));
  // facing left we see the wearer's left hip
  if (ap.bow === "left") bow(c, Math.floor((wl + wr) / 2), b.W);
  else if (ap.bow === "front") bow(c, wl + 1, b.W);
  else if (ap.bow === "back") bow(c, wr - 1, b.W);
}
