/** Claude desktop app: Cowork sessions (transcripts) and the Claude Design window (presence). */
import { afterEach, describe, expect, test } from "bun:test";
import { IDLE_AFTER_MS, type SessionInfo } from "@agent-office/protocol";
import {
  DESIGN_IDLE_QUERY_MS,
  DESIGN_QUERY_MS,
  DESIGN_RETRY_MS,
  DESIGN_TIMEOUTS_MEAN_BLOCKED,
  DesignWatcher,
  type DesignWindowState,
  fakeDesignWindows,
  isPermissionError,
  parseDesignWindows,
  systemDesignWindows,
} from "../src/desktop.ts";
import { toolActivity } from "../src/detect/activity.ts";
import { COWORK_LIVE_MS, findCoworkTranscripts, RESCAN_MS } from "../src/detect/cowork.ts";
import { DESIGN_RAW_ID, Detector, sessionKeyFor } from "../src/detect/index.ts";
import { agentDirs } from "../src/paths.ts";
import { claudeDesktopInPs, fakeProcesses, isClaudeDesktopArgs, parsePs } from "../src/proc.ts";
import { addCowork, COWORK_ID, type FakeHome, makeHome, P } from "./helpers.ts";

let h: FakeHome;
afterEach(() => h?.cleanup());

const T0 = Date.now();

/** A home with only what the test adds: the stock fixtures are aged out. */
function quietHome(): FakeHome {
  const home = makeHome(T0);
  for (const rel of Object.values(P)) home.age(rel, 24 * 3_600_000, T0);
  return home;
}

function detector(opts: {
  desktop?: boolean;
  now?: () => number;
  design?: DesignWatcher;
  share?: boolean;
  cowork?: boolean;
}) {
  return new Detector({
    dirs: agentDirs({}, h.home),
    clientId: "c_test",
    shareProjectNames: opts.share ?? true,
    processes: fakeProcesses([], {}, opts.desktop ?? true),
    now: opts.now ?? (() => T0),
    cowork: opts.cowork ?? true,
    ...(opts.design ? { design: opts.design } : {}),
  });
}

describe("Claude desktop app process", () => {
  test("the main process counts, its helpers and look-alikes do not", () => {
    expect(isClaudeDesktopArgs("/Applications/Claude.app/Contents/MacOS/Claude")).toBe(true);
    expect(isClaudeDesktopArgs("/Users/a/Applications/Claude.app/Contents/MacOS/Claude --x")).toBe(
      true,
    );
    expect(
      isClaudeDesktopArgs(
        "/Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer) --type=renderer",
      ),
    ).toBe(false);
    expect(isClaudeDesktopArgs("/Users/a/.local/bin/claude --resume")).toBe(false);
    expect(isClaudeDesktopArgs("/Applications/NotClaude.app/Contents/MacOS/Claude")).toBe(false);
  });

  test("found in ps output without becoming an agent process", () => {
    const ps = [
      "  501     1 /Applications/Claude.app/Contents/MacOS/Claude",
      "  502   501 /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=gpu-process",
      "  900   800 /Users/a/.local/bin/claude",
    ].join("\n");
    expect(claudeDesktopInPs(ps)).toBe(true);
    expect(claudeDesktopInPs("  900   800 /Users/a/.local/bin/claude\n")).toBe(false);
    expect(parsePs(ps).map((p) => p.pid)).toEqual([900]);
  });
});

describe("Cowork sessions", () => {
  test("a fresh transcript is a claude session named Cowork while the app runs", async () => {
    h = quietHome();
    addCowork(h, { lastTool: "Read" });
    const sessions = await detector({}).poll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      agent: "claude",
      project: "Cowork",
      activity: "reading",
      subagents: 0,
      startedAt: Date.parse("2026-11-10T10:00:00.000Z"),
      context: 0.1,
    });
    expect(sessions[0]!.sessionKey).toBe(sessionKeyFor("c_test", "claude", COWORK_ID));
  });

  test("driving Claude Design shows as typing", async () => {
    expect(toolActivity("ClaudeDesign")).toBe("typing");
    h = quietHome();
    addCowork(h, { lastTool: "ClaudeDesign" });
    expect((await detector({}).poll())[0]).toMatchObject({ activity: "typing" });
  });

  test("Cowork is opt-in: off (the default), a fresh session is not shown", async () => {
    h = quietHome();
    addCowork(h);
    expect(await detector({ cowork: false }).poll()).toEqual([]);
    const d = new Detector({
      dirs: agentDirs({}, h.home),
      clientId: "c_test",
      shareProjectNames: true,
      processes: fakeProcesses([], {}, true),
      now: () => T0,
    });
    expect(await d.poll()).toEqual([]);
  });

  test("the app is not running: no Cowork session, even when fresh", async () => {
    h = quietHome();
    addCowork(h);
    expect(await detector({ desktop: false }).poll()).toEqual([]);
  });

  test("a quiet session keeps its desk (waiting, then idle) until COWORK_LIVE_MS", async () => {
    h = quietHome();
    addCowork(h, { agoMs: 60_000 });
    expect((await detector({}).poll())[0]).toMatchObject({ activity: "waiting" });
    h.cleanup();

    h = quietHome();
    addCowork(h, { agoMs: IDLE_AFTER_MS + 60_000 });
    expect((await detector({}).poll())[0]).toMatchObject({ activity: "idle" });
    h.cleanup();

    h = quietHome();
    addCowork(h, { agoMs: COWORK_LIVE_MS + 1_000 });
    expect(await detector({}).poll()).toEqual([]);
  });

  test("a session that goes quiet while we watch leaves after COWORK_LIVE_MS", async () => {
    h = quietHome();
    addCowork(h);
    let now = T0;
    const d = detector({ now: () => now });
    expect(await d.poll()).toHaveLength(1);
    now = T0 + COWORK_LIVE_MS + 10_000;
    expect(await d.poll()).toEqual([]);
  });

  test("a new session is picked up at the next folder walk", async () => {
    h = quietHome();
    let now = T0;
    const d = detector({ now: () => now });
    expect(await d.poll()).toEqual([]);
    addCowork(h);
    expect(await d.poll()).toEqual([]); // folders were walked a moment ago
    now = T0 + RESCAN_MS;
    h.age(addCowork(h), 1_000, now);
    expect(await d.poll()).toHaveLength(1);
  });

  test("the VM's pid file never ties the session to a process on this machine", async () => {
    h = quietHome();
    addCowork(h); // writes sessions/777.json
    const d = new Detector({
      dirs: agentDirs({}, h.home),
      clientId: "c_test",
      shareProjectNames: true,
      // an unrelated claude process, hosted inside a Pi, happens to have pid 777: a session
      // tied to it by a pid file would be folded into the Pi's desk and hidden
      processes: fakeProcesses(
        [
          { pid: 700, agent: "pi" },
          { pid: 777, agent: "claude", hostPid: 700, backend: true },
        ],
        {},
        true,
      ),
      now: () => T0,
      cowork: true,
    });
    expect(await d.poll()).toMatchObject([{ agent: "claude", project: "Cowork" }]);
  });

  test("sessions under agent/ are found; project names can be hidden", async () => {
    h = quietHome();
    const rel = addCowork(h, { session: "local_ditto_org-1", agent: true });
    expect(rel).toContain("/agent/local_ditto_org-1/");
    expect(findCoworkTranscripts(agentDirs({}, h.home).claudeDesktop, T0)).toHaveLength(1);
    const sessions = await detector({ share: false }).poll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.project).toBeUndefined();
  });

  test("a missing or odd folder is no problem", () => {
    h = quietHome();
    expect(findCoworkTranscripts(agentDirs({}, h.home).claudeDesktop, T0)).toEqual([]);
    expect(findCoworkTranscripts("/nonexistent/claude", T0)).toEqual([]);
  });
});

describe("Claude Design window: reading macOS's answer", () => {
  test("a window titled Design counts; front needs the app and the window in front", () => {
    expect(parseDesignWindows("none\n")).toEqual({ status: "ok", open: false, front: false });
    expect(parseDesignWindows("front=true\ntrue\tClaude\n")).toEqual({
      status: "ok",
      open: false,
      front: false,
    });
    expect(parseDesignWindows("front=true\nfalse\tClaude\ntrue\tDesign\n")).toEqual({
      status: "ok",
      open: true,
      front: true,
    });
    // the main window of the app, but another app is in front
    expect(parseDesignWindows("front=false\ntrue\tDesign\n")).toEqual({
      status: "ok",
      open: true,
      front: false,
    });
    // open behind the chat window
    expect(parseDesignWindows("front=true\ntrue\tClaude\nfalse\tDesign\n")).toEqual({
      status: "ok",
      open: true,
      front: false,
    });
    expect(parseDesignWindows("front=true\nfalse\tDesign system notes\n").status).toBe("ok");
    expect(parseDesignWindows("front=true\nfalse\tDesign system notes\n")).toMatchObject({
      open: false,
    });
    expect(parseDesignWindows("front=true\r\ntrue\tDesign\r\n")).toMatchObject({ open: true });
    expect(parseDesignWindows("")).toEqual({ status: "error" });
    expect(parseDesignWindows("something else")).toEqual({ status: "error" });
  });

  test("permission errors are told apart from other failures", async () => {
    expect(
      isPermissionError(
        "execution error: System Events got an error: osascript is not allowed assistive access. (-25211)",
      ),
    ).toBe(true);
    expect(
      isPermissionError(
        "execution error: Not authorized to send Apple events to System Events. (-1743)",
      ),
    ).toBe(true);
    expect(isPermissionError("syntax error: Expected end of line (-2741)")).toBe(false);

    const q = (code: number | null, stdout = "", stderr = "") =>
      systemDesignWindows(async () => ({ code, stdout, stderr })).query();
    expect(await q(0, "front=true\ntrue\tDesign\n")).toEqual({
      status: "ok",
      open: true,
      front: true,
    });
    expect(await q(1, "", "… is not allowed assistive access. (-25211)")).toEqual({
      status: "no-permission",
    });
    expect(await q(1, "", "syntax error (-2741)")).toEqual({ status: "error" });
    expect(await q(null)).toEqual({ status: "timeout" }); // killed by the timeout
    const broken = systemDesignWindows(async () => {
      throw new Error("spawn failed");
    });
    expect(await broken.query()).toEqual({ status: "error" });
  });
});

describe("Claude Design window: the desk", () => {
  /** A watcher whose answer and query count the test controls. */
  function scripted(first: DesignWindowState) {
    const s = { answer: first, queries: 0 };
    const watcher = new DesignWatcher(
      fakeDesignWindows(() => {
        s.queries++;
        return s.answer;
      }),
    );
    return { s, watcher };
  }
  const OPEN_FRONT: DesignWindowState = { status: "ok", open: true, front: true };
  const OPEN_BACK: DesignWindowState = { status: "ok", open: true, front: false };
  const CLOSED: DesignWindowState = { status: "ok", open: false, front: false };

  test("in front: thinking; in the background for IDLE_AFTER_MS: idle; closed: gone", async () => {
    const { s, watcher } = scripted(OPEN_FRONT);
    expect(await watcher.poll(T0, true)).toEqual({ activity: "thinking", startedAt: T0 });
    s.answer = OPEN_BACK;
    let now = T0 + DESIGN_QUERY_MS;
    expect(await watcher.poll(now, true)).toEqual({ activity: "thinking", startedAt: T0 });
    now = T0 + IDLE_AFTER_MS + DESIGN_QUERY_MS;
    expect(await watcher.poll(now, true)).toEqual({ activity: "idle", startedAt: T0 });
    s.answer = OPEN_FRONT;
    now += DESIGN_QUERY_MS;
    expect(await watcher.poll(now, true)).toEqual({ activity: "thinking", startedAt: T0 });
    s.answer = CLOSED;
    now += DESIGN_QUERY_MS;
    expect(await watcher.poll(now, true)).toBeNull();
    // reopened: noticed at the next slow query, as a new session start
    s.answer = OPEN_FRONT;
    expect(await watcher.poll(now + DESIGN_QUERY_MS, true)).toBeNull();
    now += DESIGN_IDLE_QUERY_MS;
    expect(await watcher.poll(now, true)).toEqual({ activity: "thinking", startedAt: now });
    expect(watcher.status).toBe("watching");
  });

  test("a window first seen in the background starts idle, never waiting", async () => {
    const { watcher } = scripted(OPEN_BACK);
    expect(await watcher.poll(T0, true)).toEqual({ activity: "idle", startedAt: T0 });
  });

  test("macOS is asked at most every DESIGN_QUERY_MS, and not at all without the app", async () => {
    const { s, watcher } = scripted(OPEN_FRONT);
    expect(await watcher.poll(T0, false)).toBeNull();
    expect(s.queries).toBe(0);
    await watcher.poll(T0, true);
    await watcher.poll(T0 + 2_000, true);
    await watcher.poll(T0 + 4_000, true);
    expect(s.queries).toBe(1);
    await watcher.poll(T0 + DESIGN_QUERY_MS, true);
    expect(s.queries).toBe(2);
    // the app quit: the desk goes at once
    expect(await watcher.poll(T0 + DESIGN_QUERY_MS + 2_000, false)).toBeNull();
    expect(s.queries).toBe(2);
  });

  test("no permission: no desk, said so, and asked again only after DESIGN_RETRY_MS", async () => {
    const { s, watcher } = scripted({ status: "no-permission" });
    expect(await watcher.poll(T0, true)).toBeNull();
    expect(watcher.status).toBe("needs-permission");
    await watcher.poll(T0 + DESIGN_QUERY_MS, true);
    await watcher.poll(T0 + DESIGN_RETRY_MS - 1, true);
    expect(s.queries).toBe(1);
    s.answer = OPEN_FRONT; // permission granted meanwhile
    expect(await watcher.poll(T0 + DESIGN_RETRY_MS, true)).toMatchObject({ activity: "thinking" });
    expect(watcher.status).toBe("watching");
  });

  test("a slow answer is retried at once; only repeated timeouts mean a blocked dialog", async () => {
    const { s, watcher } = scripted({ status: "timeout" });
    expect(await watcher.poll(T0, true)).toBeNull();
    expect(watcher.status).toBe("watching");
    s.answer = OPEN_FRONT; // System Events has started
    expect(await watcher.poll(T0 + DESIGN_QUERY_MS, true)).toMatchObject({ activity: "thinking" });
    expect(s.queries).toBe(2);

    const blocked = scripted({ status: "timeout" });
    for (let i = 0; i < DESIGN_TIMEOUTS_MEAN_BLOCKED; i++) {
      await blocked.watcher.poll(T0 + i * DESIGN_QUERY_MS, true);
    }
    expect(blocked.watcher.status).toBe("needs-permission");
    await blocked.watcher.poll(T0 + DESIGN_TIMEOUTS_MEAN_BLOCKED * DESIGN_QUERY_MS, true);
    expect(blocked.s.queries).toBe(DESIGN_TIMEOUTS_MEAN_BLOCKED); // now waits DESIGN_RETRY_MS
  });

  test("one failed query keeps the same session until the retry; two in a row remove it", async () => {
    const { s, watcher } = scripted(OPEN_FRONT);
    await watcher.poll(T0, true);
    s.answer = { status: "error" };
    let now = T0 + DESIGN_QUERY_MS;
    expect(await watcher.poll(now, true)).toEqual({ activity: "thinking", startedAt: T0 });
    expect(watcher.status).toBe("error");
    // held for the whole retry wait, same startedAt (no new session row)
    expect(await watcher.poll(now + DESIGN_RETRY_MS - 1, true)).toEqual({
      activity: "thinking",
      startedAt: T0,
    });
    expect(s.queries).toBe(2);
    // the retry works: it simply goes on
    s.answer = OPEN_FRONT;
    now += DESIGN_RETRY_MS;
    expect(await watcher.poll(now, true)).toEqual({ activity: "thinking", startedAt: T0 });
    expect(watcher.status).toBe("watching");
    // two failures in a row: gone
    s.answer = { status: "error" };
    now += DESIGN_QUERY_MS;
    expect(await watcher.poll(now, true)).not.toBeNull();
    now += DESIGN_RETRY_MS;
    expect(await watcher.poll(now, true)).toBeNull();
    expect(s.queries).toBe(5);
  });

  test("slow polling while no Design window is open, fast once one is", async () => {
    const { s, watcher } = scripted(CLOSED);
    await watcher.poll(T0, true); // first query right away
    for (let t = 2_000; t < DESIGN_IDLE_QUERY_MS; t += 2_000) await watcher.poll(T0 + t, true);
    expect(s.queries).toBe(1);
    s.answer = OPEN_FRONT;
    let now = T0 + DESIGN_IDLE_QUERY_MS;
    expect(await watcher.poll(now, true)).toMatchObject({ activity: "thinking" });
    expect(s.queries).toBe(2);
    await watcher.poll(now + DESIGN_QUERY_MS - 1, true);
    expect(s.queries).toBe(2);
    now += DESIGN_QUERY_MS;
    s.answer = CLOSED;
    expect(await watcher.poll(now, true)).toBeNull(); // closing shows within 5 s
    expect(s.queries).toBe(3);
    // the app restarted: ask right away again
    await watcher.poll(now + 1_000, false);
    await watcher.poll(now + 2_000, true);
    expect(s.queries).toBe(4);
  });

  test("the detector adds one design session with nothing but presence", async () => {
    h = quietHome();
    const { watcher } = scripted(OPEN_FRONT);
    const d = detector({ design: watcher });
    const sessions: SessionInfo[] = await d.poll();
    expect(sessions).toEqual([
      {
        sessionKey: sessionKeyFor("c_test", "design", DESIGN_RAW_ID),
        agent: "design",
        activity: "thinking",
        subagents: 0,
        startedAt: T0,
      },
    ]);
    expect(d.designStatus).toBe("watching");
    // not watching (the default): no design session and no status
    const off = detector({});
    expect(await off.poll()).toEqual([]);
    expect(off.designStatus).toBeUndefined();
  });

  test("no design session while the Claude app is closed", async () => {
    h = quietHome();
    const { s, watcher } = scripted(OPEN_FRONT);
    expect(await detector({ design: watcher, desktop: false }).poll()).toEqual([]);
    expect(s.queries).toBe(0);
  });
});
