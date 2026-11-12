import { describe, expect, test } from "bun:test";
import {
  paintAirliner,
  paintAirport,
  paintArs,
  paintBurj,
  paintSagrada,
} from "../src/art/landmarks.ts";
import { FLIGHT_SECONDS, flightAt, LANDMARKS, WORLD_COLS } from "../src/world/landmarkLayout.ts";
import { buildOfficeMap } from "../src/world/map.ts";
import { findPath } from "../src/world/pathing.ts";

describe("landmark district", () => {
  for (const rows of [4, 6]) {
    for (const growth of [0, 2]) {
      test(`promenade remains reachable with ${rows} pod rows and ${growth} extra rows`, () => {
        const map = buildOfficeMap(rows + growth);
        expect(map.width).toBe(WORLD_COLS);
        expect(map.height).toBe(30 + (rows + growth - 4) * 6);
        expect(map.rows.every((row) => row.length === WORLD_COLS)).toBe(true);
        for (const landmark of LANDMARKS) {
          expect(map.areas.find((area) => area.name === landmark.name)).toBeDefined();
          if (landmark.name !== "airport") {
            expect(landmark.y + landmark.h).toBeLessThan(0);
            expect(landmark.x + landmark.w).toBeLessThanOrEqual(64);
            continue;
          }
          const view = map.pois.find((poi) => poi.id === `${landmark.name}-view`)!;
          expect(map.isWalkable(view.tile.x, view.tile.y)).toBe(true);
          expect(findPath(map, map.spawn, view.tile)).not.toBeNull();
          expect(map.isWalkable(landmark.x + 3, 12)).toBe(false);
          expect(map.baseWalkable(landmark.x + 3, 12)).toBe(false);
        }
      });
    }
  }
  test("large, deterministic, distinct pixel art with a transparent skyline", () => {
    for (const paint of [paintSagrada, paintBurj, paintArs, paintAirport]) {
      const a = paint();
      expect(a.height).toBe(464);
      expect(a.width).toBeGreaterThanOrEqual(272);
      expect(a.get(0, 0)).toBe(0);
      expect(new Set(a.data).size).toBeGreaterThan(15);
      expect(a.data).toEqual(paint().data);
    }
    expect(paintAirliner().data.some((pixel) => pixel !== 0)).toBe(true);
  });
});

describe("scheduled airport traffic", () => {
  test("lands, taxis, parks, departs and repeats every 72 seconds", () => {
    expect(flightAt(2).phase).toBe("landing");
    expect(flightAt(18).phase).toBe("taxi-in");
    expect(flightAt(35).phase).toBe("parked");
    expect(flightAt(46).phase).toBe("taxi-out");
    expect(flightAt(60).phase).toBe("takeoff");
    expect(flightAt(69).visible).toBe(false);
    for (let time = 0; time < FLIGHT_SECONDS; time++) {
      const f = flightAt(time);
      expect(flightAt(time + FLIGHT_SECONDS)).toEqual(f);
      expect(f.x).toBeGreaterThanOrEqual(20);
      expect(f.x).toBeLessThanOrEqual(570);
      expect(f.y).toBeGreaterThanOrEqual(108);
      expect(f.y).toBeLessThanOrEqual(210);
    }
  });
  test("visible flight legs meet continuously and altitude follows landing/takeoff", () => {
    for (const boundary of [10, 15, 21, 29, 41, 49, 55]) {
      const before = flightAt(boundary - 0.001);
      const after = flightAt(boundary);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.1);
      expect(Math.abs(after.altitude - before.altitude)).toBeLessThan(0.1);
    }
    expect(flightAt(1).altitude).toBeGreaterThan(flightAt(9).altitude);
    expect(flightAt(64).altitude).toBeGreaterThan(flightAt(56).altitude);
    expect(flightAt(35).altitude).toBe(0);
  });
});
