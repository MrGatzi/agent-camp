/**
 * The HD paper-doll painter: one 36-frame sheet (32×56 texels per frame) for a RenderLook.
 * Pure PixelCanvas (no Pixi, no DOM), so tests and preview scripts can run it headless.
 */
import { HEIGHT_LIFT } from "@agent-office/protocol";
import { PixelCanvas } from "../pixel.ts";
import {
  drawAccessoriesBehind,
  drawAccessoriesFront,
  drawAccessoriesHead,
  drawAccessoriesOverHair,
} from "./accessories.ts";
import { drawArmSide, drawArmsBack, drawArmsFront, drawMug, drawRaisedHand } from "./arms.ts";
import { type Ctx, torsoCols } from "./ctx.ts";
import { drawCostumeHead, drawCostumeTorso, drawExtras } from "./extras.ts";
import { drawEyewear } from "./eyewear.ts";
import {
  BODY_ROWS,
  FH,
  type FrameSpec,
  FW,
  HEADROOM,
  SEAT_DROP,
  SPECS,
  type View,
} from "./geometry.ts";
import { drawHair } from "./hair.ts";
import { drawHeadSkin } from "./head.ts";
import { drawEarrings, drawHeadwear } from "./headwear.ts";
import { drawLegsSeatedFront, drawLegsSide, drawLegsStanding, drawSeatBackHip } from "./legs.ts";
import type { RenderLook } from "./renderLook.ts";
import { drawTorsoBack, drawTorsoFront, drawTorsoSide, type TorsoBox, torsoBox } from "./torso.ts";
import { drawBodyHips, drawBodyTorso } from "./underwear.ts";

/** Height lift of a frame: the full lift standing, half of it seated (WD3). */
function liftOf(r: RenderLook, f: FrameSpec): number {
  const lift = HEIGHT_LIFT[r.look.body.height];
  return f.seat === "none" ? lift : Math.trunc(lift / 2);
}

function makeCtx(
  pc: PixelCanvas,
  r: RenderLook,
  f: FrameSpec,
  after: (() => void)[],
  lift: number,
  legRow: (y: number) => number,
): Ctx {
  const L = r.look;
  const view: View = f.seat === "back" ? "up" : f.view;
  const [tl, tr] = torsoCols(L.build, view);
  return {
    pc,
    r,
    L,
    f,
    view,
    dy: f.bob + (f.seat === "none" ? 0 : SEAT_DROP) - lift,
    lift,
    legRow,
    tl,
    tr,
    posed: !!f.posed,
    sleeve: L.outer.kind !== "none" ? L.outer.ramp : L.shirt.ramp,
    after,
  };
}

const scratch = new PixelCanvas(FW, FH);
/** The leg layer: painted at average height, then stretched to the body's height. */
const legLayer = new PixelCanvas(FW, FH);
/** Rows from here down (socks, shoes, seated knees) keep their place when legs stretch. */
const LEG_ANCHOR = 40;

/**
 * Row mapping of the height stretch: leg-layer rows [top, LEG_ANCHOR) become
 * [top - lift, LEG_ANCHOR); rows above move up by `lift`, rows from the anchor down stay.
 */
function legStretch(top: number, lift: number) {
  const n = LEG_ANCHOR - top;
  const n2 = n + lift;
  /** destination row -> source row (inside the stretched band) */
  const src = (yd: number) => top + Math.min(n - 1, Math.floor(((yd - (top - lift)) * n) / n2));
  const dest = (ys: number) =>
    ys < top ? ys - lift : ys >= LEG_ANCHOR ? ys : top - lift + Math.floor(((ys - top) * n2) / n);
  return { src, dest, from: top - lift };
}

/** Copy the leg layer onto the frame, stretched (or squeezed) by `lift` rows. */
function blitLegs(pc: PixelCanvas, top: number, lift: number) {
  const { src, from } = legStretch(top, lift);
  const W = legLayer.width;
  for (let yd = -HEADROOM; yd < BODY_ROWS; yd++) {
    let ys = yd;
    if (lift !== 0) {
      if (yd < from) ys = yd + lift;
      else if (yd < LEG_ANCHOR) ys = src(yd);
    }
    const row = ys + HEADROOM;
    if (row < 0 || row >= FH) continue;
    for (let x = 0; x < W; x++) {
      const v = legLayer.data[row * W + x]!;
      if (v >>> 24 !== 0) pc.put(x, yd, v);
    }
  }
}

/** Head with hair, glasses, headwear. Tilted heads are painted aside and sheared. */
function drawHead(c: Ctx, view: View, hy: number) {
  const tilt = c.posed && c.L.pose.headTilt && view === "down";
  const pc = tilt ? scratch : c.pc;
  if (tilt) {
    scratch.data.fill(0);
    scratch.at(0, HEADROOM);
  }
  const L = c.L;
  drawHeadSkin(pc, L, view, hy);
  drawEarrings(pc, L, view, hy);
  drawHair(pc, L, view, hy);
  drawCostumeHead(pc, L, view, hy);
  drawAccessoriesHead(pc, L, view, hy);
  drawEyewear(pc, L, view, hy);
  drawHeadwear(pc, L, view, hy, c.r.hat);
  if (!tilt) return;
  // slight tilt: everything above the eyes (hair, hat, brows) leans one texel to the
  // viewer's right; face and chin stay put
  for (let y = 0; y < FH; y++) {
    const body = y - HEADROOM;
    const shift = body < 12 + hy ? 1 : 0;
    for (let x = 0; x < FW; x++) {
      const v = scratch.data[y * FW + x]!;
      if (v >>> 24 !== 0) c.pc.put(x + shift, body, v);
    }
  }
}

function paintFrame(pc: PixelCanvas, r: RenderLook, f: FrameSpec, after: (() => void)[]) {
  const lift = liftOf(r, f);
  // the legs: average height into their own layer, then stretched under the lifted torso
  legLayer.data.fill(0);
  legLayer.at(0, HEADROOM);
  const lc = makeCtx(legLayer, r, f, after, 0, (y) => y);
  const lb: TorsoBox = torsoBox(lc);
  const top = lb.W;
  const { dest } = legStretch(top, lift);
  const c = makeCtx(pc, r, f, after, lift, lift === 0 ? (y) => y : dest);
  const b: TorsoBox = torsoBox(c);
  drawAccessoriesBehind(c, b);
  if (f.seat === "none") {
    drawBodyHips(lc, lb);
    if (c.view === "left") drawLegsSide(lc, lb, f.phase);
    else drawLegsStanding(lc, lb, c.view === "up", f.phase);
    blitLegs(pc, top, lift);
    drawBodyTorso(c, b);
    if (c.view === "left") {
      drawTorsoSide(c, b);
      drawCostumeTorso(c, b);
      drawArmSide(c, b, f.phase);
      drawExtras(c, b, f.arms, f.phase);
      if (r.mug && f.phase === 0) drawMug(c, 9, b.T + 6);
    } else if (c.view === "down") {
      drawTorsoFront(c, b);
      drawCostumeTorso(c, b);
      drawArmsFront(c, b, f.arms, f.phase);
      drawExtras(c, b, f.arms, f.phase);
      if (
        r.mug &&
        f.arms === "down" &&
        !(c.posed && c.L.pose.hands !== "relaxed" && c.L.pose.hands !== "hand-in-pocket")
      )
        drawMug(c, c.tr + 1, b.T + 8);
      if (r.mug && (f.arms === "wave0" || f.arms === "wave1") && c.L.pose.hands === "relaxed")
        drawMug(c, c.tl - 4, b.T + 8);
    } else {
      drawTorsoBack(c, b);
      drawCostumeTorso(c, b);
      drawArmsBack(c, b, f.arms, f.phase);
      drawExtras(c, b, f.arms, f.phase);
    }
    drawAccessoriesFront(c, b);
    drawHead(c, c.view, c.dy + (f.bow ?? 0));
    drawAccessoriesOverHair(c, b);
    if (c.view === "down") drawRaisedHand(c, b, f.arms);
    return;
  }
  if (f.seat === "back") {
    drawBodyHips(lc, lb);
    drawSeatBackHip(lc, lb);
    blitLegs(pc, top, lift);
    drawBodyTorso(c, b);
    drawTorsoBack(c, b);
    drawCostumeTorso(c, b);
    drawArmsBack(c, b, f.arms, 0);
    drawExtras(c, b, f.arms, 0);
    drawAccessoriesFront(c, b);
    drawHead(c, "up", c.dy);
    drawAccessoriesOverHair(c, b);
    return;
  }
  // seated, facing the camera
  drawBodyHips(lc, lb);
  drawLegsSeatedFront(lc, lb);
  blitLegs(pc, top, lift);
  drawBodyTorso(c, b);
  drawTorsoFront(c, b);
  drawCostumeTorso(c, b);
  drawArmsFront(c, b, f.arms === "rest" ? "down" : f.arms, 0);
  drawExtras(c, b, f.arms === "rest" ? "down" : f.arms, 0);
  if (r.mug && f.arms === "rest") drawMug(c, c.tr - 1, b.T + 4);
  drawAccessoriesFront(c, b);
  drawHead(c, "down", c.dy);
  drawRaisedHand(c, b, f.arms);
}

/**
 * Paint all frames side by side (32×56 each: HEADROOM rows, then the 48 body rows), 2-texel
 * outline, mirrored right frames.
 */
export function paintSheet(r: RenderLook): PixelCanvas {
  const pc = new PixelCanvas(FW * SPECS.length, FH);
  SPECS.forEach((spec, i) => {
    if (spec.mirror !== undefined) return;
    const after: (() => void)[] = [];
    const clip = { x0: i * FW, y0: 0, x1: (i + 1) * FW, y1: FH };
    pc.at(i * FW, HEADROOM);
    pc.clip = clip;
    paintFrame(pc, r, spec, after);
    pc.clip = null;
    pc.at(0, 0);
    pc.outline(i * FW, 0, FW, FH);
    pc.outline(i * FW, 0, FW, FH);
    // thin things stay thin: painted over the outline
    if (after.length) {
      pc.at(i * FW, HEADROOM);
      pc.clip = clip;
      for (const paint of after) paint();
      pc.clip = null;
      pc.at(0, 0);
    }
  });
  SPECS.forEach((spec, i) => {
    if (spec.mirror !== undefined) pc.mirrorFrom(spec.mirror * FW, 0, FW, FH, i * FW, 0);
  });
  return pc;
}
