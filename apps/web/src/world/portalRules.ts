/**
 * Where Rick may open portals: pure geometry on the walk grid, so it is unit-tested.
 * Portals stand on the floor; Rick and Morty always walk through them horizontally.
 */
import { type OfficeMap, type Point, TILE } from "./map.ts";

type Walk = Pick<OfficeMap, "isWalkable" | "width" | "height">;
export type Dir = 1 | -1;

/** the entrance opens this far in front of Rick */
export const PORTAL_GAP = 24;
/** Morty lines up this far behind Rick */
export const LINE_UP = 13;
/** free floor needed past the exit portal so both can step out */
export const EXIT_RUN = 34;
/** an exit is at least this far from the entrance */
export const MIN_HOP = 10 * TILE;

/** Same tile convention as the walkers: feet a little above the bottom of the tile. */
export function freeAt(map: Walk, x: number, y: number) {
  return map.isWalkable(Math.floor(x / TILE), Math.floor((y - 2) / TILE));
}

function runFree(map: Walk, x: number, y: number, dir: Dir, from: number, to: number) {
  for (let d = from; d <= to; d += 4) if (!freeAt(map, x + dir * d, y)) return false;
  return freeAt(map, x + dir * to, y);
}

/** Entrance straight ahead of Rick in `dir`, with room for Morty behind him; null if blocked. */
export function entranceFor(map: Walk, rick: Point, dir: Dir): Point | null {
  if (!runFree(map, rick.x, rick.y, dir, -LINE_UP, PORTAL_GAP + 6)) return null;
  return { x: rick.x + dir * PORTAL_GAP, y: rick.y };
}

/** A random exit far from `from` with a free runway in `dir` (tile-centered); null if none. */
export function exitFor(
  map: Walk,
  from: Point | null,
  dir: Dir,
  rand: () => number,
  minDist = MIN_HOP,
): Point | null {
  for (let tries = 0; tries < 120; tries++) {
    const tx = Math.floor(rand() * map.width);
    const ty = Math.floor(rand() * map.height);
    const p = { x: tx * TILE + 8, y: ty * TILE + 12 };
    if (from && Math.hypot(p.x - from.x, p.y - from.y) < minDist) continue;
    if (runFree(map, p.x, p.y, dir, -6, EXIT_RUN)) return p;
  }
  return null;
}
