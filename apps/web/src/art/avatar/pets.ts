/**
 * Pets (WD12, `look.accessories.pet`): a small animal riding on the shoulder, tinted by its
 * colour. A missing part (looks stored before WD12) or "none" paints nothing.
 *
 * Every pet is authored once in profile, facing the viewer's right, sitting on the viewer's
 * right shoulder of the front view. The side view (facing left) mirrors it onto the near
 * shoulder; the back view mirrors it onto the viewer's left shoulder (the same shoulder, seen
 * from behind). Pets are painted after the head, so they ride in front of cheek and hair, with
 * a one-texel ink edge where they overlap the body (the sheet outline does the rest).
 *
 * Idle wiggle: two art frames per pet (a blink, a wing flap, a tail flick), picked by the
 * frame's breathing bob, walk phase and typing/reading beat, so it is deterministic per frame.
 */
import { type Accessories, type Ramp, rampFrom } from "@agent-office/protocol";
import { darken, lighten, mix, NIGHT, WHITE } from "./color.ts";
import type { Ctx } from "./ctx.ts";
import { BODY_ROWS, FW, HEADROOM } from "./geometry.ts";
import type { TorsoBox } from "./torso.ts";

type PetKind = Exclude<NonNullable<Accessories["pet"]>["kind"], "none">;

/** 0 or 1: the idle beat of a frame (breathing bob, walk phase, typing/reading hand). */
export function beat(c: Ctx): number {
  const f = c.f;
  return (f.phase + f.bob + (f.arms.endsWith("1") ? 1 : 0)) & 1;
}

type PetArt = {
  /** profile facing right, two idle frames (same size) */
  frames: readonly [readonly string[], readonly string[]];
  /** seen from behind (unmirrored, as on the viewer's left shoulder); default: the profile */
  back?: readonly [readonly string[], readonly string[]];
  /** sprite row that rests on the shoulder row */
  seat: number;
  colors: (r: Ramp) => Record<string, string>;
};

const BEAK = "#feae34";
const BEAK_DARK = "#c27c3b";
const PINK = "#f6757a";
const EYE = NIGHT;

/** Rotate a colour's hue by `deg` (keeps saturation and lightness): the parrot's plumage. */
function hue(hex: string, deg: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  // a grey parrot still gets some colour
  const s = d === 0 ? 0.55 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const L = Math.min(0.62, Math.max(0.42, l));
  const C = (1 - Math.abs(2 * L - 1)) * Math.min(1, s);
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - C / 2;
  const [r1, g1, b1] =
    h < 60
      ? [C, X, 0]
      : h < 120
        ? [X, C, 0]
        : h < 180
          ? [0, C, X]
          : h < 240
            ? [0, X, C]
            : h < 300
              ? [X, 0, C]
              : [C, 0, X];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

const PETS: Record<PetKind, PetArt> = {
  // h body, H shadow, L light, w white face patch, k eye, y beak, Y beak shadow,
  // a/A wing (second hue), c tail tip (third hue)
  parrot: {
    frames: [
      [
        "..LLL...",
        ".LhhhL..",
        ".hhwkyy.",
        ".hhhhyYY",
        "Hhhhhh.Y",
        "HhaaAh..",
        "HaaaAh..",
        ".HaaHh..",
        "..AcH...",
        "..Ac....",
        ".cc.....",
      ],
      [
        "..LLL...",
        ".LhhhL..",
        ".hhwkyy.",
        ".hhhhyYY",
        "HaaAhh.Y",
        "aaaAhh..",
        ".aAHhh..",
        "..HHhh..",
        "..AcH...",
        "..Ac....",
        ".cc.....",
      ],
    ],
    seat: 7,
    colors: (r) => {
      const a = hue(r.base, 150);
      const c = hue(r.base, 60);
      return {
        h: r.base,
        H: r.shadow,
        L: r.light,
        w: WHITE,
        k: EYE,
        y: "#f4f4f2",
        Y: "#8b9bb4",
        a,
        A: darken(a, 0.3),
        c,
      };
    },
  },
  // curled up asleep, tail wrapped round the front; frame 2: the tail tip flicks
  cat: {
    frames: [
      [
        "......h..h",
        "..LLL.hphh",
        ".LhhhLhhhh",
        "Hhhhhhkhkh",
        "Hhhhhhhphh",
        "HhhhhhhhhH",
        ".TTTTTTHH.",
      ],
      [
        "......h..h",
        "..LLL.hphh",
        ".LhhhLhhhh",
        "Hhhhhhkhkh",
        "Hhhhhhhphh",
        "ThhhhhhhhH",
        "T.TTTTTHH.",
      ],
    ],
    back: [
      [
        "h..h......",
        "hhhh.LLL..",
        "hhhhLhhhL.",
        "hhhhhhhhhH",
        "hhhhhhhhhH",
        "HhhhhhhhhH",
        ".HHTTTTTT.",
      ],
      [
        "h..h......",
        "hhhh.LLL..",
        "hhhhLhhhL.",
        "hhhhhhhhhH",
        "hhhhhhhhhH",
        "HhhhhhhhhT",
        ".HHTTTTT.T",
      ],
    ],
    seat: 5,
    colors: (r) => ({
      h: r.base,
      H: r.shadow,
      L: r.light,
      p: PINK,
      k: darken(r.shadow, 0.6),
      T: mix(r.base, r.shadow, 0.5),
    }),
  },
  // a round ball with ears, a white tummy and pink feet; frame 2: blink
  hamster: {
    frames: [
      [".p..p.", "hhLLhh", "hkhhkh", "Lwwpwh", "hwwwwH", ".p..p."],
      [".p..p.", "hhLLhh", "hHhhHh", "Lwwpwh", "hwwwwH", ".p..p."],
    ],
    back: [
      [".h..h.", "hhLLhh", "hLhhhh", "hhhhhH", "HhhhhH", ".HHHH."],
      [".h..h.", "hhLLhh", "hLhhhh", "hhhhhH", "HhhhhH", ".HHHH."],
    ],
    seat: 4,
    colors: (r) => ({
      h: r.base,
      H: r.shadow,
      L: r.light,
      w: mix(WHITE, r.light, 0.25),
      p: PINK,
      k: EYE,
    }),
  },
  // the mantle on the shoulder, tentacles draped down over it (s = suckers)
  octopus: {
    frames: [
      [
        "..LLLL...",
        ".LhhhhH..",
        ".hwkhwkH.",
        ".hhhhhhH.",
        "hHhHhhHhH",
        "h.h.s.h.H",
        "s.H.h.s.h",
        ".h..H..h.",
        ".H......H",
      ],
      [
        "..LLLL...",
        ".LhhhhH..",
        ".hwkhwkH.",
        ".hhhhhhH.",
        "hHhHhhHhH",
        "h.h.s.h.H",
        "h.H.h.s.H",
        "s..H...h.",
        "H.......h",
      ],
    ],
    back: [
      [
        "..LLLL...",
        ".LhhhhH..",
        ".hLhhhhH.",
        ".hhhhhhH.",
        "hHhHhhHhH",
        "h.h.h.h.H",
        "h.H.h.H.h",
        ".h..H..h.",
        ".H......H",
      ],
      [
        "..LLLL...",
        ".LhhhhH..",
        ".hLhhhhH.",
        ".hhhhhhH.",
        "hHhHhhHhH",
        "h.h.h.h.H",
        "h.H.h.H.H",
        "h..H...h.",
        "H.......h",
      ],
    ],
    seat: 3,
    colors: (r) => ({
      h: r.base,
      H: r.shadow,
      L: r.light,
      w: WHITE,
      k: EYE,
      s: lighten(r.light, 0.45),
    }),
  },
  // the classic bath duck: round body, raised tail, orange bill; frame 2: it rocks back
  "rubber-duck": {
    frames: [
      [
        "....Lhh..",
        "...Lhhhh.",
        "...hhhkhy",
        "....hhhyy",
        "L..Lhhhh.",
        "hLLhhhhhH",
        "HhhHHhhH.",
        ".HHHHHH..",
      ],
      [
        "....Lhh..",
        "...Lhhhh.",
        "...hhhkhy",
        "L...hhhyy",
        "hL.Lhhhh.",
        "HhLhhhhhH",
        ".hhHHhhH.",
        "..HHHHHH.",
      ],
    ],
    seat: 6,
    colors: (r) => ({
      h: r.base,
      H: r.shadow,
      L: lighten(r.light, 0.3),
      k: EYE,
      y: mix(BEAK, r.base, 0.15),
      Y: BEAK_DARK,
    }),
  },
  // horns, a snout, a light belly, bat wings up (frame 2: wings down) and a curly tail
  dragon: {
    frames: [
      [
        "v.v.......",
        "vWvW...H..",
        "vWWvW.hhH.",
        ".vWWvhhkhh",
        "..vvhhhhhy",
        "...Hhbhh..",
        "..HhhbbH..",
        "HhhhhbhH..",
        ".H.HH.H...",
      ],
      [
        "..........",
        ".......H..",
        "......hhH.",
        "vWWv.hhkhh",
        "vWWWvhhhhy",
        ".vWWvbhh..",
        "..vvhbbH..",
        "HhhhhbhH..",
        ".H.HH.H...",
      ],
    ],
    seat: 7,
    colors: (r) => ({
      h: r.base,
      H: r.shadow,
      L: r.light,
      k: EYE,
      y: lighten(r.light, 0.4),
      b: mix(r.light, "#feae34", 0.45),
      v: darken(r.shadow, 0.35),
      W: mix(r.base, r.light, 0.5),
    }),
  },
};

const flip = (rows: readonly string[]) => rows.map((s) => [...s].reverse().join(""));

/** Lowest/rightmost texel a pet may use (the sheet outline needs 2 more). */
const MAX_X = FW - 3;

/**
 * Paint a sprite in front of what is there, with a one-texel ink edge where it overlaps
 * already painted texels (over empty ones the sheet outline draws the edge).
 */
function stampOver(
  c: Ctx,
  x0: number,
  y0: number,
  rows: readonly string[],
  col: Record<string, string>,
) {
  const pc = c.pc;
  const h = rows.length;
  const w = rows[0]!.length;
  const inside = (x: number, y: number) => x >= 0 && x < FW && y >= -HEADROOM && y < BODY_ROWS;
  const solid = (i: number, j: number) => {
    const ch = rows[j]?.[i];
    return ch !== undefined && ch !== "." && col[ch] !== undefined;
  };
  for (let j = -1; j <= h; j++)
    for (let i = -1; i <= w; i++) {
      if (solid(i, j)) continue;
      if (!(solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1))) continue;
      const x = x0 + i;
      const y = y0 + j;
      if (inside(x, y) && pc.get(x, y) >>> 24 !== 0) pc.set(x, y, NIGHT);
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!solid(i, j)) continue;
      const x = x0 + i;
      const y = y0 + j;
      if (inside(x, y)) pc.set(x, y, col[rows[j]![i]!]!);
    }
}

/** The pet on the shoulder; paint after the head. */
export function drawPet(c: Ctx, b: TorsoBox): void {
  const pet = c.L.accessories.pet;
  if (!pet || pet.kind === "none") return;
  const art = PETS[pet.kind];
  const k = beat(c);
  const col = art.colors(rampFrom(pet.color));
  const profile = art.frames[k]!;
  const w = profile[0]!.length;
  const top = b.T - art.seat;
  if (c.view === "down") {
    stampOver(c, MAX_X + 1 - w, top, profile, col);
  } else if (c.view === "left") {
    // the near shoulder, behind the face: faces left with the body
    stampOver(c, Math.min(c.tr, 21) - w + 1, top, flip(profile), col);
  } else {
    const rows = art.back ? art.back[k]! : flip(profile);
    stampOver(c, 2, top, rows, col);
  }
}
