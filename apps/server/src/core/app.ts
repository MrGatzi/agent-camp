/**
 * OfficeApp: everything the Durable Object and the Bun dev server share. Wraps the Hub,
 * the store, GenUI and the /api/* routes. Uses only web-standard Request/Response;
 * sockets are abstracted behind `Transport` and identified by string ids.
 */
import {
  AvatarEditRequest,
  type AvatarEditResponse,
  envelope,
  HistoryRow,
  InteractRequest,
  type InteractResponse,
  LookDescribeRequest,
  type LookDescribeResponse,
  type LookGenerator,
  type MessageOf,
  PartyState,
  type ServerToConnector,
  type ViewerEvent,
} from "@agent-office/protocol";
import { z } from "zod";
import { isAuthorized, ME_TTL_MS, makeMeToken, meCookie, meFromRequest } from "./auth.ts";
import {
  AI_AVATAR_SCHEMA,
  type AvatarResult,
  type AvatarService,
  createAvatarService,
  type FetchLike,
  type GenuiEnv,
  SYSTEM_PROMPT,
  userPrompt,
} from "./genui.ts";
import { type AvatarJob, type Binding, Hub, type HubResult } from "./hub.ts";
import { isAutoVersion, LatestVersion } from "./latest.ts";
import { Party, readPartyBody } from "./party.ts";
import { computeOfficeDay, computePersonDay, computeStats, historyToCsv } from "./stats.ts";
import type { Store } from "./store.ts";

export type AppEnv = GenuiEnv & {
  CONNECTOR_PASSWORD?: string;
  VIEWER_KEY?: string;
  LATEST_CONNECTOR_VERSION?: string;
  MIN_CONNECTOR_VERSION?: string;
  /** "owner/repo" whose latest GitHub release is the connector version (LATEST_CONNECTOR_VERSION=auto) */
  GITHUB_REPO?: string;
  SERVER_VERSION?: string;
  OFFICE_NAME?: string;
  OFFICE_TIMEZONE?: string;
  /** "1" = local dev: CONNECTOR_PASSWORD defaults to "devpass" */
  DEV_MODE?: string;
};

export interface Transport {
  /** send to every connected viewer */
  broadcast(json: string): void;
  /** send to one connector socket (pokes); false if it is gone */
  sendToConnector?(socketId: string, json: string): boolean;
  /** ask to be called back (`app.alarm()`) at `at`; null = nothing pending */
  scheduleAlarm(at: number | null): void;
  /** keep the runtime alive for background work (GenUI) */
  waitUntil?(p: Promise<unknown>): void;
}

/** What to do with the socket a connector message arrived on. */
export type SocketAction = {
  reply?: ServerToConnector;
  close?: { code: number; reason: string };
  binding?: Binding;
};

export const SNAPSHOT_MAX_BYTES = 300 * 1024;
export const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000;
export const BACKFILL_MAX_ROWS = 50_000;
/** One interaction per viewer (IP) this often, and one notification per person this often. */
export const INTERACT_MIN_INTERVAL_MS = 2_000;
export const POKE_PER_PERSON_MS = 10_000;
/** A "this is me" code: how long it is valid, how often one can be sent, wrong tries allowed. */
export const CLAIM_CODE_TTL_MS = 5 * 60_000;
export const CLAIM_RESEND_MS = 30_000;
export const CLAIM_MAX_TRIES = 5;
/** Codes per person per day (UTC): bounds guessing and notification spam on their Mac. */
export const CLAIM_MAX_PER_DAY = 10;
/** One look change per viewer (IP) this often. */
export const LOOK_MIN_INTERVAL_MS = 1_000;
/** One "generate my look from this description" per person this often (each is an AI call). */
export const LOOK_DESCRIBE_MIN_INTERVAL_MS = 20_000;
/** A look request a Mac never answered is asked again on that person's next hello after this. */
export const LOOK_LOCAL_RETRY_MS = 5 * 60_000;

/** A look request sent to a person's connector (one per person, kept in the store). */
type PendingLook = {
  requestId: string;
  job: AvatarJob;
  fromStudio: boolean;
  at: number;
  generator: LookGenerator;
};
const pendingLookKey = (personId: string) => `look.pending.${personId}`;

const POKE_TEXT = {
  wave: "waved at you 👋",
  coffee: "wants to grab a coffee ☕",
  cheer: "cheers you on 🎉",
} as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** SERVER_VERSION, else a fixed LATEST_CONNECTOR_VERSION, else "dev". */
export function serverVersion(env: AppEnv): string {
  if (env.SERVER_VERSION) return env.SERVER_VERSION;
  const latest = env.LATEST_CONNECTOR_VERSION?.trim();
  return latest && !isAutoVersion(latest) ? latest : "dev";
}

export function connectorPassword(env: AppEnv): string | undefined {
  return env.CONNECTOR_PASSWORD || (env.DEV_MODE === "1" ? "devpass" : undefined);
}

export function bearerOk(req: Request, env: AppEnv): boolean {
  const pw = connectorPassword(env);
  return !!pw && req.headers.get("authorization") === `Bearer ${pw}`;
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });

export class OfficeApp {
  readonly hub: Hub;
  readonly genui: AvatarService;
  readonly latest: LatestVersion;
  readonly timezone: string;
  private lastInteract = new Map<string, number>();
  private lastPoke = new Map<string, number>();
  readonly party: Party;
  private lastLook = new Map<string, number>();
  private lastDescribe = new Map<string, number>();
  private lastClaim = new Map<string, number>();

  constructor(
    private env: AppEnv,
    readonly store: Store,
    private transport: Transport,
    private opts: { now?: () => number; fetch?: FetchLike; log?: (line: string) => void } = {},
  ) {
    this.party = new Party(store);
    const log = opts.log ?? ((l: string) => console.log(l));
    this.timezone = env.OFFICE_TIMEZONE || "Europe/Vienna";
    this.genui = createAvatarService(env, store, {
      log,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.now ? { now: opts.now } : {}),
    });
    this.latest = new LatestVersion(env.LATEST_CONNECTOR_VERSION, {
      store,
      log,
      offline: env.DEV_MODE === "1",
      ...(env.GITHUB_REPO ? { repo: env.GITHUB_REPO } : {}),
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.now ? { now: opts.now } : {}),
    });
    this.hub = new Hub(
      {
        password: connectorPassword(env),
        minConnectorVersion: env.MIN_CONNECTOR_VERSION || "0.0.0",
        latestConnectorVersion: this.latest.current,
        serverVersion: serverVersion(env),
        officeName: env.OFFICE_NAME || "Agent Office",
        timezone: this.timezone,
        avatarKey: this.genui.cacheKey,
      },
      store,
    );
    this.hub.log = log;
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Rebuild state after a restart / hibernation wake. */
  restore(sockets: { socketId: string; binding: Binding | null }[]): void {
    this.hub.restore(this.now(), sockets);
    this.transport.scheduleAlarm(this.hub.nextDeadline());
  }

  connectorMessage(socketId: string, raw: unknown): SocketAction {
    const r = this.hub.onConnectorMessage(socketId, raw, this.now());
    // a hello (it returns a binding) is the only thing that refreshes the latest version
    if (r.binding) this.refreshLatest();
    return this.handle(r, socketId);
  }

  /** Background GitHub lookup when stale; the welcome that triggered it never waits. */
  private refreshLatest(): void {
    const p = this.latest.refreshIfStale();
    if (!p) return;
    this.transport.waitUntil?.(p.then((v) => this.hub.setLatestConnectorVersion(v)));
  }

  connectorClosed(socketId: string): void {
    this.handle(this.hub.onConnectorClosed(socketId, this.now()));
  }

  /** JSON of the office.snapshot a new viewer gets. */
  viewerSnapshot(): string {
    return JSON.stringify(this.snapshot());
  }

  /** The hub's snapshot plus the deployed version and today's whiteboard numbers. */
  snapshot(): MessageOf<"office.snapshot"> {
    const now = this.now();
    const snap = this.hub.snapshot(now);
    const live = snap.data.people.reduce((n, p) => n + p.sessions.length, 0);
    const today = computeOfficeDay(this.store.history(now - 3 * 86_400_000), {
      timezone: this.timezone,
      now,
      liveSessions: live,
    });
    const v = serverVersion(this.env);
    const version = v !== "dev" ? v : this.latest.current;
    return {
      ...snap,
      data: { ...snap.data, today, party: this.party.state(now), ...(version ? { version } : {}) },
    };
  }

  alarm(): void {
    this.publish(this.hub.tick(this.now()));
    this.transport.scheduleAlarm(this.hub.nextDeadline());
  }

  private handle(r: HubResult, socketId?: string): SocketAction {
    this.publish(r.events);
    this.transport.scheduleAlarm(this.hub.nextDeadline());
    if (r.avatarJob) {
      const job = r.avatarJob;
      // the person's own Mac first (their own AI subscription), else the server's provider
      if (!this.requestLocalLook(job, { prefer: socketId })) {
        const p = this.genui
          .resolve(job)
          .then((res) => this.applyLook(job, res, false))
          .catch((err) => console.error("avatar job failed", err));
        this.transport.waitUntil?.(p);
      }
    } else if (r.binding) this.retryStaleLook(r.binding.personId, socketId);
    if (r.lookGenerated) {
      const p = this.onLookGenerated(r.lookGenerated).catch((err) =>
        console.error("local look failed", err),
      );
      this.transport.waitUntil?.(p);
    }
    const action: SocketAction = {};
    if (r.reply) action.reply = r.reply;
    if (r.close) action.close = r.close;
    if (r.binding) action.binding = r.binding;
    return action;
  }

  private publish(events: ViewerEvent[]): void {
    for (const e of events) this.transport.broadcast(JSON.stringify(e));
  }

  // ---- looks drawn on the person's own Mac --------------------------------------------------

  /**
   * Ask one of the person's live connectors to draw the look with its local AI tool (Claude
   * Code / Codex on that person's own subscription). The request is remembered in the store
   * (one per person, the newest wins), so the answer is accepted only for a request this
   * server made, from a connector of that same person, even across a hibernation. Returns the
   * tool, or null when no connector of theirs can (then the server provider takes the job).
   */
  private requestLocalLook(
    job: AvatarJob,
    opts: { prefer?: string | undefined; fromStudio?: boolean },
  ): LookGenerator | null {
    if (!job.selfDescription?.trim() || !this.transport.sendToConnector) return null;
    const now = this.now();
    const target = this.hub.lookSocketOf(job.personId, now, opts.prefer);
    if (!target) return null;
    const requestId = `lr_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const sent = this.transport.sendToConnector(
      target.socketId,
      JSON.stringify(
        envelope("connector.lookRequested", {
          requestId,
          system: SYSTEM_PROMPT,
          prompt: userPrompt(job),
          schema: AI_AVATAR_SCHEMA,
        }),
      ),
    );
    if (!sent) return null;
    const pending: PendingLook = {
      requestId,
      job,
      fromStudio: !!opts.fromStudio,
      at: now,
      generator: target.generator,
    };
    this.store.kvPut(pendingLookKey(job.personId), JSON.stringify(pending));
    this.hub.log(`look ${job.personId} requested from their Mac (${target.generator})`);
    return target.generator;
  }

  private pendingLook(personId: string): PendingLook | null {
    try {
      const raw = this.store.kvGet(pendingLookKey(personId));
      return raw ? (JSON.parse(raw) as PendingLook) : null;
    } catch {
      return null;
    }
  }

  /** A connector's answer to `connector.lookRequested`. Unusable or failed: the server tries. */
  private async onLookGenerated(g: NonNullable<HubResult["lookGenerated"]>): Promise<void> {
    const pending = this.pendingLook(g.personId);
    if (!pending || pending.requestId !== g.requestId) {
      this.hub.log(`look ${g.personId}: ignored an answer to an unknown or older request`);
      return;
    }
    this.store.kvPut(pendingLookKey(g.personId), "");
    const by = `local ${g.generator}`;
    let res = g.avatar !== undefined ? this.genui.accept(g.avatar, pending.job, by) : null;
    if (res) this.hub.log(`genui ${by} ${g.personId} drew a new look`);
    else {
      this.hub.log(
        `look ${g.personId}: their Mac could not draw it (${g.error ?? "unusable answer"}), trying the server`,
      );
      res = await this.genui.resolve(pending.job);
    }
    this.applyLook(pending.job, res, pending.fromStudio);
  }

  /**
   * A Mac that took a look request and never answered (quit, updated, asleep): when one of the
   * person's connectors says hello again after LOOK_LOCAL_RETRY_MS, ask again.
   */
  private retryStaleLook(personId: string, socketId: string | undefined): void {
    const pending = this.pendingLook(personId);
    if (!pending || this.now() - pending.at < LOOK_LOCAL_RETRY_MS) return;
    this.store.kvPut(pendingLookKey(personId), "");
    if (this.requestLocalLook(pending.job, { prefer: socketId, fromStudio: pending.fromStudio }))
      return;
    const p = this.genui
      .resolve(pending.job)
      .then((res) => this.applyLook(pending.job, res, pending.fromStudio))
      .catch((err) => console.error("avatar job failed", err));
    this.transport.waitUntil?.(p);
  }

  /** Store a resolved look; from the studio, a new AI look also replaces a picked one. */
  private applyLook(job: AvatarJob, res: AvatarResult, fromStudio: boolean): void {
    this.publish(
      this.hub.setAvatar(job.personId, res.avatar, res.key, this.now(), job.selfDescription ?? ""),
    );
    if (fromStudio && res.source === "ai" && this.hub.isCustomLook(job.personId)) {
      const back = this.hub.setCustomAvatar(job.personId, null, this.now());
      if (back) this.publish(back.events);
    }
  }

  // ---- HTTP -------------------------------------------------------------------------------

  /** Handle /api/* (returns null for anything else). */
  async handleHttp(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (path === "/api/state" && method === "GET") return json(this.snapshot());

    if (path === "/api/me" && method === "GET")
      return json({ ok: true, personId: await meFromRequest(req, this.env, this.now()) });
    if (path === "/api/me" && method === "DELETE")
      return json({ ok: true }, { headers: { "set-cookie": meCookie(req, "", 0) } });

    const claim = /^\/api\/people\/([^/]{1,64})\/claim(\/verify)?$/.exec(path);
    if (claim && method === "POST") {
      let personId: string;
      try {
        personId = decodeURIComponent(claim[1]!);
      } catch {
        return json({ error: "bad person id" }, { status: 400 });
      }
      return claim[2] ? this.verifyClaim(req, personId) : this.sendClaimCode(req, personId);
    }

    if (path === "/api/interact" && method === "POST") return this.interact(req);
    if (path === "/api/party") {
      if (method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
      const now = this.now();
      const who = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "-";
      const retryAfter = this.party.requestAllowed(who, now);
      if (retryAfter !== null)
        return json(
          { error: "slow down" },
          { status: 429, headers: { "retry-after": String(retryAfter) } },
        );
      if (!(await isAuthorized(req, this.env, now)))
        return json({ error: "unauthorized" }, { status: 401 });
      const body = await readPartyBody(req);
      if (body.status)
        return json(
          { error: body.status === 413 ? "too large" : "invalid JSON" },
          { status: body.status },
        );
      const actionAt = this.now();
      const online = new Map(
        this.hub
          .state()
          .people.filter((p) => this.hub.liveSocketsOf(p.personId, actionAt).length > 0)
          .map((p) => [p.personId, p.avatar] as const),
      );
      const result = this.party.mutate(body.value, online, actionAt);
      if (result.status === 200) {
        const party = PartyState.parse(result.body);
        this.transport.broadcast(
          JSON.stringify(envelope("party.updated", { party }, { ts: actionAt })),
        );
      }
      return json(result.body, {
        status: result.status,
        ...(result.retryAfter ? { headers: { "retry-after": String(result.retryAfter) } } : {}),
      });
    }

    const look = /^\/api\/people\/([^/]{1,64})\/avatar$/.exec(path);
    if (look) {
      let personId: string;
      try {
        personId = decodeURIComponent(look[1]!);
      } catch {
        return json({ error: "bad person id" }, { status: 400 });
      }
      if (method === "GET") {
        const p = this.hub.state().people.find((x) => x.personId === personId);
        if (!p) return json({ error: "not in the office" }, { status: 404 });
        // the description is the person's own words: only their own browser gets it back
        const mine = (await meFromRequest(req, this.env, this.now())) === personId;
        const localLooks = this.hub.lookGeneratorsOf(personId, this.now());
        return json({
          ok: true,
          avatar: p.avatar,
          custom: this.hub.isCustomLook(personId),
          aiLooks: this.genui.providerId !== "off" || localLooks.length > 0,
          localLooks,
          ...(mine ? { description: this.hub.descriptionOf(personId) } : {}),
        } satisfies AvatarEditResponse);
      }
      if (method === "PUT") {
        // only your own look: the browser must have proven it is this person
        if ((await meFromRequest(req, this.env, this.now())) !== personId)
          return json(
            { error: "you can only change your own look (confirm it is you first)" },
            { status: 403 },
          );
        return this.editLook(req, personId);
      }
    }

    if (path === "/api/stats" && method === "GET") {
      const days = Number(url.searchParams.get("days") ?? 0);
      const since = days > 0 ? this.now() - days * 86_400_000 : 0;
      const sh = this.hub.shame.snapshot(this.now());
      const top = (m: Record<string, number>) =>
        Object.entries(m)
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([key, value]) => ({ key, value }));
      return json({
        ...computeStats(this.store.history(since), {
          timezone: this.timezone,
          now: this.now(),
          names: this.hub.knownNames(),
        }),
        shame: { clears: top(sh.clears), waits: top(sh.longestWaitMs), fires: top(sh.fires) },
      });
    }

    const describe = /^\/api\/people\/([^/]{1,64})\/look$/.exec(path);
    if (describe && method === "POST") {
      let personId: string;
      try {
        personId = decodeURIComponent(describe[1]!);
      } catch {
        return json({ error: "bad person id" }, { status: 400 });
      }
      if ((await meFromRequest(req, this.env, this.now())) !== personId)
        return json(
          { error: "you can only change your own look (confirm it is you first)" },
          { status: 403 },
        );
      return this.describeLook(req, personId);
    }

    const person = /^\/api\/people\/([^/]{1,64})$/.exec(path);
    if (person && method === "GET") {
      let personId: string;
      try {
        personId = decodeURIComponent(person[1]!);
      } catch {
        return json({ error: "bad person id" }, { status: 400 });
      }
      const now = this.now();
      // two extra days so sessions that started before midnight still count as running
      const rows = this.store.history(now - 3 * 86_400_000);
      const live = this.hub.state().people.find((p) => p.personId === personId);
      const name = live?.name ?? this.hub.knownNames()[personId] ?? null;
      if (!live && !name && !rows.some((r) => r.person === personId))
        return json({ error: "not found" }, { status: 404 });
      return json(
        computePersonDay(rows, personId, {
          timezone: this.timezone,
          now,
          name,
          online: !!live,
          liveSessions: live?.sessions.length ?? 0,
          recentActivity: this.hub.recentActivity(personId, now),
        }),
      );
    }

    if (path === "/api/history.csv" && method === "GET") {
      return new Response(historyToCsv(this.store.history()), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="agent-office-history.csv"',
          "cache-control": "no-store",
        },
      });
    }

    if (path === "/api/history/backfill" && method === "POST") {
      if (!bearerOk(req, this.env)) return json({ error: "unauthorized" }, { status: 401 });
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON" }, { status: 400 });
      }
      const rows = Array.isArray(body) ? body : (body as { rows?: unknown })?.rows;
      const parsed = z.array(HistoryRow).max(BACKFILL_MAX_ROWS).safeParse(rows);
      if (!parsed.success)
        return json({ error: z.prettifyError(parsed.error).slice(0, 1000) }, { status: 400 });
      this.store.appendHistory(parsed.data);
      return json({ inserted: parsed.data.length });
    }

    if (path === "/api/snapshots" && method === "GET") {
      return json({
        snapshots: this.store
          .listSnapshots()
          .map((s) => ({ ...s, url: `/api/snapshots/${s.id}.png` })),
      });
    }

    if (path === "/api/snapshots" && method === "POST") return this.uploadSnapshot(req);

    const m = /^\/api\/snapshots\/(\d+)\.png$/.exec(path);
    if (m && method === "GET") {
      const png = this.store.getSnapshot(Number(m[1]));
      if (!png) return json({ error: "not found" }, { status: 404 });
      return new Response(png, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (path.startsWith("/api/")) return json({ error: "not found" }, { status: 404 });
    return null;
  }

  /**
   * "This is me": send a one-time code as a notification to the person's live Macs (the
   * poke channel, so every connector shows it). Whoever can read it there may edit the look.
   * A courtesy lock, not identity: a connector's person is just the name it reports with the
   * shared password, so a colleague could start one under someone else's name.
   */
  private async sendClaimCode(req: Request, personId: string): Promise<Response> {
    const now = this.now();
    if (!this.hub.state().people.some((p) => p.personId === personId))
      return json({ error: "not in the office" }, { status: 404 });
    const who = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "-";
    if (now - (this.lastClaim.get(personId) ?? 0) < CLAIM_RESEND_MS)
      return json({ error: "a code was just sent, check the Mac" }, { status: 429 });
    if (now - (this.lastClaim.get(`ip:${who}`) ?? 0) < INTERACT_MIN_INTERVAL_MS)
      return json({ error: "slow down" }, { status: 429 });
    const sockets = this.hub.liveSocketsOf(personId, now);
    if (sockets.length === 0)
      return json({ error: "no Mac of theirs is connected right now" }, { status: 409 });
    const dayKey = `claim.day.${personId}.${new Date(now).toISOString().slice(0, 10)}`;
    const today = Number(this.store.kvGet(dayKey) ?? 0);
    if (today >= CLAIM_MAX_PER_DAY)
      return json(
        { error: "too many codes for this person today, try again tomorrow" },
        { status: 429 },
      );
    this.store.kvPut(dayKey, String(today + 1));
    this.lastClaim.set(personId, now);
    this.lastClaim.set(`ip:${who}`, now);
    if (this.lastClaim.size > 500) this.lastClaim.clear();
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(
      6,
      "0",
    );
    this.store.kvPut(
      `claim.${personId}`,
      JSON.stringify({ code, exp: now + CLAIM_CODE_TTL_MS, tries: 0 }),
    );
    const poke = JSON.stringify(
      envelope("connector.poked", {
        kind: "message",
        from: "Agent Office",
        text: `Your code to edit your look: ${code} (5 min). Not you? Just ignore this.`,
      }),
    );
    let delivered = 0;
    for (const socketId of sockets)
      if (this.transport.sendToConnector?.(socketId, poke)) delivered++;
    this.hub.log(`look ${personId} claim code sent to ${delivered} Mac(s)`);
    if (delivered === 0)
      return json({ error: "no Mac of theirs is connected right now" }, { status: 409 });
    return json({ ok: true, delivered });
  }

  /** Check a "this is me" code; on success the browser gets the signed `ao_me` cookie. */
  private async verifyClaim(req: Request, personId: string): Promise<Response> {
    let code = "";
    try {
      code = String(((await req.json()) as { code?: unknown }).code ?? "").replace(/\D/g, "");
    } catch {
      return json({ error: "invalid JSON" }, { status: 400 });
    }
    const now = this.now();
    const key = `claim.${personId}`;
    let pending: { code: string; exp: number; tries: number } | null = null;
    try {
      pending = JSON.parse(this.store.kvGet(key) ?? "null");
    } catch {
      pending = null;
    }
    if (!pending || pending.exp < now || pending.tries >= CLAIM_MAX_TRIES)
      return json({ error: "no valid code, send a new one" }, { status: 410 });
    if (code !== pending.code) {
      pending.tries++;
      this.store.kvPut(key, JSON.stringify(pending));
      return json({ error: "wrong code" }, { status: 403 });
    }
    this.store.kvPut(key, "null");
    const pw = connectorPassword(this.env);
    if (!pw) return json({ error: "office has no password" }, { status: 500 });
    const token = await makeMeToken(pw, personId, now);
    this.hub.log(`look ${personId} claimed by a browser`);
    return json(
      { ok: true, personId },
      { headers: { "set-cookie": meCookie(req, token, ME_TTL_MS / 1000) } },
    );
  }

  /** Look editor: pin a custom look or go back to the automatic one. */
  private async editLook(req: Request, personId: string): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, { status: 400 });
    }
    const parsed = AvatarEditRequest.safeParse(body);
    if (!parsed.success)
      return json({ error: z.prettifyError(parsed.error).slice(0, 500) }, { status: 400 });
    const now = this.now();
    const who = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "-";
    if (now - (this.lastLook.get(who) ?? 0) < LOOK_MIN_INTERVAL_MS)
      return json({ error: "slow down" }, { status: 429 });
    this.lastLook.set(who, now);
    if (this.lastLook.size > 500) this.lastLook.clear();

    const r = this.hub.setCustomAvatar(personId, parsed.data.avatar, now);
    if (!r) return json({ error: "not in the office" }, { status: 404 });
    this.hub.log(`look ${personId} edited by ${parsed.data.from || "someone"}`);
    this.publish(r.events);
    let avatar = r.avatar;
    if (r.avatarJob && !this.requestLocalLook(r.avatarJob, {})) {
      const job = r.avatarJob;
      const res = await this.genui.resolve(job);
      this.publish(
        this.hub.setAvatar(
          job.personId,
          res.avatar,
          res.key,
          this.now(),
          job.selfDescription ?? "",
        ),
      );
      avatar = res.avatar;
    }
    this.transport.scheduleAlarm(this.hub.nextDeadline());
    return json({
      ok: true,
      avatar,
      custom: parsed.data.avatar !== null,
    } satisfies AvatarEditResponse);
  }

  /**
   * Look studio: the owner describes their look, the server's GenUI turns it into one. Waits
   * for the AI (up to its timeout) so the studio can show the result. The description is
   * saved even when AI looks are off, so it is used as soon as they are turned on.
   */
  private async describeLook(req: Request, personId: string): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, { status: 400 });
    }
    const parsed = LookDescribeRequest.safeParse(body);
    if (!parsed.success)
      return json({ error: z.prettifyError(parsed.error).slice(0, 500) }, { status: 400 });
    const now = this.now();
    const retryIn = (this.lastDescribe.get(personId) ?? 0) + LOOK_DESCRIBE_MIN_INTERVAL_MS - now;
    if (retryIn > 0)
      return json(
        { error: `one new look at a time, try again in ${Math.ceil(retryIn / 1000)} s` },
        { status: 429, headers: { "retry-after": String(Math.ceil(retryIn / 1000)) } },
      );
    const job = this.hub.describeLook(personId, parsed.data.description);
    if (!job) return json({ error: "not in the office" }, { status: 404 });
    this.lastDescribe.set(personId, now);
    const current = () =>
      this.hub.state().people.find((p) => p.personId === personId)?.avatar ?? job.previous;

    // their own Mac draws it (their own AI subscription); the studio waits for avatar.updated
    const generator = this.requestLocalLook(job, { fromStudio: true });
    if (generator) {
      const avatar = current();
      if (avatar)
        return json({
          ok: true,
          avatar,
          result: "pending",
          generator,
        } satisfies LookDescribeResponse);
    }

    const res = await this.genui.resolve(job);
    // a new AI look replaces a look picked in the editor: that is what "Generate" asked for
    this.applyLook(job, res, true);
    const avatar =
      this.hub.state().people.find((p) => p.personId === personId)?.avatar ?? res.avatar;
    const result = res.source === "ai" ? "ai" : this.genui.providerId === "off" ? "off" : "failed";
    return json({ ok: result === "ai", avatar, result } satisfies LookDescribeResponse);
  }

  private async interact(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, { status: 400 });
    }
    const parsed = InteractRequest.safeParse(body);
    if (!parsed.success)
      return json({ error: z.prettifyError(parsed.error).slice(0, 500) }, { status: 400 });
    const r = parsed.data;
    const now = this.now();

    const who = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "-";
    if (now - (this.lastInteract.get(who) ?? 0) < INTERACT_MIN_INTERVAL_MS)
      return json({ error: "slow down" }, { status: 429 });
    this.lastInteract.set(who, now);
    if (this.lastInteract.size > 500) this.lastInteract.clear();

    if (r.personId && !this.hub.state().people.some((p) => p.personId === r.personId))
      return json({ error: "not in the office" }, { status: 404 });

    let delivered = 0;
    const kind = r.kind;
    const pokes = kind === "wave" || kind === "coffee" || kind === "cheer" || kind === "message";
    const officeOnly = !pokes;
    if (r.personId && pokes) {
      if (now - (this.lastPoke.get(r.personId) ?? 0) < POKE_PER_PERSON_MS)
        return json({ error: "they were just poked, give them a moment" }, { status: 429 });
      this.lastPoke.set(r.personId, now);
      const from = r.from || undefined;
      const text = kind === "message" ? r.text! : `${from ?? "Someone"} ${POKE_TEXT[kind]}`;
      const poke = JSON.stringify(
        envelope("connector.poked", { kind, text, ...(from ? { from } : {}) }),
      );
      for (const socketId of this.hub.liveSocketsOf(r.personId, now)) {
        if (this.transport.sendToConnector?.(socketId, poke)) delivered++;
      }
    }

    const event: MessageOf<"interaction.happened"> = envelope("interaction.happened", {
      kind: r.kind,
      ...(r.personId ? { personId: r.personId } : {}),
      ...(r.from ? { from: r.from } : {}),
      ...(r.text && r.kind === "message" ? { text: r.text } : {}),
      ...(r.personId && !officeOnly ? { delivered } : {}),
    });
    this.transport.broadcast(JSON.stringify(event));
    this.hub.log(`interaction ${r.kind} ${r.personId ?? "-"} delivered=${delivered}`);
    return json({ ok: true, delivered } satisfies InteractResponse);
  }

  private async uploadSnapshot(req: Request): Promise<Response> {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > SNAPSHOT_MAX_BYTES) return json({ error: "too large" }, { status: 413 });
    const png = new Uint8Array(await req.arrayBuffer());
    if (png.byteLength > SNAPSHOT_MAX_BYTES) return json({ error: "too large" }, { status: 413 });
    if (png.byteLength < 8 || PNG_MAGIC.some((b, i) => png[i] !== b)) {
      return json({ error: "expected a PNG body" }, { status: 415 });
    }
    const now = this.now();
    const trusted = bearerOk(req, this.env);
    // the kiosk recorder posts every 15 min; Bearer CONNECTOR_PASSWORD bypasses (simulator, tests)
    if (!trusted) {
      const last = Number(this.store.kvGet("snapshots.last") ?? 0);
      if (now - last < SNAPSHOT_MIN_INTERVAL_MS) {
        const retry = Math.ceil((last + SNAPSHOT_MIN_INTERVAL_MS - now) / 1000);
        return json(
          { error: "rate limited" },
          { status: 429, headers: { "retry-after": String(retry) } },
        );
      }
    }
    // Bearer uploads may backdate a frame with ?ts=<ms> (screenshots, imports); never the future
    const asked = trusted ? Number(new URL(req.url).searchParams.get("ts")) : Number.NaN;
    const ts = Number.isFinite(asked) && asked > 0 ? Math.min(Math.round(asked), now) : now;
    if (!trusted) this.store.kvPut("snapshots.last", String(now));
    const id = this.store.addSnapshot(ts, png);
    return json({ id, ts, url: `/api/snapshots/${id}.png` }, { status: 201 });
  }
}
