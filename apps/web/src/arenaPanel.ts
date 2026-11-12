import {
  ARENA_LOADOUTS,
  ArenaHistory,
  type ArenaLoadout,
  type ArenaMatch,
  type ArenaMutation,
  ArenaState,
} from "@agent-office/protocol";
import { loginIfLoggedOut } from "./net/viewer.ts";
import type { OfficeModel } from "./state/officeModel.ts";
import "./ui/arena.css";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}
function button(label: string, run: () => void) {
  const b = el("button", label);
  b.type = "button";
  b.className = "pixel-btn";
  b.onclick = run;
  return b;
}
export class ArenaPanel {
  readonly launch = button("⚔ Prompt Arena", () => this.open());
  private panel = el("section");
  private prompt = el("textarea");
  private loadout = el("select");
  private info = el("p");
  private claim = button("Confirm identity", () => this.options.claim?.());
  private notice = el("p");
  private roster = el("ol");
  private results = el("div");
  private board = el("ol");
  private feed = el("ul");
  private actions = el("div");
  private editor = el("fieldset");
  private me: string | null = null;
  private busy = false;
  private generation = 0;
  private history: ArenaHistory = { recent: [], leaderboard: [] };
  private historyRevision = -1;
  private historyLoading = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    host: HTMLElement,
    private model: OfficeModel,
    private options: {
      key: string | null;
      claim?: () => void;
      focus: () => void;
      ingest: (state: ArenaState) => void;
    },
  ) {
    this.launch.classList.add("arena-launch");
    this.launch.hidden = true;
    this.panel.className = "arena-panel pixel-box";
    this.panel.hidden = true;
    this.panel.tabIndex = -1;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "Prompt Arena");
    const header = el("header");
    header.append(
      el("h2", "PROMPT ARENA"),
      button("Close", () => this.close()),
    );
    const intro = el(
      "p",
      "Write your fighter’s tactics. The LLM chooses moves each turn; the game engine decides hits. 2–8 fighters, last one standing. Cosmetics do not affect combat.",
    );
    const watch = button("Watch arena", () => {
      this.options.focus();
      this.close();
    });
    this.info.className = "arena-info";
    const legend = el("legend", "Your private tactics & loadout");
    const label = el("label", "Tactics (max 1600 characters)");
    this.prompt.id = "arena-tactics";
    label.htmlFor = this.prompt.id;
    this.prompt.maxLength = 1600;
    this.prompt.rows = 4;
    this.prompt.placeholder =
      "Keep your distance. Collect shields, focus weak opponents, and use cover. Defend when cornered.";
    const privacy = el(
      "p",
      "Private by default. Sent to the office’s AI provider and stored for retained matches. Do not include secrets. You may choose to reveal this match’s prompt afterwards.",
    );
    privacy.className = "arena-hint";
    const gear = el("label", "Combat loadout");
    gear.htmlFor = "arena-loadout";
    this.loadout.id = "arena-loadout";
    for (const [id, kit] of Object.entries(ARENA_LOADOUTS)) {
      const o = el(
        "option",
        `${kit.label} · damage ${kit.damage}, range ${kit.range}, armor ${kit.armor}`,
      );
      o.value = id;
      this.loadout.append(o);
    }
    this.editor.append(
      legend,
      label,
      this.prompt,
      gear,
      this.loadout,
      privacy,
      button(
        "Save tactics / join",
        () =>
          void this.send({
            kind: "join",
            prompt: this.prompt.value,
            loadout: this.loadout.value as ArenaLoadout,
          }),
      ),
    );
    this.notice.setAttribute("role", "status");
    this.notice.setAttribute("aria-live", "polite");
    this.panel.append(
      header,
      intro,
      watch,
      this.info,
      this.claim,
      this.editor,
      this.notice,
      el("h3", "Fighters"),
      this.roster,
      this.actions,
      el("h3", "Live combat"),
      this.feed,
      this.results,
      el("h3", "Leaderboard · wins / knockouts / matches"),
      this.board,
    );
    this.panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
    });
    host.append(this.launch, this.panel);
  }
  setMe(me: string | null): void {
    if (me !== this.me) this.prompt.value = "";
    this.me = me;
    this.refresh();
  }
  get isOpen() {
    return !this.panel.hidden;
  }
  open(): void {
    if (!this.model.arena?.enabled) return;
    this.panel.hidden = false;
    this.historyRevision = -1;
    this.panel.focus();
    this.refresh();
    if (!this.timer) this.timer = setInterval(() => this.updateInfo(), 250);
    const generation = ++this.generation;
    const q = this.options.key ? `?key=${encodeURIComponent(this.options.key)}` : "";
    void fetch(`/api/arena/me${q}`)
      .then(async (r) => {
        if (r.status === 401) void loginIfLoggedOut();
        if (!r.ok) throw new Error("Could not load arena identity");
        return r.json();
      })
      .then((body: { personId: string | null; prompt: string | null }) => {
        if (generation !== this.generation) return;
        this.setMe(body.personId);
        if (body.prompt !== null) this.prompt.value = body.prompt;
        this.refresh();
      })
      .catch(() => {
        this.notice.textContent = "Could not load your identity. Reopen to retry.";
      });
  }
  close(): void {
    this.panel.hidden = true;
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.launch.focus();
  }
  private updateInfo(): void {
    const state = this.model.arena;
    if (!state) return;
    const m = state.match;
    const seconds = m?.deadline
      ? Math.max(0, Math.ceil((m.deadline - Date.now() - this.model.clockSkew) / 1000))
      : 0;
    this.info.textContent = `${state.model} · ${m ? `${m.phase.toUpperCase()} · turn ${m.turn}/40${m.deadline ? ` · ${seconds}s` : ""}` : "NO MATCH"} · ${this.me ? `Playing as ${this.model.people.get(this.me)?.name ?? this.me}` : "Spectator — confirm who you are in the Me menu to play"}${!state.available ? " · Model unavailable" : ""}`;
  }
  private async loadHistory(revision: number): Promise<void> {
    this.historyLoading = true;
    this.historyRevision = revision;
    try {
      const q = this.options.key ? `?key=${encodeURIComponent(this.options.key)}` : "";
      const r = await fetch(`/api/arena/history${q}`);
      if (r.status === 401) void loginIfLoggedOut();
      if (!r.ok) throw new Error("Could not load arena history");
      this.history = ArenaHistory.parse(await r.json());
    } catch {
      this.notice.textContent = "Could not load results. Reopen to retry.";
    } finally {
      this.historyLoading = false;
      this.refresh();
    }
  }
  refresh(): void {
    const state = this.model.arena;
    this.launch.hidden = !state?.enabled;
    if (!state?.enabled) {
      this.panel.hidden = true;
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      return;
    }
    if (!this.isOpen) return;
    if (!this.historyLoading && this.historyRevision !== state.historyRevision)
      void this.loadHistory(state.historyRevision);
    this.updateInfo();
    this.claim.hidden = !!this.me || !this.options.claim;
    const m = state.match;
    const own = m?.fighters.find((f) => f.personId === this.me);
    this.editor.disabled = this.busy || !this.me || (!!m && m.phase !== "lobby");
    this.editor.hidden = !this.me || (!!m && m.phase !== "lobby");
    this.roster.replaceChildren();
    for (const f of m?.fighters ?? []) {
      const li = el(
        "li",
        `${f.name}${f.personId === m?.hostId ? " ★" : ""} · ${f.loadout} · ${m?.phase === "lobby" ? (f.ready ? "READY" : "not ready") : `${f.hp} HP · ${f.shield} shield · ${f.knockouts} KO${f.hp === 0 ? " · OUT" : ""}${f.fallback ? " · fallback defense" : ""}`}`,
      );
      this.roster.append(li);
    }
    this.actions.replaceChildren();
    const add = (label: string, action: ArenaMutation) => {
      const b = button(label, () => void this.send(action));
      b.disabled = this.busy;
      this.actions.append(b);
    };
    if (m?.phase === "lobby") {
      if (own) {
        add(own.ready ? "Not ready" : "Ready", { kind: "ready", ready: !own.ready });
        add("Leave lobby", { kind: "leave" });
      }
      if (this.me === m.hostId) {
        add("Start match", { kind: "start" });
        add("Cancel lobby", { kind: "cancel" });
      }
    }
    if (m?.phase === "countdown" && this.me === m.hostId)
      add("Cancel countdown", { kind: "cancel" });
    if (m && ["finished", "aborted"].includes(m.phase) && this.me)
      add("Open rematch lobby", { kind: "rematch" });
    this.feed.replaceChildren();
    for (const e of m?.events ?? []) {
      const name = (id: string | undefined) =>
        m?.fighters.find((f) => f.personId === id)?.name ?? "Arena";
      this.feed.append(
        el(
          "li",
          `T${e.turn}: ${e.kind === "attack" ? `${name(e.actor)} hit ${name(e.target)} (${e.amount})` : e.kind === "elimination" ? `${name(e.target)} knocked out${e.actor ? ` by ${name(e.actor)}` : " by pressure"}` : e.kind === "pickup" ? `${name(e.actor)} collected a pickup` : `${name(e.target)} took ${e.amount} pressure damage`}`,
        ),
      );
    }
    this.results.replaceChildren();
    for (const match of [m, ...this.history.recent.filter((match) => match.id !== m?.id)].filter(
      (m): m is ArenaMatch => !!m && ["finished", "aborted"].includes(m.phase),
    )) {
      const section = el("details");
      section.open = match.id === m?.id;
      section.append(
        el(
          "summary",
          `${match.id === m?.id ? "Results" : "Previous match"} · ${match.phase === "aborted" ? (match.reason ?? "aborted") : match.winners.length ? `${match.fighters.find((f) => f.personId === match.winners[0])?.name} wins` : "Draw"}`,
        ),
      );
      const ranking = el("ol");
      let prior: number | undefined,
        place = 0;
      [...match.fighters]
        .sort((a, b) => (b.eliminatedTurn ?? Infinity) - (a.eliminatedTurn ?? Infinity))
        .forEach((f, i) => {
          const turn = f.eliminatedTurn ?? Infinity;
          if (turn !== prior) place = i + 1;
          prior = turn;
          ranking.append(el("li", `#${place} ${f.name} · ${f.knockouts} knockouts`));
        });
      section.append(ranking);
      if (
        this.me &&
        match.fighters.some((f) => f.personId === this.me) &&
        !Object.hasOwn(match.revealedPrompts, this.me)
      ) {
        const reveal = button("Reveal my prompt for this match", () => {
          if (confirm("Publish your frozen tactics for this match to everyone in the office?"))
            void this.send({ kind: "reveal", matchId: match.id });
        });
        reveal.disabled = this.busy;
        section.append(reveal);
      }
      for (const [id, prompt] of Object.entries(match.revealedPrompts)) {
        section.append(
          el(
            "h4",
            `${match.fighters.find((f) => f.personId === id)?.name ?? id}’s revealed tactics`,
          ),
          el("pre", prompt),
        );
      }
      this.results.append(section);
    }
    this.board.replaceChildren();
    for (const r of this.history.leaderboard.slice(0, 50))
      this.board.append(el("li", `${r.name} · ${r.wins} / ${r.knockouts} / ${r.matches}`));
  }
  private async send(action: ArenaMutation): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.notice.textContent = "Sending…";
    this.refresh();
    try {
      const q = this.options.key ? `?key=${encodeURIComponent(this.options.key)}` : "";
      const response = await fetch(`/api/arena${q}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      if (response.status === 401) void loginIfLoggedOut();
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Arena request failed");
      this.options.ingest(ArenaState.parse(body));
      this.notice.textContent =
        action.kind === "join" ? "Tactics saved privately. Mark yourself ready." : "Done.";
    } catch (error) {
      this.notice.textContent = error instanceof Error ? error.message : "Could not reach arena";
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
}
