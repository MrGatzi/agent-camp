import { describe, expect, test } from "bun:test";
import { type ArenaState, avatarFromSeed, type PersonView } from "@agent-office/protocol";
import type { DecisionProvider } from "../../src/core/arena/provider.ts";
import { ArenaService } from "../../src/core/arena/service.ts";
import { MemoryStore } from "../../src/core/store.ts";
export const person = (id: string): PersonView => ({
  personId: id,
  name: id,
  avatar: avatarFromSeed(id),
  sessions: [],
  joinedAt: 0,
});
function harness(
  provider: DecisionProvider = { model: "fake", decide: async () => ({ kind: "defend" }) },
) {
  let now = 0;
  const store = new MemoryStore();
  const frames: ArenaState[] = [];
  const jobs: Promise<unknown>[] = [];
  const hooks = {
    publish: (s: ArenaState) => frames.push(s),
    schedule: () => {},
    background: (p: Promise<unknown>) => {
      jobs.push(p);
    },
    now: () => now,
    provider,
  };
  let service = new ArenaService({ ARENA_ENABLED: "1" }, store, hooks);
  return {
    get service() {
      return service;
    },
    store,
    frames,
    advance: async () => {
      now = service.deadline() ?? now;
      service.tick();
      await Promise.all(jobs.splice(0));
    },
    restore: () => {
      service = new ArenaService({ ARENA_ENABLED: "1" }, store, hooks);
    },
    mutate: (kind: unknown, id = "a") => service.mutate(kind, id, person(id)),
  };
}
function join(h: ReturnType<typeof harness>, n = 2) {
  for (let i = 0; i < n; i++) {
    const id = String.fromCharCode(97 + i);
    expect(h.mutate({ kind: "join", prompt: `PRIVATE_${id}`, loadout: "blade" }, id).status).toBe(
      200,
    );
    expect(h.mutate({ kind: "ready", ready: true }, id).status).toBe(200);
  }
}
describe("arena orchestration", () => {
  test("ready, host, privacy, locks and eight-player cap", () => {
    const h = harness();
    join(h, 8);
    expect(h.mutate({ kind: "join", prompt: "x", loadout: "bow" }, "i").status).toBe(409);
    expect(h.mutate({ kind: "start" }, "b").status).toBe(403);
    expect(h.mutate({ kind: "start" }).status).toBe(200);
    expect(h.mutate({ kind: "join", prompt: "edit", loadout: "bow" }).status).toBe(409);
    expect(JSON.stringify(h.frames)).not.toContain("PRIVATE_");
  });
  test("restart during a job never repeats inference and stale callbacks are ignored", async () => {
    const releases: ((a: unknown) => void)[] = [];
    let calls = 0;
    const h = harness({
      model: "fake",
      decide: () => {
        calls++;
        return new Promise((resolve) => {
          releases.push(resolve);
        });
      },
    });
    join(h);
    h.mutate({ kind: "start" });
    // Start without awaiting deliberately blocked provider.
    const pending = h.advance();
    expect(calls).toBe(2);
    h.restore();
    await h.advance();
    expect(calls).toBe(2);
    expect(h.service.state().match?.turn).toBe(1);
    for (const release of releases) release({ kind: "defend" });
    await pending;
    expect(h.service.state().match?.turn).toBe(1);
  });
  test("full match results survive restore, no duplicate credit, optional reveal is scoped", async () => {
    const h = harness();
    join(h);
    h.mutate({ kind: "start" });
    for (let i = 0; i < 50 && h.service.deadline() !== null; i++) await h.advance();
    const state = h.service.state();
    expect(state.match?.phase).toBe("finished");
    const history = h.service.history();
    expect(history.leaderboard.every((r) => r.matches === 1)).toBe(true);
    h.restore();
    await h.advance();
    expect(h.service.history().leaderboard).toEqual(history.leaderboard);
    expect(h.mutate({ kind: "reveal", matchId: state.match!.id }, "outsider").status).toBe(403);
    expect(h.mutate({ kind: "reveal", matchId: state.match!.id }).status).toBe(200);
    expect(h.service.state().match!.revealedPrompts).toEqual({ a: "PRIVATE_a" });
    h.mutate({ kind: "rematch" });
    expect(h.service.state().match!.fighters).toHaveLength(0);
    expect(h.service.history().recent[0]!.revealedPrompts).toEqual({ a: "PRIVATE_a" });
  });
  test("persistent provider failure aborts without leaderboard credit", async () => {
    const h = harness({
      model: "fake",
      decide: async () => {
        throw new Error("SECRET");
      },
    });
    join(h);
    h.mutate({ kind: "start" });
    for (let i = 0; i < 4; i++) await h.advance();
    expect(h.service.state().match?.phase).toBe("aborted");
    expect(h.service.history().leaderboard).toEqual([]);
    expect(JSON.stringify(h.frames)).not.toContain("SECRET");
  });
  test("disabled service never exposes stored arena state", () => {
    const h = harness();
    join(h);
    expect(
      new ArenaService({}, h.store, {
        publish: () => {},
        schedule: () => {},
        background: () => {},
      }).state().match,
    ).toBeNull();
  });
});
