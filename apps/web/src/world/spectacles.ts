/** Office nonsense: permanent landmarks + bounded, cosmetic ensemble choreography.
 * Proxy sprites leave the real character state machines running. Visibility is restored
 * before every simulation frame, so joins, departures, new looks and rebuilds remain safe.
 */
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { textBubbleTexture } from "../art/fun.ts";
import { C, hexNum } from "../art/palette.ts";
import {
  paintCarpet,
  paintDisco,
  paintDuck,
  paintGuard,
  paintRollingChair,
  paintSaucer,
  paintThrone,
} from "../art/spectacles.ts";
import type { OfficeModel } from "../state/officeModel.ts";
import { type CharacterManager, FIRE_AT, type SessionCharacter } from "./characters.ts";
import type { Effects } from "./effects.ts";
import { localDayKey } from "./lifeRules.ts";
import { localHour } from "./living.ts";
import { HEAD_DESK, type OfficeMap, type Point, TILE } from "./map.ts";
import type { OfficeScene } from "./office.ts";
import {
  abductionPose,
  angleToward,
  canJoinSpectacle,
  congaRoute,
  hardestWorker,
  routeLength,
  routePose,
  SPECTACLE_SECONDS,
  type Spectacle,
  scheduledSpectacle,
  ufoLanding,
} from "./spectacleRules.ts";

const MAX_ACTORS = 256;
type Proxy = {
  group: Container;
  person: Sprite;
  chair: Sprite;
  source: SessionCharacter;
  from: Point;
};
type Event = {
  kind: Spectacle;
  age: number;
  actors: SessionCharacter[];
  from?: Point;
  landing?: Point;
  landed: boolean;
};
let textures: ReturnType<typeof makeTextures> | undefined;
function texture(p: { toCanvas(): HTMLCanvasElement }) {
  const t = Texture.from(p.toCanvas());
  t.source.scaleMode = "nearest";
  return t;
}
function cachedTextures() {
  textures ??= makeTextures();
  return textures;
}
function makeTextures() {
  return {
    duck: texture(paintDuck()),
    duckFront: texture(paintDuck(true)),
    throne: texture(paintThrone()),
    carpet: texture(paintCarpet()),
    guards: [texture(paintGuard()), texture(paintGuard(true))],
    ufo: texture(paintSaucer()),
    disco: texture(paintDisco()),
    chair: texture(paintRollingChair()),
  };
}

export class OfficeSpectacles {
  private readonly art = cachedTextures();
  private readonly duck = new Sprite(this.art.duck);
  private readonly duckPlaque = new Sprite(textBubbleTexture("CHIEF QUACK OFFICER", C.orange));
  private readonly throne = new Sprite(this.art.throne);
  private readonly carpet = new Sprite(this.art.carpet);
  private readonly guards = [new Sprite(this.art.guards[0]), new Sprite(this.art.guards[0])];
  private readonly air = new Container();
  private readonly lights = new Graphics();
  private readonly actors = new Container();
  private readonly ufo = new Sprite(this.art.ufo);
  private readonly disco = new Sprite(this.art.disco);
  private readonly quack = new Sprite(textBubbleTexture("QUAAAAACK!", C.orange));
  private readonly title = new Sprite();
  private hidden = new Map<Sprite, boolean>();
  private proxies = new Map<string, Proxy>();
  private event: Event | null = null;
  private map: OfficeMap | null = null;
  private route: Point[] = [];
  private duckAngle = 0;
  private quackT = 0;
  private clockIn = 0;
  private seen = new Set<string>();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private previewPending: Spectacle | null;
  private announced = false;
  onMoment: (kind: Spectacle, spot: Point) => void = () => {};

  constructor(
    private readonly scene: OfficeScene,
    private readonly chars: CharacterManager,
    private readonly model: OfficeModel,
    private readonly effects: Effects,
    preview: Spectacle | null = null,
  ) {
    this.previewPending = preview;
    for (const s of [this.duck, this.duckPlaque, this.throne, this.carpet, ...this.guards])
      s.label = "actor";
    for (const s of [
      this.duck,
      this.duckPlaque,
      this.throne,
      ...this.guards,
      this.ufo,
      this.disco,
      this.quack,
      this.title,
    ])
      s.anchor.set(0.5, 1);
    this.carpet.anchor.set(0.5, 0);
    scene.objects.addChild(this.duck, this.duckPlaque, this.throne, ...this.guards);
    scene.decals.addChild(this.carpet);
    this.actors.sortableChildren = true;
    this.air.eventMode = "none";
    this.air.addChild(this.lights, this.actors, this.ufo, this.disco, this.title, this.quack);
    scene.fx.addChild(this.air);
    this.ufo.visible = this.title.visible = this.quack.visible = false;
    this.quack.scale.set(3.5);
    this.layout();
  }

  /** Must run before the ordinary simulation, including when the world clock is frozen. */
  beforeFrame(): void {
    for (const [sprite, visible] of this.hidden) if (!sprite.destroyed) sprite.visible = visible;
    this.hidden.clear();
  }

  private layout(): void {
    if (this.map === this.scene.map) return;
    this.map = this.scene.map;
    this.route = congaRoute(this.map);
    // Actors labelled "actor" survive OfficeScene.rebuild, but their layout follows growth.
    const garden = this.map.areas.find((a) => a.name === "garden")!;
    this.duck.position.set((garden.x + 7) * TILE, (garden.y + garden.h - 1) * TILE);
    this.duck.zIndex = this.duck.y;
    this.duckPlaque.position.set(this.duck.x, this.duck.y + 12);
    this.duckPlaque.zIndex = this.duck.y + 1;
    const seat = { x: (HEAD_DESK.x + 1) * TILE + 8, y: HEAD_DESK.y * TILE - 3 };
    this.throne.position.set(seat.x, seat.y + 22);
    this.throne.zIndex = seat.y - 1;
    this.carpet.position.set(seat.x, seat.y + 6);
    this.guards.forEach((s, i) => {
      s.position.set(seat.x + (i ? 51 : -51), seat.y + 69);
      s.zIndex = s.y;
    });
    if (this.event) this.finish(); // don't continue a stale route/landing through new geometry
  }

  private eligible(c: SessionCharacter): boolean {
    const s = this.model.sessions.get(c.sessionId);
    return (
      this.chars.chars.get(c.sessionId) === c &&
      !c.removed &&
      !c.sprite.destroyed &&
      !!s &&
      canJoinSpectacle(s, FIRE_AT) &&
      !c.evac &&
      !["queued", "zapped", "waving", "leaving", "carried"].includes(c.mode)
    );
  }

  trigger(kind: Spectacle, age = 0): boolean {
    if (this.event || !Number.isFinite(age) || age < 0 || age >= SPECTACLE_SECONDS[kind])
      return false;
    const all = [...this.chars.chars.values()]
      .filter((c) => this.eligible(c) && c.sprite.visible)
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
      .slice(0, MAX_ACTORS);
    if (!all.length) return false;
    if (kind === "conga" && !this.route.length) return false;
    let event: Event = { kind, age, actors: all, landed: false };
    if (kind === "ufo") {
      const idle = all.find(
        (c) => this.model.sessions.get(c.sessionId)?.activity === "idle" && !c.rally,
      );
      if (!idle) return false;
      const landing = ufoLanding(this.scene.map, idle);
      if (!landing) return false;
      event = { kind, age, actors: [idle], from: { x: idle.x, y: idle.y }, landing, landed: false };
    }
    this.event = event;
    this.title.texture = textBubbleTexture(
      kind === "conga"
        ? "ALL ABOARD THE CHAIR TRAIN!"
        : kind === "ufo"
          ? "UNSCHEDULED PERFORMANCE REVIEW"
          : "EMERGENCY DISCO - DROP EVERYTHING!",
    );
    this.title.scale.set(1.6);
    this.announced = false;
    return true;
  }

  private hide(c: SessionCharacter): void {
    for (const s of [
      c.sprite,
      c.bubble,
      c.marker,
      c.icon,
      c.mug,
      c.ring,
      c.flame,
      c.skel,
      c.web,
      c.splat,
    ]) {
      if (!s.destroyed && !this.hidden.has(s)) {
        this.hidden.set(s, s.visible);
        s.visible = false;
      }
    }
  }

  private proxy(c: SessionCharacter): Proxy {
    let proxy = this.proxies.get(c.sessionId);
    if (!proxy) {
      const group = new Container();
      const chair = new Sprite(this.art.chair);
      const person = new Sprite(c.sprite.texture);
      chair.anchor.set(0.5, 1);
      person.anchor.copyFrom(c.sprite.anchor);
      group.addChild(chair, person);
      this.actors.addChild(group);
      proxy = { group, chair, person, source: c, from: { x: c.x, y: c.y } };
      this.proxies.set(c.sessionId, proxy);
    }
    this.hide(c);
    return proxy;
  }

  private finish(): void {
    this.beforeFrame();
    this.event = null;
    this.ufo.visible = this.title.visible = false;
    this.lights.clear();
    for (const p of this.proxies.values()) p.group.destroy({ children: true });
    this.proxies.clear();
  }

  /** A large visual quack, deliberately silent: no surprise browser audio. */
  quackNow(): boolean {
    if (this.quackT > 0) return false;
    this.quackT = 3;
    if (!this.reduced) this.effects.confetti(this.duck.x, this.duck.y - 120, 32);
    return true;
  }

  /** Duck and hanging disco ball are direct canvas controls; works on wall screens too. */
  tap(x: number, y: number): boolean {
    if (Math.abs(x - this.duck.x) < 70 && y >= this.duck.y - 140 && y <= this.duck.y) {
      this.quackNow();
      return true;
    }
    if (Math.abs(x - this.disco.x) < 35 && y >= this.disco.y - 78 && y <= this.disco.y) {
      this.trigger("disco");
      return true;
    }
    return false;
  }

  pick(x: number, y: number): SessionCharacter | null {
    for (const p of [...this.proxies.values()].reverse())
      if (
        Math.abs(x - p.group.x) < 12 &&
        y >= p.group.y - 35 &&
        y <= p.group.y + 5 &&
        this.eligible(p.source)
      )
        return p.source;
    return null;
  }

  status() {
    return {
      active: this.event?.kind ?? null,
      age: this.event?.age ?? 0,
      participants: this.proxies.size,
      sessionIds: [...this.proxies.keys()],
      duck: { x: this.duck.x, y: this.duck.y, angle: this.duckAngle, quacking: this.quackT > 0 },
      throne: { x: this.throne.x, y: this.throne.y, guards: this.guards.length },
      reducedMotion: this.reduced,
      hiddenSprites: this.hidden.size,
      ufo: {
        x: this.ufo.x,
        y: this.ufo.y,
        target: this.event?.kind === "ufo" ? (this.event.actors[0]?.sessionId ?? null) : null,
      },
      landing: this.event?.landing ?? null,
    };
  }

  update(dt: number, time: number): void {
    this.layout();
    const worker = hardestWorker([...this.model.sessions.values()]);
    const target = worker ? this.chars.chars.get(worker.sessionId) : undefined;
    const angle = target ? Math.atan2(target.y - this.duck.y, target.x - this.duck.x) : 0;
    this.duckAngle = this.reduced ? angle : angleToward(this.duckAngle, angle, dt);
    // Slow rubbery turn; the front view bridges the two side profiles.
    const side = Math.cos(this.duckAngle);
    this.duck.texture = Math.abs(side) < 0.3 ? this.art.duckFront : this.art.duck;
    this.duck.scale.x =
      Math.abs(side) < 0.3 ? 1 : (side < 0 ? -1 : 1) * (0.85 + Math.abs(side) * 0.15);
    this.guards.forEach((s, i) => {
      s.texture = this.art.guards[!this.reduced && (time + i * 2) % 7 > 6.8 ? 1 : 0]!;
    });
    this.quackT = Math.max(0, this.quackT - dt);
    this.quack.visible = this.quackT > 0;
    this.quack.position.set(
      this.duck.x,
      this.duck.y - 145 - (this.reduced ? 0 : (3 - this.quackT) * 7),
    );
    this.disco.position.set(32 * TILE, this.event?.kind === "disco" ? 145 : 78);
    this.disco.scale.set(this.event?.kind === "disco" ? 1.5 : 0.65);

    if (this.previewPending && this.chars.chars.size && this.trigger(this.previewPending))
      this.previewPending = null;
    this.clockIn -= dt;
    if (this.clockIn <= 0) {
      this.clockIn = 0.5;
      const now = new Date(Date.now() + this.model.clockSkew);
      const hour =
        localHour(this.model.timezone, now) +
        (now.getSeconds() + now.getMilliseconds() / 1000) / 3600;
      const scheduled = scheduledSpectacle(hour);
      if (scheduled) {
        const key = `${localDayKey(this.model.timezone, now)}:${Math.floor(hour * 60)}:${scheduled.kind}`;
        if (!this.seen.has(key) && (this.event || this.trigger(scheduled.kind, scheduled.age))) {
          this.seen.add(key);
        }
      }
      if (this.seen.size > 12) this.seen.delete(this.seen.values().next().value!);
    }
    const event = this.event;
    this.lights.clear();
    if (!event) return;
    event.age += dt;
    event.actors = event.actors.filter((c) => this.eligible(c));
    if (event.age >= SPECTACLE_SECONDS[event.kind] || !event.actors.length) {
      this.finish();
      return;
    }
    if (!this.announced) {
      this.announced = true;
      this.onMoment(
        event.kind,
        event.kind === "ufo" ? event.from! : { x: 20 * TILE, y: 14 * TILE },
      );
    }
    this.title.visible = true;
    this.title.position.set(
      event.kind === "ufo" ? event.from!.x : 22 * TILE,
      event.kind === "ufo" ? event.from!.y - 150 : 135,
    );
    if (event.kind === "ufo") this.abduct(event);
    else this.ensemble(event);
    const keep = new Set(event.actors.map((c) => c.sessionId));
    for (const [id, p] of this.proxies)
      if (!keep.has(id)) {
        p.group.destroy({ children: true });
        this.proxies.delete(id);
      }
  }

  private ensemble(event: Event): void {
    const conga = event.kind === "conga";
    const length = routeLength(this.route);
    const spacing = Math.min(27, length / Math.max(1, event.actors.length));
    event.actors.forEach((c, i) => {
      const p = this.proxy(c);
      p.chair.visible = conga;
      p.chair.position.set(0, 4);
      p.person.position.set(0, conga ? -4 : 0);
      let x = c.x,
        y = c.y;
      if (conga) {
        const pose = routePose(this.route, (this.reduced ? 160 : event.age * 70) - i * spacing);
        const enter = this.reduced ? 1 : Math.min(1, event.age / 3);
        x = p.from.x + (pose.x - p.from.x) * enter;
        y = p.from.y + (pose.y - p.from.y) * enter;
        p.person.texture = c.sheet.anims.sitFront[0]!;
      } else {
        p.person.texture =
          c.sheet.anims.wave[this.reduced ? 0 : Math.floor(event.age * 2 + i) % 2]!;
        if (!this.reduced) {
          y -= Math.max(0, Math.sin(event.age * 4 + i * 0.7)) * 4;
          p.person.rotation = Math.sin(event.age * 2 + i) * 0.12;
        }
      }
      p.group.position.set(Math.round(x), Math.round(y));
      p.group.zIndex = y;
    });
    if (!conga) {
      const x = this.disco.x,
        y = this.disco.y - 36;
      // Three slow pastel spotlights, no flashing/strobe. Reduced motion uses a static wash.
      for (let i = 0; i < 3; i++) {
        const angle = (this.reduced ? 0 : Math.sin(event.age * 0.35 + i) * 0.8) + i * 1.8;
        const tx = x + Math.cos(angle) * 370,
          ty = 320 + Math.sin(angle) * 160;
        this.lights
          .poly([x, y, tx - 75, ty, tx + 75, ty])
          .fill({ color: hexNum([C.pink, C.cyan, C.lemon][i]!), alpha: 0.13 });
        this.lights
          .ellipse(tx, ty, 80, 18)
          .fill({ color: hexNum([C.pink, C.cyan, C.lemon][i]!), alpha: 0.15 });
      }
    }
  }

  private abduct(event: Event): void {
    const c = event.actors[0]!;
    if (this.model.sessions.get(c.sessionId)?.activity !== "idle" || c.rally) {
      this.finish();
      return;
    }
    const pose = abductionPose(event.age, event.from!, event.landing!);
    const p = this.proxy(c);
    p.chair.visible = false;
    p.person.texture = c.sheet.anims.wave[0]!;
    const lift = this.reduced ? 0 : pose.lift;
    p.group.position.set(Math.round(pose.x), Math.round(pose.y - lift));
    if (this.reduced) p.group.position.set(event.from!.x, event.from!.y);
    p.group.zIndex = pose.y;
    this.ufo.visible = true;
    this.ufo.position.set(
      Math.round(pose.x + (1 - pose.arrival) * 300 + pose.departure * 350),
      Math.round(pose.y - 100 - pose.departure * 120),
    );
    if (this.reduced) this.ufo.position.set(event.from!.x, event.from!.y - 100);
    this.ufo.alpha = 1 - pose.departure;
    this.title.position.set(this.ufo.x, this.ufo.y - 78);
    if (event.age >= 3 && event.age < 15) {
      const beam = this.reduced ? event.from! : pose;
      this.lights
        .poly([
          beam.x - 21,
          beam.y - 104,
          beam.x + 21,
          beam.y - 104,
          beam.x + 33,
          beam.y + 3,
          beam.x - 33,
          beam.y + 3,
        ])
        .fill({ color: 0xa8ff9e, alpha: 0.22 });
    }
    if (pose.landed && !event.landed) {
      event.landed = true;
      // Reduced motion shows the alien encounter in place; no involuntary travel.
      if (!this.reduced) this.chars.landIdle(c, event.landing!);
    }
    if (event.landed) {
      p.group.visible = false;
      this.beforeFrame();
    }
  }
}
