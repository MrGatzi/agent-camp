/**
 * Rick and Morty drop by the office. They stroll around (Morty trailing Rick), and every half
 * minute or so Rick aims his portal gun, shoots a portal open in front of them and they walk
 * through it, coming out of a second portal somewhere else in the office. While they are
 * halfway through, the part that is already through shows at the exit portal.
 */
import { seededRandom } from "@agent-office/protocol";
import { Container, Graphics, Sprite } from "pixi.js";
import { textBubbleTexture } from "../art/fun.ts";
import { C } from "../art/palette.ts";
import {
  mortySheet,
  PORTAL_R,
  portalGlowTexture,
  portalShotTexture,
  portalTexture,
  RES,
  rickSheet,
  TOON,
  type ToonSheet,
} from "../art/rickmorty.ts";
import type { Effects } from "./effects.ts";
import { type Facing, type OfficeMap, type Point, TILE } from "./map.ts";
import { findPath } from "./pathing.ts";
import {
  type Dir,
  entranceFor,
  exitFor,
  freeAt,
  indoorTile,
  LINE_UP,
  PORTAL_GAP,
} from "./portalRules.ts";

const WALK = 26;
const PORTAL_WALK = 32;
/** how far Morty trails Rick on a stroll */
const FOLLOW = 15;
/** a toon is fully through a portal once its middle is this far past it */
const HALF = 8;
/** gun muzzle relative to Rick's feet in the aim frame (facing left) */
const MUZZLE = { x: -15, y: -20 };
/** the auto-pilot camera looks at a portal at most this often, and not in the first minutes */
const NOTIFY_EVERY_S = 180;

const RICK_LINES = [
  "WUBBA LUBBA DUB DUB!",
  "*BURP*",
  "COME ON, MORTY!",
  "IN AND OUT, MORTY. 20 MINUTES.",
  "YOUR AGENTS ARE AMATEURS.",
  "I'M NOT A COMPILER, MORTY!",
  "SHIP IT, MORTY! *BURP*",
];
const MORTY_LINES = [
  "AW GEEZ, RICK!",
  "OH MAN, OH MAN...",
  "W-WHERE ARE WE NOW?",
  "RICK, I DON'T LIKE THIS!",
  "IS THIS AN OFFICE?",
];
const RICK_CLICKED = ["WHAT?! *BURP*", "HANDS OFF THE LAB COAT.", "SCIENCE, MORTY!"];
const MORTY_CLICKED = ["H-HI!", "AW GEEZ...", "I'M JUST HERE WITH RICK!"];

/** One side of a vertical line through a portal, as a world-space mask rectangle. */
function halfPlane(g: Graphics, p: Point, keep: Dir) {
  g.clear();
  g.rect(keep > 0 ? p.x : p.x - 400, p.y - 120, 400, 160).fill(0xffffff);
}

/** Going through a portal pair: `a` is the entrance (null when arriving), `b` the exit. */
type Passage = { a: Point | null; b: Point; dir: Dir; crossed: boolean };

class Toon {
  readonly sprite: Sprite;
  /** the part that is already through, shown at the exit while crossing */
  private readonly ghost: Sprite;
  private readonly before = new Graphics();
  private readonly after = new Graphics();
  x = -999;
  y = -999;
  facing: Facing = "down";
  moving = false;
  pose: "aim" | "panic" | null = null;
  passage: Passage | null = null;

  constructor(
    objects: Container,
    private readonly sheet: () => ToonSheet,
  ) {
    const s = sheet();
    const mk = () => {
      const sp = new Sprite(s.frames[0]!);
      sp.anchor.set(0.5, s.ground / s.h);
      sp.scale.set(1 / RES);
      sp.label = "actor";
      objects.addChild(sp);
      return sp;
    };
    this.sprite = mk();
    this.ghost = mk();
    this.ghost.visible = false;
    for (const g of [this.before, this.after]) {
      g.label = "actor";
      objects.addChild(g);
    }
  }

  enter(passage: Passage) {
    this.passage = passage;
    if (passage.a) halfPlane(this.before, passage.a, -passage.dir as Dir);
    halfPlane(this.after, passage.b, passage.dir);
  }

  /** Walk on through the portal; returns true once clear of the exit. */
  stepThrough(dt: number) {
    const p = this.passage;
    if (!p) return true;
    this.x += p.dir * PORTAL_WALK * dt;
    this.moving = true;
    this.facing = p.dir > 0 ? "right" : "left";
    if (!p.crossed && p.a && p.dir * (this.x - p.a.x) > HALF) {
      this.x += p.b.x - p.a.x;
      this.y = p.b.y;
      p.crossed = true;
      this.ghost.mask = null;
      this.sprite.mask = this.after;
      this.before.clear();
    }
    if (p.crossed && p.dir * (this.x - p.b.x) > HALF) {
      this.passage = null;
      return true;
    }
    return false;
  }

  walkToward(t: Point, dt: number, speed: number) {
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) {
      this.moving = false;
      return true;
    }
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.moving = true;
    this.face(dx, dy);
    return false;
  }

  face(dx: number, dy: number) {
    if (Math.abs(dx) > Math.abs(dy) * 0.8) this.facing = dx < 0 ? "left" : "right";
    else if (Math.abs(dy) > 0.3) this.facing = dy < 0 ? "up" : "down";
  }

  hit(wx: number, wy: number, h: number) {
    return Math.abs(wx - this.x) <= 6 && wy >= this.y - h && wy <= this.y + 2;
  }

  draw(time: number) {
    const s = this.sheet();
    const side = this.facing === "left" || this.facing === "right";
    let set: readonly number[];
    let fps = 7;
    if (this.pose === "aim") set = TOON.aim;
    else if (this.pose === "panic") set = TOON.panic;
    else if (this.moving)
      set = side ? TOON.walkSide : this.facing === "up" ? TOON.walkUp : TOON.walkDown;
    else {
      set = side ? TOON.standSide : this.facing === "up" ? [TOON.walkUp[1]] : TOON.idle;
      fps = 3;
    }
    const tex = s.frames[set[Math.floor(time * fps) % set.length]!]!;
    const sx = (this.facing === "right" ? -1 : 1) / RES;
    const p = this.passage;
    for (const sp of [this.sprite, this.ghost]) {
      sp.texture = tex;
      sp.scale.set(sx, 1 / RES);
    }
    this.sprite.position.set(this.x, this.y);
    this.sprite.zIndex = this.y;
    if (!p) {
      if (this.sprite.mask) {
        this.sprite.mask = null;
        this.ghost.mask = null;
        // an unused mask would render as a plain white rectangle
        this.before.clear();
        this.after.clear();
      }
      this.ghost.visible = false;
    } else if (!p.crossed && p.a) {
      this.sprite.mask = this.before;
      this.ghost.mask = this.after;
      this.ghost.visible = true;
      this.ghost.position.set(this.x + p.b.x - p.a.x, p.b.y);
      this.ghost.zIndex = p.b.y;
    } else {
      this.sprite.mask = this.after;
      this.ghost.mask = null;
      this.ghost.visible = false;
    }
  }
}

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/** An upright swirling green oval standing on the floor at (x, y). */
class Portal {
  private readonly root: Container;
  private readonly oval: Container;
  private readonly disc: Sprite;
  private readonly glow: Sprite;
  /** 0 = shut, 1 = fully open */
  private p = 0;
  private opening = true;

  constructor(
    objects: Container,
    readonly x: number,
    readonly y: number,
  ) {
    this.root = new Container();
    this.oval = new Container();
    this.root.label = "actor";
    this.root.position.set(x, y);
    // just behind whoever stands on the same row, so they walk "into" it
    this.root.zIndex = y - 0.5;
    this.glow = new Sprite(portalGlowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.oval.position.set(0, -PORTAL_R - 1);
    this.disc = new Sprite(portalTexture());
    this.disc.anchor.set(0.5);
    this.disc.scale.set(1 / RES);
    this.oval.addChild(this.disc);
    this.root.addChild(this.glow, this.oval);
    objects.addChild(this.root);
    this.apply();
  }

  close() {
    this.opening = false;
  }

  get open() {
    return this.opening && this.p >= 1;
  }

  get gone() {
    return !this.opening && this.p <= 0;
  }

  private apply() {
    const s = this.opening ? easeOutBack(this.p) : this.p * this.p;
    this.oval.scale.set(0.5 * s, s);
    this.oval.visible = s > 0.01;
    this.glow.alpha = Math.min(1, this.p * 1.4);
    this.glow.scale.set((0.6 + 0.4 * s) / RES);
  }

  update(dt: number) {
    this.p = Math.max(0, Math.min(1, this.p + (this.opening ? dt / 0.4 : -dt / 0.3)));
    this.disc.rotation -= dt * 5;
    this.glow.alpha *= 0.85 + 0.15 * Math.sin(this.disc.rotation * 3);
    this.apply();
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}

type Shot = { sprite: Sprite; from: Point; to: Point; t: number; onHit: () => void };

type Hop = {
  dir: Dir;
  a: Point;
  b: Point;
  t: number;
  shot: boolean;
  entrance: Portal | null;
  exit: Portal | null;
  /** Rick / Morty have started walking through */
  rickGo: boolean;
  mortyGo: boolean;
  rickDone: boolean;
  mortyDone: boolean;
};

type Arrival = {
  b: Point;
  dir: Dir;
  portal: Portal;
  t: number;
  rickDone: boolean;
  mortyDone: boolean;
};

export class PortalDuo {
  private readonly rick: Toon;
  private readonly morty: Toon;
  private rand = seededRandom("wubba-lubba");
  private mode: "away" | "arrive" | "stand" | "walk" | "hop" = "away";
  private path: Point[] = [];
  private trail: Point[] = [];
  private timer = 3;
  private hopIn = 12;
  private hop: Hop | null = null;
  private arrival: Arrival | null = null;
  private portals: Portal[] = [];
  private shots: Shot[] = [];
  private talkCooldown = 0;
  /** 0, not -Infinity: no camera visit in the first minutes after a (kiosk) reload */
  private lastNotify = 0;
  private clock = 0;
  /** mean seconds between portal hops (shorter in the party demo) */
  hopEvery = 30;
  /**
   * A portal opened at (x, y): the auto-pilot camera may come and look (rate-limited here; the
   * camera itself lets real agent events win). Returns whether the camera came.
   */
  onPortal: (x: number, y: number) => boolean = () => false;

  constructor(
    private readonly objects: Container,
    private readonly fx: Container,
    private map: OfficeMap,
    private readonly effects: Effects,
  ) {
    this.rick = new Toon(objects, rickSheet);
    this.morty = new Toon(objects, mortySheet);
  }

  setMap(map: OfficeMap) {
    this.map = map;
    if (this.mode === "walk") {
      this.path = [];
      this.mode = "stand";
      this.timer = 1;
    }
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)]!;
  }

  private say(who: Toon, text: string) {
    const color = who === this.rick ? C.forest : C.navy;
    const h = who === this.rick ? 38 : 30;
    this.effects.floater(textBubbleTexture(text, color), who.x, who.y - h, 2.8, 8);
  }

  /** Offer the auto-pilot camera a look; it only counts when the camera came. */
  private notify(x: number, y: number) {
    if (this.clock - this.lastNotify < NOTIFY_EVERY_S) return;
    if (this.onPortal(x, y)) this.lastNotify = this.clock;
  }

  // ---- arriving -----------------------------------------------------------------------------

  private arrive() {
    const dir: Dir = this.rand() < 0.5 ? 1 : -1;
    const b = exitFor(this.map, null, dir, this.rand);
    if (!b) {
      this.timer = 10;
      return;
    }
    this.mode = "arrive";
    const portal = new Portal(this.objects, b.x, b.y);
    this.portals.push(portal);
    this.arrival = { b, dir, portal, t: 0, rickDone: false, mortyDone: false };
    for (const [toon, back] of [
      [this.rick, HALF],
      [this.morty, HALF + LINE_UP + 4],
    ] as const) {
      toon.x = b.x - dir * back;
      toon.y = b.y;
      toon.pose = null;
      toon.enter({ a: null, b, dir, crossed: true });
    }
    this.notify(b.x, b.y - 16);
  }

  private stepArrival(dt: number) {
    const a = this.arrival!;
    a.t += dt;
    if (a.t < 0.5) return;
    if (!a.rickDone) a.rickDone = this.rick.stepThrough(dt);
    else this.rick.moving = false;
    if (!a.mortyDone) a.mortyDone = this.morty.stepThrough(dt);
    else this.morty.moving = false;
    if (a.rickDone && !a.mortyDone && a.t > 0.5 && this.talkCooldown <= 0) {
      this.say(this.rick, this.pick(["*BURP*", "WE'RE HERE, MORTY.", "WUBBA LUBBA DUB DUB!"]));
      this.talkCooldown = 3;
    }
    if (a.rickDone && a.mortyDone) {
      a.portal.close();
      this.arrival = null;
      this.settle(2);
      if (this.rand() < 0.5)
        this.effects.after(0.6, () => this.say(this.morty, this.pick(MORTY_LINES)));
    }
  }

  // ---- strolling ----------------------------------------------------------------------------

  private settle(seconds: number) {
    this.mode = "stand";
    this.timer = seconds;
    this.rick.moving = false;
    this.rick.pose = null;
    this.morty.pose = null;
    this.trail = [
      { x: this.morty.x, y: this.morty.y },
      { x: this.rick.x, y: this.rick.y },
    ];
  }

  private stroll() {
    const cx = Math.floor(this.rick.x / TILE);
    const cy = Math.floor((this.rick.y - 2) / TILE);
    for (let tries = 0; tries < 20; tries++) {
      const tx = cx + Math.floor(this.rand() * 17) - 8;
      const ty = cy + Math.floor(this.rand() * 11) - 5;
      // stay inside the office building (no garden, street or east block)
      if (!indoorTile(this.map, tx, ty) || (tx === cx && ty === cy)) continue;
      const tiles = findPath(this.map, { x: cx, y: cy }, { x: tx, y: ty });
      if (!tiles || tiles.length > 24) continue;
      this.path = tiles.slice(1).map((t) => ({ x: t.x * TILE + 8, y: t.y * TILE + 12 }));
      this.mode = "walk";
      return;
    }
    this.timer = 3;
  }

  /** Morty walks Rick's trail, FOLLOW px behind him. */
  private follow(dt: number) {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - this.rick.x, last.y - this.rick.y) >= 1)
      this.trail.push({ x: this.rick.x, y: this.rick.y });
    if (this.trail.length > 80) this.trail.splice(0, this.trail.length - 80);
    let need = FOLLOW;
    let target = this.trail[0]!;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const p = this.trail[i]!;
      const q = this.trail[i - 1]!;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d >= need) {
        const k = need / d;
        target = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
        break;
      }
      need -= d;
    }
    const near = Math.hypot(this.morty.x - this.rick.x, this.morty.y - this.rick.y) < FOLLOW - 2;
    if (near || this.morty.walkToward(target, dt, WALK * 1.2)) {
      this.morty.moving = false;
      this.morty.face(this.rick.x - this.morty.x, this.rick.y - this.morty.y);
    }
  }

  private stepWalk(dt: number) {
    let budget = WALK * dt;
    while (budget > 0 && this.path.length) {
      const wp = this.path[0]!;
      const dx = wp.x - this.rick.x;
      const dy = wp.y - this.rick.y;
      const d = Math.hypot(dx, dy);
      this.rick.face(dx, dy);
      if (d <= budget) {
        this.rick.x = wp.x;
        this.rick.y = wp.y;
        budget -= d;
        this.path.shift();
      } else {
        this.rick.x += (dx / d) * budget;
        this.rick.y += (dy / d) * budget;
        budget = 0;
      }
    }
    this.rick.moving = true;
    if (!this.path.length) this.settle(3 + this.rand() * 6);
  }

  // ---- portal hops --------------------------------------------------------------------------

  private startHop() {
    const first: Dir =
      this.rick.facing === "left"
        ? -1
        : this.rick.facing === "right"
          ? 1
          : this.rand() < 0.5
            ? 1
            : -1;
    for (const dir of [first, -first as Dir]) {
      const a = entranceFor(this.map, this.rick, dir);
      if (!a) continue;
      const b = exitFor(this.map, a, dir, this.rand);
      if (!b) continue;
      this.hop = {
        dir,
        a,
        b,
        t: 0,
        shot: false,
        entrance: null,
        exit: null,
        rickGo: false,
        mortyGo: false,
        rickDone: false,
        mortyDone: false,
      };
      this.mode = "hop";
      this.rick.facing = dir > 0 ? "right" : "left";
      this.rick.moving = false;
      this.rick.pose = "aim";
      return true;
    }
    return false;
  }

  private stepHop(dt: number) {
    const h = this.hop!;
    const { rick, morty } = this;
    h.t += dt;
    const lineUp = { x: h.a.x - h.dir * (LINE_UP + PORTAL_GAP), y: h.a.y };
    if (!h.rickGo) {
      // Morty gets in line behind Rick while Rick aims
      if (morty.walkToward(lineUp, dt, WALK * 1.4)) morty.facing = rick.facing;
    }
    if (!h.shot && h.t >= 0.7) {
      h.shot = true;
      const from = { x: rick.x + h.dir * -MUZZLE.x, y: rick.y + MUZZLE.y };
      const to = { x: h.a.x, y: h.a.y - PORTAL_R - 1 };
      const sprite = new Sprite(portalShotTexture());
      sprite.anchor.set(0.5);
      sprite.scale.set(1 / RES);
      sprite.blendMode = "add";
      this.fx.addChild(sprite);
      this.shots.push({
        sprite,
        from,
        to,
        t: 0,
        onHit: () => {
          h.entrance = new Portal(this.objects, h.a.x, h.a.y);
          this.portals.push(h.entrance);
          if (this.rand() < 0.6) this.say(rick, this.pick(RICK_LINES));
          morty.pose = morty.moving ? null : "aim";
          this.effects.after(0.35, () => {
            h.exit = new Portal(this.objects, h.b.x, h.b.y);
            this.portals.push(h.exit);
            this.notify(h.b.x, h.b.y - 16);
          });
        },
      });
    }
    if (!h.rickGo && h.entrance?.open && h.exit?.open && h.t > 1.6) {
      h.rickGo = true;
      rick.pose = null;
      rick.enter({ a: h.a, b: h.b, dir: h.dir, crossed: false });
    }
    if (h.rickGo && !h.mortyGo && h.t > 2.1) {
      h.mortyGo = true;
      morty.pose = null;
      morty.y = h.a.y;
      if (Math.abs(morty.x - lineUp.x) > 8) morty.x = lineUp.x;
      morty.enter({ a: h.a, b: h.b, dir: h.dir, crossed: false });
    }
    if (h.rickGo && !h.rickDone) h.rickDone = rick.stepThrough(dt);
    else if (h.rickDone) rick.moving = false;
    if (h.mortyGo && !h.mortyDone) {
      const crossed = morty.passage?.crossed;
      h.mortyDone = morty.stepThrough(dt);
      if (!crossed && (morty.passage?.crossed || h.mortyDone)) {
        h.entrance?.close();
        if (this.rand() < 0.5) this.say(morty, this.pick(MORTY_LINES));
      }
    } else if (h.mortyDone) morty.moving = false;
    if (h.rickDone && h.mortyDone) {
      h.exit?.close();
      h.entrance?.close();
      this.hop = null;
      this.hopIn = this.hopEvery * (0.6 + this.rand() * 0.8);
      this.settle(2 + this.rand() * 3);
    }
  }

  where() {
    return this.mode === "away" ? null : { x: this.rick.x, y: this.rick.y, mode: this.mode };
  }

  // ---- clicks -------------------------------------------------------------------------------

  hit(wx: number, wy: number): "rick" | "morty" | null {
    if (this.mode === "away") return null;
    if (this.rick.hit(wx, wy, 36)) return "rick";
    if (this.morty.hit(wx, wy, 27)) return "morty";
    return null;
  }

  /** feet y of whoever `hit` found, for picking the front-most thing under the pointer */
  depth(who: "rick" | "morty") {
    return who === "rick" ? this.rick.y : this.morty.y;
  }

  poke(who: "rick" | "morty") {
    if (this.talkCooldown > 0) return;
    this.talkCooldown = 1.5;
    if (who === "morty") {
      this.say(this.morty, this.pick(MORTY_CLICKED));
      return;
    }
    this.say(this.rick, this.pick(RICK_CLICKED));
    // poking Rick gets you a portal sooner
    if (this.mode === "stand" || this.mode === "walk") this.hopIn = Math.min(this.hopIn, 1.5);
  }

  // ---- frame --------------------------------------------------------------------------------

  update(dt: number, time: number) {
    this.clock += dt;
    this.talkCooldown -= dt;
    switch (this.mode) {
      case "away":
        this.timer -= dt;
        if (this.timer <= 0) this.arrive();
        break;
      case "arrive":
        this.stepArrival(dt);
        break;
      case "walk":
        this.hopIn -= dt;
        this.stepWalk(dt);
        this.follow(dt);
        break;
      case "stand":
        this.hopIn -= dt;
        this.timer -= dt;
        this.follow(dt);
        if (this.hopIn <= 0 && freeAt(this.map, this.rick.x, this.rick.y)) {
          if (!this.startHop()) this.hopIn = 4;
        } else if (this.timer <= 0) {
          if (this.rand() < 0.2 && this.talkCooldown <= 0) {
            this.say(
              this.rand() < 0.6 ? this.rick : this.morty,
              this.pick(this.rand() < 0.6 ? RICK_LINES : MORTY_LINES),
            );
            this.talkCooldown = 4;
          }
          this.stroll();
        }
        break;
      case "hop":
        this.stepHop(dt);
        break;
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.t += dt / 0.25;
      const k = Math.min(1, s.t);
      s.sprite.position.set(
        s.from.x + (s.to.x - s.from.x) * k,
        s.from.y + (s.to.y - s.from.y) * k - Math.sin(k * Math.PI) * 3,
      );
      if (k >= 1) {
        s.sprite.destroy();
        this.shots.splice(i, 1);
        s.onHit();
      }
    }
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const p = this.portals[i]!;
      p.update(dt);
      if (p.gone) {
        p.destroy();
        this.portals.splice(i, 1);
      }
    }
    const away = this.mode === "away";
    this.rick.sprite.visible = !away;
    this.morty.sprite.visible = !away;
    if (!away) {
      this.rick.draw(time);
      this.morty.draw(time);
    }
  }
}
