/**
 * Office renderer entry. URL params:
 *   ?demo=busy|one|empty|join|party (or 1)  local fake feed, no server; &seed=, &people=, &sessions=
 *                 (party: office life moments fast: chats, coffee, /clear zap, records, pizza)
 *   ?weather=sun|clouds|rain|snow  force the weather (default: changes hour by hour, seeded)
 *   ?season=winter|spring|summer|autumn  force the season (default: the local month)
 *   ?lively=1     office life at party speed (chattier, waits count 10x, pizza drone in 3 s)
 *   ?key=...      viewer key passed through to /ws/viewer
 *   ?kiosk=1      iPad kiosk (no cursor, big text, no panels, wake lock, 30 fps, auto-tour,
 *                 reloads itself after a deploy)
 *   ?recorder=1   upload a timelapse PNG every 15 min (&recordEvery=ms to override)
 *   ?nohud=1      hide all DOM overlays     ?zoom=fit|<n>  initial zoom
 *   ?hour=0..24   force the time of day     ?gallery=1     art gallery (dev)
 *   ?focus=<personId>  start focused on that person's desk pod
 */
import "./ui/theme.css";
import "./ui/office.css";
import {
  type InteractRequest,
  isCatInteraction,
  type PersonDayResponse,
  parseViewerMessage,
  type ServerToViewer,
} from "@agent-office/protocol";
import { Application, TextureStyle } from "pixi.js";
import { fitText } from "./art/font.ts";
import { trophyCanvas } from "./art/fun.ts";
import { CAT, catTextures } from "./art/fx.ts";
import { C } from "./art/palette.ts";
import { setArtSeason } from "./art/seasons.ts";
import { Camera } from "./camera.ts";
import { DemoFeed, parseDemoMode } from "./demo/demoFeed.ts";
import { type CatAction, Hud, type PokeResult } from "./hud.ts";
import { keepAwake, reloadOnNewBuild } from "./kiosk.ts";
import { connectViewer, loginIfLoggedOut } from "./net/viewer.ts";
import { registerServiceWorker } from "./pwa.ts";
import { captureSnapshot, startRecorder } from "./recorder.ts";
import { type ModelChange, OfficeModel } from "./state/officeModel.ts";
import { Minimap } from "./ui/minimap.ts";
import { CharacterManager } from "./world/characters.ts";
import { CatColony } from "./world/colony.ts";
import { Effects } from "./world/effects.ts";
import { OfficeLife } from "./world/life.ts";
import { catCount, SEASONS, type Season, seasonFor } from "./world/lifeRules.ts";
import { Living } from "./world/living.ts";
import {
  type AreaName,
  BASE_POD_ROWS,
  buildOfficeMap,
  POD_COLS,
  podDeskSpan,
  podOrigin,
  podRowsFor,
} from "./world/map.ts";
import { OfficeScene } from "./world/office.ts";

type OfficeApi = {
  ready: boolean;
  fps(): number;
  /** average ms per frame spent in update / render over the last second */
  frameMs(): { update: number; render: number };
  model: OfficeModel;
  camera: {
    zoomToFit(): void;
    focusArea(name: AreaName | "all"): void;
    focusPerson(personId: string, zoom?: number): boolean;
  };
  injectEvent(msg: unknown): boolean;
  /** open a session's agent card (like clicking its character); false if unknown */
  openSession(sessionId: string): boolean;
  snapshotPng(): Promise<string | null>;
  characters(): number;
  /** office cats right now (not counting the ones walking out) */
  cats(): number;
  /** slow down / freeze the world clock (screenshots of short moments); 1 = normal */
  setSpeed(k: number): void;
};
declare global {
  interface Window {
    __office: OfficeApi;
  }
}

const params = new URLSearchParams(location.search);
const flag = (k: string) => params.get(k) === "1" || params.get(k) === "true";
const kiosk = flag("kiosk");
const nohud = flag("nohud");
const recorder = flag("recorder");
const demo = parseDemoMode(params.get("demo"));
const zoomParam = params.get("zoom");
const hourParam = params.get("hour");
const key = params.get("key");

registerServiceWorker();

async function boot() {
  TextureStyle.defaultOptions.scaleMode = "nearest";
  const host = document.getElementById("app")!;
  if (kiosk) document.body.classList.add("kiosk");
  if (nohud) document.body.classList.add("nohud");

  const app = new Application();
  await app.init({
    resizeTo: host,
    background: C.pine,
    antialias: false,
    roundPixels: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  if (kiosk) app.ticker.maxFPS = 30;

  if (params.has("gallery")) {
    const { showGallery } = await import("./dev/gallery.ts");
    showGallery(app);
    window.__office = { ready: true } as OfficeApi;
    return;
  }

  const model = new OfficeModel();
  const seasonParam = params.get("season") as Season | null;
  const season =
    seasonParam && SEASONS.includes(seasonParam)
      ? seasonParam
      : seasonFor(new Date().getMonth() + 1);
  setArtSeason(season);
  const scene = new OfficeScene(buildOfficeMap(BASE_POD_ROWS));
  app.stage.addChild(scene.root);
  const effects = new Effects(scene.fx);
  const chars = new CharacterManager(scene, model, effects);
  const party = demo === "party" || flag("lively");
  // the party demo runs the waiting thresholds 10x faster and starts at lunch time
  if (party) {
    chars.timeScale = 10;
    chars.chatChance = 0.8;
    chars.dwell = 0.4;
  }
  const colony = new CatColony(scene.objects, scene.fx, scene.map, effects, {
    idleSpots: () => chars.idleSpots(),
    waitSpots: () => chars.catWaitSpots(),
    perchFor: (personId, pick) => chars.catPerch(personId, pick),
    personName: (personId) => model.people.get(personId)?.name ?? personId,
    onVisit: (personId) => {
      const c = chars.charactersOf(personId)[0];
      if (c) effects.after(0.6, () => chars.say(c, "AWW, A CAT!"));
    },
  });
  chars.catEats = (sprite, x, y) => colony.tryEat(sprite, x, y);
  if (party) colony.setHunting(0.6, 900);
  const hourValue = hourParam !== null ? Number(hourParam) : demo === "party" ? 12.2 : null;
  const living = new Living(scene, model, hourValue);
  const weatherParam = params.get("weather");
  const life = new OfficeLife(
    scene,
    model,
    effects,
    {
      hour: () => living.hour,
      people: () => chars.positions(),
      pongMatch: () => chars.pongMatch(),
      inMeeting: () => chars.inArea("meeting"),
      longWaiters: () => chars.chefWaitSpots(),
      onPizza: () => chars.pizzaArrived(),
      burning: () => chars.burningCount(),
      evacuate: (spot) => chars.evacuate(spot),
      personSpot: (personId) => chars.personSpot(personId),
      catBoss: (spot) => colony.setBoss(spot),
    },
    {
      weather:
        weatherParam === "sun" ||
        weatherParam === "clouds" ||
        weatherParam === "rain" ||
        weatherParam === "snow"
          ? weatherParam
          : null,
      season,
      ...(party ? { droneDelay: demo === "party" ? 6 : 3 } : {}),
    },
  );
  chars.pizzaActive = () => life.pizzaOnTable;
  chars.hour = () => living.hour;
  chars.lunchSpot = () => life.truckSpot();
  chars.onCoffee = (personId) =>
    life.coffeeDrunk(personId, model.people.get(personId)?.name ?? personId);
  const hud = new Hud(host, model, { kiosk });
  // the top bar is 36 px (46 in kiosk) plus the notch inset in an installed app
  const hudTop = host.querySelector<HTMLElement>(".hud-top");
  const fallbackInset = kiosk ? 46 : 36;
  const topInset = nohud ? 0 : () => hudTop?.offsetHeight || fallbackInset;
  const camera = new Camera(
    scene.root,
    () => app.screen,
    () => ({ width: scene.widthPx, height: scene.heightPx }),
    () => scene.map.areas,
    {
      kiosk,
      holdAuto: zoomParam !== null && !kiosk,
      topInset,
      view: params.get("view") === "overview" ? "overview" : "tour",
      overviewEvery: Math.max(20, Number(params.get("every")) || 120),
    },
  );
  camera.attach(app.canvas);
  const minimap = new Minimap(hud.minimapHost, camera, chars);
  minimap.setTerrain(scene.terrainCanvas);
  minimap.desks = () => scene.deskRects();

  // initial view
  if (zoomParam === "fit") camera.zoomToFit(true);
  else if (zoomParam && Number(zoomParam) > 0)
    camera.set({ x: 25 * 16, y: 15 * 16, zoom: Number(zoomParam) }, true);
  else if (app.screen.width / scene.widthPx > 1.6)
    camera.set({ x: 32 * 16, y: 15 * 16, zoom: 2 }, true);
  else camera.set({ x: 22 * 16, y: 14 * 16, zoom: 2 }, true);

  // ---- events -----------------------------------------------------------------------------
  const ensureCapacity = () => {
    const need = model.podCount();
    if (need <= scene.map.podRows * POD_COLS) return;
    scene.rebuild(buildOfficeMap(podRowsFor(need)));
    colony.setMap(scene.map);
    life.reattach();
    minimap.setTerrain(scene.terrainCanvas);
    chars.syncSlots();
    camera.worldChanged();
  };

  let snapshotSeen = false;
  /** runs after every message (e.g. a ?focus= waiting for its person to show up) */
  let afterIngest = () => {};
  const ingest = (msg: ServerToViewer) => {
    const changes = model.apply(msg);
    ensureCapacity();
    colony.sync(catCount(model.people.size));
    for (const ch of changes) {
      chars.handle(ch);
      if (ch.kind === "officeRenamed") hud.setOfficeName(ch.name);
      if (ch.kind === "interaction") react(ch);
    }
    if (msg.type === "office.snapshot") {
      snapshotSeen = true;
      hud.setVersion(model.version, __BUILD__);
      chars.syncSlots();
    }
    hud.setStats(model.stats());
    if (hud.panelOpen && changes.length > 0) hud.refresh();
    living.poke();
    afterIngest();
  };

  chars.onMoment = (m) => {
    if (m.kind === "joined") camera.notify(m.x, m.y, { zoom: 3, hold: 10, rush: true });
    else if (m.kind === "arrived") {
      hud.showJoin(m.name, m.personId ? hud.portrait(m.personId) : null);
    } else if (m.kind === "record") {
      hud.showBanner(`${m.name}: ${m.count} agents at once!`, "new personal record", {
        portrait: trophyCanvas(),
      });
    } else if (m.kind === "ended") life.graveyard.add();
    else camera.notify(m.x, m.y);
  };

  const BUBBLE: Record<string, string> = { wave: "HI!", coffee: "COFFEE?", cheer: "WOO!" };
  const VERB: Record<string, string> = {
    wave: "waved at",
    coffee: "wants a coffee with",
    cheer: "cheered on",
    message: "sent a message to",
    paper: "threw a paper ball at",
    tomato: "threw a tomato at",
  };
  /** Play an interaction for everyone watching (it comes back from the server to all viewers). */
  function react(ch: Extract<ModelChange, { kind: "interaction" }>) {
    const who = ch.from || "Someone";
    const catName = colony.get(ch.catId)?.name ?? "the cat";
    if (ch.interaction === "pet") {
      colony.get(ch.catId)?.meow();
      return;
    }
    if (ch.interaction === "feed" || ch.interaction === "yarn" || ch.interaction === "laser") {
      if (!ch.spot) return;
      if (ch.interaction === "feed") {
        colony.feed(ch.catId, ch.spot);
        hud.showBanner(`${who} fed ${catName}`, "nom nom nom");
      } else if (ch.interaction === "yarn") {
        colony.yarn(ch.catId, ch.spot);
        hud.showBanner(`${who} tossed ${catName} a yarn ball`);
      } else {
        colony.laser(ch.catId, ch.spot);
        hud.showBanner(`${who} got out the laser pointer`, "the cats are on it");
      }
      hud.refreshCat();
      return;
    }
    const targets = ch.personId ? chars.charactersOf(ch.personId) : [];
    const name = ch.personId ? (model.people.get(ch.personId)?.name ?? ch.personId) : "";
    if (ch.interaction === "cat" && ch.personId) {
      colony.visit(ch.catId, ch.personId);
      hud.refreshCat();
    }
    if (ch.interaction === "paper" || ch.interaction === "tomato") {
      const kind = ch.interaction;
      const c = targets[Math.floor(Math.random() * targets.length)];
      if (c) {
        const side = c.x > scene.widthPx / 2 ? -1 : 1;
        const fx = c.x + side * 110;
        if (kind === "tomato")
          effects.throwTomato(fx, c.y - 60, c.x, c.y - 20, () => chars.tomato(c));
        else
          effects.throwBall(fx, c.y - 60, c.x, c.y - 20, () => {
            effects.puff(c.x, c.y - 20);
            chars.say(c, "OUCH!");
          });
        // paper ball war: the third hit within a minute gets thrown back at someone else
        if (ch.personId && chars.hitBy(ch.personId, kind)) {
          const victim = chars.randomOther(ch.personId);
          if (victim)
            effects.after(1.4, () => {
              chars.say(c, "THAT'S IT!");
              effects.throwBall(c.x, c.y - 20, victim.x, victim.y - 20, () => {
                effects.puff(victim.x, victim.y - 20);
                chars.say(victim, "HEY!");
              });
            });
        }
      }
    } else if (ch.interaction !== "cat") {
      const text =
        ch.interaction === "message"
          ? fitText((ch.text ?? "").toUpperCase(), 110)
          : BUBBLE[ch.interaction]!;
      for (const c of targets) chars.say(c, text);
      if (ch.interaction === "cheer" && targets[0])
        effects.confetti(targets[0].x, targets[0].y - 24, 30);
    }
    const macs =
      ch.delivered === undefined
        ? ""
        : ch.delivered > 0
          ? `popped up on ${ch.delivered} Mac${ch.delivered === 1 ? "" : "s"}`
          : "their Mac is not listening";
    const title =
      ch.interaction === "cat"
        ? `${who} sent ${catName} to ${name}`
        : `${who} ${VERB[ch.interaction]} ${name}`;
    hud.showBanner(title, macs);
  }

  const DONE: Partial<Record<InteractRequest["kind"], string>> = {
    tomato: "splat!",
    paper: "bonk!",
    pet: "purr!",
    feed: "nom nom nom",
    yarn: "boing!",
    laser: "pew!",
  };
  async function poke(input: InteractRequest): Promise<PokeResult> {
    // which cat goes: picked here, so every viewer sends the same one
    const req =
      input.kind === "cat" && input.catId === undefined
        ? { ...input, catId: colony.randomSlot() }
        : input;
    const officeOnly = isCatInteraction(req.kind) || req.kind === "paper" || req.kind === "tomato";
    if (demo) {
      ingest({
        v: 1,
        type: "interaction.happened",
        id: `demo-${Date.now()}`,
        ts: Date.now(),
        data: { ...req, ...(officeOnly ? {} : { delivered: 0 }) },
      });
      return {
        ok: true,
        message: officeOnly ? (DONE[req.kind] ?? "done") : "sent (demo: no Macs here)",
      };
    }
    try {
      const r = await fetch("/api/interact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const body = (await r.json().catch(() => ({}))) as { delivered?: number; error?: string };
      if (r.status === 401) void loginIfLoggedOut();
      if (!r.ok) return { ok: false, message: body.error ?? `failed (${r.status})` };
      if (officeOnly) return { ok: true, message: DONE[req.kind] ?? "done" };
      const sent = req.kind === "cat" ? "a cat is on its way" : "sent";
      return {
        ok: true,
        message: body.delivered
          ? `${sent}, it popped up on their Mac`
          : `${sent} (their Mac is not listening)`,
      };
    } catch {
      return { ok: false, message: "could not reach the office" };
    }
  }
  if (!kiosk) hud.onPoke = poke;

  // ---- the cat card --------------------------------------------------------------------------
  /** Laser armed from a cat card: the next tap on the floor points it. */
  let laserArmed: { slot: number; from: string | undefined } | null = null;
  hud.catInfo = (slot) => {
    const cat = colony.get(slot);
    if (!cat) return null;
    const frame = catTextures(cat.coat)[CAT.sit[0]]!;
    const src = frame.source.resource as HTMLCanvasElement | undefined;
    let portrait: HTMLCanvasElement | null = null;
    if (src) {
      portrait = document.createElement("canvas");
      portrait.width = 72;
      portrait.height = 56;
      const ctx = portrait.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, frame.frame.x, frame.frame.y, 18, 14, 0, 0, 72, 56);
    }
    return { slot, name: cat.name, coat: cat.coat.label, status: cat.status(), portrait };
  };
  if (!kiosk)
    hud.onCatAction = async (action: CatAction, slot, from) => {
      laserArmed = null;
      const sign = from ? { from } : {};
      if (action === "laser") {
        laserArmed = { slot, from };
        return { ok: true, message: "now tap the floor to point it" };
      }
      if (action === "pet") {
        colony.get(slot)?.meow();
        return poke({ kind: "pet", catId: slot, ...sign });
      }
      const spot = colony.dropSpot(slot);
      return poke({ kind: action, catId: slot, x: spot.x, y: spot.y, ...sign });
    };

  /** Agent card + ease the camera to the character (clear of the side panel). */
  const openSession = (sessionId: string) => {
    if (kiosk || !hud.openSession(sessionId)) return false;
    const c = chars.chars.get(sessionId);
    if (c) {
      const zoom = Math.max(camera.zoom, 3);
      const panelW = app.screen.width > 560 ? 330 : 0;
      camera.focus(c.x + panelW / 2 / zoom, c.y - 14, zoom);
    }
    return true;
  };
  hud.onOpenSession = (id) => void openSession(id);
  camera.holdWhile = () => hud.panelOpen;
  hud.onPanelChange = () => {
    chars.selected = hud.openSessionId;
    if (hud.openCatSlot === null) laserArmed = null;
  };
  hud.fetchDay = async (personId): Promise<PersonDayResponse | null> => {
    if (demo) return null;
    const q = key ? `?key=${encodeURIComponent(key)}` : "";
    const r = await fetch(`/api/people/${encodeURIComponent(personId)}${q}`);
    return r.ok ? ((await r.json()) as PersonDayResponse) : null;
  };

  camera.onTap = (wx, wy) => {
    if (!kiosk && life.hitCar(wx, wy)) {
      location.href = key ? `./stats?key=${encodeURIComponent(key)}` : "./stats";
      return;
    }
    if (laserArmed) {
      const armed = laserArmed;
      if (!scene.map.isWalkable(Math.floor(wx / 16), Math.floor((wy - 2) / 16))) return;
      laserArmed = null;
      void poke({
        kind: "laser",
        catId: armed.slot,
        x: Math.max(0, Math.round(wx)),
        y: Math.max(0, Math.round(wy)),
        ...(armed.from ? { from: armed.from } : {}),
      }).then((r) => hud.laserDone(r));
      return;
    }
    const cat = colony.hit(wx, wy);
    if (cat) {
      cat.meow();
      if (!demo) void poke({ kind: "pet", catId: cat.slot });
      hud.openCat(cat.slot);
      return;
    }
    const c = chars.pick(wx, wy);
    if (c) {
      openSession(c.sessionId);
      return;
    }
    const plate = scene.pickNameplate(wx, wy);
    if (plate) hud.openPanel(plate);
    else hud.closePanel();
  };
  camera.onDoubleTap = (wx, wy) => {
    const c = chars.pick(wx, wy);
    if (!c) return false;
    camera.focus(c.x, c.y - 12, 4);
    return true;
  };
  hud.portrait = (personId) => {
    const c = [...chars.chars.values()].find((ch) => ch.personId === personId);
    const frame = c?.sheet.frames[0];
    const src = frame?.source.resource as HTMLCanvasElement | undefined;
    if (!frame || !src) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, frame.frame.x, frame.frame.y, 16, 24, 0, 0, 64, 96);
    return canvas;
  };

  if (demo) {
    const feed = new DemoFeed(
      {
        mode: demo,
        seed: params.get("seed") ?? "1",
        ...(params.get("people") ? { people: Number(params.get("people")) } : {}),
        ...(params.get("sessions") ? { sessions: Number(params.get("sessions")) } : {}),
        ...(params.get("speed") ? { speed: Number(params.get("speed")) } : {}),
      },
      (msg) => {
        // round-trip through the real parser so demo data is schema-checked too
        const r = parseViewerMessage(JSON.stringify(msg));
        if (r.ok) ingest(r.msg);
        else console.error("[demo] invalid message", r.error, msg);
      },
    );
    feed.start();
  } else {
    const checkBuild = kiosk ? reloadOnNewBuild() : null;
    connectViewer({
      key,
      onMessage: ingest,
      onStatus: (s) => {
        hud.setStatus(s);
        if (s === "open") checkBuild?.();
      },
    });
  }

  const focusPerson = (personId: string, zoom = 3) => {
    const p = model.people.get(personId);
    if (!p) return false;
    // centre on the person's pod (its desks + chairs), whatever its size
    const n = Math.max(2, scene.slotDesks(p.pod));
    const span = podDeskSpan(p.pod, n);
    const o = podOrigin(p.pod);
    camera.set({ x: span.x + span.w / 2, y: o.y * 16 + 30, zoom }, true);
    return true;
  };
  /** Overview close-ups: someone waiting longest, else the pod with the most busy agents. */
  camera.hotSpot = () => {
    let best: { personId: string; score: number } | null = null;
    for (const p of model.people.values()) {
      let score = 0;
      for (const s of model.sessionsOf(p.personId)) {
        if (s.offline) continue;
        if (s.activity === "waiting") score += 10;
        else if (s.activity !== "idle") score += 3;
        score += s.subagents + ((s.context ?? 0) >= 0.8 ? 5 : 0);
      }
      if (score > 0 && (!best || score > best.score)) best = { personId: p.personId, score };
    }
    const p = best && model.people.get(best.personId);
    if (!p) return null;
    const n = Math.max(2, scene.slotDesks(p.pod));
    const span = podDeskSpan(p.pod, n);
    return { x: span.x + span.w / 2, y: podOrigin(p.pod).y * 16 + 30 };
  };
  const focusParam = params.get("focus");
  if (focusParam) {
    // with a live server the snapshot arrives later: focus as soon as the person exists
    const tryFocus = () => {
      if (focusPerson(focusParam, Number(zoomParam) || 3)) afterIngest = () => {};
    };
    afterIngest = tryFocus;
    tryFocus();
  }

  if (kiosk) keepAwake();
  if (recorder) {
    startRecorder(app, scene, model, {
      everyMs: Number(params.get("recordEvery")) || 15 * 60_000,
      key,
    });
  }

  // ---- frame loop ---------------------------------------------------------------------------
  let time = 0;
  let speed = 1;
  let frames = 0;
  let fpsWindowStart = performance.now();
  let fps = 0;
  let updMs = 0;
  let renMs = 0;
  let lastUpd = 0;
  let lastRen = 0;
  const renderer = app.renderer;
  const render = renderer.render.bind(renderer) as (...a: unknown[]) => void;
  (renderer as unknown as { render: (...a: unknown[]) => void }).render = (...a: unknown[]) => {
    const t0 = performance.now();
    render(...a);
    renMs += performance.now() - t0;
  };
  app.ticker.add((ticker) => {
    const t0 = performance.now();
    const dt = Math.min(0.1, ticker.deltaMS / 1000) * speed;
    time += dt;
    scene.update(time, dt);
    chars.update(dt, time);
    colony.update(dt, time);
    // cats coming in or going home get the door opened too
    if (!scene.doorWanted) {
      const d = scene.map.door;
      scene.doorWanted = colony.nearDoor({ x: (d.x + 1) * 16, y: (d.y + 1) * 16 });
    }
    life.update(dt, time);
    effects.update(dt);
    living.update(dt);
    camera.update(dt);
    if (!nohud && !kiosk) minimap.update(dt);
    frames++;
    const now = performance.now();
    updMs += now - t0;
    if (now - fpsWindowStart >= 1000) {
      fps = (frames * 1000) / (now - fpsWindowStart);
      lastUpd = updMs / frames;
      lastRen = renMs / frames;
      updMs = 0;
      renMs = 0;
      frames = 0;
      fpsWindowStart = now;
    }
  });
  window.addEventListener("resize", () => camera.resized());

  const api: OfficeApi = {
    ready: false,
    fps: () => Math.round(fps * 10) / 10,
    frameMs: () => ({
      update: Math.round(lastUpd * 100) / 100,
      render: Math.round(lastRen * 100) / 100,
    }),
    model,
    camera: {
      zoomToFit: () => camera.zoomToFit(true),
      focusArea: (name) => camera.focusArea(name, true),
      focusPerson: (personId, zoom) => focusPerson(personId, zoom),
    },
    injectEvent(raw) {
      const r = parseViewerMessage(typeof raw === "string" ? raw : JSON.stringify(raw));
      if (r.ok) ingest(r.msg);
      return r.ok;
    },
    snapshotPng: async () => {
      const blob = await captureSnapshot(app, scene);
      if (!blob) return null;
      return await new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.readAsDataURL(blob);
      });
    },
    characters: () => chars.chars.size,
    cats: () => colony.cats().length,
    setSpeed: (k) => {
      speed = Math.max(0, k);
    },
    openSession,
  };
  window.__office = api;
  await document.fonts?.ready;
  const markReady = () => {
    if (snapshotSeen || !demo) {
      requestAnimationFrame(() => {
        api.ready = true;
      });
    } else setTimeout(markReady, 50);
  };
  markReady();
}

void boot();
