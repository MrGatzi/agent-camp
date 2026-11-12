import { describe, expect, test } from "bun:test";
import { facingFor } from "../src/world/facing.ts";
import type { Facing } from "../src/world/map.ts";

/**
 * Walks from `from` to `to` the way the walkers do (36 px/s, frame times that vary a little) and
 * records every facing on the way.
 */
function walk(from: { x: number; y: number }, to: { x: number; y: number }, start: Facing) {
  let { x, y } = from;
  let facing = start;
  const seen = new Set<Facing>();
  for (let i = 0; i < 500; i++) {
    const dx = to.x - x;
    const dy = to.y - y;
    const d = Math.hypot(dx, dy);
    if (d <= 0.01) break;
    facing = facingFor(dx, dy, facing);
    seen.add(facing);
    const step = Math.min(d, 36 * (1 / 60 + (i % 3) * 0.002));
    x += (dx / d) * step;
    y += (dy / d) * step;
    if (step === d) break;
  }
  return seen;
}

describe("walking facing", () => {
  test("a diagonal tile step keeps one facing all the way, anywhere on the floor", () => {
    // before, rounding flipped about 40% of these steps between the side and front/back view
    for (let tx = 0; tx < 60; tx++) {
      for (let ty = 0; ty < 40; ty++) {
        const from = { x: tx * 16 + 8, y: ty * 16 + 13 };
        for (const [sx, sy] of [
          [16, 16],
          [-16, 16],
          [16, -16],
          [-16, -16],
        ] as const) {
          const start: Facing = sx < 0 ? "left" : "right";
          expect(walk(from, { x: from.x + sx, y: from.y + sy }, start).size).toBe(1);
        }
      }
    }
  });

  test("near a tie it keeps a facing that still fits and otherwise shows the side", () => {
    expect(facingFor(16, 16.0000001, "right")).toBe("right");
    expect(facingFor(16.0000001, 16, "down")).toBe("down");
    expect(facingFor(16, 16, "up")).toBe("right");
    expect(facingFor(-16, 16, "right")).toBe("left");
  });

  test("clear moves face their main axis", () => {
    expect(facingFor(16, 0, "up")).toBe("right");
    expect(facingFor(-16, 2, "down")).toBe("left");
    expect(facingFor(0, -16, "left")).toBe("up");
    expect(facingFor(3, 16, "right")).toBe("down");
  });
});
