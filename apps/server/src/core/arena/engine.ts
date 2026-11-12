/** Pure simultaneous combat; no clocks, network, persistence, or model judgments. */
import {
  ARENA_LOADOUTS,
  ARENA_RULES,
  ArenaAction,
  type ArenaFighter,
  type ArenaMatch,
  type ArenaPoint,
} from "@agent-office/protocol";

export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const distance = (a: ArenaPoint, b: ArenaPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const same = (a: ArenaPoint, b: ArenaPoint) => a.x === b.x && a.y === b.y;
const inside = (p: ArenaPoint) =>
  p.x >= 0 && p.y >= 0 && p.x < ARENA_RULES.size && p.y < ARENA_RULES.size;
export const ARENA_OBSTACLES: ArenaPoint[] = [
  { x: 4, y: 4 },
  { x: 7, y: 4 },
  { x: 4, y: 7 },
  { x: 7, y: 7 },
];
const SPAWNS = [
  { x: 1, y: 1 },
  { x: 10, y: 10 },
  { x: 10, y: 1 },
  { x: 1, y: 10 },
  { x: 5, y: 0 },
  { x: 6, y: 11 },
  { x: 0, y: 6 },
  { x: 11, y: 5 },
];

export function prepare(match: ArenaMatch): ArenaMatch {
  const m = structuredClone(match);
  const rng = random(m.seed);
  const positions = [...SPAWNS];
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  m.fighters = [...m.fighters]
    .sort((a, b) => a.personId.localeCompare(b.personId))
    .map((f, i) => ({
      ...f,
      ...positions[i]!,
      hp: 100,
      shield: 0,
      boost: 0,
      cooldown: 0,
      knockouts: 0,
      eliminatedTurn: null,
    }));
  m.obstacles = structuredClone(ARENA_OBSTACLES);
  m.pickups = [];
  m.events = [];
  m.turn = 0;
  m.winners = [];
  spawnPickup(m, rng);
  spawnPickup(m, rng);
  spawnPickup(m, rng);
  return m;
}
function spawnPickup(m: ArenaMatch, rng: () => number): void {
  if (m.pickups.length >= 6) return;
  const free: ArenaPoint[] = [];
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const p = { x, y };
      if (
        ![...m.obstacles, ...m.pickups, ...m.fighters.filter((f) => f.hp > 0)].some((q) =>
          same(p, q),
        )
      )
        free.push(p);
    }
  if (!free.length) return;
  const p = free[Math.floor(rng() * free.length)]!;
  m.pickups.push({
    ...p,
    id: `p-${m.turn}-${m.pickups.length}`,
    kind: (["heal", "shield", "boost"] as const)[Math.floor(rng() * 3)]!,
  });
}
/** Supercover line: obstacles touched by the ray block it; other fighters do not. */
function clearShot(a: ArenaPoint, b: ArenaPoint, obstacles: ArenaPoint[]): boolean {
  const nx = Math.abs(b.x - a.x),
    ny = Math.abs(b.y - a.y);
  const sx = Math.sign(b.x - a.x),
    sy = Math.sign(b.y - a.y);
  const blocked = (x: number, y: number) => obstacles.some((o) => o.x === x && o.y === y);
  let x = a.x,
    y = a.y,
    ix = 0,
    iy = 0;
  while (ix < nx || iy < ny) {
    const crossing = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (crossing === 0) {
      // At an exact corner the ray touches both adjacent cells, not only the diagonal.
      if (blocked(x + sx, y) || blocked(x, y + sy)) return false;
      x += sx;
      y += sy;
      ix++;
      iy++;
    } else if (crossing < 0) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    if (blocked(x, y)) return false;
  }
  return true;
}
function legalMove(f: ArenaFighter, a: ArenaPoint, m: ArenaMatch): boolean {
  if (
    !inside(a) ||
    distance(f, a) > 2 ||
    distance(f, a) === 0 ||
    m.obstacles.some((o) => same(o, a))
  )
    return false;
  // At most two orthogonal steps; at least one unblocked route must exist.
  if (distance(f, a) === 1) return true;
  return [
    { x: f.x + 1, y: f.y },
    { x: f.x - 1, y: f.y },
    { x: f.x, y: f.y + 1 },
    { x: f.x, y: f.y - 1 },
  ].some(
    (p) =>
      inside(p) &&
      distance(p, a) === 1 &&
      !m.obstacles.some((o) => same(o, p)) &&
      !m.fighters.some((o) => o.hp > 0 && same(o, p)),
  );
}
export function validAction(m: ArenaMatch, f: ArenaFighter, value: unknown): ArenaAction | null {
  const parsed = ArenaAction.safeParse(value);
  if (!parsed.success) return null;
  const a = parsed.data;
  if (a.kind === "move") return legalMove(f, a, m) ? a : null;
  if (a.kind === "attack" || a.kind === "special") {
    const t = m.fighters.find(
      (p) => p.personId === a.targetId && p.hp > 0 && p.personId !== f.personId,
    );
    if (!t || (a.kind === "special" && f.cooldown > 0)) return null;
    // Range is checked again after simultaneous movement.
  }
  if (a.kind === "collect" && !m.pickups.some((p) => same(p, f))) return null;
  return a;
}
export function resolveTurn(
  match: ArenaMatch,
  inputs: Readonly<Record<string, unknown>>,
): ArenaMatch {
  if (match.phase !== "deciding") throw new Error("Arena is not deciding");
  const m = structuredClone(match);
  m.turn++;
  m.events = [];
  const rng = random((m.seed + Math.imul(m.turn, 7919)) >>> 0);
  const alive = m.fighters
    .filter((f) => f.hp > 0)
    .sort((a, b) => a.personId.localeCompare(b.personId));
  const actions = new Map<string, ArenaAction>();
  for (const f of alive) {
    const a = validAction(match, f, inputs[f.personId]);
    f.lastAction = a ?? { kind: "defend" };
    f.fallback = !a;
    actions.set(f.personId, f.lastAction);
  }
  // Never enter a cell occupied at turn start; shared destinations fail for all contenders.
  for (const f of alive) {
    const a = actions.get(f.personId)!;
    if (a.kind !== "move") continue;
    if (
      match.fighters.some((o) => o.hp > 0 && same(o, a)) ||
      alive.filter((o) => {
        const move = actions.get(o.personId)!;
        return move.kind === "move" && same(move, a);
      }).length !== 1
    )
      continue;
    f.x = a.x;
    f.y = a.y;
  }
  for (const f of alive)
    if (actions.get(f.personId)!.kind === "collect") {
      const i = m.pickups.findIndex((p) => same(p, f));
      if (i < 0) continue;
      const p = m.pickups.splice(i, 1)[0]!;
      if (p.kind === "heal") f.hp = Math.min(100, f.hp + 25);
      if (p.kind === "shield") f.shield = Math.min(30, f.shield + 20);
      if (p.kind === "boost") f.boost = 3;
      m.events.push({ turn: m.turn, kind: "pickup", actor: f.personId });
    }
  const damage = new Map<string, { actor: string; amount: number; tie: number }[]>();
  for (const f of alive) {
    const a = actions.get(f.personId)!;
    const oldCooldown = f.cooldown;
    f.cooldown = Math.max(0, f.cooldown - 1);
    if (a.kind !== "attack" && a.kind !== "special") continue;
    const t = alive.find((o) => o.personId === a.targetId);
    const kit = ARENA_LOADOUTS[f.loadout];
    if (
      !t ||
      distance(f, t) > kit.range ||
      !clearShot(f, t, m.obstacles) ||
      (a.kind === "special" && oldCooldown > 0)
    )
      continue;
    if (a.kind === "special") f.cooldown = 3;
    let amount =
      (a.kind === "special" ? kit.specialDamage : kit.damage) +
      (f.boost > 0 ? 8 : 0) -
      ARENA_LOADOUTS[t.loadout].armor;
    if (actions.get(t.personId)!.kind === "defend") amount = Math.ceil(amount / 2);
    const list = damage.get(t.personId) ?? [];
    list.push({ actor: f.personId, amount, tie: rng() });
    damage.set(t.personId, list);
    m.events.push({ turn: m.turn, kind: "attack", actor: f.personId, target: t.personId, amount });
  }
  for (const f of alive) {
    const hits = damage.get(f.personId) ?? [];
    const healthBeforeDamage = f.hp;
    const total = hits.reduce((n, h) => n + h.amount, 0);
    const absorbed = Math.min(f.shield, total);
    f.shield -= absorbed;
    f.hp = Math.max(0, f.hp - total + absorbed);
    if (m.turn >= ARENA_RULES.pressureFrom) {
      const margin = Math.min(5, Math.floor((m.turn - ARENA_RULES.pressureFrom) / 4) + 1);
      const pressure =
        f.x < margin || f.y < margin || f.x >= 12 - margin || f.y >= 12 - margin
          ? 8 + 2 * (m.turn - ARENA_RULES.pressureFrom)
          : 0;
      if (pressure) {
        f.hp = Math.max(0, f.hp - pressure);
        m.events.push({ turn: m.turn, kind: "pressure", target: f.personId, amount: pressure });
      }
    }
    f.boost = Math.max(0, f.boost - 1);
    if (f.hp === 0) {
      f.eliminatedTurn = m.turn;
      // Pressure cannot confer credit if weapon damage alone would not have eliminated.
      const killer =
        total - absorbed >= healthBeforeDamage
          ? hits.sort((a, b) => b.amount - a.amount || a.tie - b.tie)[0]
          : undefined;
      if (killer) m.fighters.find((o) => o.personId === killer.actor)!.knockouts++;
      m.events.push({
        turn: m.turn,
        kind: "elimination",
        target: f.personId,
        ...(killer ? { actor: killer.actor } : {}),
      });
    }
  }
  if (m.turn % 4 === 0) spawnPickup(m, rng);
  const survivors = m.fighters.filter((f) => f.hp > 0);
  m.phase = survivors.length <= 1 || m.turn >= ARENA_RULES.maxTurns ? "finished" : "resolving";
  m.winners = m.phase === "finished" && survivors.length === 1 ? [survivors[0]!.personId] : [];
  m.deadline = null;
  return m;
}
