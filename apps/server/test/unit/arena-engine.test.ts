import { describe, expect, test } from "bun:test";
import { type ArenaMatch, avatarFromSeed } from "@agent-office/protocol";
import { prepare, resolveTurn } from "../../src/core/arena/engine.ts";
export function fixture(n = 2): ArenaMatch {
  return prepare({
    id: "match",
    hostId: "a",
    seed: 42,
    phase: "deciding",
    turn: 0,
    fighters: Array.from({ length: n }, (_, i) => ({
      personId: String.fromCharCode(97 + i),
      name: `Player ${i}`,
      avatar: avatarFromSeed(String(i)),
      loadout: "blade",
      ready: true,
      x: 0,
      y: 0,
      hp: 100,
      shield: 0,
      boost: 0,
      cooldown: 0,
      knockouts: 0,
      eliminatedTurn: null,
    })),
    obstacles: [],
    pickups: [],
    events: [],
    winners: [],
    deadline: null,
    startedAt: 0,
    endedAt: null,
    revealedPrompts: {},
  });
}
describe("arena engine", () => {
  test("seeded setup and replay are deterministic and do not mutate input", () => {
    const m = fixture(8);
    const before = JSON.stringify(m);
    expect(prepare(fixture(8))).toEqual(m);
    expect(resolveTurn(m, {})).toEqual(resolveTurn(m, {}));
    expect(JSON.stringify(m)).toBe(before);
  });
  test("simultaneous lethal attacks draw and both receive credit", () => {
    const m = fixture();
    m.fighters[0]!.x = 1;
    m.fighters[0]!.y = 1;
    m.fighters[1]!.x = 2;
    m.fighters[1]!.y = 1;
    for (const f of m.fighters) f.hp = 20;
    const r = resolveTurn(m, {
      a: { kind: "attack", targetId: "b" },
      b: { kind: "attack", targetId: "a" },
    });
    expect(r.phase).toBe("finished");
    expect(r.winners).toEqual([]);
    expect(r.fighters.map((f) => f.knockouts)).toEqual([1, 1]);
  });
  test("invalid actions defend and cannot invent stats", () => {
    const r = resolveTurn(fixture(), {
      a: { kind: "win", hp: 9999 },
      b: { kind: "move", x: 100, y: 100 },
    });
    expect(
      r.fighters.every((f) => f.fallback && f.lastAction?.kind === "defend" && f.hp === 100),
    ).toBe(true);
  });
  test("shared movement destination fails symmetrically", () => {
    const m = fixture();
    Object.assign(m.fighters[0]!, { x: 1, y: 1 });
    Object.assign(m.fighters[1]!, { x: 3, y: 1 });
    const r = resolveTurn(m, { a: { kind: "move", x: 2, y: 1 }, b: { kind: "move", x: 2, y: 1 } });
    expect(r.fighters.map((f) => f.x)).toEqual([1, 3]);
  });
  test("turn limit ends even defensive fights", () => {
    const m = fixture();
    m.turn = 39;
    expect(resolveTurn(m, {}).phase).toBe("finished");
  });
});
