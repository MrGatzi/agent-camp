/** Pure choreography: spectacles never change connector status or desk ownership. */
import type { Activity } from "@agent-office/protocol";
import type { OfficeMap, Point } from "./map.ts";
import { TILE } from "./map.ts";
import { findPath } from "./pathing.ts";

/** Client-only switch: ordinary screens opt out; wall screens explicitly opt in. */
export function spectaclesEnabled(value: string | null, kiosk: boolean): boolean {
  return value === null ? !kiosk : !["0", "false", "off"].includes(value);
}

/** Never conceal a session that currently needs the human\'s attention. */
export function canJoinSpectacle(
  session: { activity: Activity; offline: boolean; context?: number | undefined },
  fireAt: number,
): boolean {
  return !session.offline && session.activity !== "waiting" && (session.context ?? 0) < fireAt;
}

export type Spectacle = "conga" | "ufo" | "disco";
export const SPECTACLE_SECONDS: Record<Spectacle, number> = { conga: 35, ufo: 18, disco: 15 };
export const SPECTACLES: readonly Spectacle[] = ["conga", "ufo", "disco"];

/** Same office-local minute on every screen; no replay of a missed event on reconnect.
 * Leave the top-of-hour bow alone. The conga rolls at :05, aliens at :12/:32/:52,
 * and the emergency disco at :20/:40. Milliseconds come from the server-adjusted clock.
 */
export function scheduledSpectacle(hour: number): { kind: Spectacle; age: number } | null {
  const seconds = Math.round(((((hour * 3600) % 3600) + 3600) % 3600) * 1e6) / 1e6;
  const slots: [Spectacle, number][] = [
    ["conga", 5 * 60],
    ["ufo", 12 * 60],
    ["disco", 20 * 60],
    ["ufo", 32 * 60],
    ["disco", 40 * 60],
    ["ufo", 52 * 60],
  ];
  for (const [kind, start] of slots) {
    const age = seconds - start;
    if (age >= 0 && age < SPECTACLE_SECONDS[kind]) return { kind, age };
  }
  return null;
}

/** "Hardest working" = currently active, then most helpers, then longest current stint.
 * Waiting/idle/offline sessions never beat a working agent; ids make ties deterministic.
 */
export function hardestWorker<
  T extends {
    sessionId: string;
    activity: Activity;
    offline: boolean;
    subagents: number;
    activitySince: number;
  },
>(sessions: readonly T[]): T | null {
  const working = sessions.filter((s) => !s.offline && !["idle", "waiting"].includes(s.activity));
  working.sort(
    (a, b) =>
      b.subagents - a.subagents ||
      a.activitySince - b.activitySince ||
      a.sessionId.localeCompare(b.sessionId),
  );
  return working[0] ?? null;
}

export function angleToward(current: number, target: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, Math.max(0, dt) * 0.7);
}

/** A real walkable aisle loop, rebuilt from current map dimensions. */
export function congaRoute(map: OfficeMap): Point[] {
  const desks = map.areas.find((a) => a.name === "desks")!;
  const bottom = desks.y + desks.h - 3;
  const corners = [
    { x: 1, y: 4 },
    { x: 32, y: 4 },
    { x: 32, y: bottom },
    { x: 1, y: bottom },
    { x: 1, y: 4 },
  ];
  const route: Point[] = [];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]!,
      b = corners[i]!;
    if (!map.isWalkable(a.x, a.y) || !map.isWalkable(b.x, b.y)) return [];
    const path = findPath(map, a, b);
    if (!path) return [];
    for (const p of path.slice(route.length ? 1 : 0))
      route.push({ x: p.x * TILE + 8, y: p.y * TILE + 13 });
  }
  return route;
}

export function routeLength(route: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < route.length; i++)
    length += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y);
  return length;
}

export function routePose(route: readonly Point[], distance: number): Point & { angle: number } {
  const length = routeLength(route);
  if (!length) return { ...(route[0] ?? { x: 0, y: 0 }), angle: 0 };
  let left = ((distance % length) + length) % length;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!,
      b = route[i]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= segment && segment > 0)
      return {
        x: a.x + ((b.x - a.x) * left) / segment,
        y: a.y + ((b.y - a.y) * left) / segment,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    left -= segment;
  }
  return { ...route[0]!, angle: 0 };
}

/** Silly but reachable landing, never a pond, desk, wall or sealed-off landmark. */
export function ufoLanding(map: OfficeMap, from: Point): Point | null {
  const candidates = [
    { x: 47, y: 19 }, // right on the boss\'s royal carpet
    { x: 35, y: 10 },
    { x: 54, y: 24 },
    { x: 35, y: 23 },
    { x: 2, y: 26 },
  ];
  const start = { x: Math.floor(from.x / TILE), y: Math.floor((from.y - 4) / TILE) };
  for (const tile of candidates) {
    if (map.isWalkable(tile.x, tile.y) && findPath(map, start, tile))
      return { x: tile.x * TILE + 8, y: tile.y * TILE + 13 };
  }
  return null;
}

/** 18 s: arrive, lift, cross the room, lower gently, depart. */
export function abductionPose(age: number, from: Point, to: Point) {
  const smooth = (t: number) => {
    const k = Math.max(0, Math.min(1, t));
    return k * k * (3 - 2 * k);
  };
  const travel = smooth((age - 7) / 4);
  const lift = smooth((age - 3) / 4) * (1 - smooth((age - 11) / 4));
  const x = from.x + (to.x - from.x) * travel;
  const y = from.y + (to.y - from.y) * travel;
  return {
    x,
    y,
    lift: lift * 76,
    arrival: smooth(age / 3),
    departure: smooth((age - 15) / 3),
    landed: age >= 15,
  };
}
