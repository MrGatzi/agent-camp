import { expect, test } from "bun:test";
import { type ArenaState, avatarFromSeed } from "@agent-office/protocol";
import { ArenaService, LOBBY_IDLE_MS, LOBBY_OFFLINE_MS } from "../../src/core/arena/service.ts";
import { MemoryStore } from "../../src/core/store.ts";

const person = (id: string) => ({
  personId: id,
  name: id,
  avatar: avatarFromSeed(id),
  sessions: [],
  joinedAt: 0,
});
class TracedStore extends MemoryStore {
  reads: string[] = [];
  writes: string[] = [];
  override kvGet(key: string) {
    this.reads.push(key);
    return super.kvGet(key);
  }
  override kvPut(key: string, value: string) {
    this.writes.push(key);
    super.kvPut(key, value);
  }
}
function setup(store = new TracedStore()) {
  let now = 0;
  const jobs: Promise<unknown>[] = [];
  const online = new Set(["a", "b", "c"]);
  const frames: ArenaState[] = [];
  const hooks = {
    now: () => now,
    online: () => online,
    publish: (s: ArenaState) => frames.push(s),
    schedule: () => {},
    background: (p: Promise<unknown>) => {
      jobs.push(p);
    },
    provider: { model: "fake", decide: async () => ({ kind: "defend" }) },
  };
  let service = new ArenaService({ ARENA_ENABLED: "1", ARENA_DAILY_CALLS: "10000" }, store, hooks);
  return {
    store,
    online,
    frames,
    get service() {
      return service;
    },
    setNow: (n: number) => {
      now = n;
    },
    restore: () => {
      service = new ArenaService({ ARENA_ENABLED: "1", ARENA_DAILY_CALLS: "10000" }, store, hooks);
    },
    mutate: (a: unknown, id = "a") => service.mutate(a, id, person(id)),
    advance: async () => {
      now = service.deadline() ?? now;
      service.tick();
      await Promise.all(jobs.splice(0));
    },
  };
}
test("live turns never load or rewrite archive, budget, or 1000-row leaderboard", async () => {
  const h = setup();
  for (let i = 0; i < 25; i++) {
    h.mutate({ kind: "join", prompt: "x".repeat(1600), loadout: "blade" });
    h.mutate({ kind: "cancel" });
    h.mutate({ kind: "rematch" }, "c");
    if (h.service.state().match?.hostId === "c") {
      h.mutate({ kind: "join", prompt: "x", loadout: "blade" }, "c");
      h.mutate({ kind: "leave" }, "c");
    }
  }
  expect(
    [...h.store.kv.keys()].filter((k) => k.startsWith("arena.match.")).length,
  ).toBeLessThanOrEqual(21);
  expect(h.service.history().recent.length).toBe(20);
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    personId: i === 0 ? "a" : i === 1 ? "b" : `old-${i}`,
    name: `Old ${i}`,
    wins: 0,
    knockouts: 0,
    matches: 1,
  }));
  h.store.kvPut("arena.board.v2", JSON.stringify({ rows, applied: [] }));
  for (const id of ["a", "b"]) {
    expect(h.mutate({ kind: "join", prompt: "private", loadout: "blade" }, id).status).toBe(200);
    h.mutate({ kind: "ready", ready: true }, id);
  }
  expect(h.mutate({ kind: "start" }).status).toBe(200);
  h.store.reads = [];
  h.store.writes = [];
  await h.advance();
  expect(h.service.state().match?.turn).toBe(1);
  expect(h.store.reads.every((k) => k === "arena.v1")).toBe(true);
  expect(h.store.writes.every((k) => k === "arena.v1")).toBe(true);
  expect(h.store.writes.length).toBeGreaterThan(0);
  const live = JSON.parse(h.store.kv.get("arena.v1")!);
  expect(live).not.toHaveProperty("recent");
  expect(live).not.toHaveProperty("leaderboard");
  expect(live).not.toHaveProperty("budget");
  for (const frame of h.frames) {
    expect(frame).not.toHaveProperty("recent");
    expect(frame).not.toHaveProperty("leaderboard");
  }
  expect(h.service.history().leaderboard.length).toBe(1000);
});
test("any online person can open the next lobby, even if all participants left", () => {
  const h = setup();
  h.mutate({ kind: "join", prompt: "x", loadout: "blade" });
  h.mutate({ kind: "cancel" });
  expect(h.mutate({ kind: "rematch" }, "c").status).toBe(200);
  expect(h.service.state().match?.hostId).toBe("c");
});
test("offline hosts hand over, offline fighters are pruned, and idle lobbies expire", () => {
  const h = setup();
  for (const id of ["a", "b"]) h.mutate({ kind: "join", prompt: "x", loadout: "blade" }, id);
  h.online.delete("a");
  h.setNow(30_000);
  h.service.tick();
  expect(h.service.state().match?.hostId).toBe("b");
  h.online.clear();
  h.setNow(60_000);
  h.service.tick();
  h.setNow(LOBBY_OFFLINE_MS + 60_001);
  h.service.tick();
  expect(h.service.state().match).toBeNull();
  h.online.add("c");
  h.mutate({ kind: "join", prompt: "x", loadout: "blade" }, "c");
  h.setNow(LOBBY_OFFLINE_MS + 60_001 + LOBBY_IDLE_MS + 1);
  h.service.tick();
  expect(h.service.state().match).toBeNull();
  expect(h.mutate({ kind: "join", prompt: "x", loadout: "bow" }, "c").status).toBe(200);
});
test("unchanged hub alarms do not write/broadcast and only idle expiry is scheduled", () => {
  const h = setup();
  h.mutate({ kind: "join", prompt: "x", loadout: "blade" });
  h.store.writes = [];
  const frames = h.frames.length;
  expect(h.service.deadline()).toBe(LOBBY_IDLE_MS);
  h.setNow(60_000);
  for (let i = 0; i < 20; i++) h.service.tick();
  expect(h.store.writes).toEqual([]);
  expect(h.frames.length).toBe(frames);
  expect(h.service.deadline()).toBe(LOBBY_IDLE_MS);
});
test("an online host keeps host and participant join/ready renews idle expiry", () => {
  const h = setup();
  for (const id of ["a", "b"]) h.mutate({ kind: "join", prompt: "x", loadout: "blade" }, id);
  const id = h.service.state().match!.id;
  h.setNow(LOBBY_IDLE_MS / 2);
  h.mutate({ kind: "ready", ready: true }, "b");
  expect(h.service.deadline()).toBe(LOBBY_IDLE_MS * 1.5);
  h.setNow(LOBBY_IDLE_MS + 1);
  h.service.tick();
  expect(h.service.state().match?.id).toBe(id);
  expect(h.service.state().match?.hostId).toBe("a");
  h.setNow(LOBBY_IDLE_MS * 1.5 - 1);
  h.mutate({ kind: "join", prompt: "updated", loadout: "bow" }, "b");
  expect(h.service.deadline()).toBe(LOBBY_IDLE_MS * 2.5 - 1);
  h.setNow(LOBBY_IDLE_MS * 2.5);
  h.service.tick();
  expect(h.service.state().match).toBeNull();
});
test("legacy envelopes migrate history and budget once, not on each turn", () => {
  const h = setup();
  h.mutate({ kind: "join", prompt: "legacy-private", loadout: "blade" });
  h.mutate({ kind: "cancel" });
  const live = JSON.parse(h.store.kv.get("arena.v1")!);
  h.store.kvPut(
    "arena.v1",
    JSON.stringify({
      ...live,
      recent: [],
      leaderboard: [],
      budget: { day: "1970-01-01", calls: 80, reservations: { old: 80 } },
    }),
  );
  h.restore();
  h.service.tick();
  expect(JSON.parse(h.store.kv.get("arena.budget.v2")!).calls).toBe(80);
  expect(JSON.parse(h.store.kv.get("arena.v1")!)).not.toHaveProperty("recent");
  expect(h.service.ownPrompt("a")).toBe("legacy-private");
});
test("result projection resumes after a crash without double-counting standings", async () => {
  class CrashStore extends TracedStore {
    crash = true;
    override kvPut(k: string, v: string) {
      if (k.startsWith("arena.match.") && this.crash) {
        this.crash = false;
        throw new Error("simulated power loss");
      }
      super.kvPut(k, v);
    }
  }
  const h = setup(new CrashStore());
  for (const id of ["a", "b"]) {
    h.mutate({ kind: "join", prompt: "x", loadout: "blade" }, id);
    h.mutate({ kind: "ready", ready: true }, id);
  }
  h.mutate({ kind: "start" });
  for (
    let i = 0;
    i < 40 && !["finished", "aborted"].includes(h.service.state().match?.phase ?? "");
    i++
  )
    await h.advance();
  expect(h.service.state().match?.phase).toBe("finished");
  h.restore();
  h.service.tick();
  expect(h.frames.at(-1)?.match?.phase).toBe("finished");
  expect(h.service.history().leaderboard.map((r) => r.matches)).toEqual([1, 1]);
  h.restore();
  h.service.tick();
  expect(h.service.history().leaderboard.map((r) => r.matches)).toEqual([1, 1]);
});
