/**
 * Claude Design presence: is a Claude Design canvas open in the Claude desktop app, and is the
 * app in front?
 *
 * Claude Design runs on Anthropic's servers. On this machine it is only a web page inside the
 * Claude app: no transcript, no agent process, and (when it runs in a Cowork chat) its session
 * lives in the app's VM. What macOS can see is which pages the app's windows show: a canvas is
 * a `claude.ai/code/artifact/…` page (designs, slides, docs), the Design home is
 * `claude.ai/design…`. Whether Claude is generating is not visible there (checked live: no
 * Stop button, busy flag or progress element appears), so the desk shows presence only.
 *
 * Reading another app's pages needs the Accessibility permission (System Settings -> Privacy &
 * Security -> Accessibility). That is why this is opt-in (`design_window = true`). Only "a
 * canvas is open" and "the app is in front" ever leave this module: no addresses, no titles.
 */
import { type Activity, IDLE_AFTER_MS } from "@agent-office/protocol";

export const CLAUDE_BUNDLE_ID = "com.anthropic.claudefordesktop";

/** Ask macOS this often while a Design canvas is open (so closing it shows quickly). */
export const DESIGN_QUERY_MS = 5_000;
/** Ask macOS this often while no Design canvas is open (most of the day). */
export const DESIGN_IDLE_QUERY_MS = 30_000;
/** After a refusal or failure, wait this long before asking again. */
export const DESIGN_RETRY_MS = 60_000;
/**
 * Give up on one `osascript` run after this long. A long chat makes the accessibility tree big,
 * and the first query after the app starts can be slow while it builds that tree.
 */
export const DESIGN_TIMEOUT_MS = 3_000;
/** This many timeouts in a row count as a failure (the desk is then held until the retry). */
export const DESIGN_TIMEOUTS_MEAN_BLOCKED = 3;

export type DesignWindowState =
  /** `open`: a Design canvas is open in some Claude window; `front`: and the app is in front */
  | { status: "ok"; open: boolean; front: boolean }
  /** macOS refused: Accessibility or Automation permission is missing */
  | { status: "no-permission" }
  /** no answer within DESIGN_TIMEOUT_MS */
  | { status: "timeout" }
  | { status: "error" };

export interface DesignWindowSource {
  query(): Promise<DesignWindowState>;
}

/** What `agent-office status` shows. */
export type DesignWatchStatus = "watching" | "needs-permission" | "error";

/** Page paths that mean "a Claude Design canvas is open" (artifact canvas, the Design page). */
export function isDesignPath(host: string, path: string): boolean {
  if (host !== "claude.ai" && !host.endsWith(".claude.ai")) return false;
  return path.startsWith("/code/artifact/") || path === "/design" || path.startsWith("/design/");
}

/** Walk at most this many accessibility nodes per query (a long chat has a big tree). */
export const DESIGN_MAX_NODES = 6_000;

/**
 * JavaScript for Automation (`osascript -l JavaScript`). Calls the macOS accessibility API on
 * the Claude app directly (no System Events, so no Automation prompt) and walks its windows to
 * the web pages they show. Prints "none" (app not running), "no-permission", or
 * "front=<bool>" and "canvas=<bool>" on two lines. Page addresses never leave the script.
 *
 * `AXManualAccessibility` asks the app (Electron) to expose its web content to accessibility
 * clients; without it the tree ends at the window.
 */
export const DESIGN_SCRIPT = `ObjC.import("AppKit");
ObjC.import("ApplicationServices");
(() => {
  const apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("${CLAUDE_BUNDLE_ID}");
  if (apps.count === 0) return "none";
  if (!$.AXIsProcessTrusted()) return "no-permission";
  const app = apps.objectAtIndex(0);
  const root = $.AXUIElementCreateApplication(app.processIdentifier);
  $.AXUIElementSetAttributeValue(root, $("AXManualAccessibility"), $.kCFBooleanTrue);
  const attr = (e, n) => {
    const r = Ref();
    return $.AXUIElementCopyAttributeValue(e, $(n), r) === 0 ? r[0] : undefined;
  };
  const isDesign = ${isDesignPath.toString()};
  let nodes = 0;
  let canvas = false;
  const walk = (e, d) => {
    if (canvas || d > 45 || ++nodes > ${DESIGN_MAX_NODES}) return;
    const role = attr(e, "AXRole");
    if (role && ObjC.castRefToObject(role).js === "AXWebArea") {
      const u = attr(e, "AXURL");
      const url = u ? ObjC.castRefToObject(u) : undefined;
      if (url && isDesign(String(url.host.js || ""), String(url.path.js || ""))) {
        canvas = true;
        return;
      }
    }
    const kids = attr(e, "AXChildren");
    if (!kids) return;
    const list = ObjC.castRefToObject(kids);
    for (let i = 0; i < list.count; i++) walk(list.objectAtIndex(i), d + 1);
  };
  const wins = attr(root, "AXWindows");
  if (wins) {
    const list = ObjC.castRefToObject(wins);
    for (let i = 0; i < list.count; i++) walk(list.objectAtIndex(i), 0);
  }
  return "front=" + (app.active === true) + "\\ncanvas=" + canvas;
})();`;

/** Parse DESIGN_SCRIPT's output. `open` = a Design canvas is open in some Claude window. */
export function parseDesignWindows(out: string): DesignWindowState {
  const lines = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines[0] === "none") return { status: "ok", open: false, front: false };
  if (lines[0] === "no-permission") return { status: "no-permission" };
  const value = (key: string) => lines.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
  const front = value("front");
  const canvas = value("canvas");
  if (front === undefined || canvas === undefined) return { status: "error" };
  const open = canvas === "true";
  return { status: "ok", open, front: open && front === "true" };
}

/**
 * Does `osascript`'s error text mean a missing permission? The script checks the permission
 * itself ("no-permission"); this catches the errors macOS raises anyway: -25211 / "assistive
 * access" = Accessibility, -1719 = what element access reports on some macOS versions.
 */
export function isPermissionError(stderr: string): boolean {
  return /-25211|-1743|-1719|assistive access|not authori[sz]ed/i.test(stderr);
}

export type RunScript = (
  script: string,
  timeoutMs: number,
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

const runOsascript: RunScript = async (script, timeoutMs) => {
  const p = Bun.spawn(["osascript", "-l", "JavaScript", "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    p.kill();
  }, timeoutMs);
  try {
    const [stdout, stderr] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
    ]);
    const code = await p.exited;
    return { code: timedOut ? null : code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
};

/** The real thing (macOS). */
export function systemDesignWindows(run: RunScript = runOsascript): DesignWindowSource {
  return {
    async query() {
      try {
        const r = await run(DESIGN_SCRIPT, DESIGN_TIMEOUT_MS);
        if (r.code === null) return { status: "timeout" };
        if (r.code !== 0) {
          return { status: isPermissionError(r.stderr) ? "no-permission" : "error" };
        }
        return parseDesignWindows(r.stdout);
      } catch {
        return { status: "error" };
      }
    },
  };
}

/** A fixed or scripted answer, for tests. */
export function fakeDesignWindows(
  answer: DesignWindowState | (() => DesignWindowState),
): DesignWindowSource {
  return { query: async () => (typeof answer === "function" ? answer() : answer) };
}

export type DesignPresence = { activity: Activity; startedAt: number };

/**
 * Turns answers into a desk: `thinking` while a Design canvas is open and the app in front, `idle`
 * once it has been in the background for IDLE_AFTER_MS, gone when it is closed. Never
 * `waiting`: we cannot know that Claude Design waits for the person.
 */
export class DesignWatcher {
  private last: { open: boolean; front: boolean } | null = null;
  /** the last query failed: `last` is held until the next query (one hiccup keeps the desk) */
  private stale = false;
  private nextAt = Number.NEGATIVE_INFINITY;
  private since: number | null = null;
  private lastFront = Number.NEGATIVE_INFINITY;
  private timeouts = 0;
  private state: DesignWatchStatus = "watching";

  constructor(private readonly source: DesignWindowSource) {}

  get status(): DesignWatchStatus {
    return this.state;
  }

  /**
   * `desktopRunning`: the Claude app runs (no query otherwise). Never throws.
   *
   * Cadence: the first query right away, then every DESIGN_IDLE_QUERY_MS while no Design
   * window is open and every DESIGN_QUERY_MS while one is. After a failure the next query
   * waits DESIGN_RETRY_MS; the last good answer is held until then, so one failed
   * query keeps the same session (same startedAt), and is dropped only if the retry fails
   * too. A held answer does not count as "in front".
   */
  async poll(now: number, desktopRunning: boolean): Promise<DesignPresence | null> {
    if (!desktopRunning) {
      this.last = null;
      this.stale = false;
      this.since = null;
      this.timeouts = 0;
      this.nextAt = Number.NEGATIVE_INFINITY;
      return null;
    }
    if (now >= this.nextAt) {
      let r: DesignWindowState;
      try {
        r = await this.source.query();
      } catch {
        r = { status: "error" };
      }
      this.timeouts = r.status === "timeout" ? this.timeouts + 1 : 0;
      if (r.status === "ok") {
        this.state = "watching";
        this.last = { open: r.open, front: r.front };
        this.stale = false;
        this.nextAt = now + (r.open ? DESIGN_QUERY_MS : DESIGN_IDLE_QUERY_MS);
      } else if (r.status === "timeout" && this.timeouts < DESIGN_TIMEOUTS_MEAN_BLOCKED) {
        // probably a slow first answer: ask again soon, keep what we had
        this.nextAt = now + DESIGN_QUERY_MS;
      } else {
        this.state = r.status === "error" ? "error" : "needs-permission";
        this.nextAt = now + DESIGN_RETRY_MS;
        if (this.stale) this.last = null;
        else this.stale = true;
      }
    }
    if (!this.last?.open) {
      this.since = null;
      this.lastFront = Number.NEGATIVE_INFINITY;
      return null;
    }
    this.since ??= now;
    if (this.last.front && !this.stale) this.lastFront = now;
    return {
      activity: now - this.lastFront < IDLE_AFTER_MS ? "thinking" : "idle",
      startedAt: this.since,
    };
  }
}
