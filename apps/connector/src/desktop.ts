/**
 * Claude Design presence: is a Design window of the Claude desktop app open, and is it in
 * front?
 *
 * Claude Design runs on Anthropic's servers. On this machine it is only a window of the Claude
 * app that shows a web page: no transcript, no agent process, nothing on disk but the window's
 * size. So all we can report is that the window is there. The app pins its title to "Design"
 * (it blocks the page from changing it), which is how we recognize it.
 *
 * Window titles of another app need macOS System Events, i.e. the Accessibility permission
 * (System Settings -> Privacy & Security -> Accessibility) plus the "control System Events"
 * prompt. That is why this is opt-in (`design_window = true`). Only "open" and "in front"
 * ever leave this module: no titles, nothing from the page.
 *
 * The title follows the app's language; "Design" covers English and German.
 */
import { type Activity, IDLE_AFTER_MS } from "@agent-office/protocol";

export const CLAUDE_BUNDLE_ID = "com.anthropic.claudefordesktop";
export const DESIGN_WINDOW_TITLES: readonly string[] = ["Design"];

/** Ask macOS at most this often. */
export const DESIGN_QUERY_MS = 5_000;
/** After a refusal or failure, wait this long before asking again. */
export const DESIGN_RETRY_MS = 60_000;
/**
 * Give up on one `osascript` run after this long. A pending permission dialog blocks it for
 * good; System Events starting up (it quits itself when unused) blocks it for a few seconds.
 */
export const DESIGN_TIMEOUT_MS = 3_000;
/** This many timeouts in a row mean a permission dialog is waiting, not a slow start. */
export const DESIGN_TIMEOUTS_MEAN_BLOCKED = 3;
/** A failed query keeps the last good answer this long. */
const KEEP_LAST_MS = 20_000;

export type DesignWindowState =
  /** `open`: a Design window exists; `front`: it is the main window of the frontmost app */
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

/**
 * One line "front=<bool>", then one line per window: "<is main window>\t<title>".
 * "none" when the app has no process.
 */
export const DESIGN_SCRIPT = `tell application "System Events"
	set procs to (application processes whose bundle identifier is "${CLAUDE_BUNDLE_ID}")
	if (count of procs) is 0 then return "none"
	set p to item 1 of procs
	set out to "front=" & ((frontmost of p) as text)
	repeat with w in (windows of p)
		set isMain to false
		try
			set isMain to (value of attribute "AXMain" of w) as boolean
		end try
		set title to ""
		try
			set title to (name of w) as text
		end try
		set out to out & linefeed & (isMain as text) & tab & title
	end repeat
	return out
end tell`;

/** Parse DESIGN_SCRIPT's output. */
export function parseDesignWindows(
  out: string,
  titles: readonly string[] = DESIGN_WINDOW_TITLES,
): DesignWindowState {
  const lines = out.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const head = lines[0]?.trim();
  if (head === "none") return { status: "ok", open: false, front: false };
  if (!head?.startsWith("front=")) return { status: "error" };
  const appFront = head.slice("front=".length).trim() === "true";
  let open = false;
  let front = false;
  for (const line of lines.slice(1)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    if (!titles.includes(line.slice(tab + 1).trim())) continue;
    open = true;
    if (appFront && line.slice(0, tab).trim() === "true") front = true;
  }
  return { status: "ok", open, front };
}

/**
 * Does `osascript`'s error text mean a missing permission? -25211 / "assistive access" =
 * Accessibility, -1743 = Automation ("control System Events"), -1719 = what window access
 * reports on some macOS versions while Accessibility is missing.
 */
export function isPermissionError(stderr: string): boolean {
  return /-25211|-1743|-1719|assistive access|not authori[sz]ed/i.test(stderr);
}

export type RunScript = (
  script: string,
  timeoutMs: number,
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

const runOsascript: RunScript = async (script, timeoutMs) => {
  const p = Bun.spawn(["osascript", "-e", script], {
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
 * Turns window answers into a desk: `thinking` while the Design window is in front, `idle`
 * once it has been in the background for IDLE_AFTER_MS, gone when it is closed. Never
 * `waiting`: we cannot know that Claude Design waits for the person.
 */
export class DesignWatcher {
  private last: { open: boolean; front: boolean; at: number } | null = null;
  private queriedAt = Number.NEGATIVE_INFINITY;
  private retryAt = Number.NEGATIVE_INFINITY;
  private since: number | null = null;
  private lastFront = Number.NEGATIVE_INFINITY;
  private timeouts = 0;
  private state: DesignWatchStatus = "watching";

  constructor(private readonly source: DesignWindowSource) {}

  get status(): DesignWatchStatus {
    return this.state;
  }

  /** `desktopRunning`: the Claude app runs (no query otherwise). Never throws. */
  async poll(now: number, desktopRunning: boolean): Promise<DesignPresence | null> {
    if (!desktopRunning) {
      this.last = null;
      this.since = null;
      this.queriedAt = Number.NEGATIVE_INFINITY;
      return null;
    }
    if (now >= this.retryAt && now - this.queriedAt >= DESIGN_QUERY_MS) {
      this.queriedAt = now;
      let r: DesignWindowState;
      try {
        r = await this.source.query();
      } catch {
        r = { status: "error" };
      }
      this.timeouts = r.status === "timeout" ? this.timeouts + 1 : 0;
      if (r.status === "ok") {
        this.state = "watching";
        this.last = { open: r.open, front: r.front, at: now };
      } else if (r.status === "timeout" && this.timeouts < DESIGN_TIMEOUTS_MEAN_BLOCKED) {
        // probably System Events starting up: ask again at the normal pace
      } else {
        this.state = r.status === "error" ? "error" : "needs-permission";
        this.retryAt = now + DESIGN_RETRY_MS;
      }
    }
    if (this.last && now - this.last.at >= KEEP_LAST_MS) {
      this.last = null;
    }
    if (!this.last?.open) {
      this.since = null;
      this.lastFront = Number.NEGATIVE_INFINITY;
      return null;
    }
    this.since ??= now;
    if (this.last.front) this.lastFront = now;
    return {
      activity: now - this.lastFront < IDLE_AFTER_MS ? "thinking" : "idle",
      startedAt: this.since,
    };
  }
}
