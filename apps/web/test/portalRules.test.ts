import { describe, expect, test } from "bun:test";
import { seededRandom } from "@agent-office/protocol";
import { buildOfficeMap, TILE } from "../src/world/map.ts";
import {
  EXIT_RUN,
  entranceFor,
  exitFor,
  freeAt,
  LINE_UP,
  MIN_HOP,
  PORTAL_GAP,
} from "../src/world/portalRules.ts";

/** A walled box: walkable inside x0..x1, y0..y1 (tiles). */
function box(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  return {
    width: w,
    height: h,
    isWalkable: (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1,
  };
}

describe("portal rules", () => {
  test("the entrance opens straight ahead of Rick, on his row", () => {
    const map = box(20, 10, 1, 1, 18, 8);
    const rick = { x: 8 * TILE + 8, y: 4 * TILE + 12 };
    expect(entranceFor(map, rick, 1)).toEqual({ x: rick.x + PORTAL_GAP, y: rick.y });
    expect(entranceFor(map, rick, -1)).toEqual({ x: rick.x - PORTAL_GAP, y: rick.y });
  });

  test("no entrance into a wall, nor without room for Morty behind Rick", () => {
    const map = box(20, 10, 1, 1, 18, 8);
    const nearRight = { x: 17 * TILE + 8, y: 4 * TILE + 12 };
    expect(entranceFor(map, nearRight, 1)).toBeNull();
    const nearLeft = { x: 1 * TILE + 4, y: 4 * TILE + 12 };
    expect(nearLeft.x - LINE_UP).toBeLessThan(TILE);
    expect(entranceFor(map, nearLeft, 1)).toBeNull();
  });

  test("exits are far away and have a free runway in the walking direction", () => {
    const map = buildOfficeMap(4);
    const rand = seededRandom("exits");
    const from = { x: 20 * TILE + 8, y: 14 * TILE + 12 };
    for (const dir of [1, -1] as const) {
      for (let i = 0; i < 40; i++) {
        const b = exitFor(map, from, dir, rand);
        expect(b).not.toBeNull();
        if (!b) continue;
        expect(Math.hypot(b.x - from.x, b.y - from.y)).toBeGreaterThanOrEqual(MIN_HOP);
        for (let d = 0; d <= EXIT_RUN; d += 2) expect(freeAt(map, b.x + dir * d, b.y)).toBe(true);
      }
    }
  });

  test("no exit when nothing is walkable", () => {
    const solid = { width: 10, height: 10, isWalkable: () => false };
    expect(exitFor(solid, null, 1, seededRandom("x"))).toBeNull();
  });
});
