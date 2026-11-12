/** Decorative, geographically compressed Linz riverfront; never part of the walkable map. */
export type LinzRect = { x: number; y: number; w: number; h: number };
export const LINZ_SURROUND = 192;

export function overlapsLinzRect(a: LinzRect, b: LinzRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function linzLayout(width: number, height: number) {
  const m = LINZ_SURROUND;
  const north = { x: -m, y: -m, w: width + 2 * m, h: m };
  return {
    strips: [
      north,
      { x: -m, y: height, w: width + 2 * m, h: m },
      { x: -m, y: 0, w: m, h: height },
      { x: width, y: 0, w: m, h: height },
    ],
    north,
    hill: { x: 24, y: -188, w: 246, h: 56 },
    basilica: { x: 112, y: -186, w: 46, h: 36 },
    farBank: { x: -m, y: -132, w: width + 2 * m, h: 24 },
    aec: { x: 310, y: -181, w: 122, h: 69 },
    river: { x: -m, y: -108, w: width + 2 * m, h: 50 },
    nearBank: { x: -m, y: -58, w: width + 2 * m, h: 50 },
    lentos: { x: 496, y: -53, w: 192, h: 41 },
    lentosOpening: { x: 562, y: -34, w: 78, h: 22 },
    facades: { x: 752, y: -54, w: 184, h: 46 },
    sidewalk: { x: -m, y: height, w: width + 2 * m, h: 10 },
    road: { x: -m, y: height + 10, w: width + 2 * m, h: 44 },
    // Keep night life in the shallow north band visible at the unchanged office/kiosk fit.
    // These full sprite/vegetation bounds clear the river, buildings, benches and office.
    nightlife: {
      wolfPromenade: { x: 64, y: -30, w: 128, h: 22 },
      eyeVegetation: { x: 272, y: -30, w: 132, h: 20 },
    },
    benches: [36, 212, 450, 712, 1004, 1180].map((x) => ({ x, y: -30, w: 18, h: 11 })),
    treeExclusions: [north],
  };
}

export type LinzLayout = ReturnType<typeof linzLayout>;

/** Full tree footprint, including the lifted crown and ground shadow, must clear the city. */
export function linzTreeAllowed(layout: LinzLayout, x: number, y: number, r: number): boolean {
  const footprint = { x: x - r - 1, y: y - r - 7, w: 2 * r + 2, h: 2 * r + 12 };
  return !layout.treeExclusions.some((rect) => overlapsLinzRect(footprint, rect));
}
