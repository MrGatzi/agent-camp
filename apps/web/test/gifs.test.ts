import { describe, expect, test } from "bun:test";
import { avatarFromSeed, envelope, type PersonView } from "@agent-office/protocol";
import { OfficeModel } from "../src/state/officeModel.ts";
import { fitScale, frameAt, frameEnds, GIF_MAX_H, GIF_MAX_W } from "../src/world/gifs.ts";

const GIF = "JIX9t2j0ZTN9S";

describe("gif timing", () => {
  test("frameEnds: tiny delays play like browsers (100 ms)", () => {
    expect(frameEnds([50, 0, 10, 20])).toEqual([50, 150, 250, 270]);
  });

  test("frameAt loops", () => {
    const ends = [100, 200, 300];
    expect(frameAt(ends, 0)).toBe(0);
    expect(frameAt(ends, 99)).toBe(0);
    expect(frameAt(ends, 100)).toBe(1);
    expect(frameAt(ends, 299)).toBe(2);
    expect(frameAt(ends, 300)).toBe(0);
    expect(frameAt(ends, 1_250)).toBe(0);
    expect(frameAt([], 500)).toBe(0);
  });

  test("fitScale keeps the aspect ratio inside the box", () => {
    const wide = fitScale(200, 100);
    expect(200 * wide).toBeCloseTo(GIF_MAX_W);
    expect(100 * wide).toBeLessThanOrEqual(GIF_MAX_H);
    const tall = fitScale(200, 400);
    expect(400 * tall).toBeCloseTo(GIF_MAX_H);
    expect(fitScale(0, 0)).toBe(1);
  });
});

describe("office model: head gif", () => {
  const anna = (gif?: string): PersonView => ({
    personId: "anna",
    name: "Anna",
    avatar: avatarFromSeed("anna"),
    sessions: [],
    joinedAt: 1,
    ...(gif ? { gif } : {}),
  });
  const snap = (p: PersonView) =>
    envelope("office.snapshot", { officeName: "Camp", serverTime: 10, people: [p] });

  test("snapshot, gif.updated and a later snapshot all keep it in sync", () => {
    const m = new OfficeModel(() => 10);
    m.apply(snap(anna(GIF)));
    expect(m.people.get("anna")?.gif).toBe(GIF);

    expect(m.apply(envelope("gif.updated", { personId: "anna" }))).toEqual([
      { kind: "gifChanged", personId: "anna" },
    ]);
    expect(m.people.get("anna")?.gif).toBeUndefined();
    // same value again: no change
    expect(m.apply(envelope("gif.updated", { personId: "anna" }))).toEqual([]);

    const changes = m.apply(snap(anna(GIF)));
    expect(changes).toContainEqual({ kind: "gifChanged", personId: "anna" });
    expect(m.people.get("anna")?.gif).toBe(GIF);
  });
});
