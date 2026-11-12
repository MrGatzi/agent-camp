/**
 * Which way a walker faces while moving by (dx, dy). Paths step in 8 directions but sheets only
 * have 4 walk views, so a diagonal step is a tie between |dx| and |dy|. Floating-point rounding
 * tips that tie one way or the other from frame to frame, which made walkers flicker between the
 * side and the front/back view on every diagonal tile. Near a tie the current facing is kept as
 * long as it still points along the move; otherwise the side view wins.
 */
import type { Facing } from "./map.ts";

/** how much bigger one axis must be than the other before the facing switches to it */
const SWITCH = 1.2;

export function facingFor(dx: number, dy: number, current: Facing): Facing {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const side: Facing = dx < 0 ? "left" : "right";
  const vertical: Facing = dy < 0 ? "up" : "down";
  if (ax > ay * SWITCH) return side;
  if (ay > ax * SWITCH) return vertical;
  return current === side || current === vertical ? current : side;
}
