/** Run against Vite: bun tools/screenshots/spectacles-smoke.ts (offline demos only). */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const base = process.env.SPECTACLES_URL ?? "http://127.0.0.1:5184";
const out = process.env.SPECTACLES_SHOTS ?? "/tmp/agent-office-spectacles";
mkdirSync(out, { recursive: true });
const errors: string[] = [];
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const track = (page: Page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("[office]")) errors.push(m.text());
  });
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
  });
  track(page);
  await page.goto(`${base}/?demo=busy&zoom=1&hour=12&season=summer&weather=sun`);
  await page.waitForFunction(() => window.__office?.ready && window.__office.characters() >= 20);
  await page.evaluate(() => window.__office.setSpeed(5));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__office.setSpeed(0));
  const capture = async (name: string, x: number, y: number, zoom: number) => {
    await page.evaluate(({ x, y, zoom }) => window.__office.camera.lookAt(x, y, zoom), {
      x,
      y,
      zoom,
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  await capture("01-overview", 40, 15, 0.95);
  const initial = await page.evaluate(() => window.__office.spectacles!.status());
  assert.equal(initial.throne.guards, 2);
  assert.equal(initial.active, null);
  await capture("02-throne", initial.throne.x / 16, initial.throne.y / 16 + 1, 3);
  // Exercise the actual accessible UI, not just the preview API.
  await page.evaluate(() => window.__office.camera.lookAt(58, 22, 2.2));
  await page.waitForTimeout(250);
  // QUACK is also accessible without precisely targeting the canvas.
  await page.getByText("🎪 Office nonsense", { exact: true }).click();
  await page.getByRole("button", { name: "🦆 Giant QUACK", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__office.spectacles!.status().duck.quacking), true);
  assert.equal(await page.evaluate(() => window.__office.spectacles!.quack()), false);
  await capture("03-duck-quack", 58, 20, 2.2);

  for (const kind of ["conga", "disco", "ufo"] as const) {
    assert(
      await page.evaluate((kind) => window.__office.spectacles!.trigger(kind), kind),
      `start ${kind}`,
    );
    assert.equal(await page.evaluate(() => window.__office.spectacles!.trigger("disco")), false);
    await page.evaluate(() => window.__office.setSpeed(5));
    await page.waitForFunction(
      (kind) =>
        window.__office.spectacles!.status().active === kind &&
        window.__office.spectacles!.status().age > (kind === "ufo" ? 8 : 5),
      kind,
    );
    await page.evaluate(() => window.__office.setSpeed(0));
    const status = await page.evaluate(() => window.__office.spectacles!.status());
    assert(status.participants > 0 && status.hiddenSprites > 0);
    assert(
      await page.evaluate(() =>
        window.__office.spectacles!.status().sessionIds.every((id) => {
          const s = window.__office.model.sessions.get(id) as {
            activity: string;
            context?: number;
          };
          return s.activity !== "waiting" && (s.context ?? 0) < 0.8;
        }),
      ),
    );
    if (kind === "ufo") await capture("06-ufo", status.ufo.x / 16, status.ufo.y / 16 + 2, 2.2);
    else await capture(kind === "conga" ? "04-chair-conga" : "05-emergency-disco", 30, 15, 1.3);
    if (kind === "conga") {
      // Newly waiting/burning actors leave the show immediately so their markers stay visible.
      const protectedIds = await page.evaluate(() => {
        const ids = window.__office.spectacles!.status().sessionIds.slice(0, 2);
        ids.forEach((id, i) => {
          const s = window.__office.model.sessions.get(id) as {
            personId: string;
            activity: string;
          };
          window.__office.injectEvent({
            v: 1,
            id: `protect-${i}`,
            ts: Date.now(),
            type: i ? "session.contextChanged" : "session.activityChanged",
            data: i
              ? { personId: s.personId, sessionId: id, context: 0.9 }
              : { personId: s.personId, sessionId: id, previous: s.activity, activity: "waiting" },
          });
        });
        return ids;
      });
      await page.waitForFunction(
        (ids) => ids.every((id) => !window.__office.spectacles!.status().sessionIds.includes(id)),
        protectedIds,
      );
    }
    await page.evaluate(() => window.__office.setSpeed(20));
    await page.waitForFunction(() => window.__office.spectacles!.status().active === null);
    await page.evaluate(() => window.__office.setSpeed(0));
    const ended = await page.evaluate(() => window.__office.spectacles!.status());
    assert.equal(ended.participants, 0);
    assert.equal(ended.hiddenSprites, 0);
  }
  // Start another abduction, then make the target busy: it must stop immediately.
  assert(await page.evaluate(() => window.__office.spectacles!.trigger("ufo")));
  await page.evaluate(() => window.__office.setSpeed(1));
  await page.waitForFunction(() => window.__office.spectacles!.status().participants === 1);
  await page.evaluate(() => {
    const id = window.__office.spectacles!.status().ufo.target!;
    const session = window.__office.model.sessions.get(id) as { personId: string };
    window.__office.injectEvent({
      v: 1,
      id: "busy-abductee",
      ts: Date.now(),
      type: "session.activityChanged",
      data: { personId: session.personId, sessionId: id, previous: "idle", activity: "typing" },
    });
  });
  await page.waitForFunction(() => window.__office.spectacles!.status().active === null);

  // Grow the real office mid-conga: all real actors are restored, landmarks survive.
  assert(await page.evaluate(() => window.__office.spectacles!.trigger("conga")));
  await page.waitForFunction(() => window.__office.spectacles!.status().participants > 0);
  await page.evaluate(async () => {
    const path = "/src/demo/demoFeed.ts";
    const { DemoFeed } = await import(path);
    const feed = new DemoFeed({ mode: "busy", people: 15, sessions: 40 }, (msg: unknown) => {
      if (!window.__office.injectEvent(msg)) throw new Error("Invalid demo growth event");
    });
    feed.start();
    feed.stop();
  });
  await page.waitForFunction(() => window.__office.spectacles!.status().active === null);
  assert.equal(await page.evaluate(() => window.__office.spectacles!.status().hiddenSprites), 0);

  // Explicit regression: every actor layer survives growth, while static objects rebuild.
  assert(
    await page.evaluate(async () => {
      const load = (path: string) => import(path);
      const [{ OfficeScene }, { buildOfficeMap }] = await Promise.all([
        load("/src/world/office.ts"),
        load("/src/world/map.ts"),
      ]);
      const scene = new OfficeScene(buildOfficeMap(4));
      const Container = scene.root.constructor;
      const cases = [scene.decals, scene.objects, scene.glows].map((layer) => {
        const actor = new Container();
        actor.label = "actor";
        const decor = new Container();
        layer.addChild(actor, decor);
        return { layer, actor, decor };
      });
      scene.rebuild(buildOfficeMap(6));
      const ok = cases.every(
        ({ layer, actor, decor }) => !actor.destroyed && actor.parent === layer && decor.destroyed,
      );
      scene.root.destroy({ children: true });
      return ok;
    }),
  );

  // Kiosks are off by default even if a preview URL is present; desktop can opt out too.
  const disabled = await browser.newPage({
    viewport: { width: 1180, height: 820 },
    serviceWorkers: "block",
  });
  track(disabled);
  for (const query of ["kiosk=1", "spectacles=0"]) {
    await disabled.goto(`${base}/?demo=busy&${query}&spectacle=disco`);
    await disabled.waitForFunction(() => window.__office?.ready);
    assert.equal(await disabled.evaluate(() => window.__office.spectacles), null);
    assert.equal(await disabled.locator(".spectacle-controls").count(), 0);
  }
  await disabled.close();

  // Opted-in kiosk and reduced-motion mobile still see the permanent props and static disco.
  const kiosk = await browser.newPage({
    viewport: { width: 1180, height: 820 },
    serviceWorkers: "block",
  });
  track(kiosk);
  await kiosk.goto(
    `${base}/?demo=busy&kiosk=1&spectacles=1&zoom=1&hour=12&season=summer&spectacle=disco`,
  );
  await kiosk.waitForFunction(
    () => window.__office?.ready && window.__office.spectacles!.status().participants > 0,
  );
  await kiosk.evaluate(() => {
    window.__office.setSpeed(0);
    window.__office.camera.lookAt(36, 15, 1);
  });
  assert.equal(await kiosk.locator(".spectacle-controls").count(), 0);
  await kiosk.screenshot({ path: `${out}/07-kiosk.png` });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  track(mobile);
  await mobile.goto(`${base}/?demo=busy&zoom=1&hour=12&season=summer&spectacle=disco`);
  await mobile.waitForFunction(
    () => window.__office?.ready && window.__office.spectacles!.status().participants > 0,
  );
  assert.equal(
    await mobile.evaluate(() => window.__office.spectacles!.status().reducedMotion),
    true,
  );
  await mobile.evaluate(() => {
    window.__office.setSpeed(0);
    window.__office.camera.lookAt(47, 15, 1.5);
  });
  await mobile.screenshot({ path: `${out}/08-mobile-reduced-motion.png` });
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  // Reduced-motion alien stays in place for the full encounter, including approach/departure.
  await mobile.evaluate(() => window.__office.setSpeed(20));
  await mobile.waitForFunction(() => window.__office.spectacles!.status().active === null);
  assert(await mobile.evaluate(() => window.__office.spectacles!.trigger("ufo")));
  await mobile.waitForFunction(() => window.__office.spectacles!.status().age > 3);
  await mobile.evaluate(() => window.__office.setSpeed(0));
  const still = await mobile.evaluate(() => window.__office.spectacles!.status().ufo);
  await mobile.evaluate(() => window.__office.setSpeed(8));
  await mobile.waitForFunction(() => window.__office.spectacles!.status().age > 10);
  await mobile.evaluate(() => window.__office.setSpeed(0));
  assert.deepEqual(await mobile.evaluate(() => window.__office.spectacles!.status().ufo), still);
  assert.deepEqual(errors, []);
  console.log(
    `spectacles smoke: all five features, cleanup, busy-abort, rebuild, kiosk and reduced motion passed; screenshots: ${out}`,
  );
} finally {
  await browser.close();
}
