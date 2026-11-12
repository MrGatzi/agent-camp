/** Hand-painted, native-resolution architecture: no vectors, smoothing or downloaded assets. */
import { drawText } from "./font.ts";
import { PixelCanvas } from "./pixel.ts";

const INK = "#263341";
const STONE = "#cfac78";
const LIGHT = "#f5ddb0";
const SHADE = "#96724f";

function triangle(p: PixelCanvas, cx: number, y: number, w: number, h: number, color: string) {
  for (let j = 0; j < h; j++) {
    const half = Math.floor((j * w) / h / 2);
    p.hline(cx - half, y + j, half * 2 + 1, color);
  }
}
function arch(p: PixelCanvas, x: number, y: number, w: number, h: number) {
  triangle(p, x + Math.floor(w / 2), y, w, Math.floor(w / 2), LIGHT);
  p.rect(x, y + Math.floor(w / 2), w, h - Math.floor(w / 2), LIGHT);
  triangle(p, x + Math.floor(w / 2), y + 3, w - 6, Math.floor(w / 2), INK);
  p.rect(x + 3, y + Math.floor(w / 2), w - 6, h - Math.floor(w / 2), INK);
  p.vline(x + Math.floor(w / 2), y + 8, h - 8, STONE);
}
function plaque(p: PixelCanvas, title: string, subtitle: string, width: number) {
  p.rect(8, 430, width - 16, 31, INK);
  p.hline(10, 430, width - 20, "#e8c581");
  drawText(p, 17, 437, title, "#fff0ce");
  drawText(p, 17, 449, subtitle, "#9bc3ce");
}
function steps(p: PixelCanvas, x: number, y: number, w: number) {
  for (let i = 0; i < 5; i++) {
    p.rect(x - i * 3, y + i * 3, w + i * 6, 3, i % 2 ? "#a49c8d" : "#e1d6bd");
  }
}
function spire(p: PixelCanvas, x: number, top: number, base: number, w: number, fruit = false) {
  const cx = x + Math.floor(w / 2);
  triangle(p, cx, top + 10, w, 44, STONE);
  p.rect(x, top + 54, w, base - top - 54, STONE);
  p.rect(x + w - 6, top + 54, 6, base - top - 54, SHADE);
  p.vline(x + 3, top + 49, base - top - 49, LIGHT);
  for (let y = top + 60; y < base - 8; y += 13) {
    p.rect(x + 7, y, Math.max(3, w - 16), 7, "#5b5141");
    p.hline(x + 6, y + 8, w - 12, LIGHT);
    p.hline(x, y + 11, w, SHADE);
  }
  p.rect(cx - 3, top, 6, 16, "#d8b968");
  p.rect(cx - 8, top + 4, 16, 5, LIGHT);
  if (fruit) {
    p.ellipse(cx - 6, top - 5, 12, 12, "#91a955");
    p.ellipse(cx - 4, top - 10, 8, 10, "#eab34e");
    p.rect(cx - 2, top - 8, 3, 3, "#fff1a5");
  }
}
export function paintSagrada(): PixelCanvas {
  const p = new PixelCanvas(288, 464);
  p.ellipse(12, 390, 270, 30, "#34414a", 75);
  // Rear apse and central crossing tower, behind the four Nativity bell towers.
  spire(p, 126, 30, 292, 38);
  spire(p, 94, 93, 310, 23, true);
  spire(p, 177, 97, 310, 23, true);
  p.rect(37, 266, 219, 126, SHADE);
  triangle(p, 146, 166, 198, 116, "#a68b63");
  for (let i = 0; i < 11; i++) {
    const x = 48 + i * 18;
    spire(p, x, 221 + Math.abs(5 - i) * 5, 350, 12, true);
  }
  p.rect(38, 299, 216, 94, STONE);
  for (let y = 301; y < 390; y += 7) {
    p.hline(40, y, 212, "#b48d5e");
    for (let x = 42 + (y % 2) * 6; x < 250; x += 13) p.vline(x, y, 6, "#e2c494");
  }
  spire(p, 40, 137, 380, 30);
  spire(p, 78, 107, 382, 32);
  spire(p, 181, 107, 382, 32);
  spire(p, 221, 137, 380, 30);
  // Sculpted portals, gables and stained-glass rose window.
  triangle(p, 145, 248, 100, 92, LIGHT);
  triangle(p, 145, 260, 82, 77, SHADE);
  p.ellipse(127, 286, 36, 36, LIGHT);
  p.ellipse(131, 290, 28, 28, INK);
  const glass = ["#cc744c", "#e3bb59", "#69a19b", "#7196b9", "#b18aa9"];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    p.rect(
      143 + Math.round(Math.cos(a) * 10),
      302 + Math.round(Math.sin(a) * 10),
      3,
      3,
      glass[i % 5]!,
    );
  }
  p.rect(143, 294, 3, 22, LIGHT);
  p.rect(134, 303, 22, 3, LIGHT);
  arch(p, 119, 331, 52, 63);
  arch(p, 73, 350, 31, 44);
  arch(p, 187, 350, 31, 44);
  for (const x of [110, 174]) {
    p.rect(x, 337, 6, 55, LIGHT);
    p.ellipse(x - 2, 339, 10, 9, STONE);
    p.rect(x - 2, 350, 10, 17, SHADE);
    p.rect(x, 349, 4, 13, LIGHT);
  }
  for (let i = 0; i < 70; i++) {
    const x = 112 + ((i * 19) % 66);
    const y = 275 + ((i * 31) % 113);
    if (x < 125 || x > 166) p.rect(x, y, 2, 3, i % 2 ? LIGHT : SHADE);
  }
  steps(p, 35, 395, 222);
  plaque(p, "SAGRADA FAMILIA", "BARCELONA / CATALUNYA", 288);
  return p;
}

export function paintBurj(): PixelCanvas {
  const p = new PixelCanvas(272, 464);
  // The stepped, spiralling setbacks and silver vertical fins are its silhouette.
  p.ellipse(12, 375, 248, 44, "#40576b", 80);
  p.ellipse(8, 379, 256, 31, "#9bd5d5");
  p.ellipse(22, 384, 229, 21, "#498fa6");
  for (let x = 35; x < 240; x += 18) p.hline(x, 393 + (x % 3), 10, "#b8eff0");
  const tiers = [
    [29, 326, 203, 65],
    [44, 278, 174, 103],
    [60, 234, 142, 143],
    [74, 190, 114, 183],
    [88, 148, 88, 224],
    [103, 109, 62, 262],
    [115, 77, 41, 294],
    [124, 52, 25, 318],
  ];
  for (const [x, y, w, h] of tiers as [number, number, number, number][]) {
    p.rect(x, y, w, h, INK);
    p.rect(x + 2, y + 2, w - 4, h - 2, "#6c98ae");
    p.rect(x + Math.floor(w * 0.62), y + 2, Math.floor(w * 0.32), h - 2, "#416a84");
    for (let yy = y + 5; yy < y + h; yy += 5) {
      p.hline(x + 2, yy, w - 4, "#bed4dc");
      p.hline(x + 3, yy + 1, w - 6, "#527a91");
    }
    for (let xx = x + 4; xx < x + w - 2; xx += 7) p.vline(xx, y + 2, h - 3, "#d0e6e7");
    p.hline(x, y, w, "#f4f0db");
    p.hline(x + 2, y - 2, w - 4, "#99b7c5");
  }
  p.rect(132, 28, 10, 343, "#9dbfce");
  p.vline(134, 29, 342, "#e5f2eb");
  p.vline(140, 33, 337, "#54788f");
  p.rect(135, 12, 4, 27, "#e5e5da");
  p.vline(136, 2, 20, "#f7eed1");
  p.set(136, 1, "#e8816c");
  p.rect(89, 373, 99, 19, INK);
  for (let x = 94; x < 185; x += 9) p.rect(x, 375, 5, 13, "#badbdf");
  steps(p, 74, 395, 128);
  plaque(p, "BURJ KHALIFA", "DUBAI / UNITED ARAB EMIRATES", 272);
  return p;
}

function glassBlock(p: PixelCanvas, x: number, y: number, w: number, h: number, side: number) {
  p.rect(x, y, w, h, "#24374e");
  // Faceted roof and receding right wall, rasterised one scanline at a time.
  for (let j = 0; j < 20; j++) p.hline(x + j, y - j, w, j % 4 ? "#667582" : "#98a4a9");
  for (let i = 0; i < side; i++) p.vline(x + w + i, y - i, h, "#31475f");
  const colors = ["#a9dde3", "#75b9dc", "#889cdb", "#b39ad6", "#d49dcb", "#70c7d3"];
  for (let row = 0; row < Math.floor((h - 7) / 12); row++) {
    for (let col = 0; col < Math.floor((w - 5) / 13); col++) {
      const color = colors[(Math.floor(col / 3) + Math.floor(row / 3)) % colors.length]!;
      p.rect(x + 3 + col * 13, y + 4 + row * 12, 11, 10, color);
      p.hline(x + 3 + col * 13, y + 4 + row * 12, 11, "#d5e7ec");
      p.vline(x + 12 + col * 13, y + 5 + row * 12, 8, "#667eaa");
    }
  }
  for (let i = 2; i < side; i += 6) {
    for (let j = 5; j < h - 8; j += 12) p.rect(x + w + i, y - i + j, 4, 9, "#7788be");
  }
  p.hline(x, y + h - 1, w, "#b9d9e2");
}
export function paintArs(): PixelCanvas {
  const p = new PixelCanvas(304, 464);
  // Danube promenade and the characteristic linked, unequal glass volumes.
  p.rect(5, 390, 294, 29, "#437f99");
  for (let y = 395; y < 419; y += 7)
    for (let x = 12 + (y % 3) * 7; x < 290; x += 28) p.hline(x, y, 15, "#82b7c6");
  p.rect(9, 365, 285, 23, "#b9b4af");
  glassBlock(p, 177, 245, 101, 113, 16);
  glassBlock(p, 131, 286, 65, 70, 12);
  glassBlock(p, 18, 183, 145, 174, 22);
  p.rect(23, 326, 134, 30, "#263b50");
  for (let x = 26; x < 155; x += 12) {
    p.rect(x, 329, 9, 24, "#74a9bc");
    p.vline(x + 2, 330, 21, "#aecad3");
  }
  p.rect(32, 312, 122, 12, "#213d51");
  drawText(p, 37, 316, "ARS ELECTRONICA", "#ecf9ed");
  steps(p, 22, 357, 139);
  for (let x = 12; x < 295; x += 14) p.vline(x, 375, 15, "#56636b");
  p.hline(12, 375, 281, "#e5e2cf");
  plaque(p, "ARS ELECTRONICA CENTER", "LINZ / AUSTRIA / DONAU", 304);
  return p;
}

export function paintAirport(): PixelCanvas {
  const p = new PixelCanvas(608, 464);
  p.rect(8, 49, 587, 206, "#848d92");
  p.rect(8, 67, 587, 80, "#303d4a");
  p.hline(10, 70, 583, "#b6c4c8");
  p.hline(10, 144, 583, "#b6c4c8");
  for (let x = 74; x < 550; x += 37) p.rect(x, 106, 19, 3, "#eceddb");
  for (const x of [28, 554]) {
    for (let y = 79; y < 140; y += 9) p.rect(x, y, 17, 4, "#f5f0db");
  }
  drawText(p, 52, 119, "09", "#fff0cf");
  drawText(p, 533, 119, "27", "#fff0cf");
  for (let x = 15; x < 595; x += 18) {
    p.rect(x, 63, 2, 2, "#b9e9fa");
    p.rect(x, 149, 2, 2, "#b9e9fa");
  }
  p.rect(69, 147, 3, 65, "#e5c66b");
  p.rect(513, 147, 3, 65, "#e5c66b");
  p.rect(70, 209, 446, 3, "#e5c66b");
  for (const x of [245, 340, 435]) {
    p.rect(x, 226, 65, 1, "#ded8be");
    p.vline(x, 226, 27, "#ded8be");
    p.vline(x + 64, 226, 27, "#ded8be");
    drawText(p, x + 25, 242, `G${Math.floor(x / 95)}`, "#f6e8a5");
  }
  // Terminal, glass curtain wall, jet bridges, roof vents and control tower.
  p.rect(204, 277, 352, 99, INK);
  p.rect(204, 266, 352, 25, "#c7cbd0");
  p.rect(216, 270, 328, 14, "#98a6b2");
  for (let x = 215; x < 548; x += 17) {
    p.rect(x, 296, 13, 53, "#6396af");
    p.vline(x + 1, 298, 48, "#b9dae1");
    p.hline(x, 317, 13, "#cfdee0");
  }
  for (const x of [267, 362, 457]) {
    p.rect(x, 252, 12, 22, "#b5c2c8");
    p.rect(x - 7, 249, 26, 9, "#d8e2dc");
  }
  p.rect(242, 350, 276, 18, "#20384c");
  drawText(p, 254, 356, "AGENT INTERNATIONAL / DEPARTURES", "#d7f3ed");
  p.rect(99, 279, 33, 95, "#a9b3b9");
  p.rect(120, 279, 12, 95, "#728896");
  p.rect(82, 257, 67, 30, INK);
  p.rect(86, 261, 59, 18, "#91ced8");
  for (let x = 94; x < 145; x += 12) p.vline(x, 260, 20, "#43596e");
  p.rect(78, 251, 75, 7, "#dce3da");
  p.vline(113, 229, 23, "#c8d5d8");
  p.rect(107, 234, 17, 3, "#e3d9ae");
  p.rect(112, 228, 3, 3, "#e9826e");
  p.rect(19, 390, 570, 23, "#475262");
  for (let x = 26; x < 580; x += 26) p.hline(x, 401, 12, "#d9d4bd");
  plaque(p, "AGENT INTERNATIONAL AIRPORT", "ARRIVALS / TAXI / DEPARTURES", 608);
  return p;
}

/** Airliner pointing east; paired with a separate moving ground shadow. */
export function paintAirliner(): PixelCanvas {
  const p = new PixelCanvas(69, 53);
  for (let j = 0; j < 20; j++) {
    p.hline(25 - Math.floor(j / 2), 5 + j, 7 + Math.floor(j / 2), "#cbdde3");
    p.hline(25 - Math.floor(j / 2), 47 - j, 7 + Math.floor(j / 2), "#91adbf");
  }
  p.rect(8, 22, 48, 9, "#e8f1e9");
  p.ellipse(47, 22, 18, 9, "#f7f4e6");
  p.hline(11, 29, 43, "#6ea6c3");
  p.rect(5, 12, 6, 15, "#527cbb");
  p.rect(5, 27, 6, 15, "#527cbb");
  p.rect(8, 23, 9, 7, "#516fa6");
  p.rect(53, 23, 6, 3, "#2b4b68");
  for (let x = 20; x < 50; x += 5) p.rect(x, 24, 2, 2, "#385b78");
  p.rect(28, 14, 10, 4, "#f2ead8");
  p.rect(28, 36, 10, 4, "#a8bfcc");
  p.set(24, 5, "#f2847e");
  p.set(24, 47, "#87d9ad");
  return p;
}
