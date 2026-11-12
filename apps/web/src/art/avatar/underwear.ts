/**
 * The body under the clothes (WD5): bare skin of the torso and hips in the skin ramp, then the
 * underwear (`look.underwear`). Garments are painted over it, so whatever a `none` garment
 * leaves uncovered shows skin or underwear. With nothing on, the body is a smooth, featureless
 * doll body (no anatomical detail).
 */
import type { Ctx } from "./ctx.ts";
import type { TorsoBox } from "./torso.ts";

/** Bare torso (+ underwear top), painted before the shirt. */
export function drawBodyTorso(_c: Ctx, _b: TorsoBox): void {}

/** Bare hips (+ underwear bottom), painted in the leg layer before the bottoms. */
export function drawBodyHips(_c: Ctx, _b: TorsoBox): void {}
