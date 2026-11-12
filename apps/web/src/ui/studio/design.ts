/**
 * The look studio's "Design it" editor (WD8), as data: sections of rows over the whole look.
 * A row is a carousel of kinds (or none) plus the colour chips of that part; every getter and
 * setter works on a `Draft`, the avatar with its full look. Pure (no DOM), so it is unit tested.
 */
import {
  ACCENT_COLORS,
  APRON_BOWS,
  APRON_KINDS,
  type AvatarSpec,
  BAGS,
  BOTTOM_KINDS,
  BROWS,
  BUILDS,
  CHEEKS,
  COLLARS,
  COSTUME_KINDS,
  DESK_MESS_LEVELS,
  DESK_PROPS,
  EARRING_STYLES,
  EARS,
  EXPRESSIONS,
  EYES,
  EYEWEAR_STYLES,
  FACE_SHAPES,
  FACIAL_HAIR_STYLES,
  FIGURES,
  type FullLook,
  GLOVES,
  HAIR_CLIPS,
  HAIR_CUTS,
  HAND_POSES,
  HEADWEAR_STYLES,
  HEIGHTS,
  HELD_ITEMS,
  HELD_KINDS,
  HEMS,
  LEGWEAR_KINDS,
  LENS_TINTS,
  MASKS,
  MAX_DESK_PROPS,
  NECKLACES,
  NECKWEAR,
  OUTER_KINDS,
  OUTER_LENGTHS,
  PATTERN_KINDS,
  type Pattern,
  type Ramp,
  rampFrom,
  resolveLook,
  SHIRT_KINDS,
  SHIRT_LENGTHS,
  SHOE_KINDS,
  SLEEVES,
  SUSPENDERS,
  TAILS,
  UNDERWEAR_BOTTOMS,
  UNDERWEAR_TOPS,
  VEHICLES,
  VEST_KINDS,
  WINGS,
  WRIST_KINDS,
  withWardrobe,
} from "@agent-office/protocol";

/** The avatar being designed: its look always has every wardrobe section. */
export type Draft = Omit<AvatarSpec, "look"> & { look: FullLook };

/** A draft of the look an avatar wears now (an AI look included). */
export function draftOf(avatar: AvatarSpec): Draft {
  return structuredClone({ ...avatar, look: withWardrobe(resolveLook(avatar)) });
}

/** Comparable form of a draft (dirty check). */
export const draftKey = (d: Draft): string => JSON.stringify(d);

export type Opt = { id: string; label: string };
/** Which swatches a colour chip offers. */
export type Palette = "fabric" | "skin" | "hair" | "eyes";
export type ColorSlot = {
  id: string;
  label: string;
  get: (d: Draft) => string;
  set: (d: Draft, hex: string) => void;
  /** may be "none" (no colour / feature off) */
  none?: boolean;
  palette?: Palette;
};
export type DesignRow = {
  id: string;
  label: string;
  /** carousel choices; empty = a colour-only row */
  options: readonly Opt[];
  get: (d: Draft) => string;
  set: (d: Draft, id: string) => void;
  colors?: ColorSlot[];
  /** colour chips only while this holds (default: the row's value is not "none") */
  colorsShown?: (d: Draft) => boolean;
  /** the row only while this holds */
  shown?: (d: Draft) => boolean;
  /** choices to skip right now (desk props already on another slot) */
  skip?: (d: Draft) => ReadonlySet<string>;
};
export type DesignSection = { id: string; title: string; rows: DesignRow[] };

// ---- labels -------------------------------------------------------------------------------

const SPECIAL: Record<string, string> = {
  none: "none",
  tshirt: "T-shirt",
  "trachten-shirt": "Trachten shirt",
  "trachten-vest": "Trachten vest",
  "dirndl-blouse": "dirndl blouse",
  "dirndl-bodice": "dirndl bodice",
  "dirndl-skirt": "dirndl skirt",
  "kneebund-lederhosen": "knee lederhosen",
  loferl: "Loferl (calf warmers)",
  haferl: "Haferl shoes",
  "tyrolean-hat": "Tyrolean hat",
  "h-bridge": "H-bridge",
  "very-tall": "very tall",
  "cap-backwards": "cap (backwards)",
  "hand-in-pocket": "hand in pocket",
  "hands-in-pockets": "hands in pockets",
  "hands-on-hips": "hands on hips",
  "arms-crossed": "arms crossed",
};
/** "cowboy-hat" -> "cowboy hat" */
export const labelOf = (id: string): string => SPECIAL[id] ?? id.replace(/-/g, " ");
const opts = (ids: readonly string[]): Opt[] => ids.map((id) => ({ id, label: labelOf(id) }));
const YES_NO: Opt[] = [
  { id: "false", label: "no" },
  { id: "true", label: "yes" },
];

// ---- builders -----------------------------------------------------------------------------

type L = FullLook;
/** A ramp colour chip: shows the base, picking a colour sets the whole ramp from it. */
const rampChip = (
  id: string,
  label: string,
  get: (l: L) => Ramp,
  set: (l: L, r: Ramp) => void,
  palette: Palette = "fabric",
): ColorSlot => ({
  id,
  label,
  palette,
  get: (d) => get(d.look).base,
  set: (d, hex) => set(d.look, rampFrom(hex)),
});
const hexChip = (
  id: string,
  label: string,
  get: (l: L) => string,
  set: (l: L, hex: string) => void,
  none = false,
  palette: Palette = "fabric",
): ColorSlot => ({
  id,
  label,
  none,
  palette,
  get: (d) => get(d.look),
  set: (d, h) => set(d.look, h),
});

/** A carousel over one enum field of the look. */
function kindRow(
  id: string,
  label: string,
  values: readonly string[],
  get: (l: L) => string,
  set: (l: L, v: string) => void,
  extra: Partial<DesignRow> = {},
): DesignRow {
  return {
    id,
    label,
    options: opts(values),
    get: (d) => get(d.look),
    set: (d, v) => set(d.look, v),
    ...extra,
  };
}
const boolRow = (
  id: string,
  label: string,
  get: (l: L) => boolean,
  set: (l: L, v: boolean) => void,
  extra: Partial<DesignRow> = {},
): DesignRow => ({
  id,
  label,
  options: YES_NO,
  get: (d) => String(get(d.look)),
  set: (d, v) => set(d.look, v === "true"),
  ...extra,
});
/** The pattern of a garment: kind carousel + its two colours. */
function patternRow(
  id: string,
  label: string,
  get: (l: L) => Pattern,
  set: (l: L, p: Pattern) => void,
  shown: (l: L) => boolean,
): DesignRow {
  return {
    id,
    label,
    options: opts(PATTERN_KINDS),
    get: (d) => get(d.look).kind,
    set: (d, v) => set(d.look, { ...get(d.look), kind: v as Pattern["kind"] }),
    shown: (d) => shown(d.look),
    colors: [
      hexChip(
        `${id}-a`,
        "pattern colour",
        (l) => get(l).a,
        (l, h) => set(l, { ...get(l), a: h }),
      ),
      hexChip(
        `${id}-b`,
        "second colour",
        (l) => get(l).b,
        (l, h) => set(l, { ...get(l), b: h }),
        true,
      ),
    ],
  };
}

// ---- sections -----------------------------------------------------------------------------

const deskSlots = Array.from({ length: MAX_DESK_PROPS }, (_, i) => i);
const propsOf = (d: Draft): string[] => deskSlots.map((i) => d.deskProps[i] ?? "none");

export const DESIGN_SECTIONS: readonly DesignSection[] = [
  {
    id: "body",
    title: "Body",
    rows: [
      kindRow(
        "height",
        "Height",
        HEIGHTS,
        (l) => l.body.height,
        (l, v) => {
          l.body = { ...l.body, height: v as L["body"]["height"] };
        },
      ),
      kindRow(
        "build",
        "Build",
        BUILDS,
        (l) => l.build,
        (l, v) => {
          l.build = v as L["build"];
        },
      ),
      kindRow(
        "figure",
        "Figure",
        FIGURES,
        (l) => l.body.figure,
        (l, v) => {
          l.body = { ...l.body, figure: v as L["body"]["figure"] };
        },
      ),
      {
        id: "skin",
        label: "Skin",
        options: [],
        get: () => "",
        set: () => {},
        colorsShown: () => true,
        colors: [
          rampChip(
            "skin",
            "skin",
            (l) => l.skin,
            (l, r) => {
              l.skin = r;
            },
            "skin",
          ),
        ],
      },
      kindRow(
        "pose",
        "Pose",
        HAND_POSES,
        (l) => l.pose.hands,
        (l, v) => {
          l.pose = { ...l.pose, hands: v as L["pose"]["hands"] };
        },
      ),
      kindRow(
        "stance",
        "Stance",
        ["neutral", "wide"],
        (l) => l.pose.stance,
        (l, v) => {
          l.pose = { ...l.pose, stance: v as L["pose"]["stance"] };
        },
      ),
    ],
  },
  {
    id: "face",
    title: "Face",
    rows: [
      kindRow(
        "face",
        "Face",
        FACE_SHAPES,
        (l) => l.face.shape,
        (l, v) => {
          l.face = { ...l.face, shape: v as L["face"]["shape"] };
        },
      ),
      kindRow(
        "eyes",
        "Eyes",
        EYES,
        (l) => l.face.eyes,
        (l, v) => {
          l.face = { ...l.face, eyes: v as L["face"]["eyes"] };
        },
        {
          colorsShown: () => true,
          colors: [
            hexChip(
              "eye-color",
              "eye colour",
              (l) => l.face.eyeColor,
              (l, h) => {
                l.face = { ...l.face, eyeColor: h };
              },
              false,
              "eyes",
            ),
          ],
        },
      ),
      kindRow(
        "brows",
        "Brows",
        BROWS,
        (l) => l.face.brows,
        (l, v) => {
          l.face = { ...l.face, brows: v as L["face"]["brows"] };
        },
      ),
      kindRow(
        "expression",
        "Mouth",
        EXPRESSIONS,
        (l) => l.face.expression,
        (l, v) => {
          l.face = { ...l.face, expression: v as L["face"]["expression"] };
        },
      ),
      kindRow(
        "cheeks",
        "Cheeks",
        CHEEKS,
        (l) => l.face.cheeks,
        (l, v) => {
          l.face = { ...l.face, cheeks: v as L["face"]["cheeks"] };
        },
      ),
      kindRow(
        "ears",
        "Ears",
        EARS,
        (l) => l.face.ears,
        (l, v) => {
          l.face = { ...l.face, ears: v as L["face"]["ears"] };
        },
      ),
      {
        id: "makeup",
        label: "Makeup",
        options: [],
        get: () => "",
        set: () => {},
        colorsShown: () => true,
        colors: [
          hexChip(
            "lips",
            "lipstick",
            (l) => l.face.makeup?.lips ?? "none",
            (l, h) => {
              l.face = { ...l.face, makeup: { eyeshadow: "none", ...l.face.makeup, lips: h } };
            },
            true,
          ),
          hexChip(
            "eyeshadow",
            "eyeshadow",
            (l) => l.face.makeup?.eyeshadow ?? "none",
            (l, h) => {
              l.face = { ...l.face, makeup: { lips: "none", ...l.face.makeup, eyeshadow: h } };
            },
            true,
          ),
        ],
      },
    ],
  },
  {
    id: "hair",
    title: "Hair",
    rows: [
      kindRow(
        "cut",
        "Hair",
        HAIR_CUTS,
        (l) => l.hair.cut,
        (l, v) => {
          l.hair = { ...l.hair, cut: v as L["hair"]["cut"] };
        },
        {
          colorsShown: (d) => d.look.hair.cut !== "bald",
          colors: [
            rampChip(
              "hair",
              "hair colour",
              (l) => l.hair.ramp,
              (l, r) => {
                l.hair = { ...l.hair, ramp: r };
              },
              "hair",
            ),
            hexChip(
              "tips",
              "dyed tips",
              (l) => l.hair.tips ?? "none",
              (l, h) => {
                l.hair = { ...l.hair, tips: h };
              },
              true,
              "hair",
            ),
          ],
        },
      ),
      boolRow(
        "sheen",
        "Shine",
        (l) => l.hair.sheen,
        (l, v) => {
          l.hair = { ...l.hair, sheen: v };
        },
      ),
      kindRow(
        "clips",
        "Hair clips",
        HAIR_CLIPS,
        (l) => l.hair.clips ?? "none",
        (l, v) => {
          l.hair = { ...l.hair, clips: v as NonNullable<L["hair"]["clips"]> };
        },
        { shown: (d) => d.look.hair.cut !== "bald" },
      ),
      kindRow(
        "beard",
        "Beard",
        FACIAL_HAIR_STYLES,
        (l) => l.facialHair.style,
        (l, v) => {
          l.facialHair = { ...l.facialHair, style: v as L["facialHair"]["style"] };
        },
        {
          colors: [
            hexChip(
              "beard-color",
              "beard colour",
              (l) => l.facialHair.color,
              (l, h) => {
                l.facialHair = { ...l.facialHair, color: h };
              },
              false,
              "hair",
            ),
          ],
        },
      ),
    ],
  },
  {
    id: "head",
    title: "Head",
    rows: [
      kindRow(
        "hat",
        "Hat",
        HEADWEAR_STYLES,
        (l) => l.headwear.style,
        (l, v) => {
          l.headwear = { ...l.headwear, style: v as L["headwear"]["style"] };
        },
        {
          colors: [
            rampChip(
              "hat-color",
              "hat colour",
              (l) => l.headwear.ramp,
              (l, r) => {
                l.headwear = { ...l.headwear, ramp: r };
              },
            ),
            hexChip(
              "hat-accent",
              "band / trim",
              (l) => l.headwear.accent,
              (l, h) => {
                l.headwear = { ...l.headwear, accent: h };
              },
            ),
          ],
        },
      ),
      kindRow(
        "glasses",
        "Glasses",
        EYEWEAR_STYLES,
        (l) => l.eyewear.style,
        (l, v) => {
          l.eyewear = { ...l.eyewear, style: v as L["eyewear"]["style"] };
        },
        {
          colors: [
            hexChip(
              "frame",
              "frame",
              (l) => l.eyewear.frame,
              (l, h) => {
                l.eyewear = { ...l.eyewear, frame: h };
              },
            ),
            hexChip(
              "lens",
              "lens",
              (l) => l.eyewear.lens,
              (l, h) => {
                l.eyewear = { ...l.eyewear, lens: h };
              },
            ),
          ],
        },
      ),
      kindRow(
        "tint",
        "Lenses",
        LENS_TINTS,
        (l) => l.eyewear.tint,
        (l, v) => {
          l.eyewear = { ...l.eyewear, tint: v as L["eyewear"]["tint"] };
        },
        { shown: (d) => d.look.eyewear.style !== "none" },
      ),
      kindRow(
        "earrings",
        "Earrings",
        EARRING_STYLES,
        (l) => l.earrings.style,
        (l, v) => {
          l.earrings = { ...l.earrings, style: v as L["earrings"]["style"] };
        },
        {
          colors: [
            hexChip(
              "earring-color",
              "earrings",
              (l) => l.earrings.color,
              (l, h) => {
                l.earrings = { ...l.earrings, color: h };
              },
            ),
          ],
        },
      ),
      kindRow(
        "mask",
        "Mask",
        MASKS,
        (l) => l.accessories.mask.kind,
        (l, v) => {
          l.accessories = { ...l.accessories, mask: { ...l.accessories.mask, kind: v as never } };
        },
        {
          colors: [
            hexChip(
              "mask-color",
              "mask",
              (l) => l.accessories.mask.color,
              (l, h) => {
                l.accessories = { ...l.accessories, mask: { ...l.accessories.mask, color: h } };
              },
            ),
          ],
        },
      ),
    ],
  },
  {
    id: "top",
    title: "Top",
    rows: [
      kindRow(
        "under-top",
        "Underwear top",
        UNDERWEAR_TOPS,
        (l) => l.underwear.top,
        (l, v) => {
          l.underwear = { ...l.underwear, top: v as L["underwear"]["top"] };
        },
        {
          colors: [
            rampChip(
              "under-top-color",
              "underwear top",
              (l) => l.underwear.topRamp,
              (l, r) => {
                l.underwear = { ...l.underwear, topRamp: r };
              },
            ),
            hexChip(
              "under-trim",
              "trim",
              (l) => l.underwear.trim,
              (l, h) => {
                l.underwear = { ...l.underwear, trim: h };
              },
              true,
            ),
          ],
        },
      ),
      kindRow(
        "shirt",
        "Shirt",
        SHIRT_KINDS,
        (l) => l.shirt.kind,
        (l, v) => {
          l.shirt = { ...l.shirt, kind: v as L["shirt"]["kind"] };
        },
        {
          colors: [
            rampChip(
              "shirt-color",
              "shirt",
              (l) => l.shirt.ramp,
              (l, r) => {
                l.shirt = { ...l.shirt, ramp: r, pattern: { ...l.shirt.pattern } };
              },
            ),
          ],
        },
      ),
      patternRow(
        "shirt-pattern",
        "Shirt pattern",
        (l) => l.shirt.pattern,
        (l, p) => {
          l.shirt = { ...l.shirt, pattern: p };
        },
        (l) => l.shirt.kind !== "none",
      ),
      kindRow(
        "collar",
        "Collar",
        COLLARS,
        (l) => l.shirt.collar,
        (l, v) => {
          l.shirt = { ...l.shirt, collar: v as L["shirt"]["collar"] };
        },
        { shown: (d) => d.look.shirt.kind !== "none" },
      ),
      kindRow(
        "sleeves",
        "Sleeves",
        SLEEVES,
        (l) => l.shirt.sleeves,
        (l, v) => {
          l.shirt = { ...l.shirt, sleeves: v as L["shirt"]["sleeves"] };
        },
        { shown: (d) => d.look.shirt.kind !== "none" },
      ),
      kindRow(
        "shirt-length",
        "Shirt length",
        ["auto", ...SHIRT_LENGTHS],
        (l) => l.shirt.length ?? "auto",
        (l, v) => {
          const { length: _old, ...shirt } = l.shirt;
          l.shirt =
            v === "auto" ? shirt : { ...shirt, length: v as NonNullable<L["shirt"]["length"]> };
        },
        { shown: (d) => d.look.shirt.kind !== "none" },
      ),
      kindRow(
        "neckwear",
        "Tie / scarf",
        NECKWEAR,
        (l) => l.shirt.neckwear,
        (l, v) => {
          l.shirt = { ...l.shirt, neckwear: v as L["shirt"]["neckwear"] };
        },
        {
          colors: [
            hexChip(
              "neckwear-color",
              "tie / scarf",
              (l) => l.shirt.neckwearColor,
              (l, h) => {
                l.shirt = { ...l.shirt, neckwearColor: h };
              },
            ),
          ],
        },
      ),
      kindRow(
        "vest",
        "Vest / bodice",
        VEST_KINDS,
        (l) => l.vest.kind,
        (l, v) => {
          l.vest = { ...l.vest, kind: v as L["vest"]["kind"] };
        },
        {
          colors: [
            rampChip(
              "vest-color",
              "vest",
              (l) => l.vest.ramp,
              (l, r) => {
                l.vest = { ...l.vest, ramp: r };
              },
            ),
            hexChip(
              "vest-piping",
              "piping / lacing",
              (l) => l.vest.piping,
              (l, h) => {
                l.vest = { ...l.vest, piping: h };
              },
              true,
            ),
          ],
        },
      ),
      patternRow(
        "vest-pattern",
        "Vest pattern",
        (l) => l.vest.pattern,
        (l, p) => {
          l.vest = { ...l.vest, pattern: p };
        },
        (l) => l.vest.kind !== "none",
      ),
      kindRow(
        "outer",
        "Jacket / coat",
        OUTER_KINDS,
        (l) => l.outer.kind,
        (l, v) => {
          l.outer = { ...l.outer, kind: v as L["outer"]["kind"] };
        },
        {
          colorsShown: (d) => d.look.outer.kind !== "none" && !d.look.outer.agentColored,
          colors: [
            rampChip(
              "outer-color",
              "jacket",
              (l) => l.outer.ramp,
              (l, r) => {
                l.outer = { ...l.outer, ramp: r };
              },
            ),
            hexChip(
              "outer-collar",
              "collar / lapels",
              (l) => l.outer.collarColor,
              (l, h) => {
                l.outer = { ...l.outer, collarColor: h };
              },
              true,
            ),
            hexChip(
              "outer-piping",
              "trim",
              (l) => l.outer.piping,
              (l, h) => {
                l.outer = { ...l.outer, piping: h };
              },
              true,
            ),
          ],
        },
      ),
      boolRow(
        "agent-colored",
        "In my agent's colour",
        (l) => l.outer.agentColored,
        (l, v) => {
          l.outer = { ...l.outer, agentColored: v };
        },
        { shown: (d) => d.look.outer.kind !== "none" },
      ),
      boolRow(
        "open",
        "Worn open",
        (l) => l.outer.open,
        (l, v) => {
          l.outer = { ...l.outer, open: v };
        },
        { shown: (d) => d.look.outer.kind !== "none" },
      ),
      kindRow(
        "length",
        "Length",
        OUTER_LENGTHS,
        (l) => l.outer.length,
        (l, v) => {
          l.outer = { ...l.outer, length: v as L["outer"]["length"] };
        },
        { shown: (d) => d.look.outer.kind !== "none" },
      ),
      patternRow(
        "outer-pattern",
        "Jacket pattern",
        (l) => l.outer.pattern,
        (l, p) => {
          l.outer = { ...l.outer, pattern: p };
        },
        (l) => l.outer.kind !== "none" && !l.outer.agentColored,
      ),
      kindRow(
        "buttons",
        "Buttons",
        ["0", "1", "2", "3", "4", "5", "6", "7", "8"],
        (l) => String(l.outer.buttons.count),
        (l, v) => {
          l.outer = { ...l.outer, buttons: { ...l.outer.buttons, count: Number(v) } };
        },
        {
          shown: (d) => d.look.outer.kind !== "none",
          colorsShown: (d) => d.look.outer.buttons.count > 0,
          colors: [
            hexChip(
              "button-color",
              "buttons",
              (l) => l.outer.buttons.color,
              (l, h) => {
                l.outer = { ...l.outer, buttons: { ...l.outer.buttons, color: h } };
              },
            ),
          ],
        },
      ),
    ],
  },
  {
    id: "bottom",
    title: "Bottom",
    rows: [
      kindRow(
        "under-bottom",
        "Underwear",
        UNDERWEAR_BOTTOMS,
        (l) => l.underwear.bottom,
        (l, v) => {
          l.underwear = { ...l.underwear, bottom: v as L["underwear"]["bottom"] };
        },
        {
          colors: [
            rampChip(
              "under-bottom-color",
              "underwear",
              (l) => l.underwear.bottomRamp,
              (l, r) => {
                l.underwear = { ...l.underwear, bottomRamp: r };
              },
            ),
          ],
        },
      ),
      patternRow(
        "under-pattern",
        "Underwear pattern",
        (l) => l.underwear.pattern,
        (l, p) => {
          l.underwear = { ...l.underwear, pattern: p };
        },
        (l) => l.underwear.top !== "none" || l.underwear.bottom !== "none",
      ),
      kindRow(
        "bottoms",
        "Trousers / skirt",
        BOTTOM_KINDS,
        (l) => l.bottoms.kind,
        (l, v) => {
          l.bottoms = {
            ...l.bottoms,
            kind: v as L["bottoms"]["kind"],
            flap: v === "lederhosen" || v === "kneebund-lederhosen",
          };
        },
        {
          colors: [
            rampChip(
              "bottoms-color",
              "trousers / skirt",
              (l) => l.bottoms.ramp,
              (l, r) => {
                l.bottoms = { ...l.bottoms, ramp: r };
              },
            ),
            hexChip(
              "belt",
              "belt",
              (l) => l.bottoms.belt,
              (l, h) => {
                l.bottoms = { ...l.bottoms, belt: h };
              },
              true,
            ),
          ],
        },
      ),
      patternRow(
        "bottoms-pattern",
        "Pattern",
        (l) => l.bottoms.pattern,
        (l, p) => {
          l.bottoms = { ...l.bottoms, pattern: p };
        },
        (l) => l.bottoms.kind !== "none",
      ),
      kindRow(
        "hem",
        "Hem",
        HEMS,
        (l) => l.bottoms.hem,
        (l, v) => {
          l.bottoms = { ...l.bottoms, hem: v as L["bottoms"]["hem"] };
        },
        { shown: (d) => d.look.bottoms.kind !== "none" },
      ),
      kindRow(
        "suspenders",
        "Suspenders",
        SUSPENDERS,
        (l) => l.bottoms.suspenders,
        (l, v) => {
          l.bottoms = { ...l.bottoms, suspenders: v as L["bottoms"]["suspenders"] };
        },
        {
          shown: (d) => d.look.bottoms.kind !== "none",
          colors: [
            hexChip(
              "suspenders-color",
              "suspenders",
              (l) => l.bottoms.suspendersColor,
              (l, h) => {
                l.bottoms = { ...l.bottoms, suspendersColor: h };
              },
            ),
          ],
        },
      ),
      kindRow(
        "apron",
        "Apron",
        APRON_KINDS,
        (l) => l.apron.kind,
        (l, v) => {
          l.apron = { ...l.apron, kind: v as L["apron"]["kind"] };
        },
        {
          colors: [
            rampChip(
              "apron-color",
              "apron",
              (l) => l.apron.ramp,
              (l, r) => {
                l.apron = { ...l.apron, ramp: r };
              },
            ),
          ],
        },
      ),
      kindRow(
        "bow",
        "Apron bow",
        APRON_BOWS,
        (l) => l.apron.bow,
        (l, v) => {
          l.apron = { ...l.apron, bow: v as L["apron"]["bow"] };
        },
        { shown: (d) => d.look.apron.kind !== "none" },
      ),
      kindRow(
        "legwear",
        "Socks / tights",
        LEGWEAR_KINDS,
        (l) => l.legwear.kind,
        (l, v) => {
          l.legwear = { ...l.legwear, kind: v as L["legwear"]["kind"] };
        },
        {
          colors: [
            hexChip(
              "legwear-color",
              "socks / tights",
              (l) => l.legwear.color,
              (l, h) => {
                l.legwear = { ...l.legwear, color: h };
              },
            ),
            hexChip(
              "legwear-accent",
              "stripe",
              (l) => l.legwear.accent,
              (l, h) => {
                l.legwear = { ...l.legwear, accent: h };
              },
              true,
            ),
          ],
        },
      ),
      kindRow(
        "shoes",
        "Shoes",
        SHOE_KINDS,
        (l) => l.shoes.kind,
        (l, v) => {
          l.shoes = { ...l.shoes, kind: v as L["shoes"]["kind"] };
        },
        {
          colors: [
            rampChip(
              "shoes-color",
              "shoes",
              (l) => l.shoes.ramp,
              (l, r) => {
                l.shoes = { ...l.shoes, ramp: r };
              },
            ),
            hexChip(
              "sole",
              "sole",
              (l) => l.shoes.sole,
              (l, h) => {
                l.shoes = { ...l.shoes, sole: h };
              },
            ),
            hexChip(
              "shoe-accent",
              "details",
              (l) => l.shoes.accent,
              (l, h) => {
                l.shoes = { ...l.shoes, accent: h };
              },
              true,
            ),
          ],
        },
      ),
    ],
  },
  {
    id: "extras",
    title: "Extras",
    rows: [
      ...(["leftHand", "rightHand"] as const).map((hand) => {
        const tint = hand === "leftHand" ? "leftTint" : "rightTint";
        return kindRow(
          hand,
          hand === "leftHand" ? "Left hand" : "Right hand",
          HELD_KINDS,
          (l) => l.extras?.[hand] ?? "none",
          (l, v) => {
            l.extras = { ...extrasOf(l), [hand]: v };
          },
          {
            options: HELD_ITEMS.length
              ? [{ id: "none", label: "nothing" }, ...HELD_ITEMS.filter((h) => h.id !== "none")]
              : opts(HELD_KINDS),
            colors: [
              hexChip(
                `${hand}-tint`,
                "item colour",
                (l) => l.extras?.[tint] ?? "none",
                (l, h) => {
                  l.extras = { ...extrasOf(l), [tint]: h };
                },
                true,
              ),
            ],
          },
        );
      }),
      ...(["wings", "tail", "gloves", "necklace", "bag"] as const).map((k) =>
        kindRow(
          k,
          labelOf(k).replace(/^./, (c) => c.toUpperCase()),
          { wings: WINGS, tail: TAILS, gloves: GLOVES, necklace: NECKLACES, bag: BAGS }[k],
          (l) => l.accessories[k].kind,
          (l, v) => {
            l.accessories = { ...l.accessories, [k]: { ...l.accessories[k], kind: v } };
          },
          {
            colors: [
              hexChip(
                `${k}-color`,
                k,
                (l) => l.accessories[k].color,
                (l, h) => {
                  l.accessories = { ...l.accessories, [k]: { ...l.accessories[k], color: h } };
                },
              ),
            ],
          },
        ),
      ),
      kindRow(
        "costume",
        "Costume details",
        COSTUME_KINDS,
        (l) => l.extras?.costume ?? "none",
        (l, v) => {
          l.extras = { ...extrasOf(l), costume: v as never };
        },
        {
          colors: [
            hexChip(
              "costume-tint",
              "costume colour",
              (l) => l.extras?.costumeTint ?? "none",
              (l, h) => {
                l.extras = { ...extrasOf(l), costumeTint: h };
              },
              true,
            ),
          ],
        },
      ),
      kindRow(
        "wrist",
        "Bracelets",
        WRIST_KINDS,
        (l) => l.extras?.wrist ?? "none",
        (l, v) => {
          l.extras = { ...extrasOf(l), wrist: v as never };
        },
        {
          colors: [
            hexChip(
              "wrist-tint",
              "bracelet colour",
              (l) => l.extras?.wristTint ?? "none",
              (l, h) => {
                l.extras = { ...extrasOf(l), wristTint: h };
              },
              true,
            ),
          ],
        },
      ),
      {
        id: "accent",
        label: "Glow colour",
        options: [],
        get: () => "",
        set: () => {},
        colorsShown: () => true,
        colors: [
          hexChip(
            "accent-color",
            "lightsaber, balloon, party hat",
            (l) => extrasOf(l).accent,
            (l, h) => {
              l.extras = { ...extrasOf(l), accent: h };
            },
          ),
        ],
      },
      boolRow(
        "tilt",
        "Head tilt",
        (l) => l.pose.headTilt,
        (l, v) => {
          l.pose = { ...l.pose, headTilt: v };
        },
      ),
    ],
  },
  {
    id: "desk",
    title: "Desk & ride",
    rows: [
      ...deskSlots.map(
        (i): DesignRow => ({
          id: `desk${i}`,
          label: `Desk item ${i + 1}`,
          options: [{ id: "none", label: "nothing" }, ...DESK_PROPS],
          get: (d) => propsOf(d)[i]!,
          set: (d, id) => {
            const slots = propsOf(d);
            slots[i] = id;
            d.deskProps = slots.filter((x) => x !== "none") as Draft["deskProps"];
          },
          skip: (d) => new Set(propsOf(d).filter((x, j) => j !== i && x !== "none")),
        }),
      ),
      {
        id: "deskMess",
        label: "Desk mess",
        options: DESK_MESS_LEVELS.map((m) => ({
          id: String(m),
          label: ["spotless", "a bit messy", "messy", "chaos"][m]!,
        })),
        get: (d) => String(d.deskMess),
        set: (d, id) => {
          d.deskMess = Number(id) as Draft["deskMess"];
        },
      },
      {
        id: "vehicle",
        label: "Ride",
        options: VEHICLES,
        get: (d) => d.vehicle,
        set: (d, id) => {
          d.vehicle = id as Draft["vehicle"];
        },
      },
      {
        id: "accentColor",
        label: "Party colour",
        options: ACCENT_COLORS,
        get: (d) => d.accentColor,
        set: (d, id) => {
          d.accentColor = id as Draft["accentColor"];
        },
      },
    ],
  },
];

function extrasOf(l: L): NonNullable<L["extras"]> {
  return (
    l.extras ?? {
      leftHand: "none",
      rightHand: "none",
      costume: "none",
      wrist: "none",
      accent: "#2ce8f5",
    }
  );
}

/** Rows of a section that show for this draft. */
export const visibleRows = (s: DesignSection, d: Draft): DesignRow[] =>
  s.rows.filter((r) => r.shown?.(d) ?? true);

/** Colour chips of a row that show for this draft. */
export function visibleColors(r: DesignRow, d: Draft): ColorSlot[] {
  if (!r.colors?.length) return [];
  const on = r.colorsShown ? r.colorsShown(d) : r.get(d) !== "none" && r.get(d) !== "false";
  return on ? r.colors : [];
}

/** The avatar to save: the draft as an AvatarSpec (its look included). */
export const avatarOfDraft = (d: Draft): AvatarSpec => structuredClone(d);
