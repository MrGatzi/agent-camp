import { expect, test } from "bun:test";
import { ArenaState, envelope, parseViewerMessage } from "@agent-office/protocol";
import { OfficeModel } from "../src/state/officeModel.ts";

const state = ArenaState.parse({
  enabled: true,
  available: true,
  model: "fake",
  match: null,
  historyRevision: 0,
});
test("arena socket state updates without altering office identity or seating", () => {
  const model = new OfficeModel();
  const msg = envelope("arena.updated", { arena: state });
  const parsed = parseViewerMessage(JSON.stringify(msg));
  expect(parsed.ok).toBe(true);
  expect(model.apply(msg)).toEqual([{ kind: "arenaChanged" }]);
  expect(model.arena).toEqual(state);
  expect(model.people.size).toBe(0);
  model.apply(
    envelope("office.snapshot", { officeName: "office", serverTime: Date.now(), people: [] }),
  );
  expect(model.arena).toBeUndefined();
});
test("older cached viewer snapshots tolerate optional invalid arena field", () => {
  const parsed = parseViewerMessage(
    JSON.stringify(
      envelope("office.snapshot", {
        officeName: "office",
        serverTime: Date.now(),
        people: [],
        arena: state,
      }),
    ),
  );
  expect(parsed.ok).toBe(true);
  const unknown = parseViewerMessage({
    v: 1,
    type: "office.snapshot",
    id: "x",
    ts: 0,
    data: { officeName: "office", serverTime: 0, people: [], arena: { version: 999 } },
  });
  expect(unknown.ok).toBe(true);
});
