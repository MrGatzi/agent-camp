/** Conservative reservations: no retries/refunds, so restarts cannot double-spend. */
import { ARENA_RULES } from "@agent-office/protocol";
import type { Store } from "../store.ts";
import type { ArenaEnv } from "./provider.ts";
export function boundedInteger(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : 0;
}
export type ArenaBudgetRecord = {
  day: string;
  calls: number;
  reservations: Record<string, number>;
};
export class ArenaBudget {
  readonly daily: number;
  readonly perMatch: number;
  constructor(env: ArenaEnv) {
    this.daily = boundedInteger(env.ARENA_DAILY_CALLS, 640, 100000);
    this.perMatch = boundedInteger(env.ARENA_MATCH_CALLS, 320, 320);
  }
  reserve(
    record: ArenaBudgetRecord,
    matchId: string,
    players: number,
    now: number,
  ): ArenaBudgetRecord | null {
    if (!Number.isInteger(players) || players < 2 || players > 8) return null;
    const day = new Date(now).toISOString().slice(0, 10);
    const current = record.day === day ? record : { day, calls: 0, reservations: {} };
    if (Object.hasOwn(current.reservations, matchId)) return current;
    const calls = players * ARENA_RULES.maxTurns;
    if (calls > this.perMatch || current.calls + calls > this.daily) return null;
    return {
      day,
      calls: current.calls + calls,
      reservations: { ...current.reservations, [matchId]: calls },
    };
  }
}
export const emptyBudget = (): ArenaBudgetRecord => ({ day: "", calls: 0, reservations: {} });
/** Per-person/IP pre-body limiter, bounded independently of persisted match data. */
export class ArenaRateLimit {
  private requests = new Map<string, number>();
  allow(key: string, now: number): boolean {
    for (const [k, at] of this.requests) if (now - at >= 1000) this.requests.delete(k);
    if (this.requests.has(key) || this.requests.size >= 512) return false;
    this.requests.set(key.slice(0, 128), now);
    return true;
  }
}
// Store imported as a type here so budgets can later use the same atomic envelope as matches.
export type ArenaStore = Pick<Store, "kvGet" | "kvPut" | "kvDelete">;
