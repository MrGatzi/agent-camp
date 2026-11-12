/**
 * Avatar magic in the office (catalog `trail` and `companion`, see magicRules.ts):
 * - a walking character drops glitter stars and/or sweets that lie on the floor and fade;
 * - now and then a companion turns up next to the character, tags along and leaves again.
 * Purely local and cosmetic: no requests, nothing about the coding session changes.
 */
import { type AvatarSpec, avatarFromSeed } from "@agent-office/protocol";
import { Graphics, Sprite, Texture } from "pixi.js";
import { type CompanionKind, companionCanvas } from "../art/companions.ts";
import { C, hexNum } from "../art/palette.ts";
import type { OfficeModel } from "../state/officeModel.ts";
import type { CharacterManager, SessionCharacter } from "./characters.ts";
import {
  CompanionClock,
  companionKinds,
  DROP_LIFE,
  type DropKind,
  dropKind,
  dropsDue,
  MAX_DROPS,
} from "./magicRules.ts";
import type { OfficeScene } from "./office.ts";

type Drop = { x: number; y: number; kind: DropKind; color: string; age: number; seed: number };
type Spark = { x: number; y: number; vx: number; vy: number; age: number };
type Pal = {
  clock: CompanionClock;
  sprite: Sprite;
  x: number;
  y: number;
  /** 0 = gone, 1 = fully here */
  fade: number;
  step: number;
};

const STAR_COLORS = [C.lemon, C.white, C.cyan, C.pink] as const;
const CANDY_COLORS = [C.red, C.pink, C.neon, C.sky, C.orange] as const;

export class MagicWorld {
  private drops: Drop[] = [];
  private sparks: Spark[] = [];
  private walked = new Map<string, { x: number; y: number; carry: number; n: number }>();
  private pals = new Map<string, Pal>();
  private textures = new Map<string, Texture>();
  /** drops on the floor; `scene.rebuild()` destroys `decals` when the office grows */
  private floor = new Graphics();
  private readonly air = new Graphics();
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private scene: OfficeScene,
    private chars: CharacterManager,
    private model: OfficeModel,
  ) {
    this.air.eventMode = "none";
    scene.fx.addChild(this.air);
    this.attachFloor();
  }

  /** (Re-)attach the floor layer, like `PartyWorld.attachFloor()`, after a rebuild. */
  private attachFloor(): void {
    if (this.floor.destroyed) this.floor = new Graphics();
    if (this.floor.parent) return;
    this.floor.eventMode = "none";
    this.scene.decals.addChild(this.floor);
  }

  private avatar(personId: string): AvatarSpec {
    return this.model.people.get(personId)?.avatar ?? avatarFromSeed(personId);
  }

  private texture(kind: CompanionKind, frame: number): Texture {
    const key = `${kind}/${frame}`;
    let t = this.textures.get(key);
    if (!t) {
      t = Texture.from(companionCanvas(kind, frame));
      this.textures.set(key, t);
    }
    return t;
  }

  /** The character a person's companions follow: their first one that is in the office. */
  private host(personId: string): SessionCharacter | undefined {
    for (const c of this.chars.chars.values())
      if (c.personId === personId && !c.removed && c.sprite.visible && c.mode !== "zapped")
        return c;
    return undefined;
  }

  update(dt: number, time: number): void {
    this.attachFloor();
    this.trails(dt);
    this.companions(dt, time);
    this.draw(time, dt);
  }

  // ---- trails -----------------------------------------------------------------------------------
  private trails(dt: number): void {
    const live = new Set<string>();
    for (const c of this.chars.chars.values()) {
      if (c.removed || !c.sprite.visible) continue;
      const trail = this.avatar(c.personId).trail;
      if (trail === "none") continue;
      live.add(c.sessionId);
      let w = this.walked.get(c.sessionId);
      if (!w) {
        w = { x: c.x, y: c.y, carry: 0, n: 0 };
        this.walked.set(c.sessionId, w);
      }
      const moved = c.mode === "walking" ? Math.hypot(c.x - w.x, c.y - w.y) : 0;
      w.x = c.x;
      w.y = c.y;
      const due = dropsDue(w.carry, moved);
      w.carry = due.carry;
      for (let i = 0; i < due.drops && this.drops.length < MAX_DROPS; i++) {
        const kind = dropKind(trail, w.n++);
        if (!kind) break;
        const seed = (w.n * 7919 + c.sessionId.length * 31) >>> 0;
        const colors = kind === "star" ? STAR_COLORS : CANDY_COLORS;
        this.drops.push({
          x: c.x + ((seed % 7) - 3),
          y: c.y - 1 + ((seed >> 3) % 3),
          kind,
          color: colors[seed % colors.length]!,
          age: 0,
          seed,
        });
      }
    }
    for (const id of this.walked.keys()) if (!live.has(id)) this.walked.delete(id);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.age += dt;
      if (d.age >= DROP_LIFE) this.drops.splice(i, 1);
    }
  }

  // ---- companions -------------------------------------------------------------------------------
  private companions(dt: number, time: number): void {
    const live = new Set<string>();
    for (const person of this.model.people.values()) {
      const kinds = companionKinds(this.avatar(person.personId).companion);
      const host = this.host(person.personId);
      for (const kind of kinds) {
        const key = `${person.personId}|${kind}`;
        if (!host) continue;
        live.add(key);
        let pal = this.pals.get(key);
        if (pal?.sprite.destroyed) {
          // destroyed under us anyway: start over instead of touching a dead sprite every frame
          this.pals.delete(key);
          pal = undefined;
        }
        if (!pal) {
          const sprite = new Sprite(this.texture(kind, 0));
          sprite.anchor.set(0.5, 1);
          sprite.eventMode = "none";
          // "actor": `scene.rebuild()` keeps these in `objects` when the office grows
          sprite.label = "actor";
          (kind === "eye" ? this.scene.fx : this.scene.objects).addChild(sprite);
          pal = { clock: new CompanionClock(key), sprite, x: host.x, y: host.y, fade: 0, step: 0 };
          this.pals.set(key, pal);
        }
        const change = pal.clock.update(dt);
        const [tx, ty] = this.target(kind, host, time);
        if (change === "arrive") {
          pal.x = tx;
          pal.y = ty;
          this.burst(tx, ty - (kind === "eye" ? 6 : 4));
        } else if (change === "leave") this.burst(pal.x, pal.y - 4);
        pal.fade = Math.max(0, Math.min(1, pal.fade + (pal.clock.here ? dt : -dt) * 2.5));
        const k = Math.min(1, dt * (kind === "eye" ? 3 : 4));
        const vx = (tx - pal.x) * k;
        pal.x += vx;
        pal.y += (ty - pal.y) * k;
        this.pose(pal, kind, vx, dt, time);
      }
    }
    for (const [key, pal] of this.pals)
      if (!live.has(key)) {
        pal.sprite.destroy();
        this.pals.delete(key);
      }
  }

  /** Where a companion wants to be: the eye floats beside the head, the pig trots behind. */
  private target(kind: CompanionKind, c: SessionCharacter, time: number): [number, number] {
    if (kind === "eye") {
      const bob = this.reducedMotion ? 0 : Math.sin(time * 2.2) * 2;
      return [c.x - 15, c.y - 22 + bob];
    }
    const behind = c.facing === "left" ? 13 : -13;
    return [c.x + behind, c.y + 1];
  }

  private pose(pal: Pal, kind: CompanionKind, vx: number, dt: number, time: number): void {
    const s = pal.sprite;
    s.visible = pal.fade > 0;
    s.alpha = pal.fade;
    s.position.set(Math.round(pal.x), Math.round(pal.y));
    if (kind === "eye") {
      // blink for a moment every few seconds
      const blink = !this.reducedMotion && time % 4.3 < 0.15;
      s.texture = this.texture("eye", blink ? 1 : 0);
      s.zIndex = 0;
      return;
    }
    // the pig trots while it catches up and looks where it is going (drawn facing left)
    if (Math.abs(vx) > 0.05) {
      pal.step += dt;
      s.scale.x = vx > 0 ? -1 : 1;
    }
    const frame = !this.reducedMotion && Math.abs(vx) > 0.05 ? Math.floor(pal.step * 8) % 2 : 0;
    s.texture = this.texture("pig", frame);
    s.zIndex = pal.y - 1;
  }

  private burst(x: number, y: number): void {
    const n = this.reducedMotion ? 3 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = this.reducedMotion ? 0 : 14;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, age: 0 });
    }
  }

  // ---- paint ------------------------------------------------------------------------------------
  private draw(time: number, dt: number): void {
    this.floor.clear();
    for (const d of this.drops) {
      const alpha = Math.min(1, (DROP_LIFE - d.age) * 1.5);
      const x = Math.round(d.x);
      const y = Math.round(d.y);
      if (d.kind === "star") {
        // twinkle: the cross grows and shrinks a little
        const big = this.reducedMotion || Math.sin(time * 9 + d.seed) > -0.2;
        const fill = { color: hexNum(d.color), alpha };
        if (big)
          this.floor
            .rect(x - 1, y, 3, 1)
            .rect(x, y - 1, 1, 3)
            .fill(fill);
        else this.floor.rect(x, y, 1, 1).fill(fill);
      } else {
        // wrapped sweet: coloured middle, white twisted ends
        this.floor
          .rect(x - 1, y, 1, 1)
          .rect(x + 2, y, 1, 1)
          .fill({ color: hexNum(C.white), alpha });
        this.floor.rect(x, y, 2, 1).fill({ color: hexNum(d.color), alpha });
      }
    }
    this.air.clear();
    // a soft glow behind the floating eye
    for (const [key, pal] of this.pals)
      if (key.endsWith("|eye") && pal.fade > 0)
        this.air
          .circle(Math.round(pal.x), Math.round(pal.y) - 6, 9)
          .fill({ color: hexNum(C.lemon), alpha: 0.18 * pal.fade });
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.age += dt;
      if (s.age > 0.8) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const fill = { color: hexNum(C.lemon), alpha: 1 - s.age / 0.8 };
      this.air.rect(Math.round(s.x) - 1, Math.round(s.y), 3, 1).fill(fill);
      this.air.rect(Math.round(s.x), Math.round(s.y) - 1, 1, 3).fill(fill);
    }
  }

  /** Resource counts for local diagnostics. */
  counts(): { drops: number; companions: number; textures: number } {
    return { drops: this.drops.length, companions: this.pals.size, textures: this.textures.size };
  }

  destroy(): void {
    for (const pal of this.pals.values()) pal.sprite.destroy();
    this.pals.clear();
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear();
    this.drops = [];
    this.sparks = [];
    this.floor.destroy();
    this.air.destroy();
  }
}
