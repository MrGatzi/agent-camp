/**
 * Accessories (WD6, `look.accessories`): mask, wings, tail, gloves, necklace, bag.
 * Behind = painted before the body (wings and tail seen from the front); Front = after torso,
 * arms and held items (wings and tail seen from behind, necklace, bag); Head = on the face,
 * after the hair and before glasses and hats (masks).
 */
import type { FullLook } from "@agent-office/protocol";
import type { PixelCanvas } from "../pixel.ts";
import type { Ctx } from "./ctx.ts";
import type { View } from "./geometry.ts";
import type { TorsoBox } from "./torso.ts";

export function drawAccessoriesBehind(_c: Ctx, _b: TorsoBox): void {}

export function drawAccessoriesFront(_c: Ctx, _b: TorsoBox): void {}

export function drawAccessoriesHead(
  _pc: PixelCanvas,
  _L: FullLook,
  _view: View,
  _hy: number,
): void {}
