/**
 * Fabric patterns at texel scale. A pattern is drawn over a garment's base colour; shading
 * (shadow column, light edge) is painted on top by the garment painters.
 * Coordinates are garment-local so a pattern doesn't crawl when the body bobs.
 */
import type { Pattern, Ramp } from "@agent-office/protocol";
import { hash2, mix, NIGHT, noise, opt, WHITE } from "./color.ts";

export type Fabric = {
  ramp: Ramp;
  pattern: Pattern;
  salt?: number;
  /** garment-local row of the hem (flames rise from it); missing = a trouser-length garment */
  hem?: number;
};

/** Hem row of a fabric that names none (waistband to ankle). */
const HEM = 12;

/** Leopard rosettes on a 7×5 cell (two shapes): o = dark broken ring, i = inside, . = ground. */
const LEOPARD = [
  [".oo.o..", "oiiio..", "oiii.o.", ".o.oo..", "......."],
  ["..o.o..", ".oiio..", "oiiio..", ".o.o...", "......o"],
];

/** Colour of one texel of a fabric. */
export function fabricAt(f: Fabric, x: number, y: number): string {
  const { ramp, pattern } = f;
  const a = pattern.a;
  const b = opt(pattern.b, ramp.shadow);
  const s = f.salt ?? 0;
  switch (pattern.kind) {
    case "none":
      return ramp.base;
    case "dots":
      return (x % 4 === 1 && y % 4 === 1) || (x % 4 === 3 && y % 4 === 3) ? a : ramp.base;
    case "pinstripe":
      return x % 3 === 1 ? a : ramp.base;
    case "stripes":
      return y % 4 < 2 ? a : pattern.b === "none" ? ramp.base : b;
    case "check": {
      const on = ((x >> 1) + (y >> 1)) % 2 === 0;
      return on ? a : ramp.base;
    }
    case "plaid": {
      const vx = x % 5 === 0;
      const hy = y % 5 === 0;
      if (vx && hy) return mix(a, b, 0.5);
      if (vx) return a;
      if (hy) return b;
      return ramp.base;
    }
    case "damask": {
      // small dense ornament: offset dots of `a` and `b` on a 4×4 tile
      const tx = x % 4;
      const ty = y % 4;
      if ((tx === 0 && ty === 0) || (tx === 2 && ty === 2)) return a;
      if ((tx === 2 && ty === 0) || (tx === 0 && ty === 2)) return b;
      return ramp.base;
    }
    case "floral": {
      const tx = (x + (y >= 0 ? Math.floor(y / 5) * 3 : 0)) % 6;
      const ty = y % 5;
      if (tx === 2 && ty === 2) return b;
      if ((tx === 2 && (ty === 1 || ty === 3)) || (ty === 2 && (tx === 1 || tx === 3))) return a;
      return ramp.base;
    }
    case "heather": {
      const h = hash2(x, y, 11 + s) % 7;
      return h === 0 ? a : h === 1 && pattern.b !== "none" ? b : ramp.base;
    }
    case "worn": {
      // blotchy patina: lighter patches (a), darker patches (b)
      const n = noise(x + 3, y + 1, 3, 7 + s);
      if (n > 0.68) return a;
      if (n < 0.24) return b;
      return ramp.base;
    }
    case "camo": {
      const n = noise(x, y, 3, 19 + s);
      if (n > 0.62) return a;
      if (n < 0.32) return b;
      return ramp.base;
    }
    case "leopard": {
      // rosettes: a broken dark ring (a) around a darker middle (b), staggered rows
      const cy = Math.floor((y + 10) / 5);
      const sx = x + 14 + (cy % 2) * 3;
      const cx = Math.floor(sx / 7);
      const h = hash2(cx, cy, 31 + s);
      const ring = LEOPARD[h % 2]?.[y + 10 - cy * 5]?.[sx - cx * 7 - ((h >> 1) % 2)];
      if (ring === "o") return a;
      if (ring === "i") return pattern.b === "none" ? mix(ramp.base, a, 0.35) : b;
      return ramp.base;
    }
    case "zebra": {
      // wavy stripes of uneven width running round the body
      const v = y + 1.4 * Math.sin(x * 0.6 + y * 0.3) + 1.4 * noise(x, y, 5, 41 + s);
      return ((v % 4) + 4) % 4 < 1.5 ? a : ramp.base;
    }
    case "flames": {
      // tongues of fire rising from the hem: the flame in a, its hot core in b (or yellow)
      const d = (f.hem ?? HEM) - y;
      const g = Math.floor((x + 40) / 3);
      const tall = 3 + (hash2(g, 0, 53 + s) % 5);
      const h = (x + 40) % 3 === 1 ? tall : tall - 2;
      if (d > h) return ramp.base;
      const core = pattern.b === "none" ? mix(a, "#fee761", 0.7) : b;
      return d < h - 2 ? core : a;
    }
    case "tie-dye": {
      // a spiral swirled from the middle of the chest, the colours bleeding into each other
      const dx = x - 15.5;
      const dy = (y - 5) * 1.2;
      const t = Math.atan2(dy, dx) / (2 * Math.PI) + Math.sqrt(dx * dx + dy * dy) / 7;
      const cols = [a, mix(a, ramp.base, 0.5), ramp.base, opt(pattern.b, ramp.light)];
      const k = (((t * 4 + noise(x, y, 3, 61 + s) * 0.5) % 4) + 4) % 4;
      return cols[Math.floor(k)] ?? a;
    }
    case "sequins": {
      // sewn all over with sequins in a (and b), each tilted its own way, some catching the light
      const h = hash2(x, y, 71 + s) % 13;
      if (h === 0) return WHITE;
      if (h < 3) return mix(a, WHITE, 0.45);
      if (h < 6) return pattern.b === "none" ? mix(a, ramp.base, 0.5) : b;
      if (h < 9) return mix(a, NIGHT, 0.25);
      return a;
    }
    case "galaxy": {
      // night sky: nebula clouds of a and b on near-black, stars and the odd bright one
      const sky = mix(ramp.shadow, NIGHT, 0.75);
      const st = hash2(x, y, 83 + s) % 23;
      if (st === 0) return WHITE;
      if (st === 1) return mix(WHITE, a, 0.3);
      const n = noise(x, y, 4, 89 + s);
      if (n > 0.66) return mix(sky, a, 0.55);
      if (n < 0.28) return mix(sky, opt(pattern.b, ramp.base), 0.45);
      return sky;
    }
  }
}
