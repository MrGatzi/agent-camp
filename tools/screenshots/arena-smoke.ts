/** Real multi-browser arena e2e, fake inference only. Build web first. No external calls. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ARENA_RULES, type ArenaState, envelope } from "@agent-office/protocol";
import type { ServerWebSocket } from "bun";
import type { Browser, Page } from "playwright";
import { OfficeApp } from "../../apps/server/src/core/app.ts";
import {
  ME_COOKIE,
  makeMeToken,
  makeSessionToken,
  SESSION_COOKIE,
} from "../../apps/server/src/core/auth.ts";
import { MemoryStore } from "../../apps/server/src/core/store.ts";

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const root = resolve(import.meta.dir, "../..");
const out = process.env.ARENA_SHOTS ?? "/tmp/agent-office-arena-shots";
mkdirSync(out, { recursive: true });
let now = Date.now();
const viewers = new Set<ServerWebSocket<unknown>>();
const jobs: Promise<unknown>[] = [];
const providerInputs: string[] = [];
let calls = 0;
const app = new OfficeApp(
  {
    CONNECTOR_PASSWORD: "arena-test",
    ARENA_ENABLED: "1",
    ARENA_PROVIDER: "jev",
    ARENA_MODEL: "fake-only",
    AI_GATEWAY_API_KEY: "fake-not-a-real-key",
  },
  new MemoryStore(),
  {
    broadcast: (raw) => {
      for (const ws of viewers) ws.send(raw);
    },
    scheduleAlarm: () => {},
    waitUntil: (p) => {
      jobs.push(p);
    },
  },
  {
    now: () => now,
    log: () => {},
    fetch: async (url, init) => {
      assert.equal(
        url,
        "https://ai-gateway.vercel.sh/v1/chat/completions",
        "No unexpected provider/network access",
      );
      calls++;
      const body = JSON.parse(String(init.body));
      const input = JSON.parse(body.messages[1].content);
      providerInputs.push(body.messages[1].content);
      assert.equal(input.tactics, `TACTICS_PRIVATE_${input.self}`);
      assert(
        !body.messages[1].content.includes(
          "TACTICS_PRIVATE_" +
            input.fighters.find((f: { personId: string }) => f.personId !== input.self).personId,
        ),
      );
      // Defensive tactics guarantee bounded deterministic completion under arena pressure.
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ kind: "defend", x: null, y: null, targetId: null }),
            },
          },
        ],
      });
    },
  },
);
for (let i = 0; i < 8; i++) {
  const name = `Fighter ${i}`;
  app.connectorMessage(
    name,
    envelope("connector.hello", {
      name,
      password: "arena-test",
      clientId: name,
      connectorVersion: "99.0.0",
    }),
  );
  app.connectorMessage(
    name,
    envelope("presence.snapshot", {
      sessions: [
        {
          sessionKey: `arena-session-${i}`,
          agent: "pi",
          activity: "idle",
          subagents: 0,
          startedAt: now,
        },
      ],
    }),
  );
}
const server = Bun.serve<unknown>({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws/viewer") {
      if (srv.upgrade(req, { data: {} })) return;
      return new Response("upgrade", { status: 426 });
    }
    if (url.pathname === "/__test/tick") {
      const deadline = app.arena.deadline();
      if (deadline !== null) {
        now = Math.max(now, deadline);
        for (let i = 0; i < 8; i++)
          app.connectorMessage(
            `Fighter ${i}`,
            envelope("presence.snapshot", {
              sessions: [
                {
                  sessionKey: `arena-session-${i}`,
                  agent: "pi",
                  activity: "idle",
                  subagents: 0,
                  startedAt: now,
                },
              ],
            }),
          );
        app.alarm();
        await Promise.all(jobs.splice(0));
      }
      return Response.json(app.arena.state());
    }
    if (req.method === "POST") now += 1100; // virtual-time rate limit advance, isolated to this test host
    const api = await app.handleHttp(req);
    if (api) return api;
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = resolve(root, "apps/web/dist", `.${path}`);
    if (!file.startsWith(`${resolve(root, "apps/web/dist")}/`))
      return new Response("not found", { status: 404 });
    return new Response(Bun.file(file));
  },
  websocket: {
    open(ws) {
      viewers.add(ws);
      ws.send(app.viewerSnapshot());
    },
    message(ws, msg) {
      if (msg === "ping") ws.send("pong");
    },
    close(ws) {
      viewers.delete(ws);
    },
  },
});
const base = `http://127.0.0.1:${server.port}`;
let browser: Browser | undefined;
const errors: string[] = [];
const frames: string[] = [];
const pages: Page[] = [];
let hostHistoryRequests = 0;
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const session = await makeSessionToken("arena-test", now);
  for (let i = 0; i < 9; i++) {
    const context = await browser.newContext({
      viewport: i === 8 ? { width: 1440, height: 900 } : { width: 680, height: 720 },
      serviceWorkers: "block",
      reducedMotion: i === 0 ? "reduce" : "no-preference",
    });
    await context.addCookies([
      { name: SESSION_COOKIE, value: session, url: base },
      ...(i < 8
        ? [
            {
              name: ME_COOKIE,
              value: await makeMeToken("arena-test", `fighter-${i}`, now),
              url: base,
            },
          ]
        : []),
    ]);
    const page = await context.newPage();
    pages.push(page);
    if (i === 0)
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/arena/history") hostHistoryRequests++;
      });
    page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
    if (i === 8)
      page.on("websocket", (ws) =>
        ws.on("framereceived", ({ payload }) => frames.push(String(payload))),
      );
    await page.goto(`${base}/?zoom=fit`);
    await page.waitForFunction(
      () => window.__office?.ready && window.__office.model.people.size === 8,
    );
    await page.getByRole("button", { name: "⚔ Prompt Arena", exact: true }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector<HTMLFieldSetElement>(".arena-panel fieldset")!.disabled ||
        document.querySelector(".arena-info")?.textContent?.includes("Spectator"),
    );
    if (i < 8) {
      await page.waitForFunction(
        () => !document.querySelector<HTMLFieldSetElement>(".arena-panel fieldset")!.disabled,
      );
      await page.locator("#arena-tactics").fill(`TACTICS_PRIVATE_fighter-${i}`);
      await page
        .locator("#arena-loadout")
        .selectOption((["blade", "bow", "guardian"] as const)[i % 3]!);
      await page.getByRole("button", { name: "Save tactics / join", exact: true }).click();
      await page.getByRole("button", { name: "Ready", exact: true }).click();
      await page.getByRole("button", { name: "Not ready", exact: true }).waitFor();
    }
  }
  console.log("arena smoke: eight players joined and ready; spectator connected");
  const host = pages[0]!,
    spectator = pages[8]!;
  assert(await spectator.locator("#arena-tactics").isDisabled());
  assert.equal(app.arena.state().match?.fighters.length, 8);
  assert(
    !frames.join("\n").includes("TACTICS_PRIVATE_"),
    "spectator wire must not include private tactics",
  );
  await host.getByRole("button", { name: "Start match", exact: true }).click();
  await spectator.waitForFunction(() => window.__office.model.arena?.match?.phase === "countdown");
  assert(await host.locator("#arena-tactics").isDisabled());
  await spectator.getByRole("button", { name: "Watch arena", exact: true }).click();
  await spectator.evaluate(() => window.__office.camera.focusArea("arena"));
  await spectator.screenshot({ path: `${out}/arena-desktop.png` });
  const tick = async () => {
    const res = await fetch(`${base}/__test/tick`);
    return (await res.json()) as ArenaState;
  };
  const historyBeforeTurn = hostHistoryRequests;
  let state = await tick();
  assert.equal(state.match?.turn, 1);
  assert.equal(calls, 8);
  await host.waitForFunction(() => window.__office.model.arena?.match?.turn === 1);
  assert.equal(hostHistoryRequests, historyBeforeTurn, "live turns must not refetch history");
  console.log("arena smoke: first turn resolved");
  await spectator.waitForFunction(() => window.__office.model.arena?.match?.turn === 1);
  // A fresh spectator joins mid-match using a phone viewport; no mutation rights.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await mobileContext.addCookies([{ name: SESSION_COOKIE, value: session, url: base }]);
  const mobile = await mobileContext.newPage();
  mobile.on("pageerror", (e) => errors.push(e.stack ?? e.message));
  await mobile.goto(`${base}/?zoom=fit`);
  await mobile.waitForFunction(
    () => window.__office?.ready && window.__office.model.arena?.match?.turn === 1,
  );
  await mobile.getByRole("button", { name: "⚔ Prompt Arena", exact: true }).click();
  await mobile.screenshot({ path: `${out}/arena-phone.png` });
  await pages[2]!.reload();
  await pages[2]!.waitForFunction(
    () => window.__office?.ready && window.__office.model.arena?.match?.turn === 1,
  );
  for (let turn = 1; turn < ARENA_RULES.maxTurns && state.match?.phase !== "finished"; turn++)
    state = await tick();
  console.log(`arena smoke: phase=${state.match?.phase}, turn=${state.match?.turn}`);
  assert.equal(state.match?.phase, "finished");
  const history = app.arena.history();
  assert(history.leaderboard.every((r) => r.matches === 1));
  assert.equal(history.leaderboard.length, 8);
  await host.waitForFunction(() => window.__office.model.arena?.match?.phase === "finished");
  assert(!frames.join("\n").includes("TACTICS_PRIVATE_"));
  host.once("dialog", (dialog) => dialog.accept());
  await host.getByRole("button", { name: "Reveal my prompt for this match", exact: true }).click();
  await spectator.getByRole("button", { name: "⚔ Prompt Arena", exact: true }).click();
  await spectator.getByText("TACTICS_PRIVATE_fighter-0", { exact: true }).waitFor();
  assert.equal(Object.keys(app.arena.state().match!.revealedPrompts).length, 1);
  assert(!JSON.stringify(app.arena.state()).includes("TACTICS_PRIVATE_fighter-1"));
  await spectator.screenshot({ path: `${out}/arena-results.png` });
  await host.getByRole("button", { name: "Open rematch lobby", exact: true }).click();
  await host.waitForFunction(() => window.__office.model.arena?.match?.phase === "lobby");
  assert.equal(app.arena.state().match!.fighters.length, 0);
  assert(providerInputs.length > 0);
  assert.deepEqual(errors, []);
  console.log(
    `PASS: 8 isolated player browsers + live spectator + phone, private prompts, locked lobby, ${calls} fake decisions, late join/reconnect, results, selective reveal, rematch. Screenshots: ${out}`,
  );
} catch (error) {
  console.error("arena smoke failure", {
    phase: app.arena.state().match?.phase,
    turn: app.arena.state().match?.turn,
    calls,
    errors,
  });
  throw error;
} finally {
  await browser?.close();
  server.stop(true);
}
