import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { avatarFromSeed } from "@agent-office/protocol";
import { ArenaService } from "../../src/core/arena/service.ts";
import { MemoryStore, SqlStore } from "../../src/core/store.ts";

test("SQLite preserves private tactics separately from public snapshots and reveals", () => {
  const db = new Database(":memory:");
  const run = (sql: string, ...args: unknown[]) =>
    db.query(sql).all(...(args as never[])) as Record<string, unknown>[];
  const store = new SqlStore(run);
  const hooks = { publish: () => {}, schedule: () => {}, background: () => {} };
  const a = new ArenaService({ ARENA_ENABLED: "1" }, store, hooks);
  const person = {
    personId: "anna",
    name: "Anna",
    avatar: avatarFromSeed("anna"),
    sessions: [],
    joinedAt: 0,
  };
  a.mutate({ kind: "join", prompt: "PRIVATE_SQL_CANARY", loadout: "bow" }, "anna", person);
  const b = new ArenaService({ ARENA_ENABLED: "1" }, new SqlStore(run), hooks);
  expect(b.ownPrompt("anna")).toBe("PRIVATE_SQL_CANARY");
  expect(b.ownPrompt("bob")).toBeNull();
  expect(JSON.stringify(b.state())).not.toContain("PRIVATE_SQL_CANARY");
  const id = b.state().match!.id;
  expect(b.mutate({ kind: "reveal", matchId: id }, "anna", person).status).toBe(409);
  b.mutate({ kind: "cancel" }, "anna", person);
  b.mutate({ kind: "rematch" }, "anna", person);
  expect(JSON.stringify(b.state())).not.toContain("PRIVATE_SQL_CANARY");
  b.mutate({ kind: "reveal", matchId: id }, "anna", undefined);
  expect(b.history().recent[0]!.revealedPrompts.anna).toBe("PRIVATE_SQL_CANARY");
  b.mutate({ kind: "join", prompt: "FUTURE_PRIVATE", loadout: "blade" }, "anna", person);
  expect(b.history().recent[0]!.revealedPrompts.anna).toBe("PRIVATE_SQL_CANARY");
  expect(JSON.stringify(b.state())).not.toContain("FUTURE_PRIVATE");
  db.close();
});
test("corrupted persistence fails closed instead of resetting the spending budget", () => {
  const store = new MemoryStore();
  store.kvPut("arena.v1", "broken");
  const s = new ArenaService({ ARENA_ENABLED: "1" }, store, {
    publish: () => {},
    schedule: () => {},
    background: () => {},
  });
  expect(s.state().available).toBe(false);
  expect(s.mutate({ kind: "join", prompt: "x", loadout: "blade" }, "anna", undefined).status).toBe(
    503,
  );
  s.tick();
  expect(store.kvGet("arena.v1")).toBe("broken");
});
