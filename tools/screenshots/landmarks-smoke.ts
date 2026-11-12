/** Run against Vite: bun tools/screenshots/landmarks-smoke.ts */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "/tmp/agent-office-landmarks";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("[office]"))
      errors.push(message.text());
  });
  await page.goto(
    `${process.env.LANDMARKS_URL ?? "http://127.0.0.1:5173"}/?demo=empty&zoom=1&hour=12&season=summer&weather=sun&nohud=1`,
  );
  await page.waitForFunction(() => window.__office?.ready);
  await page.evaluate(() => {
    window.__office.setSpeed(0);
    window.__office.camera.lookAt(32, -16, 1.65);
  });
  await page.screenshot({ path: `${out}/landmarks.png` });
  await page.evaluate(() => window.__office.camera.focusArea("airport"));
  await page.screenshot({ path: `${out}/airport.png` });
  const check = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const { OfficeScene } = await load("/src/world/office.ts");
    const { buildOfficeMap } = await load("/src/world/map.ts");
    const scene = new OfficeScene(buildOfficeMap(4));
    const sample = (time: number) => {
      scene.update(time, 0);
      const actor = scene.objects.children.find((c: { zIndex: number }) => c.zIndex === 100_000);
      const plane = actor.children[1];
      return { x: plane.x, y: plane.y, visible: plane.visible };
    };
    const landing = sample(2);
    const parked = sample(35);
    const away = sample(69);
    scene.rebuild(buildOfficeMap(6));
    const rebuilt = sample(35);
    scene.root.destroy({ children: true });
    return { landing, parked, away, rebuilt };
  });
  assert.notDeepEqual(check.landing, check.parked);
  assert.equal(check.away.visible, false);
  assert.deepEqual(check.parked, check.rebuilt);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__office.camera.focusArea("airport"));
  await page.screenshot({ path: `${out}/airport-mobile.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ out, check, errors }));
} finally {
  await browser.close();
}
