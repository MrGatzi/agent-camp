/** Live turns stay small; completed matches, standings and budget have separate KV rows. */
import {
  ARENA_RULES,
  type ArenaAction,
  type ArenaHistory,
  ArenaMatch,
  ArenaMutation,
  ArenaStanding,
  type ArenaState,
  type PersonView,
} from "@agent-office/protocol";
import { z } from "zod";
import type { FetchLike } from "../genui.ts";
import { ArenaBudget, type ArenaStore, emptyBudget } from "./budget.ts";
import { prepare, resolveTurn } from "./engine.ts";
import {
  type ArenaEnv,
  chooseAction,
  createDecisionProvider,
  type DecisionProvider,
} from "./provider.ts";

const KEY = "arena.v1",
  BOARD = "arena.board.v2",
  INDEX = "arena.history.v2",
  BUDGET = "arena.budget.v2";
const archiveKey = (id: string) => `arena.match.${id}`;
export const LOBBY_IDLE_MS = 10 * 60_000,
  LOBBY_OFFLINE_MS = 2 * 60_000;
const Strings = z.record(z.string().max(64), z.string().max(1600));
const Journal = z
  .array(z.object({ turn: z.number().int(), actions: z.record(z.string(), z.unknown()) }))
  .max(40);
const Archive = z.object({ match: ArenaMatch, prompts: Strings, journal: Journal.default([]) });
const Board = z.object({
  rows: z.array(ArenaStanding).max(1000),
  applied: z.array(z.string()).max(21),
});
const Budget = z.object({
  day: z.string(),
  calls: z.number().int().nonnegative(),
  reservations: z.record(z.string(), z.number().int().nonnegative()),
});
const Stored = z.object({
  match: ArenaMatch.nullable(),
  prompts: Strings,
  job: z.string().nullable(),
  failures: z.number().int().nonnegative(),
  journal: Journal,
  historyRevision: z.number().int().nonnegative().default(0),
  resultsDone: z.boolean().default(false),
  lobbyAt: z.number().default(0),
  missing: z.record(z.string(), z.number()).default({}),
});
type Data = z.infer<typeof Stored>;
const ended = (m: ArenaMatch | null) => !!m && ["finished", "aborted"].includes(m.phase);
export class ArenaService {
  readonly enabled: boolean;
  readonly provider: DecisionProvider | null;
  readonly budget: ArenaBudget;
  private data: Data;
  private storageError = false;
  private readonly now: () => number;
  constructor(
    env: ArenaEnv,
    private store: ArenaStore,
    private hooks: {
      publish: (state: ArenaState) => void;
      schedule: (at: number) => void;
      background: (p: Promise<unknown>) => void;
      now?: () => number;
      fetch?: FetchLike;
      provider?: DecisionProvider;
      online?: () => ReadonlySet<string>;
    },
  ) {
    this.enabled = env.ARENA_ENABLED === "1";
    this.provider = hooks.provider ?? createDecisionProvider(env, hooks.fetch);
    this.budget = new ArenaBudget(env);
    this.now = hooks.now ?? Date.now;
    this.data = {
      match: null,
      prompts: {},
      job: null,
      failures: 0,
      journal: [],
      historyRevision: 0,
      resultsDone: true,
      lobbyAt: 0,
      missing: {},
    };
    try {
      const raw = store.kvGet(KEY);
      if (raw !== null) {
        const value = JSON.parse(raw);
        this.data = Stored.parse(value);
        // One-time, retry-safe migration of the pre-review envelope; never read archives on a turn.
        if (Object.hasOwn(value, "recent")) {
          const legacy = z
            .object({
              recent: z.array(Archive).max(20),
              leaderboard: z.array(ArenaStanding).max(1000),
              budget: Budget,
            })
            .parse(value);
          const ids: string[] = [];
          for (const entry of legacy.recent) {
            store.kvPut(archiveKey(entry.match.id), JSON.stringify(entry));
            ids.push(entry.match.id);
          }
          store.kvPut(INDEX, JSON.stringify(ids));
          store.kvPut(BUDGET, JSON.stringify(legacy.budget));
          store.kvPut(
            BOARD,
            JSON.stringify({
              rows: legacy.leaderboard,
              applied: this.data.match?.phase === "finished" ? [this.data.match.id] : [],
            }),
          );
          this.data.lobbyAt = this.now();
          store.kvPut(KEY, JSON.stringify(this.data));
        }
      }
    } catch {
      this.storageError = true;
    }
  }
  private read<S extends z.ZodType>(key: string, schema: S, fallback: z.infer<S>): z.infer<S> {
    const raw = this.store.kvGet(key);
    return raw === null ? fallback : schema.parse(JSON.parse(raw));
  }
  state(): ArenaState {
    return structuredClone({
      enabled: this.enabled,
      available: this.enabled && !!this.provider && !this.storageError,
      model: this.provider?.model ?? "not configured",
      match: this.enabled ? this.data.match : null,
      historyRevision: this.data.historyRevision,
    });
  }
  history(): ArenaHistory {
    if (!this.enabled || this.storageError) return { recent: [], leaderboard: [] };
    if (this.completeResults()) this.hooks.publish(this.state());
    const ids = this.read(INDEX, z.array(z.string()).max(21), []);
    const recent = ids
      .filter((id) => id !== this.data.match?.id)
      .slice(0, 20)
      .flatMap((id) => {
        const entry = this.read(archiveKey(id), Archive.nullable(), null);
        return entry ? [entry.match] : [];
      });
    return structuredClone({
      recent,
      leaderboard: this.read(BOARD, Board, { rows: [], applied: [] }).rows,
    });
  }
  ownPrompt(personId: string): string | null {
    return Object.hasOwn(this.data.prompts, personId) ? this.data.prompts[personId]! : null;
  }
  deadline(): number | null {
    if (!this.enabled || this.storageError) return null;
    return this.data.match?.phase === "lobby"
      ? this.data.lobbyAt + LOBBY_IDLE_MS
      : (this.data.match?.deadline ?? null);
  }
  private commit(): void {
    this.store.kvPut(KEY, JSON.stringify(this.data));
    this.hooks.publish(this.state());
    const at = this.deadline();
    if (at !== null) this.hooks.schedule(at);
  }
  /** Durable finished state is the recovery source. Each projection is idempotent. */
  private completeResults(): boolean {
    const m = this.data.match;
    if (!ended(m) || !m || this.data.resultsDone) return false;
    const board = this.read(BOARD, Board, { rows: [], applied: [] });
    if (m.phase === "finished" && !board.applied.includes(m.id)) {
      for (const f of m.fighters) {
        let row = board.rows.find((r) => r.personId === f.personId);
        if (!row) {
          row = { personId: f.personId, name: f.name, wins: 0, knockouts: 0, matches: 0 };
          board.rows.push(row);
        }
        row.name = f.name;
        row.matches++;
        row.knockouts += f.knockouts;
        if (m.winners.includes(f.personId)) row.wins++;
      }
      board.rows.sort(
        (a, b) =>
          b.wins - a.wins || b.knockouts - a.knockouts || a.personId.localeCompare(b.personId),
      );
      board.applied = [m.id, ...board.applied].slice(0, 21);
      this.store.kvPut(BOARD, JSON.stringify(board));
    }
    this.store.kvPut(
      archiveKey(m.id),
      JSON.stringify({ match: m, prompts: this.data.prompts, journal: this.data.journal }),
    );
    const ids = [
      m.id,
      ...this.read(INDEX, z.array(z.string()).max(21), []).filter((id) => id !== m.id),
    ];
    for (const id of ids.slice(21)) this.store.kvDelete(archiveKey(id));
    this.store.kvPut(INDEX, JSON.stringify(ids.slice(0, 21)));
    this.data.resultsDone = true;
    this.store.kvPut(KEY, JSON.stringify(this.data));
    return true;
  }
  private lobby(hostId: string): void {
    this.completeResults();
    const retained = this.read(INDEX, z.array(z.string()).max(21), []);
    for (const id of retained.slice(20)) this.store.kvDelete(archiveKey(id));
    if (retained.length > 20) this.store.kvPut(INDEX, JSON.stringify(retained.slice(0, 20)));
    this.data.match = {
      id: crypto.randomUUID(),
      hostId,
      seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      phase: "lobby",
      turn: 0,
      fighters: [],
      pickups: [],
      obstacles: [],
      events: [],
      winners: [],
      deadline: null,
      startedAt: null,
      endedAt: null,
      revealedPrompts: {},
    };
    this.data.prompts = {};
    this.data.job = null;
    this.data.failures = 0;
    this.data.journal = [];
    this.data.resultsDone = true;
    this.data.lobbyAt = this.now();
    this.data.missing = {};
    this.data.historyRevision++;
  }
  /** Opportunistic cleanup on hub alarms/mutations; no periodic arena wakeups. */
  private maintainLobby(): boolean {
    const m = this.data.match;
    if (m?.phase !== "lobby") return false;
    const now = this.now();
    if (now - this.data.lobbyAt >= LOBBY_IDLE_MS) {
      this.data.match = null;
      this.data.prompts = {};
      this.data.missing = {};
      return true;
    }
    const before = JSON.stringify([m.hostId, m.fighters.map((f) => f.personId), this.data.missing]);
    const online = this.hooks.online?.() ?? new Set(m.fighters.map((f) => f.personId));
    for (const f of m.fighters) {
      if (online.has(f.personId)) delete this.data.missing[f.personId];
      else if (!Object.hasOwn(this.data.missing, f.personId)) this.data.missing[f.personId] = now;
    }
    const count = m.fighters.length;
    m.fighters = m.fighters.filter((f) => {
      if (online.has(f.personId) || now - this.data.missing[f.personId]! < LOBBY_OFFLINE_MS)
        return true;
      delete this.data.prompts[f.personId];
      delete this.data.missing[f.personId];
      return false;
    });
    if (!online.has(m.hostId)) {
      const successor = m.fighters.find((f) => online.has(f.personId));
      if (successor) m.hostId = successor.personId;
    }
    if (count > 0 && m.fighters.length === 0) {
      this.data.match = null;
      return true;
    }
    return (
      before !== JSON.stringify([m.hostId, m.fighters.map((f) => f.personId), this.data.missing])
    );
  }
  mutate(
    input: unknown,
    personId: string,
    person: PersonView | undefined,
  ): { status: number; body: unknown } {
    const fail = (status: number, error: string) => ({ status, body: { error } });
    if (!this.enabled) return fail(404, "Arena is disabled");
    if (this.storageError)
      return fail(503, "Arena storage needs operator recovery; spending is disabled");
    const parsed = ArenaMutation.safeParse(input);
    if (!parsed.success) return fail(400, "Invalid arena action");
    const a = parsed.data;
    if (this.maintainLobby()) this.commit();
    let m = this.data.match;
    if (a.kind === "reveal") {
      const current = m?.id === a.matchId;
      const entry =
        current && m
          ? { match: m, prompts: this.data.prompts, journal: this.data.journal }
          : this.read(archiveKey(a.matchId), Archive.nullable(), null);
      const ids = this.read(INDEX, z.array(z.string()).max(21), []);
      if (!entry || !ended(entry.match) || (!current && !ids.includes(a.matchId)))
        return fail(409, "That match is not finished");
      if (!Object.hasOwn(entry.prompts, personId))
        return fail(403, "Only a participant can reveal their own tactics");
      entry.match.revealedPrompts[personId] = entry.prompts[personId]!;
      this.store.kvPut(archiveKey(a.matchId), JSON.stringify(entry));
      this.data.historyRevision++;
      this.commit();
      return { status: 200, body: this.state() };
    }
    if (!person) return fail(409, "Connect your coding agent to enter the arena");
    if (a.kind === "rematch") {
      if (!ended(m)) return fail(409, "Finish the current match first");
      this.lobby(personId);
      this.commit();
      return { status: 200, body: this.state() };
    }
    if (a.kind === "join" && !m) {
      this.lobby(personId);
      m = this.data.match;
    }
    if (!m) return fail(409, "Join the arena first");
    if (a.kind === "cancel") {
      if (m.hostId !== personId) return fail(403, "Only the host can cancel");
      if (m.phase !== "lobby" && m.phase !== "countdown")
        return fail(409, "Started matches cannot be cancelled");
      this.finish("aborted", "Cancelled by host");
      return { status: 200, body: this.state() };
    }
    if (m.phase !== "lobby")
      return fail(409, "Tactics and participants are locked until the next lobby");
    const fighter = m.fighters.find((f) => f.personId === personId);
    if (a.kind === "join") {
      if (!fighter && m.fighters.length >= 8) return fail(409, "Arena is full (8 fighters)");
      if (fighter) {
        fighter.loadout = a.loadout;
        fighter.ready = false;
      } else
        m.fighters.push({
          personId,
          name: person.name,
          avatar: person.avatar,
          loadout: a.loadout,
          ready: false,
          x: 0,
          y: 0,
          hp: 100,
          shield: 0,
          boost: 0,
          cooldown: 0,
          knockouts: 0,
          eliminatedTurn: null,
        });
      this.data.prompts[personId] = a.prompt;
    } else if (a.kind === "leave") {
      if (!fighter) return fail(409, "You have not joined");
      m.fighters = m.fighters.filter((f) => f.personId !== personId);
      delete this.data.prompts[personId];
      delete this.data.missing[personId];
      if (m.hostId === personId) m.hostId = m.fighters[0]?.personId ?? personId;
      if (!m.fighters.length) this.data.match = null;
    } else if (a.kind === "ready") {
      if (!fighter) return fail(403, "Join before readying");
      fighter.ready = a.ready;
    } else if (a.kind === "start") {
      if (m.hostId !== personId || !fighter) return fail(403, "Only the host can start");
      if (m.fighters.length < 2 || !m.fighters.every((f) => f.ready))
        return fail(409, "Need 2–8 ready fighters");
      if (!this.provider) return fail(503, "Arena model is not configured");
      const board = this.read(BOARD, Board, { rows: [], applied: [] }).rows;
      if (
        board.length +
          m.fighters.filter((f) => !board.some((r) => r.personId === f.personId)).length >
        1000
      )
        return fail(409, "Arena leaderboard is full");
      const reserved = this.budget.reserve(
        this.read(BUDGET, Budget, emptyBudget()),
        m.id,
        m.fighters.length,
        this.now(),
      );
      if (!reserved) return fail(429, "Arena match or daily inference budget exhausted");
      this.store.kvPut(BUDGET, JSON.stringify(reserved));
      this.data.match = prepare(m);
      m = this.data.match;
      m.phase = "countdown";
      m.startedAt = this.now();
      m.deadline = this.now() + ARENA_RULES.countdownMs;
    }
    if (a.kind === "join" || a.kind === "ready") this.data.lobbyAt = this.now();
    this.commit();
    return { status: 200, body: this.state() };
  }
  /** Called by alarms and restore; in-flight paid jobs are never repeated. */
  tick(): void {
    if (!this.enabled || this.storageError) return;
    if (this.completeResults()) this.hooks.publish(this.state());
    const m = this.data.match;
    if (!m) return;
    if (m.phase === "lobby") {
      if (this.maintainLobby()) this.commit();
      return;
    }
    if (m.deadline === null) return;
    if (m.deadline > this.now()) {
      this.hooks.schedule(m.deadline);
      return;
    }
    if (m.phase === "deciding") {
      this.settle(m.id, this.data.job, {});
      return;
    }
    if (m.phase !== "countdown" && m.phase !== "resolving") return;
    if (!this.provider) {
      this.finish("aborted", "Arena model unavailable");
      return;
    }
    m.phase = "deciding";
    m.deadline = this.now() + ARENA_RULES.decisionMs + 250;
    const job = crypto.randomUUID();
    this.data.job = job;
    const id = m.id,
      snapshot = structuredClone(m),
      provider = this.provider;
    this.commit();
    const p = Promise.all(
      snapshot.fighters
        .filter((f) => f.hp > 0)
        .map(
          async (f) =>
            [
              f.personId,
              await chooseAction(
                provider,
                snapshot,
                f.personId,
                this.data.prompts[f.personId] ?? "",
              ),
            ] as const,
        ),
    )
      .then((entries) => this.settle(id, job, Object.fromEntries(entries)))
      .catch(() => this.settle(id, job, {}));
    this.hooks.background(p);
  }
  private settle(
    id: string,
    job: string | null,
    actions: Record<string, ArenaAction | null>,
  ): void {
    const m = this.data.match;
    if (!m || m.id !== id || m.phase !== "deciding" || this.data.job !== job) return;
    const persisted = JSON.parse(this.store.kvGet(KEY) ?? "null") as Data | null;
    if (
      persisted?.job !== job ||
      persisted?.match?.id !== id ||
      persisted.match.phase !== "deciding"
    )
      return;
    this.data.job = null;
    this.data.failures = Object.values(actions).some(Boolean) ? 0 : this.data.failures + 1;
    if (this.data.failures >= 3) {
      this.finish("aborted", "Model unavailable for three consecutive turns");
      return;
    }
    this.data.journal.push({ turn: m.turn + 1, actions });
    this.data.match = resolveTurn(m, actions);
    if (this.data.match.phase === "finished") {
      this.finish("finished");
      return;
    }
    this.data.match.deadline = this.now() + ARENA_RULES.animationMs;
    this.commit();
  }
  private finish(phase: "finished" | "aborted", reason?: string): void {
    const m = this.data.match;
    if (!m) return;
    m.phase = phase;
    m.deadline = null;
    m.endedAt = this.now();
    if (reason) m.reason = reason;
    this.data.job = null;
    this.data.resultsDone = false;
    this.data.historyRevision++;
    // Persist outcome before projecting results. Recovery retries projections, not the fight.
    this.store.kvPut(KEY, JSON.stringify(this.data));
    this.completeResults();
    this.commit();
  }
}
