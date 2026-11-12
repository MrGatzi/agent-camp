import { describe, expect, test } from "bun:test";
import {
  AvatarSpec,
  avatarFromSeed,
  COMPANIONS,
  repairAvatar,
  TRAILS,
  ViewerAvatar,
} from "@agent-office/protocol";
import { COMPANION_SIZE, companionPixels } from "../src/art/companions.ts";
import {
  AWAY,
  CompanionClock,
  companionKinds,
  dropKind,
  dropsDue,
  FIRST_VISIT,
  TRAIL_STEP,
  VISIT,
} from "../src/world/magicRules.ts";

describe("trail", () => {
  test("one drop every TRAIL_STEP pixels walked, the rest carries over", () => {
    expect(dropsDue(0, TRAIL_STEP - 1)).toEqual({ drops: 0, carry: TRAIL_STEP - 1 });
    expect(dropsDue(TRAIL_STEP - 1, 1)).toEqual({ drops: 1, carry: 0 });
    expect(dropsDue(0, TRAIL_STEP * 3 + 2)).toEqual({ drops: 3, carry: 2 });
    expect(dropsDue(4, -10)).toEqual({ drops: 0, carry: 4 }); // standing still never drops
  });

  test("glitter, sweets, or both taking turns", () => {
    expect(dropKind("none", 0)).toBeNull();
    expect(dropKind("sparkles", 3)).toBe("star");
    expect(dropKind("candy", 3)).toBe("candy");
    expect([0, 1, 2, 3].map((n) => dropKind("both", n))).toEqual([
      "star",
      "candy",
      "star",
      "candy",
    ]);
  });
});

describe("companions", () => {
  test("settings map to the friends that come along", () => {
    expect(companionKinds("none")).toEqual([]);
    expect(companionKinds("eye")).toEqual(["eye"]);
    expect(companionKinds("pig")).toEqual(["pig"]);
    expect(companionKinds("both")).toEqual(["eye", "pig"]);
  });

  test("a visit schedule: not at once, then here and away within the bounds", () => {
    const clock = new CompanionClock("anna|pig");
    const events: { at: number; change: "arrive" | "leave" }[] = [];
    let t = 0;
    for (let i = 0; i < 20 * 60 * 10; i++) {
      t += 0.1;
      const change = clock.update(0.1);
      if (change) events.push({ at: t, change });
    }
    expect(events[0]!.change).toBe("arrive");
    expect(events[0]!.at).toBeGreaterThanOrEqual(FIRST_VISIT[0]);
    expect(events[0]!.at).toBeLessThanOrEqual(FIRST_VISIT[1] + 0.2);
    for (let i = 1; i < events.length; i++) {
      const gap = events[i]!.at - events[i - 1]!.at;
      const [lo, hi] = events[i]!.change === "leave" ? VISIT : AWAY;
      expect(events[i]!.change).not.toBe(events[i - 1]!.change);
      expect(gap).toBeGreaterThanOrEqual(lo - 0.2);
      expect(gap).toBeLessThanOrEqual(hi + 0.2);
    }
    expect(events.length).toBeGreaterThan(4);
  });

  test("the same person gets the same rhythm in every browser", () => {
    const a = new CompanionClock("anna|eye");
    const b = new CompanionClock("anna|eye");
    for (let i = 0; i < 5000; i++) expect(a.update(0.1)).toBe(b.update(0.1));
  });

  test("both sprites have pixels in both frames and the frames differ", () => {
    for (const kind of ["eye", "pig"] as const) {
      const [f0, f1] = [0, 1].map((f) => companionPixels(kind, f));
      expect(f0!.width).toBe(COMPANION_SIZE[kind].w);
      expect([...f0!.data].filter((v) => v >>> 24 !== 0).length).toBeGreaterThan(30);
      expect([...f0!.data].join()).not.toBe([...f1!.data].join());
    }
  });
});

describe("catalog fields", () => {
  test("stored avatars without them default to none, unknown ids fall back", () => {
    const { trail, companion, ...old } = avatarFromSeed("anna");
    expect(trail).toBe("none");
    expect(companion).toBe("none");
    const parsed = AvatarSpec.parse(old);
    expect(parsed.trail).toBe("none");
    expect(parsed.companion).toBe("none");
    const viewer = ViewerAvatar.parse({ ...old, trail: "fireworks", companion: "dragon" });
    expect(viewer.trail).toBe("none");
    expect(viewer.companion).toBe("none");
  });

  test("every option survives a repair round trip", () => {
    for (const { id: trail } of TRAILS)
      for (const { id: companion } of COMPANIONS) {
        const a = { ...avatarFromSeed("anna"), trail, companion };
        expect(repairAvatar(a, "anna").avatar).toMatchObject({ trail, companion });
      }
    const broken = { ...avatarFromSeed("anna"), trail: 7, companion: "dragon" };
    expect(repairAvatar(broken, "anna").avatar).toMatchObject({ trail: "none", companion: "none" });
  });
});
