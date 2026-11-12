/** Arena-only actors: never move or alter the office's coding-session characters. */
import type { ArenaMatch } from "@agent-office/protocol";
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { lookFor, lookPreview } from "../art/characters.ts";
import { drawText, fitText } from "../art/font.ts";
import { C, hexNum } from "../art/palette.ts";
import { PixelCanvas } from "../art/pixel.ts";
import { arenaGrid, TILE } from "./map.ts";
import type { OfficeScene } from "./office.ts";

type Actor = {
  sprite: Sprite;
  label: Sprite;
  textures: Texture[];
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  key: string;
};
export class ArenaWorld {
  private layer = new Container();
  private paint = new Graphics();
  private actors = new Map<string, Actor>();
  private floor: Sprite | null = null;
  private floorTexture: Texture | null = null;
  private match: ArenaMatch | null = null;
  private age = 2;
  private key = "";
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(private scene: OfficeScene) {
    this.layer.eventMode = "none";
    this.paint.eventMode = "none";
    scene.fx.addChild(this.layer);
    this.layer.addChild(this.paint);
  }
  setState(match: ArenaMatch | null): void {
    const key = match ? `${match.id}:${match.turn}` : "";
    if (key !== this.key) {
      this.age = this.key && match?.id === this.match?.id ? 0 : 2;
      this.key = key;
    }
    this.match = match;
    const present = new Set(match?.fighters.map((f) => f.personId) ?? []);
    for (const [id, a] of this.actors)
      if (!present.has(id)) {
        a.sprite.destroy();
        a.label.destroy();
        for (const t of a.textures) t.destroy(true);
        this.actors.delete(id);
      }
    for (const f of match?.fighters ?? []) {
      const appearance = JSON.stringify([f.avatar, f.name]);
      let a = this.actors.get(f.personId);
      if (a && a.key !== appearance) {
        a.sprite.destroy();
        a.label.destroy();
        for (const t of a.textures) t.destroy(true);
        this.actors.delete(f.personId);
        a = undefined;
      }
      if (!a) {
        const look = lookFor(f.avatar, "unknown", null);
        const textures = [0, 2, 3, 4, 5, 26].map((frame) =>
          Texture.from(lookPreview(look, frame, 1)),
        );
        const sprite = new Sprite(textures[0]);
        sprite.anchor.set(0.5, 1);
        const name = fitText(f.name.toUpperCase(), 44);
        const plate = new PixelCanvas(Math.max(16, name.length * 4 + 4), 8);
        plate.rect(0, 0, plate.width, plate.height, C.night);
        drawText(plate, 2, 1, name, C.cream);
        const labelTexture = Texture.from(plate.toCanvas());
        const label = new Sprite(labelTexture);
        label.anchor.set(0.5, 1);
        textures.push(labelTexture);
        this.layer.addChild(sprite, label);
        a = {
          sprite,
          label,
          textures,
          x: f.x,
          y: f.y,
          fromX: f.x,
          fromY: f.y,
          toX: f.x,
          toY: f.y,
          key: appearance,
        };
        this.actors.set(f.personId, a);
      }
      if (a.toX !== f.x || a.toY !== f.y) {
        a.fromX = a.x;
        a.fromY = a.y;
        a.toX = f.x;
        a.toY = f.y;
      }
    }
  }
  private attach(): boolean {
    if (!this.scene.map.areas.some((a) => a.name === "arena")) return false;
    if (!this.floor || this.floor.destroyed) {
      this.floorTexture?.destroy(true);
      const p = new PixelCanvas(18 * TILE, 16 * TILE);
      p.rect(0, 0, p.width, p.height, C.slate);
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 12; x++)
          p.rect((x + 3) * TILE, (y + 2) * TILE, TILE - 1, TILE - 1, (x + y) % 2 ? C.navy : C.dusk);
      drawText(p, 65, 9, "PROMPT ARENA", C.lemon);
      for (const x of [8, 270])
        for (let y = 40; y < 220; y += 32) {
          if (x === 8 && y === 104) continue; // clear entrance beside the sign
          p.rect(x, y, 10, 20, C.cocoa);
        }
      drawText(p, 4, 115, "ENTER", C.cyan);
      this.floorTexture = Texture.from(p.toCanvas());
      this.floor = new Sprite(this.floorTexture);
      this.floor.eventMode = "none";
      this.scene.decals.addChild(this.floor);
    }
    const g = arenaGrid(this.scene.map);
    this.floor.position.set((g.x - 3) * TILE, (g.y - 2) * TILE);
    this.layer.position.set(g.x * TILE, g.y * TILE);
    return true;
  }
  update(dt: number): void {
    const visible = this.attach();
    this.layer.visible = visible;
    if (!visible) return;
    this.age += dt;
    this.paint.clear();
    const m = this.match;
    if (!m) return;
    for (const o of m.obstacles)
      this.paint.rect(o.x * TILE + 1, o.y * TILE + 1, 14, 14).fill(hexNum(C.grey));
    if (m.turn >= 15) {
      const margin = Math.min(5, Math.floor((m.turn - 15) / 4) + 1) * TILE;
      this.paint
        .rect(0, 0, 192, margin)
        .rect(0, 192 - margin, 192, margin)
        .rect(0, margin, margin, 192 - 2 * margin)
        .rect(192 - margin, margin, margin, 192 - 2 * margin)
        .fill({ color: hexNum(C.red), alpha: 0.22 });
    }
    for (const p of m.pickups) {
      const color = p.kind === "heal" ? C.leaf : p.kind === "shield" ? C.cyan : C.lemon;
      this.paint.rect(p.x * TILE + 5, p.y * TILE + 5, 6, 6).fill(hexNum(color));
    }
    for (const f of m.fighters) {
      const a = this.actors.get(f.personId)!;
      const t = this.reduced ? 1 : Math.min(1, this.age / 0.65);
      a.x = a.fromX + (a.toX - a.fromX) * t;
      a.y = a.fromY + (a.toY - a.fromY) * t;
      a.sprite.position.set(Math.round((a.x + 0.5) * TILE), Math.round((a.y + 1) * TILE));
      a.label.position.set(a.sprite.x, a.sprite.y - 29);
      a.label.alpha = a.sprite.alpha = f.hp > 0 ? 1 : 0.25;
      a.sprite.texture =
        a.textures[
          t < 1
            ? 1 + (Math.floor(this.age * 12) % 4)
            : f.lastAction?.kind === "attack" && this.age < 0.9
              ? 5
              : 0
        ]!;
      const x = (a.x + 0.5) * TILE,
        y = (a.y + 1) * TILE;
      this.paint.rect(x - 8, y - 28, 16, 3).fill(hexNum(C.night));
      this.paint.rect(x - 8, y - 28, (16 * f.hp) / 100, 2).fill(hexNum(C.leaf));
      if (f.shield > 0 || f.lastAction?.kind === "defend")
        this.paint.circle(x, y - 10, 10).stroke({ color: hexNum(C.cyan), width: 1, alpha: 0.6 });
      // Combat loadout is visibly separate from the avatar's cosmetic hand props.
      const color = f.loadout === "blade" ? C.white : f.loadout === "bow" ? C.orange : C.cyan;
      this.paint.rect(x + 7, y - 12, 2, f.loadout === "blade" ? 10 : 5).fill(hexNum(color));
    }
    if (!this.reduced && this.age < 1.2)
      for (const e of m.events) {
        if (e.kind !== "attack" || !e.actor || !e.target) continue;
        const a = this.actors.get(e.actor),
          b = this.actors.get(e.target);
        if (!a || !b) continue;
        const t = Math.min(1, Math.max(0, (this.age - 0.4) / 0.6));
        const x = (a.x + (b.x - a.x) * t + 0.5) * TILE,
          y = (a.y + (b.y - a.y) * t + 0.5) * TILE;
        this.paint.circle(x, y, 2).fill(hexNum(C.lemon));
        if (t === 1)
          this.paint
            .circle((b.x + 0.5) * TILE, (b.y + 0.5) * TILE, 5)
            .stroke({ color: hexNum(C.red), width: 1 });
      }
  }
  positions(): { x: number; y: number }[] {
    const g = arenaGrid(this.scene.map);
    return [...this.actors.values()].map((a) => ({
      x: (g.x + a.x + 0.5) * TILE,
      y: (g.y + a.y + 0.5) * TILE,
    }));
  }
  entranceHit(x: number, y: number): boolean {
    const a = this.scene.map.areas.find((a) => a.name === "arena");
    return (
      !!a && x >= a.x * TILE && x < (a.x + a.w) * TILE && y >= a.y * TILE && y < (a.y + a.h) * TILE
    );
  }
}
