import { describe, expect, test } from "bun:test";
import type { Container } from "pixi.js";
import { paintLinz } from "../src/art/linz.ts";
import { C } from "../src/art/palette.ts";
import { PixelCanvas, packColor } from "../src/art/pixel.ts";
import { artSeason, setArtSeason } from "../src/art/seasons.ts";
import { Camera } from "../src/camera.ts";
import {
  LINZ_SURROUND,
  type LinzRect,
  linzLayout,
  linzTreeAllowed,
  overlapsLinzRect,
} from "../src/world/linzLayout.ts";
import { buildOfficeMap, OFFICE_COLS, TILE } from "../src/world/map.ts";

const contains = (outer: LinzRect, inner: LinzRect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

describe("linzLayout", () => {
  for (const rows of [4, 5, 6]) {
    test(`four non-overlapping strips preserve office and road (${rows} pod rows)`, () => {
      const map = buildOfficeMap(rows);
      const width = map.width * TILE;
      const height = map.height * TILE;
      const l = linzLayout(width, height);
      expect(width).toBe(1280);
      expect(height).toBe(480 + (rows - 4) * 96);
      expect(l).toEqual(linzLayout(width, height));
      expect(l.strips.length).toBe(4);
      for (const [i, strip] of l.strips.entries()) {
        expect(overlapsLinzRect(strip, { x: 0, y: 0, w: width, h: height })).toBe(false);
        for (const other of l.strips.slice(i + 1))
          expect(overlapsLinzRect(strip, other)).toBe(false);
      }
      expect(l.strips.reduce((area, s) => area + s.w * s.h, 0)).toBe(
        (width + 2 * LINZ_SURROUND) * (height + 2 * LINZ_SURROUND) - width * height,
      );
      expect(l.sidewalk).toEqual({ x: -192, y: height, w: width + 384, h: 10 });
      expect(l.road).toEqual({ x: -192, y: height + 10, w: width + 384, h: 44 });
      // Existing car lanes (+30/+50) and lunch truck (+32) remain inside the street.
      for (const lane of [30, 50, 32]) {
        expect(height + lane).toBeGreaterThan(l.road.y);
        expect(height + lane).toBeLessThan(l.road.y + l.road.h);
      }
      expect(l.nightlife).toEqual(linzLayout(1280, 480).nightlife);
      for (const region of Object.values(l.nightlife)) {
        expect(contains(l.nearBank, region)).toBe(true);
        for (const obstacle of [l.river, l.lentos, l.facades, l.road, ...l.benches])
          expect(overlapsLinzRect(region, obstacle)).toBe(false);
      }
      expect(l.north).toEqual(linzLayout(1280, 480).north);
    });
  }

  test("landmarks occupy the right banks, basilica stays distant and river is continuous", () => {
    const l = linzLayout(1280, 480);
    for (const rect of [l.hill, l.basilica, l.aec, l.river, l.lentos, l.facades]) {
      expect(contains(l.north, rect)).toBe(true);
      expect(rect.y + rect.h).toBeLessThanOrEqual(-8);
    }
    expect(contains(l.hill, l.basilica)).toBe(true);
    expect(l.aec.y + l.aec.h).toBeLessThanOrEqual(l.river.y);
    expect(contains(l.nearBank, l.lentos)).toBe(true);
    expect(contains(l.nearBank, l.facades)).toBe(true);
    expect(contains(l.lentos, l.lentosOpening)).toBe(true);
    expect(l.river.x).toBe(l.north.x);
    expect(l.river.w).toBe(l.north.w);
  });

  test("night eyes and the entire wolf sprite stay inside their reserved regions", () => {
    const { eyeVegetation: eyes, wolfPromenade: wolf } = linzLayout(1280, 480).nightlife;
    expect(overlapsLinzRect(eyes, wolf)).toBe(false);
    // Runtime eyes are 7×3 at scale 2, with a centred anchor; wolf is 20×16, foot anchored.
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const eyeX = Math.round(eyes.x + 7 + fraction * (eyes.w - 14));
      const eyeY = Math.round(eyes.y + 5 + fraction * (eyes.h - 10));
      expect(contains(eyes, { x: eyeX - 7, y: eyeY - 3, w: 14, h: 6 })).toBe(true);
      const wolfX = wolf.x + 10 + fraction * (wolf.w - 20);
      const wolfY = wolf.y + wolf.h - 2;
      expect(contains(wolf, { x: wolfX - 10, y: wolfY - 16, w: 20, h: 16 })).toBe(true);
    }
  });

  for (const [name, width, height, kiosk] of [
    ["laptop", 1440, 900, false],
    ["1080p", 1920, 1080, false],
    ["wall kiosk", 1920, 1080, true],
    ["iPad kiosk", 1180, 820, true],
  ] as const) {
    test(`nightlife stays visible under the HUD at unchanged ${name} office fit`, () => {
      const map = buildOfficeMap();
      const world = { scale: { set() {} }, position: { set() {} } } as unknown as Container;
      const topInset = kiosk ? 46 : 36;
      const cam = new Camera(
        world,
        () => ({ width, height }),
        () => ({ width: map.width * TILE, height: map.height * TILE }),
        () => map.areas,
        { kiosk, holdAuto: !kiosk, topInset, view: "overview" },
      );
      cam.fitWidth = () => OFFICE_COLS * TILE;
      cam.zoomToFit(true);
      const topLeft = cam.screenToWorld(0, topInset);
      const bottomRight = cam.screenToWorld(width, height);
      const visible = {
        ...topLeft,
        w: bottomRight.x - topLeft.x,
        h: bottomRight.y - topLeft.y,
      };
      for (const region of Object.values(linzLayout(1280, 480).nightlife))
        expect(contains(visible, region)).toBe(true);
      expect(cam.zoom * TILE).toBeCloseTo((width / (OFFICE_COLS * TILE)) * TILE, 5);
    });
  }

  test("complete tree crowns/shadows cannot intrude into the riverfront", () => {
    const l = linzLayout(1280, 480);
    for (let y = -192; y < 20; y += 4)
      for (let x = -192; x < 1472; x += 20)
        for (const radius of [9, 15])
          if (linzTreeAllowed(l, x, y, radius)) expect(y - radius - 7).toBeGreaterThanOrEqual(0);
    expect(linzTreeAllowed(l, -100, 100, 15)).toBe(true);
  });
});

describe("paintLinz", () => {
  test("seasonal hill and riverfront vegetation leave river and architecture unchanged", () => {
    const previous = artSeason();
    const l = linzLayout(1280, 480);
    const sheets: PixelCanvas[] = [];
    try {
      for (const season of ["summer", "autumn", "spring", "winter"] as const) {
        setArtSeason(season);
        const pc = new PixelCanvas(1664, 192).at(192, 192);
        paintLinz(pc, l);
        sheets.push(pc);
      }
      const summer = sheets[0]!;
      const pixels = (sheet: PixelCanvas, rect: LinzRect) => {
        const result: number[] = [];
        for (let y = rect.y; y < rect.y + rect.h; y++)
          for (let x = rect.x; x < rect.x + rect.w; x++) result.push(sheet.get(x, y));
        return result;
      };
      for (const sheet of sheets.slice(1))
        for (const rect of [l.river, l.aec, l.lentos, l.facades])
          expect(pixels(sheet, rect)).toEqual(pixels(summer, rect));
      for (const sheet of sheets.slice(1, 3)) expect(sheet.data).not.toEqual(summer.data);
    } finally {
      setArtSeason(previous);
    }
  });

  test("deterministic clipped north painting never touches office, paths or southern traffic", () => {
    for (const height of [480, 576, 672]) {
      const l = linzLayout(1280, height);
      const full = new PixelCanvas(1664, height + 384).at(192, 192);
      paintLinz(full, l);
      // All landmarks and the clean setback stop before the original map origin.
      expect(full.data.subarray(192 * full.width).every((p) => p === 0)).toBe(true);
      const strip = new PixelCanvas(1664, 192).at(192, 192);
      paintLinz(strip, l);
      expect(full.data.subarray(0, 192 * full.width)).toEqual(strip.data);
      const repeat = new PixelCanvas(1664, 192).at(192, 192);
      paintLinz(repeat, l);
      expect(strip.data).toEqual(repeat.data);
      // The picture-frame void is open right through to the base, unlike a glass window.
      const o = l.lentosOpening;
      expect(strip.get(o.x, o.y + o.h - 1)).toBe(packColor(C.ink));
      expect(strip.get(o.x - 1, o.y + o.h - 1)).not.toBe(packColor(C.ink));
      // A ribbon of water reaches both strip edges, with no gaps or tree-coloured pixels.
      for (const x of [-192, 0, 400, 900, 1471])
        expect([C.slate, C.dusk, C.grey].map((c) => packColor(c))).toContain(strip.get(x, -80));
    }
  });
});
