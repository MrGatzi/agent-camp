/**
 * Map the latest transcript entry to one activity verb.
 *
 * Each detector normalizes its agent's raw JSONL entries into `TurnEvent`s (or null to skip
 * them); `deriveActivity` then looks at the last relevant event plus the file mtime.
 * Mapping (PLAN "Deriving activity"):
 *   typing   edit/write tools
 *   reading  read/grep/glob/search tools
 *   running  bash/shell tools
 *   thinking assistant turn with no tool yet, a tool result waiting for the model, unknown tools
 *   waiting  turn finished (end_turn / task_complete / interrupted), or a question to the human
 *            is open (AskUserQuestion, plan approval, Codex request_user_input,
 *            purrness_ask_question)
 *   idle     no transcript writes for IDLE_AFTER_MS while the process is alive, unless an
 *            `ActivityHold` says the session is still working (see BUSY_HOLD_MS)
 */
import { type Activity, IDLE_AFTER_MS } from "@agent-office/protocol";

export type TurnEvent =
  /** the model called a tool (and we have not seen its result yet) */
  | { kind: "tool"; name: string }
  /** a tool result came back; the model is working on the next step */
  | { kind: "toolResult" }
  /** the human sent a prompt */
  | { kind: "user" }
  /** assistant text / reasoning; `final` when the turn is known to be complete */
  | { kind: "assistant"; final: boolean }
  /** the turn ended (task complete, aborted, interrupted) */
  | { kind: "turnEnd" };

/**
 * Assistant text without a tool and without an explicit end marker, followed by this much
 * silence, is treated as a finished turn (some agent versions never write stop reasons).
 */
export const TEXT_SETTLE_MS = 30_000;

const TYPING = new Set([
  "edit",
  "write",
  "multiedit",
  "notebookedit",
  "apply_patch",
  "edit_file",
  "write_file",
  "create_file",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  // Cowork's tool that creates and edits designs in Claude Design
  "claudedesign",
]);
const READING = new Set([
  "read",
  "grep",
  "glob",
  "ls",
  "webfetch",
  "websearch",
  "find",
  "read_file",
  "list_dir",
  "list_directory",
  "search",
  "view_image",
  "notebookread",
  "web_search",
]);
const RUNNING = new Set([
  "bash",
  "shell",
  "exec",
  "exec_command",
  "shell_command",
  "local_shell",
  "local_shell_call",
  "bashoutput",
  "killshell",
  "write_stdin",
]);

/**
 * Tools that hand the turn to the human and wait for the answer (MCP prefixes allowed). While
 * one is pending the agent is not working, so it must neither look like "thinking" nor keep a
 * session off idle.
 */
const ASKING =
  /(^|_)(ask_?user_?question|purrness_ask_question|request_?user_?input|exit_?plan_?mode)$/;

/** Tool name -> activity. Case-insensitive; unknown tools (incl. MCP tools) -> thinking. */
export function toolActivity(name: string): Activity {
  const n = name.trim().toLowerCase();
  if (ASKING.test(n)) return "waiting";
  if (TYPING.has(n)) return "typing";
  if (READING.has(n)) return "reading";
  if (RUNNING.has(n)) return "running";
  return "thinking";
}

/**
 * How long a session that is evidently still working may stay off "idle" while neither its
 * transcript nor any of its subagent transcripts is written.
 *
 * A quiet transcript alone is a poor idle signal: a foreground Bash call (up to its 10 min
 * timeout), a long build or test run, or a turn waiting on background subagents writes nothing
 * to the main transcript for minutes. So a busy status or a pending tool call holds the session
 * at its desk. But a status can go stale (Claude stays "busy" while a forgotten background dev
 * server or script it started keeps running) and a tool can hang, so the hold ends after 30 min
 * of total silence: three times the longest single Bash call and far longer than any real step
 * we observed, yet short enough that a stuck session still reaches the bar within the half hour.
 */
export const BUSY_HOLD_MS = 30 * 60_000;

/** Evidence, beyond transcript age, that a quiet session is still doing something. */
export type ActivityHold = {
  /**
   * The agent's own status for a live process: true = it says "busy", false = it reports some
   * other status, undefined = it reports none (older Claude Code, Codex, Pi).
   */
  busy?: boolean;
  /** Newest write to the transcript or its subagent transcripts. Lazy: may walk directories. */
  lastWriteMs(): number;
};

/**
 * Derive the activity from the normalized events of a transcript (oldest first).
 * `mtimeMs` is the transcript's last write; `now` the current time. With a `hold`, a session
 * that says it is busy (or, reporting no status at all, has a pending tool call) is not idle
 * however old its last write, until BUSY_HOLD_MS of silence.
 */
export function deriveActivity(
  events: readonly (TurnEvent | null)[],
  mtimeMs: number,
  now: number,
  hold?: ActivityHold,
): Activity {
  let last: TurnEvent | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e) {
      last = e;
      break;
    }
  }
  if (hold && isHeld(last, hold) && withinHold(mtimeMs, now, hold)) {
    // still working: the last event says on what; its age does not matter
    return last?.kind === "tool" ? toolActivity(last.name) : "thinking";
  }
  const age = now - mtimeMs;
  if (age >= IDLE_AFTER_MS) return "idle";
  if (!last) return "waiting";
  switch (last.kind) {
    case "tool":
      return toolActivity(last.name);
    case "toolResult":
    case "user":
      return "thinking";
    case "assistant":
      return last.final || age >= TEXT_SETTLE_MS ? "waiting" : "thinking";
    case "turnEnd":
      return "waiting";
  }
}

/** Does the hold apply to a session whose last event is `last`? */
function isHeld(last: TurnEvent | null, hold: ActivityHold): boolean {
  // an open question waits on the human, just like a finished turn: never held
  if (last?.kind === "tool" && toolActivity(last.name) === "waiting") return false;
  if (hold.busy === true) return true;
  // a reported non-busy status outranks a pending tool (it may sit at a permission prompt)
  return hold.busy === undefined && last?.kind === "tool";
}

function withinHold(mtimeMs: number, now: number, hold: ActivityHold): boolean {
  // only walk the subagent folders once the main transcript alone is too old
  if (now - mtimeMs < BUSY_HOLD_MS) return true;
  return now - Math.max(mtimeMs, hold.lastWriteMs()) < BUSY_HOLD_MS;
}

// ---- small helpers for normalizers -----------------------------------------------------------
export const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
