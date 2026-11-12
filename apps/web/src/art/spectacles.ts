/** Big, deliberately ridiculous landmarks in the same crisp software-pixel style. */
import { drawText } from "./font.ts";
import { C } from "./palette.ts";
import { PixelCanvas } from "./pixel.ts";

export function paintDuck(front = false): PixelCanvas {
  const p = new PixelCanvas(144, 148);
  p.ellipse(18, 129, 112, 14, C.pine, 90);
  // Tail, enormous pear-shaped body, layered rubber wing.
  p.ellipse(16, 71, 115, 65, C.orange);
  p.ellipse(12, 62, 116, 66, C.amber);
  p.ellipse(16, 57, 108, 62, C.lemon);
  p.ellipse(26, 69, 71, 43, "#f6c344");
  p.ellipse(29, 70, 62, 33, "#ffdb5c");
  p.ellipse(31, 72, 45, 19, "#ffe987");
  p.ellipse(16, 65, 22, 15, C.lemon);
  p.ellipse(67, 13, 62, 70, C.amber);
  p.ellipse(65, 10, 62, 64, C.lemon);
  p.ellipse(74, 15, 24, 11, "#fff4af");
  // Orange bill is huge enough to read at overview scale.
  if (front) {
    p.round(76, 51, 47, 17, C.rust);
    p.round(74, 49, 49, 13, C.orange);
    p.hline(80, 53, 34, C.peach);
    for (const x of [78, 110]) {
      p.ellipse(x, 32, 10, 14, C.ink);
      p.rect(x + 2, 34, 3, 4, C.white);
    }
  } else {
    p.round(112, 48, 30, 18, C.rust);
    p.round(109, 45, 33, 15, C.orange);
    p.hline(118, 48, 18, C.peach);
    p.ellipse(101, 29, 13, 17, C.ink);
    p.rect(103, 32, 4, 5, C.white);
    p.set(111, 42, C.bark);
  }
  return p;
}

export function paintThrone(): PixelCanvas {
  const p = new PixelCanvas(82, 94);
  // Crown + baroque gold frame, ruby inset and purple velvet.
  p.rect(15, 22, 52, 60, C.rust);
  p.round(12, 19, 58, 59, C.amber);
  p.round(18, 24, 46, 49, C.lemon);
  p.round(23, 28, 36, 41, C.wine);
  p.round(27, 31, 28, 34, C.berry);
  for (const [x, y] of [
    [21, 7],
    [36, 1],
    [51, 7],
  ] as const) {
    p.rect(x, y, 9, 20, C.amber);
    p.rect(x + 1, y + 1, 6, 16, C.lemon);
    p.round(x + 2, y + 4, 4, 5, C.red);
  }
  p.rect(21, 19, 39, 6, C.amber);
  p.hline(22, 19, 36, C.cream);
  for (let y = 37; y < 65; y += 10) {
    p.set(33, y, C.amber);
    p.set(48, y, C.amber);
  }
  p.round(7, 58, 68, 15, C.amber);
  p.hline(9, 59, 64, C.lemon);
  p.round(18, 68, 46, 13, C.wine);
  p.rect(12, 73, 9, 16, C.amber);
  p.rect(61, 73, 9, 16, C.amber);
  p.rect(10, 86, 15, 5, C.lemon);
  p.rect(57, 86, 15, 5, C.lemon);
  p.outline();
  return p;
}

export function paintCarpet(): PixelCanvas {
  const p = new PixelCanvas(92, 124);
  p.rect(3, 2, 86, 120, C.amber);
  p.rect(6, 4, 80, 116, C.wine);
  p.rect(12, 4, 68, 116, C.red);
  p.rect(16, 4, 60, 116, "#ad3654");
  for (let y = 10; y < 120; y += 12) {
    p.rect(8, y, 2, 5, C.lemon);
    p.rect(82, y, 2, 5, C.lemon);
  }
  for (let x = 3; x < 90; x += 3) {
    p.vline(x, 0, 3, C.lemon);
    p.vline(x, 121, 3, C.lemon);
  }
  drawText(p, 21, 96, "YES, YOUR", C.lemon);
  drawText(p, 17, 105, "MAJESTY.", C.lemon);
  return p;
}

export function paintGuard(blink = false): PixelCanvas {
  const p = new PixelCanvas(26, 36);
  p.ellipse(3, 30, 20, 5, C.ink, 60);
  p.round(6, 15, 14, 17, C.grey);
  p.rect(7, 10, 12, 13, C.silver);
  p.rect(7, 6, 4, 6, C.grey);
  p.rect(15, 6, 4, 6, C.grey);
  p.round(5, 6, 16, 8, C.amber);
  p.hline(7, 7, 12, C.lemon);
  p.rect(11, 2, 5, 6, C.red);
  p.rect(8, 17, 3, blink ? 1 : 3, C.ink);
  p.rect(16, 17, 3, blink ? 1 : 3, C.ink);
  p.set(13, 21, C.pink);
  p.hline(4, 23, 6, C.white);
  p.hline(17, 23, 6, C.white);
  p.rect(6, 29, 5, 4, C.cream);
  p.rect(15, 29, 5, 4, C.cream);
  p.vline(23, 5, 27, C.wood);
  p.rect(21, 3, 5, 5, C.silver);
  p.set(23, 1, C.white);
  return p;
}

export function paintSaucer(): PixelCanvas {
  const p = new PixelCanvas(148, 68);
  p.ellipse(43, 3, 62, 42, C.sky);
  p.ellipse(47, 5, 54, 34, C.cyan);
  p.ellipse(52, 7, 17, 9, C.white);
  p.ellipse(65, 16, 20, 24, C.leaf);
  p.ellipse(68, 19, 5, 9, C.ink);
  p.ellipse(78, 19, 5, 9, C.ink);
  p.hline(72, 31, 6, C.forest);
  p.ellipse(5, 31, 138, 32, C.slate);
  p.ellipse(4, 25, 140, 29, C.silver);
  p.ellipse(14, 27, 120, 18, C.white);
  p.ellipse(24, 29, 100, 12, C.grey);
  for (let x = 18; x < 135; x += 19) {
    p.round(x, 44, 9, 5, C.pine);
    p.rect(x + 1, 44, 7, 3, "#a8ff9e");
  }
  p.ellipse(48, 54, 53, 9, C.pine);
  p.ellipse(54, 54, 41, 5, "#a8ff9e");
  p.outline();
  return p;
}

export function paintDisco(): PixelCanvas {
  const p = new PixelCanvas(66, 78);
  p.rect(31, 0, 3, 14, C.grey);
  p.ellipse(5, 14, 56, 56, C.slate);
  const colors = [C.silver, C.sky, C.white, C.cyan, C.grey, C.pink];
  for (let y = 18; y < 67; y += 7) {
    for (let x = 8; x < 60; x += 7) {
      const dx = (x + 2 - 33) / 26,
        dy = (y + 2 - 42) / 26;
      if (dx * dx + dy * dy < 0.88) p.rect(x, y, 5, 5, colors[(x * 3 + y) % colors.length]!);
    }
  }
  p.rect(19, 27, 2, 13, C.white);
  p.rect(14, 32, 13, 2, C.white);
  p.set(20, 33, C.lemon);
  p.round(9, 69, 48, 8, C.wine);
  drawText(p, 13, 70, "DISCO!", C.lemon);
  return p;
}

export function paintRollingChair(): PixelCanvas {
  const p = new PixelCanvas(28, 30);
  p.round(3, 1, 22, 14, C.slate);
  p.round(5, 3, 18, 9, C.sky);
  p.round(2, 15, 24, 6, C.dusk);
  p.hline(4, 15, 20, C.silver);
  p.rect(12, 21, 4, 4, C.grey);
  p.hline(3, 25, 22, C.slate);
  for (const x of [3, 12, 22]) p.rect(x, 25, 3, 4, C.ink);
  return p;
}
