import { Container, Sprite, Texture } from "pixi.js";
import {
  paintAirliner,
  paintAirport,
  paintArs,
  paintBurj,
  paintSagrada,
} from "../art/landmarks.ts";
import { PixelCanvas } from "../art/pixel.ts";
import { artSeason } from "../art/seasons.ts";
import { AIRPORT_X, flightAt, LANDMARKS, NORTH_TOP } from "./landmarkLayout.ts";

let art: { canvas: HTMLCanvasElement; texture: Texture }[] | undefined;
let planeTexture: Texture | undefined;
let shadowTexture: Texture | undefined;

/** Static art is uploaded once, reused across map growth; flight actors are rebuilt safely. */
export class LandmarkDistrict {
  readonly ground = new Container();
  readonly minimap: HTMLCanvasElement;
  readonly aircraft = new Container();
  private parkTexture: Texture;
  private plane: Sprite;
  private shadow: Sprite;

  constructor(terrain: HTMLCanvasElement) {
    art ??= [paintSagrada, paintBurj, paintArs, paintAirport].map((paint) => {
      const canvas = paint().toCanvas();
      const texture = Texture.from(canvas);
      texture.source.scaleMode = "nearest";
      return { canvas, texture };
    });
    this.minimap = document.createElement("canvas");
    this.minimap.width = terrain.width;
    this.minimap.height = terrain.height - NORTH_TOP;
    const ctx = this.minimap.getContext("2d")!;
    // A paved sculpture park above the office; existing tile coordinates never move.
    const park = new PixelCanvas(80 * 16, -NORTH_TOP);
    const winter = artSeason() === "winter";
    park.rect(0, 0, park.width, park.height, winter ? "#c0cbdc" : "#718c77");
    for (let y = 0; y < park.height; y += 16)
      for (let x = 0; x < park.width; x += 16)
        park.rect(x + 1, y + 1, 14, 14, winter ? "#f1f6fa" : y > 448 ? "#b5b5ac" : "#849882");
    const parkCanvas = park.toCanvas();
    this.parkTexture = Texture.from(parkCanvas);
    this.parkTexture.source.scaleMode = "nearest";
    const parkSprite = new Sprite(this.parkTexture);
    parkSprite.position.set(0, NORTH_TOP);
    this.ground.addChild(parkSprite);
    ctx.drawImage(parkCanvas, 0, 0);
    ctx.drawImage(terrain, 0, -NORTH_TOP);
    for (let i = 0; i < art.length; i++) {
      const a = art[i]!;
      const x = LANDMARKS[i]!.x * 16;
      const sprite = new Sprite(a.texture);
      const y = i < 3 ? NORTH_TOP : 0;
      sprite.position.set(x, y);
      this.ground.addChild(sprite);
      ctx.drawImage(a.canvas, x, y - NORTH_TOP);
    }
    if (!planeTexture) {
      planeTexture = Texture.from(paintAirliner().toCanvas());
      planeTexture.source.scaleMode = "nearest";
      const shadow = new PixelCanvas(69, 53);
      const plane = paintAirliner();
      for (let y = 0; y < 53; y++)
        for (let x = 0; x < 69; x++) if (plane.get(x, y) >>> 24) shadow.set(x, y, "#182b3c");
      shadowTexture = Texture.from(shadow.toCanvas());
      shadowTexture.source.scaleMode = "nearest";
    }
    this.plane = new Sprite(planeTexture);
    this.shadow = new Sprite(shadowTexture!);
    this.plane.anchor.set(0.5);
    this.shadow.anchor.set(0.5);
    this.aircraft.addChild(this.shadow, this.plane);
    this.aircraft.zIndex = 100_000;
    this.update(0);
  }

  destroy() {
    this.ground.destroy({ children: true });
    this.aircraft.destroy({ children: true });
    this.parkTexture.destroy(true);
  }

  update(time: number) {
    const f = flightAt(time);
    const x = AIRPORT_X * 16 + f.x;
    this.plane.visible = this.shadow.visible = f.visible;
    this.plane.position.set(Math.round(x), Math.round(f.y - f.altitude));
    this.shadow.position.set(Math.round(x + f.altitude * 0.3), Math.round(f.y + 5));
    this.plane.rotation = this.shadow.rotation = f.heading;
    this.plane.scale.set(1 + f.altitude / 170);
    this.shadow.alpha = 0.25 - f.altitude / 400;
  }
}
