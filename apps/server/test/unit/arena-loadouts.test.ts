import { expect, test } from "bun:test";
import { ARENA_LOADOUTS, type ArenaAction } from "@agent-office/protocol";
import { resolveTurn } from "../../src/core/arena/engine.ts";
import { fixture } from "./arena-engine.test.ts";

function duel() {
  const m = fixture();
  Object.assign(m.fighters[0]!, { x: 1, y: 1 });
  Object.assign(m.fighters[1]!, { x: 2, y: 1 });
  m.obstacles = [];
  m.pickups = [];
  return m;
}
test("loadouts have distinct tradeoffs and cosmetics do not change damage", () => {
  expect(ARENA_LOADOUTS.bow.range).toBeGreaterThan(ARENA_LOADOUTS.blade.range);
  expect(ARENA_LOADOUTS.bow.damage).toBeLessThan(ARENA_LOADOUTS.blade.damage);
  const m = duel();
  m.fighters[1]!.loadout = "guardian";
  const r = resolveTurn(m, { a: { kind: "attack", targetId: "b" }, b: { kind: "defend" } });
  expect(r.fighters[1]!.hp).toBe(90);
});
test("ranged attacks respect range and obstacles", () => {
  const m = duel();
  m.fighters[0]!.loadout = "bow";
  m.fighters[1]!.x = 5;
  expect(
    resolveTurn(m, { a: { kind: "attack", targetId: "b" }, b: { kind: "move", x: 6, y: 1 } })
      .fighters[1]!.hp,
  ).toBe(84);
  m.obstacles = [{ x: 3, y: 1 }];
  expect(resolveTurn(m, { a: { kind: "attack", targetId: "b" } }).fighters[1]!.hp).toBe(100);
});
test("rays cannot clip obstacle corners in either direction", () => {
  const m = duel();
  Object.assign(m.fighters[1]!, { x: 3, y: 3 });
  for (const f of m.fighters) f.loadout = "bow";
  m.obstacles = [{ x: 2, y: 1 }];
  const r = resolveTurn(m, {
    a: { kind: "attack", targetId: "b" },
    b: { kind: "attack", targetId: "a" },
  });
  expect(r.fighters.map((f) => f.hp)).toEqual([100, 100]);
});
test("special cooldown cannot be bypassed", () => {
  const m = duel();
  m.fighters[0]!.cooldown = 2;
  const r = resolveTurn(m, { a: { kind: "special", targetId: "b" } });
  expect(r.fighters[0]!.fallback).toBe(true);
  expect(r.fighters[1]!.hp).toBe(100);
  expect(r.fighters[0]!.cooldown).toBe(1);
});
test("healing/shields/boosts are bounded, collected explicitly and consumed", () => {
  for (const kind of ["heal", "shield", "boost"] as const) {
    const m = duel();
    m.fighters[0]!.hp = 90;
    m.pickups = [{ id: "p", kind, x: 1, y: 1 }];
    const r = resolveTurn(m, { a: { kind: "collect" }, b: { kind: "move", x: 3, y: 1 } });
    expect(r.pickups).toHaveLength(0);
    expect(r.fighters[0]!.hp).toBe(kind === "heal" ? 100 : 90);
    expect(r.fighters[0]!.shield).toBe(kind === "shield" ? 20 : 0);
    expect(r.fighters[0]!.boost).toBe(kind === "boost" ? 2 : 0);
  }
});
test("pressure grants no knockout credit", () => {
  const m = duel();
  m.turn = 30;
  m.fighters[0]!.hp = 5;
  m.fighters[1]!.hp = 5;
  const r = resolveTurn(m, { a: { kind: "defend" }, b: { kind: "defend" } });
  expect(r.fighters.every((f) => f.hp === 0 && f.knockouts === 0)).toBe(true);
});
test("seeded multi-player matches stay in bounds and resolve within cap", () => {
  for (let seed = 0; seed < 50; seed++) {
    let m = fixture(8);
    m.seed = seed;
    for (let t = 0; t < 40; t++) {
      m.phase = "deciding";
      const actions: Record<string, ArenaAction> = {};
      for (const f of m.fighters) {
        const target = m.fighters.find((o) => o.personId !== f.personId && o.hp > 0);
        actions[f.personId] = target
          ? { kind: "attack", targetId: target.personId }
          : { kind: "defend" };
      }
      m = resolveTurn(m, actions);
      expect(
        m.fighters.every(
          (f) => f.hp >= 0 && f.hp <= 100 && f.x >= 0 && f.x < 12 && f.y >= 0 && f.y < 12,
        ),
      ).toBe(true);
      if (m.phase === "finished") break;
    }
    expect(m.phase).toBe("finished");
  }
});
