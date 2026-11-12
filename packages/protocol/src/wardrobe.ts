/**
 * The wardrobe (WD1-WD8): helpers shared by the renderer, the look studio and GenUI.
 *
 *   rampFrom      one colour -> a 3-step ramp (LK6 rule: shadow darker + cooler, light lighter)
 *   withWardrobe  a look with every optional wardrobe section filled with its default
 *   *Of builders  a whole garment section from a kind + one colour
 *   OUTFIT_PRESETS / applyPreset  one-click outfits (clothing sections only)
 *   randomLook    a random, valid look (the studio's dice)
 *
 * Pure and deterministic; no DOM.
 */
import { mulberry32 } from "./hash.ts";
import {
  type Accessories,
  type Apron,
  BAGS,
  BOTTOM_KINDS,
  type Body,
  BROWS,
  BUILDS,
  CHEEKS,
  type CharacterLook,
  DEFAULT_BODY,
  EARRING_STYLES,
  EARS,
  EMBROIDERY_MOTIFS,
  EXPRESSIONS,
  type Extras,
  EYES,
  EYEWEAR_STYLES,
  FACE_SHAPES,
  FACIAL_HAIR_STYLES,
  FIGURES,
  GLOVES,
  HAIR_CUTS,
  HAND_POSES,
  HEADWEAR_STYLES,
  HEIGHTS,
  HELD_KINDS,
  LEGWEAR_KINDS,
  LOOK_VERSION,
  MASKS,
  NECKLACES,
  OUTER_KINDS,
  OUTER_LENGTHS,
  PATTERN_KINDS,
  type Pattern,
  type Ramp,
  SHIRT_KINDS,
  SHOE_KINDS,
  SLEEVES,
  TAILS,
  UNDERWEAR_BOTTOMS,
  UNDERWEAR_TOPS,
  type Underwear,
  VEST_KINDS,
  WINGS,
  WRIST_KINDS,
} from "./look.ts";

// ---- colour -------------------------------------------------------------------------------

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const h2 = (v: number) =>
  Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, "0");
/** Linear mix of two #rrggbb colours (t = 0 -> a). */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return `#${h2(r1 + (r2 - r1) * t)}${h2(g1 + (g2 - g1) * t)}${h2(b1 + (b2 - b1) * t)}`;
}

/** The outline / darkest ink of the art (Endesga night), a cool dark purple. */
const INK = "#181425";

/**
 * A ramp from one colour, as the look schema asks for it: shadow about 25% darker and shifted
 * toward cool purple (mixed toward the outline ink), light about 18% lighter and a touch warm.
 */
export function rampFrom(base: string): Ramp {
  const b = base.toLowerCase();
  return { base: b, shadow: mixHex(b, INK, 0.28), light: mixHex(b, "#ffffff", 0.2) };
}

// ---- section builders ---------------------------------------------------------------------

type Shirt = CharacterLook["shirt"];
type Vest = CharacterLook["vest"];
type Outer = CharacterLook["outer"];
type Bottoms = CharacterLook["bottoms"];
type Legwear = CharacterLook["legwear"];
type Shoes = CharacterLook["shoes"];
type Headwear = CharacterLook["headwear"];
type Buttons = Shirt["buttons"];

export const plain = (a: string): Pattern => ({ kind: "none", a, b: "none" });
export const buttons = (count: number, color: string, o: Partial<Buttons> = {}): Buttons => ({
  count,
  color,
  rim: "none",
  size: "small",
  layout: "single",
  ...o,
});

export function shirtOf(kind: Shirt["kind"], color: string, o: Partial<Shirt> = {}): Shirt {
  const collar: Shirt["collar"] =
    kind === "shirt" || kind === "blouse"
      ? "shirt"
      : kind === "polo"
        ? "polo"
        : kind === "turtleneck"
          ? "turtleneck"
          : kind === "hoodie"
            ? "hood"
            : kind === "none"
              ? "none"
              : "crew";
  const sleeves: Shirt["sleeves"] =
    kind === "tank" || kind === "camisole" || kind === "none"
      ? "none"
      : kind === "dirndl-blouse"
        ? "puff"
        : kind === "tshirt" || kind === "polo" || kind === "jersey" || kind === "crop-top"
          ? "short"
          : "long";
  return {
    kind,
    ramp: rampFrom(color),
    pattern: plain(color),
    collar,
    collarColor: "none",
    neckwear: "none",
    neckwearColor: "#262b44",
    sleeves,
    buttons: buttons(kind === "shirt" || kind === "polo" ? 3 : 0, mixHex(color, INK, 0.3)),
    peeksAtWaist: false,
    ...o,
  };
}

export function vestOf(kind: Vest["kind"], color: string, o: Partial<Vest> = {}): Vest {
  return {
    kind,
    ramp: rampFrom(color),
    pattern: plain(color),
    collar: "none",
    piping: "none",
    buttons: buttons(kind === "waistcoat" ? 4 : 0, mixHex(color, INK, 0.4)),
    ...o,
  };
}

export function outerOf(kind: Outer["kind"], color: string, o: Partial<Outer> = {}): Outer {
  const long = kind === "trench-coat" || kind === "coat" || kind === "lab-coat";
  const robe = kind === "kimono" || kind === "bathrobe" || kind === "cape";
  return {
    kind,
    agentColored: false,
    ramp: rampFrom(color),
    pattern: plain(color),
    open: kind !== "coat" && kind !== "poncho" && kind !== "parka",
    length: robe ? "knee" : long ? "thigh" : kind === "tailcoat" ? "knee" : "hip",
    collar:
      kind === "blazer" || kind === "tuxedo" || kind === "tailcoat" || kind === "trench-coat"
        ? "lapel"
        : kind === "kimono" || kind === "bathrobe"
          ? "shawl"
          : kind === "parka" || kind === "rain-jacket" || kind === "zip-hoodie"
            ? "hood"
            : kind === "cape" || kind === "poncho" || kind === "none"
              ? "none"
              : "shirt",
    collarColor: "none",
    collarPiping: "none",
    piping: "none",
    buttons: buttons(kind === "blazer" || kind === "tuxedo" ? 2 : 0, mixHex(color, INK, 0.4)),
    pockets: kind === "blazer" || kind === "tuxedo" ? "welt" : "none",
    pocketPiping: "none",
    yoke: false,
    ...o,
  };
}

export function bottomsOf(kind: Bottoms["kind"], color: string, o: Partial<Bottoms> = {}): Bottoms {
  return {
    kind,
    ramp: rampFrom(color),
    pattern: plain(color),
    flap: kind === "lederhosen" || kind === "kneebund-lederhosen",
    embroidery: { motif: "none", color, stitching: "none" },
    buttons: buttons(0, color),
    suspenders: "none",
    suspendersColor: mixHex(color, INK, 0.3),
    belt: "none",
    hem: "plain",
    ...o,
  };
}

export const legwearOf = (kind: Legwear["kind"], color = "#262b44", accent = "none"): Legwear => ({
  kind,
  color,
  accent,
});

export function shoesOf(kind: Shoes["kind"], color: string, o: Partial<Shoes> = {}): Shoes {
  return {
    kind,
    ramp: rampFrom(color),
    sole: kind === "sneakers" || kind === "high-tops" ? "#ffffff" : INK,
    accent: "none",
    laces: kind === "sneakers" || kind === "high-tops" ? "#ffffff" : "none",
    ...o,
  };
}

export function headwearOf(
  style: Headwear["style"],
  color = "#3a4466",
  accent = "#ffffff",
): Headwear {
  return { style, ramp: rampFrom(color), accent, logo: "none" };
}

export function underwearOf(
  top: Underwear["top"],
  topColor: string,
  bottom: Underwear["bottom"],
  bottomColor = topColor,
  o: Partial<Underwear> = {},
): Underwear {
  return {
    top,
    topRamp: rampFrom(topColor),
    bottom,
    bottomRamp: rampFrom(bottomColor),
    pattern: plain(topColor),
    trim: "none",
    ...o,
  };
}

export function apronOf(
  kind: Apron["kind"],
  color = "#ffffff",
  bow: Apron["bow"] = "left",
  o: Partial<Apron> = {},
): Apron {
  return { kind, ramp: rampFrom(color), pattern: plain(color), bow, ...o };
}

type PartSpec = { [K in keyof Accessories]?: [Accessories[K]["kind"], string] };
export function accessoriesOf(parts: PartSpec = {}): Accessories {
  const one = <K extends keyof Accessories>(k: K): Accessories[K] => {
    const p = parts[k];
    return (p ? { kind: p[0], color: p[1] } : { kind: "none", color: "#3a4466" }) as Accessories[K];
  };
  return {
    mask: one("mask"),
    wings: one("wings"),
    tail: one("tail"),
    gloves: one("gloves"),
    necklace: one("necklace"),
    bag: one("bag"),
  };
}

// ---- defaults -----------------------------------------------------------------------------

export const DEFAULT_UNDERWEAR: Underwear = underwearOf("none", "#ffffff", "none");
export const DEFAULT_APRON: Apron = apronOf("none");
export const DEFAULT_ACCESSORIES: Accessories = accessoriesOf();
const DEFAULT_EXTRAS: Extras = {
  leftHand: "none",
  rightHand: "none",
  costume: "none",
  wrist: "none",
  accent: "#2ce8f5",
};

/** A look whose optional wardrobe sections are all present. */
export type FullLook = CharacterLook & {
  body: Body;
  underwear: Underwear;
  apron: Apron;
  accessories: Accessories;
};

/**
 * The look with every optional wardrobe section filled with its default (looks stored before
 * the wardrobe draw exactly as before: average height, neutral figure, nothing extra).
 */
export function withWardrobe(L: CharacterLook): FullLook {
  return {
    ...L,
    body: L.body ?? DEFAULT_BODY,
    underwear: L.underwear ?? DEFAULT_UNDERWEAR,
    apron: L.apron ?? DEFAULT_APRON,
    accessories: L.accessories ?? DEFAULT_ACCESSORIES,
  };
}

// ---- outfit presets -----------------------------------------------------------------------

/** The clothing part of a look that an outfit preset replaces. */
export type OutfitParts = Pick<
  FullLook,
  | "shirt"
  | "vest"
  | "outer"
  | "bottoms"
  | "legwear"
  | "shoes"
  | "underwear"
  | "apron"
  | "accessories"
> & {
  /** set when the outfit comes with a hat (costumes); otherwise the person's own is kept */
  headwear?: Headwear;
  /** legacy costume overlay and held items that belong to the outfit */
  costume?: Extras["costume"];
  leftHand?: Extras["leftHand"];
  rightHand?: Extras["rightHand"];
};

const NO_VEST = vestOf("none", "#ffffff");
const NO_OUTER = outerOf("none", "#8b9bb4");
const NO_SHIRT = shirtOf("none", "#ffffff");
const NO_BOTTOMS = bottomsOf("none", "#3a4466");
const BAREFOOT = shoesOf("none", "#733e39");
const BRIEFS = underwearOf("none", "#ffffff", "briefs", "#ffffff");

const outfit = (o: Partial<OutfitParts>): OutfitParts => ({
  shirt: NO_SHIRT,
  vest: NO_VEST,
  outer: NO_OUTER,
  bottoms: NO_BOTTOMS,
  legwear: legwearOf("none"),
  shoes: BAREFOOT,
  underwear: BRIEFS,
  apron: DEFAULT_APRON,
  accessories: DEFAULT_ACCESSORIES,
  ...o,
});

export type OutfitPreset = { id: string; label: string; outfit: OutfitParts };

const GOLD = "#feae34";
const NAVY = "#262b44";
const CHARCOAL = "#3a3f47";
const WHITE = "#ffffff";
const BLACK = "#1f1b2a";
const SNOW = "#f4f4f2";

/** One-click outfits: the clothing sections only (body, face and hair stay). */
export const OUTFIT_PRESETS: readonly OutfitPreset[] = [
  {
    id: "casual",
    label: "Casual",
    outfit: outfit({
      shirt: shirtOf("tshirt", "#5a6988"),
      outer: outerOf("denim-jacket", "#4a6fa5", { buttons: buttons(0, "#c0cbdc") }),
      bottoms: bottomsOf("jeans", "#3b5ba5", { hem: "cuffed" }),
      legwear: legwearOf("ankle-socks", WHITE),
      shoes: shoesOf("sneakers", WHITE, { accent: "#e43b44" }),
    }),
  },
  {
    id: "business-suit",
    label: "Business suit",
    outfit: outfit({
      shirt: shirtOf("shirt", "#dbe4f0", { neckwear: "tie", neckwearColor: "#a22633" }),
      outer: outerOf("blazer", CHARCOAL, { open: false, buttons: buttons(2, BLACK) }),
      bottoms: bottomsOf("trousers", CHARCOAL, { belt: BLACK }),
      legwear: legwearOf("crew-socks", BLACK),
      shoes: shoesOf("oxfords", BLACK),
    }),
  },
  {
    id: "tuxedo",
    label: "Tuxedo",
    outfit: outfit({
      shirt: shirtOf("shirt", WHITE, { neckwear: "bow-tie", neckwearColor: BLACK }),
      vest: vestOf("waistcoat", BLACK, { buttons: buttons(3, "#c0cbdc") }),
      outer: outerOf("tuxedo", BLACK, { collarColor: "#2b2638", open: true }),
      bottoms: bottomsOf("trousers", BLACK),
      legwear: legwearOf("crew-socks", BLACK),
      shoes: shoesOf("oxfords", BLACK, { accent: "#ffffff" }),
    }),
  },
  {
    id: "dirndl",
    label: "Dirndl",
    outfit: outfit({
      shirt: shirtOf("dirndl-blouse", SNOW, { collar: "none", sleeves: "puff" }),
      vest: vestOf("dirndl-bodice", "#a22633", {
        piping: "#feae34",
        pattern: { kind: "damask", a: "#c4344a", b: "none" },
        buttons: buttons(4, "#c0cbdc"),
      }),
      bottoms: bottomsOf("dirndl-skirt", "#1f3d6b", {
        pattern: { kind: "floral", a: "#f6757a", b: "#63c74d" },
      }),
      apron: apronOf("dirndl", "#7ab0d6", "left", {
        pattern: { kind: "pinstripe", a: "#a6cde8", b: "none" },
      }),
      legwear: legwearOf("stockings", SNOW),
      shoes: shoesOf("ballet-flats", BLACK),
      underwear: underwearOf("bra", WHITE, "panties", WHITE),
      accessories: accessoriesOf({ necklace: ["chain", "#c0cbdc"] }),
    }),
  },
  {
    id: "lederhosen",
    label: "Lederhosen & Janker",
    outfit: outfit({
      shirt: shirtOf("trachten-shirt", "#e8eef4", {
        collar: "stand-up",
        pattern: { kind: "check", a: "#5a8ec4", b: "none" },
        peeksAtWaist: true,
      }),
      outer: outerOf("janker", "#3e5a2e", {
        collar: "stand-up",
        collarColor: "#265c42",
        buttons: buttons(5, "#c0cbdc", { size: "large", rim: "#8b9bb4" }),
        pockets: "flap",
        yoke: true,
      }),
      bottoms: bottomsOf("lederhosen", "#8a6a4a", {
        pattern: { kind: "worn", a: "#a68660", b: "#6b5038" },
        suspenders: "h-bridge",
        suspendersColor: "#6b5038",
        embroidery: { motif: "edelweiss", color: "#eadfc8", stitching: "#eadfc8" },
        buttons: buttons(2, "#e8dcc6"),
        hem: "lacing",
      }),
      legwear: legwearOf("loferl", "#d8cdb8"),
      shoes: shoesOf("haferl", "#5a3a28"),
      headwear: headwearOf("tyrolean-hat", "#3e5a2e", "#ead4aa"),
    }),
  },
  {
    id: "kilt",
    label: "Kilt",
    outfit: outfit({
      shirt: shirtOf("shirt", WHITE),
      vest: vestOf("waistcoat", "#262b44", { buttons: buttons(4, "#c0cbdc") }),
      outer: outerOf("jacket", "#262b44"),
      bottoms: bottomsOf("kilt", "#265c42", {
        pattern: { kind: "plaid", a: "#a22633", b: "#262b44" },
      }),
      legwear: legwearOf("knee-socks", "#ead4aa", "#a22633"),
      shoes: shoesOf("oxfords", BLACK),
      accessories: accessoriesOf({ bag: ["crossbody", "#733e39"] }),
    }),
  },
  {
    id: "ball-gown",
    label: "Ball gown",
    outfit: outfit({
      shirt: shirtOf("camisole", "#68386c"),
      vest: vestOf("corset", "#68386c", { piping: GOLD }),
      bottoms: bottomsOf("gown", "#68386c", {
        pattern: { kind: "damask", a: "#7d4a82", b: "none" },
      }),
      shoes: shoesOf("heels", "#68386c"),
      underwear: underwearOf("bra", "#ffffff", "panties"),
      accessories: accessoriesOf({ gloves: ["long", SNOW], necklace: ["pearls", SNOW] }),
      headwear: headwearOf("tiara", "#c0cbdc", "#2ce8f5"),
    }),
  },
  {
    id: "summer-dress",
    label: "Summer dress",
    outfit: outfit({
      shirt: shirtOf("camisole", "#fee761"),
      bottoms: bottomsOf("dress", "#fee761", {
        pattern: { kind: "floral", a: "#f6757a", b: WHITE },
      }),
      shoes: shoesOf("sandals", "#c28569"),
      underwear: underwearOf("bra", WHITE, "panties"),
      accessories: accessoriesOf({ bag: ["tote", "#ead4aa"] }),
    }),
  },
  {
    id: "gym",
    label: "Gym",
    outfit: outfit({
      shirt: shirtOf("tank", "#0099db"),
      bottoms: bottomsOf("shorts", NAVY, { hem: "plain" }),
      legwear: legwearOf("crew-socks", WHITE, "#0099db"),
      shoes: shoesOf("sneakers", "#e43b44"),
      underwear: underwearOf("sports-bra", BLACK, "boxer-briefs", BLACK),
      accessories: accessoriesOf({ gloves: ["boxing", "#e43b44"] }),
    }),
  },
  {
    id: "pyjamas",
    label: "Pyjamas",
    outfit: outfit({
      shirt: shirtOf("shirt", "#8fb8de", {
        pattern: { kind: "stripes", a: WHITE, b: "none" },
        collar: "shirt",
        buttons: buttons(4, WHITE),
      }),
      bottoms: bottomsOf("joggers", "#8fb8de", {
        pattern: { kind: "stripes", a: WHITE, b: "none" },
      }),
      shoes: shoesOf("slippers", "#b55088"),
    }),
  },
  {
    id: "bathrobe",
    label: "Bathrobe",
    outfit: outfit({
      outer: outerOf("bathrobe", WHITE, { open: false, length: "knee" }),
      shoes: shoesOf("slippers", WHITE),
    }),
  },
  {
    id: "swim-trunks",
    label: "Swim trunks",
    outfit: outfit({
      underwear: underwearOf("none", WHITE, "swim-trunks", "#0099db", {
        pattern: { kind: "floral", a: "#fee761", b: "none" },
      }),
      shoes: shoesOf("flip-flops", "#fee761"),
    }),
  },
  {
    id: "bikini",
    label: "Bikini",
    outfit: outfit({
      underwear: underwearOf("bikini-top", "#e43b44", "bikini", "#e43b44", {
        pattern: { kind: "dots", a: WHITE, b: "none" },
      }),
      shoes: shoesOf("flip-flops", "#2ce8f5"),
    }),
  },
  {
    id: "swimsuit",
    label: "Swimsuit",
    outfit: outfit({
      underwear: underwearOf("swimsuit", "#193c3e", "none", "#193c3e", { trim: "#2ce8f5" }),
      shoes: BAREFOOT,
    }),
  },
  {
    id: "underwear",
    label: "Underwear",
    outfit: outfit({
      underwear: underwearOf("undershirt", WHITE, "boxers", "#5a8ec4", {
        pattern: { kind: "none", a: WHITE, b: "none" },
        trim: "#262b44",
      }),
      legwear: legwearOf("crew-socks", WHITE),
    }),
  },
  {
    id: "lingerie",
    label: "Lingerie",
    outfit: outfit({
      underwear: underwearOf("bra", BLACK, "panties", BLACK, { trim: "#b55088" }),
      legwear: legwearOf("thigh-highs", BLACK),
    }),
  },
  {
    id: "naked",
    label: "Naked",
    outfit: outfit({ underwear: DEFAULT_UNDERWEAR }),
  },
  {
    id: "chef",
    label: "Chef",
    outfit: outfit({
      shirt: shirtOf("shirt", WHITE),
      outer: outerOf("jacket", WHITE, {
        open: false,
        collar: "stand-up",
        buttons: buttons(6, "#262b44", { layout: "double" }),
      }),
      bottoms: bottomsOf("trousers", "#262b44", {
        pattern: { kind: "check", a: "#5a6988", b: "none" },
      }),
      apron: apronOf("waist", WHITE, "back"),
      shoes: shoesOf("clogs", BLACK),
      headwear: headwearOf("chef-hat", WHITE, WHITE),
    }),
  },
  {
    id: "doctor",
    label: "Doctor",
    outfit: outfit({
      shirt: shirtOf("tshirt", "#3e8948", { collar: "v-neck" }),
      outer: outerOf("lab-coat", WHITE, { pockets: "patch" }),
      bottoms: bottomsOf("joggers", "#3e8948"),
      shoes: shoesOf("crocs", WHITE),
      accessories: accessoriesOf({ mask: ["surgical", "#8fd3e8"], necklace: ["medal", "#c0cbdc"] }),
    }),
  },
  {
    id: "superhero",
    label: "Superhero",
    outfit: outfit({
      shirt: shirtOf("longsleeve", "#0058a8", { collar: "none" }),
      outer: outerOf("cape", "#e43b44", { length: "knee" }),
      bottoms: bottomsOf("leggings", "#0058a8", { belt: GOLD }),
      shoes: shoesOf("boots", "#e43b44"),
      underwear: underwearOf("none", WHITE, "briefs", "#e43b44"),
      accessories: accessoriesOf({ mask: ["eye-mask", "#e43b44"], gloves: ["short", "#e43b44"] }),
    }),
  },
  {
    id: "witch",
    label: "Witch",
    outfit: outfit({
      shirt: shirtOf("blouse", "#3a2a4a"),
      outer: outerOf("cape", BLACK, { length: "ankle" }),
      bottoms: bottomsOf("maxi-skirt", "#3a2a4a", { hem: "frayed" }),
      legwear: legwearOf("tights", "#3a2a4a", "#63c74d"),
      shoes: shoesOf("boots", BLACK),
      headwear: headwearOf("witch-hat", BLACK, "#68386c"),
      rightHand: "magic-wand",
    }),
  },
  {
    id: "pirate",
    label: "Pirate",
    outfit: outfit({
      shirt: shirtOf("blouse", "#ead4aa", {
        pattern: { kind: "stripes", a: "#a22633", b: "none" },
      }),
      vest: vestOf("waistcoat", "#5a3a28", { piping: GOLD }),
      outer: outerOf("coat", "#a22633", {
        open: true,
        length: "thigh",
        piping: GOLD,
        buttons: buttons(6, GOLD, { layout: "double" }),
      }),
      bottoms: bottomsOf("trousers", "#3a2a2a", { hem: "frayed", belt: "#5a3a28" }),
      shoes: shoesOf("boots", BLACK),
      headwear: headwearOf("tricorn", BLACK, GOLD),
      costume: "pirate",
    }),
  },
  {
    id: "santa",
    label: "Santa",
    outfit: outfit({
      outer: outerOf("coat", "#e43b44", {
        open: false,
        piping: SNOW,
        collarColor: SNOW,
        buttons: buttons(0, BLACK),
      }),
      bottoms: bottomsOf("trousers", "#e43b44", { belt: BLACK }),
      shoes: shoesOf("boots", BLACK),
      headwear: headwearOf("santa-hat", "#e43b44", SNOW),
      accessories: accessoriesOf({ gloves: ["short", BLACK], bag: ["backpack", "#733e39"] }),
    }),
  },
  {
    id: "ninja",
    label: "Ninja",
    outfit: outfit({
      shirt: shirtOf("longsleeve", BLACK),
      outer: outerOf("kimono", BLACK, { length: "hip", open: false, collarColor: "#2b2638" }),
      bottoms: bottomsOf("joggers", BLACK, { belt: "#a22633" }),
      shoes: shoesOf("slippers", BLACK),
      accessories: accessoriesOf({ mask: ["ninja", BLACK], gloves: ["short", BLACK] }),
    }),
  },
  {
    id: "cowboy",
    label: "Cowboy",
    outfit: outfit({
      shirt: shirtOf("shirt", "#a22633", {
        pattern: { kind: "plaid", a: "#ead4aa", b: "none" },
        neckwear: "bandana",
        neckwearColor: "#0058a8",
      }),
      vest: vestOf("waistcoat", "#8a6a4a", { buttons: buttons(0, "#8a6a4a") }),
      bottoms: bottomsOf("jeans", "#3b5ba5", { belt: "#5a3a28" }),
      shoes: shoesOf("cowboy-boots", "#8a5a3a"),
      headwear: headwearOf("cowboy-hat", "#c28569", "#5a3a28"),
    }),
  },
  {
    id: "vampire",
    label: "Vampire",
    outfit: outfit({
      shirt: shirtOf("shirt", WHITE, { neckwear: "bow-tie", neckwearColor: "#a22633" }),
      vest: vestOf("waistcoat", "#a22633"),
      outer: outerOf("cape", BLACK, {
        length: "ankle",
        collar: "stand-up",
        collarColor: "#a22633",
      }),
      bottoms: bottomsOf("trousers", BLACK),
      shoes: shoesOf("oxfords", BLACK),
      costume: "vampire",
    }),
  },
  {
    id: "kimono",
    label: "Kimono",
    outfit: outfit({
      outer: outerOf("kimono", "#b55088", {
        open: false,
        length: "ankle",
        pattern: { kind: "floral", a: "#f6c1d6", b: WHITE },
        collarColor: WHITE,
      }),
      bottoms: bottomsOf("maxi-skirt", "#b55088"),
      apron: apronOf("waist", "#feae34", "back"),
      legwear: legwearOf("ankle-socks", WHITE),
      shoes: shoesOf("flip-flops", "#733e39"),
    }),
  },
  {
    id: "punk",
    label: "Punk",
    outfit: outfit({
      shirt: shirtOf("tshirt", BLACK, { pattern: { kind: "worn", a: "#3a3a4a", b: "none" } }),
      outer: outerOf("leather-jacket", BLACK, { buttons: buttons(0, "#c0cbdc") }),
      bottoms: bottomsOf("jeans", "#5a6988", {
        pattern: { kind: "worn", a: "#8b9bb4", b: "none" },
        hem: "frayed",
      }),
      legwear: legwearOf("fishnets", BLACK),
      shoes: shoesOf("boots", BLACK),
      accessories: accessoriesOf({ necklace: ["chain", "#c0cbdc"] }),
    }),
  },
  {
    id: "hiker",
    label: "Hiker",
    outfit: outfit({
      shirt: shirtOf("longsleeve", "#3e8948"),
      outer: outerOf("rain-jacket", "#feae34", { open: false }),
      bottoms: bottomsOf("cargo", "#5a6988"),
      legwear: legwearOf("crew-socks", "#8b9bb4"),
      shoes: shoesOf("boots", "#733e39"),
      accessories: accessoriesOf({ bag: ["backpack", "#e43b44"] }),
      headwear: headwearOf("bucket-hat", "#3e8948", "#265c42"),
    }),
  },
  {
    id: "astronaut",
    label: "Astronaut",
    outfit: outfit({
      outer: outerOf("jacket", WHITE, { open: false, collar: "none" }),
      shirt: shirtOf("longsleeve", WHITE),
      bottoms: bottomsOf("jumpsuit", WHITE),
      shoes: shoesOf("boots", "#c0cbdc"),
      accessories: accessoriesOf({ gloves: ["short", "#c0cbdc"], bag: ["backpack", "#c0cbdc"] }),
      costume: "astronaut",
    }),
  },
  {
    id: "angel",
    label: "Angel",
    outfit: outfit({
      shirt: shirtOf("blouse", SNOW, { collar: "none" }),
      bottoms: bottomsOf("gown", SNOW),
      shoes: shoesOf("sandals", GOLD),
      accessories: accessoriesOf({ wings: ["angel", WHITE] }),
      headwear: headwearOf("halo", GOLD, GOLD),
    }),
  },
  {
    id: "devil",
    label: "Little devil",
    outfit: outfit({
      shirt: shirtOf("crop-top", "#a22633"),
      bottoms: bottomsOf("mini-skirt", BLACK),
      legwear: legwearOf("tights", "#a22633"),
      shoes: shoesOf("platforms", BLACK),
      accessories: accessoriesOf({ tail: ["devil", "#e43b44"], wings: ["bat", BLACK] }),
      headwear: headwearOf("devil-horns", "#e43b44", "#e43b44"),
    }),
  },
  {
    id: "dino",
    label: "Dino onesie",
    outfit: outfit({
      outer: outerOf("zip-hoodie", "#63c74d", { open: false, collar: "hood" }),
      bottoms: bottomsOf("joggers", "#63c74d"),
      shoes: shoesOf("slippers", "#3e8948"),
      accessories: accessoriesOf({ tail: ["dino", "#63c74d"] }),
    }),
  },
];

/** Hats that belong to an outfit: switching outfits takes them off again. */
const OUTFIT_HATS = new Set(
  OUTFIT_PRESETS.map((p) => p.outfit.headwear?.style).filter((s) => s !== undefined),
);

/** The look wearing a preset outfit. Body, face and hair (and an ordinary hat) stay. */
export function applyPreset(look: CharacterLook, presetId: string): CharacterLook {
  const preset = OUTFIT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return look;
  const o = preset.outfit;
  const ex = look.extras ?? DEFAULT_EXTRAS;
  const headwear = o.headwear
    ? structuredClone(o.headwear)
    : OUTFIT_HATS.has(look.headwear.style)
      ? { ...look.headwear, style: "none" as const }
      : look.headwear;
  return {
    ...look,
    shirt: structuredClone(o.shirt),
    vest: structuredClone(o.vest),
    outer: structuredClone(o.outer),
    bottoms: structuredClone(o.bottoms),
    legwear: structuredClone(o.legwear),
    shoes: structuredClone(o.shoes),
    underwear: structuredClone(o.underwear),
    apron: structuredClone(o.apron),
    accessories: structuredClone(o.accessories),
    headwear,
    extras: {
      ...ex,
      costume: o.costume ?? "none",
      leftHand: o.leftHand ?? (o.costume || o.rightHand ? "none" : ex.leftHand),
      rightHand: o.rightHand ?? (o.costume ? "none" : ex.rightHand),
    },
  };
}

// ---- random look --------------------------------------------------------------------------

/** Colours the dice picks clothes from (tasteful, varied). */
export const FABRIC_COLORS = [
  "#ffffff",
  "#f4f4f2",
  "#ead4aa",
  "#c28569",
  "#8a6a4a",
  "#5a3a28",
  "#1f1b2a",
  "#3a3f47",
  "#5a6988",
  "#8b9bb4",
  "#c0cbdc",
  "#262b44",
  "#1f3d6b",
  "#0058a8",
  "#0099db",
  "#2ce8f5",
  "#193c3e",
  "#265c42",
  "#3e8948",
  "#63c74d",
  "#fee761",
  "#feae34",
  "#f77622",
  "#e43b44",
  "#a22633",
  "#f6757a",
  "#b55088",
  "#68386c",
] as const;
/** Natural skin tones, light to deep, then fantasy tones. */
export const SKIN_COLORS = [
  "#fde3cf",
  "#f6d2b8",
  "#f1c9a8",
  "#e8b796",
  "#d9a47a",
  "#c28569",
  "#a86c4e",
  "#8a5a3c",
  "#6e4630",
  "#4f3122",
  "#8fd18a",
  "#7ab0d6",
  "#b49ad8",
  "#c0cbdc",
] as const;
export const HAIR_HEXES = [
  "#1f1b1a",
  "#3b2819",
  "#5a3e2b",
  "#8a5a3c",
  "#c28a4a",
  "#e8c87a",
  "#f4e6b8",
  "#c0cbdc",
  "#ffffff",
  "#a22633",
  "#e43b44",
  "#f6757a",
  "#b55088",
  "#0099db",
  "#63c74d",
] as const;
export const EYE_COLORS = [
  "#181425",
  "#3b2819",
  "#5a3e2b",
  "#265c42",
  "#0058a8",
  "#5a6988",
] as const;

const pickOf = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const maybe = (r: () => number, p: number) => r() < p;
/** "none" most of the time, else one of the rest. */
const rare = <T>(r: () => number, xs: readonly T[], p = 0.15): T =>
  maybe(r, p) ? pickOf(r, xs.slice(1)) : xs[0]!;

/** A random but valid look (the studio's dice). Deterministic for a seed. */
export function randomLook(seed: number): FullLook {
  const r = mulberry32(seed);
  const col = () => pickOf(r, FABRIC_COLORS);
  const pattern = (base: string): Pattern =>
    maybe(r, 0.3)
      ? { kind: pickOf(r, PATTERN_KINDS.slice(1)), a: mixHex(col(), base, 0.3), b: "none" }
      : plain(base);
  const skin = pickOf(r, SKIN_COLORS.slice(0, maybe(r, 0.9) ? 10 : SKIN_COLORS.length));
  const hairHex = pickOf(r, HAIR_HEXES);
  const shirtKind = pickOf(r, SHIRT_KINDS);
  const shirtCol = col();
  const outerKind = maybe(r, 0.5) ? pickOf(r, OUTER_KINDS) : "none";
  const outerCol = col();
  const bottomsKind = pickOf(r, BOTTOM_KINDS);
  const bottomsCol = col();
  const lw = pickOf(r, LEGWEAR_KINDS);
  return {
    v: LOOK_VERSION,
    build: pickOf(r, BUILDS),
    skin: rampFrom(skin),
    face: {
      shape: pickOf(r, FACE_SHAPES),
      ears: pickOf(r, EARS),
      eyes: pickOf(r, EYES),
      eyeColor: pickOf(r, EYE_COLORS),
      brows: pickOf(r, BROWS),
      expression: pickOf(r, EXPRESSIONS),
      cheeks: pickOf(r, CHEEKS),
      makeup: {
        lips: maybe(r, 0.25) ? pickOf(r, ["#a22633", "#e43b44", "#b55088", "#68386c"]) : "none",
        eyeshadow: maybe(r, 0.15) ? col() : "none",
      },
    },
    hair: {
      cut: pickOf(r, HAIR_CUTS),
      ramp: rampFrom(hairHex),
      sheen: maybe(r, 0.6),
      tips: maybe(r, 0.12) ? pickOf(r, HAIR_HEXES) : "none",
    },
    facialHair: { style: rare(r, FACIAL_HAIR_STYLES, 0.3), color: hairHex },
    eyewear: {
      style: rare(r, EYEWEAR_STYLES, 0.35),
      frame: col(),
      frameAccent: col(),
      framePattern: maybe(r, 0.2) ? "tortoiseshell" : "solid",
      lens: "#c0cbdc",
      tint: maybe(r, 0.2) ? "dark" : "clear",
    },
    headwear: { ...headwearOf(rare(r, HEADWEAR_STYLES, 0.4), col(), col()) },
    earrings: { style: rare(r, EARRING_STYLES, 0.25), color: "#feae34" },
    shirt: shirtOf(shirtKind, shirtCol, {
      pattern: pattern(shirtCol),
      neckwear: maybe(r, 0.15)
        ? pickOf(r, ["tie", "bow-tie", "scarf", "bandana"] as const)
        : "none",
      neckwearColor: col(),
      sleeves: shirtKind === "none" ? "none" : pickOf(r, SLEEVES),
    }),
    vest: maybe(r, 0.2) ? vestOf(pickOf(r, VEST_KINDS), col()) : vestOf("none", "#ffffff"),
    outer: outerOf(outerKind, outerCol, {
      pattern: pattern(outerCol),
      length: pickOf(r, OUTER_LENGTHS),
      agentColored: maybe(r, 0.15),
    }),
    bottoms: bottomsOf(bottomsKind, bottomsCol, {
      pattern: pattern(bottomsCol),
      embroidery: { motif: rare(r, EMBROIDERY_MOTIFS), color: col(), stitching: "none" },
      belt: maybe(r, 0.3) ? col() : "none",
    }),
    legwear: legwearOf(lw, col(), maybe(r, 0.2) ? col() : "none"),
    shoes: shoesOf(pickOf(r, SHOE_KINDS), col()),
    pose: {
      hands: pickOf(r, HAND_POSES),
      stance: maybe(r, 0.3) ? "wide" : "neutral",
      headTilt: maybe(r, 0.2),
    },
    extras: {
      leftHand: rare(r, HELD_KINDS, 0.2),
      rightHand: rare(r, HELD_KINDS, 0.2),
      costume: "none",
      wrist: rare(r, WRIST_KINDS, 0.1),
      accent: col(),
      leftTint: maybe(r, 0.2) ? col() : "none",
      rightTint: maybe(r, 0.2) ? col() : "none",
      costumeTint: "none",
      wristTint: "none",
    },
    body: { height: pickOf(r, HEIGHTS), figure: pickOf(r, FIGURES) },
    underwear: underwearOf(
      shirtKind === "none" || maybe(r, 0.3) ? pickOf(r, UNDERWEAR_TOPS) : "none",
      col(),
      bottomsKind === "none" ? pickOf(r, UNDERWEAR_BOTTOMS.slice(1)) : pickOf(r, UNDERWEAR_BOTTOMS),
      col(),
      { trim: maybe(r, 0.3) ? col() : "none" },
    ),
    apron: maybe(r, 0.1)
      ? apronOf(
          pickOf(r, ["dirndl", "kitchen", "waist"] as const),
          col(),
          pickOf(r, ["left", "right", "front", "back"] as const),
        )
      : DEFAULT_APRON,
    accessories: accessoriesOf({
      mask: [rare(r, MASKS, 0.08), col()],
      wings: [rare(r, WINGS, 0.08), col()],
      tail: [rare(r, TAILS, 0.08), col()],
      gloves: [rare(r, GLOVES, 0.1), col()],
      necklace: [rare(r, NECKLACES, 0.15), col()],
      bag: [rare(r, BAGS, 0.15), col()],
    }),
  };
}
