/**
 * Pure rules for the avatar "magic" (catalog `trail` and `companion`): what drops behind a
 * walking character and when a companion turns up. No Pixi, so they are unit-tested.
 */
import type { Companion, Trail } from "@agent-office/protocol";
import { seededRandom } from "@agent-office/protocol";
import type { CompanionKind } from "../art/companions.ts";

/** World pixels a character walks between two drops. */
export const TRAIL_STEP = 9;
/** Seconds a drop lies on the floor before it has faded out. */
export const DROP_LIFE = 3;
/** Drops alive at once across the whole office (each is a couple of pixels). */
export const MAX_DROPS = 240;

export type DropKind = "star" | "candy";

/** The n-th drop of a trail ("both" alternates glitter and sweets), or null for none. */
export function dropKind(trail: Trail, n: number): DropKind | null {
  switch (trail) {
    case "none":
      return null;
    case "sparkles":
      return "star";
    case "candy":
      return "candy";
    case "both":
      return n % 2 === 0 ? "star" : "candy";
  }
}

/** Which companions a setting brings along. */
export function companionKinds(companion: Companion): CompanionKind[] {
  switch (companion) {
    case "none":
      return [];
    case "eye":
      return ["eye"];
    case "pig":
      return ["pig"];
    case "both":
      return ["eye", "pig"];
  }
}

/** Walking distance accumulator: how many drops are due after moving `moved` pixels. */
export function dropsDue(carry: number, moved: number): { drops: number; carry: number } {
  const total = carry + Math.max(0, moved);
  const drops = Math.floor(total / TRAIL_STEP);
  return { drops, carry: total - drops * TRAIL_STEP };
}

/** First visit after this many seconds (so a companion is not there the moment you sit down). */
export const FIRST_VISIT = [20, 60] as const;
/** How long a visit lasts. */
export const VISIT = [30, 60] as const;
/** The break between two visits. */
export const AWAY = [120, 300] as const;

/**
 * When a companion is around: a deterministic schedule per person and kind (everyone in the
 * office sees the same rhythm without any network traffic), away → here → away → …
 */
export class CompanionClock {
  here = false;
  private left: number;
  private readonly rand: () => number;

  constructor(seed: string) {
    this.rand = seededRandom(`companion:${seed}`);
    this.left = this.between(FIRST_VISIT);
  }

  private between([lo, hi]: readonly [number, number]): number {
    return lo + this.rand() * (hi - lo);
  }

  /** Advance; returns "arrive" / "leave" on the frame the companion comes or goes. */
  update(dt: number): "arrive" | "leave" | null {
    this.left -= dt;
    if (this.left > 0) return null;
    this.here = !this.here;
    this.left = this.between(this.here ? VISIT : AWAY);
    return this.here ? "arrive" : "leave";
  }
}
