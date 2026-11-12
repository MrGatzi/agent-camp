import { expect, test } from "bun:test";
import { ArenaBudget, ArenaRateLimit, emptyBudget } from "../../src/core/arena/budget.ts";

test("reserves full match envelope, idempotent and independent daily reset", () => {
  const b = new ArenaBudget({ ARENA_DAILY_CALLS: "320" });
  const r = b.reserve(emptyBudget(), "m", 8, 0)!;
  expect(r.calls).toBe(320);
  expect(b.reserve(r, "m", 8, 0)).toEqual(r);
  expect(b.reserve(r, "other", 2, 0)).toBeNull();
  expect(b.reserve(r, "next-day", 8, 86400000)?.calls).toBe(320);
});
test("invalid budget config fails closed and player count is bounded", () => {
  expect(
    new ArenaBudget({ ARENA_DAILY_CALLS: "NaN" }).reserve(emptyBudget(), "m", 2, 0),
  ).toBeNull();
  expect(new ArenaBudget({}).reserve(emptyBudget(), "m", 9, 0)).toBeNull();
  expect(new ArenaBudget({ ARENA_MATCH_CALLS: "79" }).reserve(emptyBudget(), "m", 2, 0)).toBeNull();
});
test("limiter bounds malformed and repeated requests", () => {
  const l = new ArenaRateLimit();
  expect(l.allow("ip", 0)).toBe(true);
  expect(l.allow("ip", 0)).toBe(false);
  expect(l.allow("ip", 1000)).toBe(true);
});
