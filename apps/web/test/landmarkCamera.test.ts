import { describe, expect, test } from "bun:test";
import type { Container } from "pixi.js";
import { Camera } from "../src/camera.ts";
import { LANDMARKS, NORTH_TOP } from "../src/world/landmarkLayout.ts";
import { buildOfficeMap } from "../src/world/map.ts";

describe("northern skyline camera bounds", () => {
  for (const screen of [
    { width: 1600, height: 950 },
    { width: 390, height: 844 },
  ]) {
    test(`all landmark facades fit at ${screen.width}px`, () => {
      const map = buildOfficeMap();
      const world = { scale: { set() {} }, position: { set() {} } } as unknown as Container;
      const cam = new Camera(
        world,
        () => screen,
        () => ({ width: map.width * 16, height: map.height * 16 - NORTH_TOP, top: NORTH_TOP }),
        () => map.areas,
        { kiosk: false, holdAuto: true },
      );
      for (const landmark of LANDMARKS) {
        cam.focusArea(landmark.name, true);
        const view = cam.viewRect();
        expect(view.x).toBeLessThanOrEqual(landmark.x * 16);
        expect(view.x + view.w).toBeGreaterThanOrEqual((landmark.x + landmark.w) * 16);
        expect(view.y).toBeLessThanOrEqual(landmark.y * 16);
        expect(view.y + view.h).toBeGreaterThanOrEqual((landmark.y + landmark.h) * 16);
        if (landmark.name !== "airport") expect(cam.y).toBeLessThan(0);
      }
      cam.zoomToFit(true);
      const view = cam.viewRect();
      expect(view.y).toBeLessThanOrEqual(NORTH_TOP);
      expect(view.y + view.h).toBeGreaterThanOrEqual(map.height * 16);
    });
  }
});
