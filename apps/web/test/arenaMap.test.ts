import { expect, test } from "bun:test";
import { arenaGrid, buildOfficeMap, chairTile } from "../src/world/map.ts";
import { findPath } from "../src/world/pathing.ts";

for (const rows of [4, 5, 8])
  test(`arena annex preserves office paths and grows with ${rows} pod rows`, () => {
    const before = buildOfficeMap(rows),
      map = buildOfficeMap(rows, true),
      grid = arenaGrid(map);
    expect(map.height).toBe(before.height + 18);
    expect(map.rows.slice(0, before.height)).toEqual([...before.rows]);
    expect(map.rows.every((r) => r.length === map.width)).toBe(true);
    for (const p of map.pois) expect(findPath(map, map.spawn, p.tile), p.id).not.toBeNull();
    for (let pod = 0; pod < rows * 3; pod++)
      expect(findPath(map, map.spawn, chairTile(pod, 0))).not.toBeNull();
    expect(map.isWalkable(grid.x, grid.y)).toBe(false);
    expect(map.areas.find((a) => a.name === "arena")).toBeDefined();
  });
