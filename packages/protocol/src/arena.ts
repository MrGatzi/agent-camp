/** Arena v1: public wire shapes. Private tactics never belong in this state. */
import { z } from "zod";
import { ViewerAvatar } from "./catalog.ts";

export const ARENA_RULES = {
  version: 1,
  minPlayers: 2,
  maxPlayers: 8,
  size: 12,
  health: 100,
  maxTurns: 40,
  pressureFrom: 15,
  promptMax: 1600,
  countdownMs: 3000,
  animationMs: 1800,
  decisionMs: 10000,
  outputTokens: 160,
} as const;
export const ArenaLoadout = z.enum(["blade", "bow", "guardian"]);
export type ArenaLoadout = z.infer<typeof ArenaLoadout>;
export const ARENA_LOADOUTS = {
  blade: { label: "Blade", damage: 24, range: 1, specialDamage: 36, armor: 0 },
  bow: { label: "Bow", damage: 16, range: 5, specialDamage: 26, armor: 0 },
  guardian: { label: "Guardian", damage: 18, range: 1, specialDamage: 28, armor: 4 },
} as const;
const Id = z.string().min(1).max(64);
const Coord = z
  .number()
  .int()
  .min(0)
  .max(ARENA_RULES.size - 1);
export const ArenaPoint = z.strictObject({ x: Coord, y: Coord });
export type ArenaPoint = z.infer<typeof ArenaPoint>;
export const ArenaAction = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("move"), x: Coord, y: Coord }),
  z.strictObject({ kind: z.literal("attack"), targetId: Id }),
  z.strictObject({ kind: z.literal("special"), targetId: Id }),
  z.strictObject({ kind: z.literal("defend") }),
  z.strictObject({ kind: z.literal("collect") }),
]);
export type ArenaAction = z.infer<typeof ArenaAction>;
export const ArenaFighter = z.object({
  personId: Id,
  name: z.string().max(40),
  avatar: ViewerAvatar,
  loadout: ArenaLoadout,
  ready: z.boolean(),
  x: Coord,
  y: Coord,
  hp: z.number().int().min(0).max(100),
  shield: z.number().int().min(0).max(30),
  boost: z.number().int().min(0).max(3),
  cooldown: z.number().int().min(0).max(3),
  knockouts: z.number().int().nonnegative(),
  eliminatedTurn: z.number().int().nullable(),
  lastAction: ArenaAction.optional(),
  fallback: z.boolean().optional(),
});
export type ArenaFighter = z.infer<typeof ArenaFighter>;
export const ArenaPickup = z.object({
  id: Id,
  x: Coord,
  y: Coord,
  kind: z.enum(["heal", "shield", "boost"]),
});
export type ArenaPickup = z.infer<typeof ArenaPickup>;
export const ArenaEvent = z.object({
  turn: z.number().int(),
  kind: z.enum(["attack", "pickup", "elimination", "pressure"]),
  actor: Id.optional(),
  target: Id.optional(),
  amount: z.number().int().optional(),
});
export type ArenaEvent = z.infer<typeof ArenaEvent>;
export const ArenaMatch = z.object({
  id: Id,
  hostId: Id,
  seed: z.number().int().nonnegative(),
  phase: z.enum(["lobby", "countdown", "deciding", "resolving", "finished", "aborted"]),
  turn: z.number().int().min(0).max(40),
  fighters: z.array(ArenaFighter).max(8),
  pickups: z.array(ArenaPickup).max(6),
  obstacles: z.array(ArenaPoint).max(16),
  events: z.array(ArenaEvent).max(128),
  winners: z.array(Id).max(1),
  deadline: z.number().nullable(),
  reason: z.string().max(160).optional(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  revealedPrompts: z.record(Id, z.string().max(1600)),
});
export type ArenaMatch = z.infer<typeof ArenaMatch>;
export const ArenaStanding = z.object({
  personId: Id,
  name: z.string().max(40),
  wins: z.number().int().nonnegative(),
  knockouts: z.number().int().nonnegative(),
  matches: z.number().int().nonnegative(),
});
export type ArenaStanding = z.infer<typeof ArenaStanding>;
export const ArenaState = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  model: z.string().max(100),
  match: ArenaMatch.nullable(),
  historyRevision: z.number().int().nonnegative().default(0),
});
export type ArenaState = z.infer<typeof ArenaState>;
/** Loaded only when the arena panel requests history; never broadcast with live turns. */
export const ArenaHistory = z.object({
  leaderboard: z.array(ArenaStanding).max(1000),
  recent: z.array(ArenaMatch).max(20),
});
export type ArenaHistory = z.infer<typeof ArenaHistory>;
export const ArenaMutation = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("join"),
    prompt: z.string().trim().min(1).max(1600),
    loadout: ArenaLoadout,
  }),
  z.strictObject({ kind: z.literal("ready"), ready: z.boolean() }),
  z.strictObject({ kind: z.literal("leave") }),
  z.strictObject({ kind: z.literal("start") }),
  z.strictObject({ kind: z.literal("cancel") }),
  z.strictObject({ kind: z.literal("rematch") }),
  z.strictObject({ kind: z.literal("reveal"), matchId: Id }),
]);
export type ArenaMutation = z.infer<typeof ArenaMutation>;
