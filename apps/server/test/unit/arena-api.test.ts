import { expect, test } from "bun:test";
import { envelope, parseViewerMessage } from "@agent-office/protocol";
import { OfficeApp } from "../../src/core/app.ts";
import { ME_COOKIE, makeMeToken } from "../../src/core/auth.ts";
import { MemoryStore } from "../../src/core/store.ts";

async function setup(enabled = true) {
  let now = 1_000_000;
  let ip = 0;
  const sent: string[] = [];
  const app = new OfficeApp(
    { CONNECTOR_PASSWORD: "pw", ARENA_ENABLED: enabled ? "1" : "0" },
    new MemoryStore(),
    { broadcast: (s) => sent.push(s), scheduleAlarm: () => {} },
    { now: () => now, log: () => {} },
  );
  for (const name of ["Anna", "Bob"])
    app.connectorMessage(
      name,
      envelope("connector.hello", {
        name,
        password: "pw",
        clientId: name,
        connectorVersion: "1.0.0",
      }),
    );
  const cookie = `${ME_COOKIE}=${await makeMeToken("pw", "anna", now)}`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.handleHttp(
      new Request("http://office/api/arena", {
        method: "POST",
        headers: { authorization: "Bearer pw", cookie, "cf-connecting-ip": `${++ip}`, ...headers },
        body: JSON.stringify(body),
      }),
    );
  return {
    app,
    sent,
    post,
    cookie,
    advance: () => {
      now += 1000;
    },
  };
}
test("arena API gates feature, identity, office auth, origin, forged fields and body size", async () => {
  const disabled = await setup(false);
  expect((await disabled.post({ kind: "join", prompt: "x", loadout: "blade" }))!.status).toBe(404);
  expect(disabled.app.snapshot().data.arena).toBeUndefined();
  const h = await setup();
  const join = { kind: "join", prompt: "API_PRIVATE_CANARY", loadout: "blade" };
  expect((await h.post(join, { cookie: "" }))!.status).toBe(403);
  expect((await h.post(join, { authorization: "Bearer invalid" }))!.status).toBe(401);
  expect((await h.post(join, { origin: "https://evil.example" }))!.status).toBe(403);
  expect((await h.post({ ...join, personId: "bob" }))!.status).toBe(400);
  h.advance();
  expect((await h.post({ ...join, prompt: "x".repeat(10000) }))!.status).toBe(413);
  h.advance();
  expect((await h.post(join))!.status).toBe(200);
  expect(JSON.stringify(h.app.snapshot())).not.toContain("API_PRIVATE_CANARY");
  expect(h.sent.join("\n")).not.toContain("API_PRIVATE_CANARY");
  for (const raw of h.sent) expect(parseViewerMessage(raw).ok).toBe(true);
  const own = await h.app.handleHttp(
    new Request("http://office/api/arena/me", {
      headers: { authorization: "Bearer pw", cookie: h.cookie },
    }),
  );
  expect(await own!.json()).toMatchObject({ personId: "anna", prompt: "API_PRIVATE_CANARY" });
  const anon = await h.app.handleHttp(
    new Request("http://office/api/arena/me", { headers: { authorization: "Bearer pw" } }),
  );
  expect(await anon!.json()).toMatchObject({ personId: null, prompt: null });
});
test("same office NAT does not share the confirmed-player cooldown", async () => {
  const h = await setup();
  const bob = `${ME_COOKIE}=${await makeMeToken("pw", "bob", 1_000_000)}`;
  const join = { kind: "join", prompt: "private", loadout: "blade" };
  expect((await h.post(join, { "cf-connecting-ip": "office-NAT" }))!.status).toBe(200);
  expect((await h.post(join, { "cf-connecting-ip": "office-NAT", cookie: bob }))!.status).toBe(200);
  expect(
    (await h.post({ kind: "ready", ready: true }, { "cf-connecting-ip": "different-IP" }))!.status,
  ).toBe(429);
  h.advance();
  expect(
    (await h.post({ kind: "ready", ready: true }, { "cf-connecting-ip": "office-NAT" }))!.status,
  ).toBe(200);
});
test("history is on-demand and still requires office authentication", async () => {
  const h = await setup();
  expect((await h.app.handleHttp(new Request("http://office/api/arena/history")))!.status).toBe(
    401,
  );
  const r = await h.app.handleHttp(
    new Request("http://office/api/arena/history", { headers: { authorization: "Bearer pw" } }),
  );
  expect(await r!.json()).toEqual({ recent: [], leaderboard: [] });
  expect(h.app.snapshot().data.arena).not.toHaveProperty("recent");
  expect(h.app.snapshot().data.arena).not.toHaveProperty("leaderboard");
});
test("GET arena is public to office spectators but not unauthenticated callers", async () => {
  const h = await setup();
  expect((await h.app.handleHttp(new Request("http://office/api/arena")))!.status).toBe(401);
  expect(
    (await h.app.handleHttp(
      new Request("http://office/api/arena", { headers: { authorization: "Bearer pw" } }),
    ))!.status,
  ).toBe(200);
});
