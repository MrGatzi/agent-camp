import { describe, expect, test } from "bun:test";
import {
  paintCarpet,
  paintDisco,
  paintDuck,
  paintGuard,
  paintRollingChair,
  paintSaucer,
  paintThrone,
} from "../src/art/spectacles.ts";
import { buildOfficeMap, TILE } from "../src/world/map.ts";
import {
  abductionPose,
  angleToward,
  canJoinSpectacle,
  congaRoute,
  hardestWorker,
  routeLength,
  routePose,
  SPECTACLE_SECONDS,
  scheduledSpectacle,
  spectaclesEnabled,
  ufoLanding,
} from "../src/world/spectacleRules.ts";

const session = (
  sessionId: string,
  activity: "idle" | "waiting" | "typing" = "typing",
  subagents = 0,
  activitySince = 0,
  offline = false,
) => ({ sessionId, activity, subagents, activitySince, offline });

describe("office spectacles", () => {
  test("client switch defaults off on kiosks, supports explicit opt-in and opt-out", () => {
    expect(spectaclesEnabled(null, false)).toBe(true);
    expect(spectaclesEnabled(null, true)).toBe(false);
    for (const kiosk of [true, false]) {
      expect(spectaclesEnabled("1", kiosk)).toBe(true);
      for (const off of ["0", "false", "off"]) expect(spectaclesEnabled(off, kiosk)).toBe(false);
    }
  });
  test("waiting, burning and offline sessions retain their normal indicators", () => {
    expect(canJoinSpectacle({ activity: "typing", offline: false }, 0.8)).toBe(true);
    expect(canJoinSpectacle({ activity: "waiting", offline: false }, 0.8)).toBe(false);
    expect(canJoinSpectacle({ activity: "typing", offline: true }, 0.8)).toBe(false);
    expect(canJoinSpectacle({ activity: "typing", offline: false, context: 0.79 }, 0.8)).toBe(true);
    expect(canJoinSpectacle({ activity: "typing", offline: false, context: 0.8 }, 0.8)).toBe(false);
    expect(canJoinSpectacle({ activity: "idle", offline: false, context: 1 }, 0.8)).toBe(false);
  });
  test("duck watches active work, not idle/waiting/offline sessions", () => {
    const busy = session("busy", "typing", 2);
    expect(
      hardestWorker([
        session("idle", "idle", 100),
        session("waiting", "waiting", 99),
        session("offline", "typing", 100, 0, true),
        busy,
      ]),
    ).toBe(busy);
    expect(hardestWorker([session("idle", "idle")])).toBeNull();
    expect(hardestWorker([])).toBeNull();
  });
  test("duck ranking is helpers, current work duration, stable id; input is unchanged", () => {
    const pool = [
      session("z", "typing", 3, 100),
      session("a", "typing", 3, 100),
      session("b", "typing", 3, 200),
      session("c", "typing", 2, 0),
    ];
    expect(hardestWorker(pool)?.sessionId).toBe("a");
    expect(pool.map((s) => s.sessionId)).toEqual(["z", "a", "b", "c"]);
  });
  test("duck turns slowly by the shortest angle, including across -PI/PI", () => {
    const start = Math.PI - 0.1;
    const next = angleToward(start, -Math.PI + 0.1, 0.1);
    expect(next).toBeGreaterThan(start);
    expect(next - start).toBeLessThan(0.1);
    expect(angleToward(1, 2, 0)).toBe(1);
  });
  test("conga occurs once an hour, away from the existing top-of-hour bow", () => {
    expect(scheduledSpectacle(12)).toBeNull();
    for (let h = 0; h < 24; h++) {
      expect(scheduledSpectacle(h + 5 / 60)?.kind).toBe("conga");
      expect(scheduledSpectacle(h + (5 * 60 + 20) / 3600)?.age).toBeCloseTo(20, 6);
      expect(scheduledSpectacle(h + (5 * 60 + 36) / 3600)).toBeNull();
    }
  });
  test("disco lasts exactly 15 seconds; slots don't replay for a late joiner", () => {
    expect(SPECTACLE_SECONDS.disco).toBe(15);
    expect(scheduledSpectacle(12 + (20 * 60 + 14.9) / 3600)?.kind).toBe("disco");
    expect(scheduledSpectacle(12 + (20 * 60 + 15.1) / 3600)).toBeNull();
    expect(scheduledSpectacle(12 + 21 / 60)).toBeNull();
    for (const minute of [12, 32, 52])
      expect(scheduledSpectacle(12 + minute / 60)?.kind).toBe("ufo");
    expect(scheduledSpectacle(24)).toBeNull();
  });
  test("conga route is closed, walkable and grows with the office", () => {
    let length = 0;
    for (const rows of [4, 6, 8]) {
      const map = buildOfficeMap(rows);
      const before = map.walkable.slice();
      const route = congaRoute(map);
      expect(route.length).toBeGreaterThan(4);
      expect(route[0]).toEqual(route.at(-1));
      for (const p of route)
        expect(map.isWalkable(Math.floor(p.x / TILE), Math.floor((p.y - 4) / TILE))).toBe(true);
      expect(routeLength(route)).toBeGreaterThan(length);
      length = routeLength(route);
      expect(map.walkable).toEqual(before);
    }
  });
  test("conga wraps both leading and trailing chairs smoothly", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ];
    expect(routePose(route, 50)).toEqual({ x: 50, y: 0, angle: 0 });
    expect(routePose(route, 450)).toEqual(routePose(route, 50));
    expect(routePose(route, -350)).toEqual(routePose(route, 50));
    expect(routePose([], 100)).toEqual({ x: 0, y: 0, angle: 0 });
  });
  test("UFO lifts and lowers gently, landing before departure", () => {
    const from = { x: 100, y: 200 },
      to = { x: 500, y: 400 };
    expect(abductionPose(0, from, to)).toMatchObject({ x: 100, y: 200, lift: 0, landed: false });
    expect(abductionPose(7, from, to).lift).toBe(76);
    expect(abductionPose(15, from, to)).toMatchObject({ x: 500, y: 400, lift: 0, landed: true });
    expect(abductionPose(18, from, to).departure).toBe(1);
    for (let t = 0; t < 18; t += 0.1) {
      const p = abductionPose(t, from, to);
      expect(p.lift).toBeGreaterThanOrEqual(0);
      expect(p.lift).toBeLessThanOrEqual(76);
      expect(p.x).toBeGreaterThanOrEqual(from.x);
      expect(p.x).toBeLessThanOrEqual(to.x);
    }
  });
  test("UFO landings use reachable safe floor tiles and do not change collision", () => {
    for (const rows of [4, 8]) {
      const map = buildOfficeMap(rows);
      const before = map.walkable.slice();
      const p = ufoLanding(map, { x: 24, y: 61 });
      expect(p).not.toBeNull();
      expect(map.isWalkable(Math.floor(p!.x / TILE), Math.floor((p!.y - 4) / TILE))).toBe(true);
      expect(map.walkable).toEqual(before);
    }
    const map = buildOfficeMap();
    map.walkable.fill(0);
    expect(ufoLanding(map, { x: 24, y: 61 })).toBeNull();
  });
  test("all five props are substantial opaque pixel art with transparent margins", () => {
    for (const paint of [
      paintDuck,
      paintThrone,
      paintCarpet,
      paintGuard,
      paintSaucer,
      paintDisco,
      paintRollingChair,
    ]) {
      const pc = paint();
      expect(pc.data.length).toBe(pc.width * pc.height);
      expect([...pc.data].filter((p) => p >>> 24 > 0).length).toBeGreaterThan(100);
      expect([...pc.data].some((p) => p === 0)).toBe(true);
    }
    expect(paintDuck().height).toBeGreaterThan(24 * 5);
    expect(paintDuck().data).not.toEqual(paintDuck(true).data);
    expect(paintGuard().data).not.toEqual(paintGuard(true).data);
  });
});
