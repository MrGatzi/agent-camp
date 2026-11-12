/**
 * Detailed character looks ("paper doll" v1).
 *
 * A `CharacterLook` describes one character for the HD (32×48 texel) renderer: free hex
 * colour ramps, many garment/part types, small detail layers (patterns, piping, buttons,
 * embroidery), facial expression and a standing pose. GenUI providers fill it from a free-text
 * description; catalog-only avatars get one from `lookFromCatalog` (avatarLook.ts).
 *
 * Every field is required so strict structured-output schemas can be derived from it.
 * Colours are free `#rrggbb` (characters are the one exception to the Endesga-only palette).
 *
 * Must not import catalog.ts (catalog.ts imports this file).
 */
import { z } from "zod";

export const LOOK_VERSION = 1 as const;

export const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe("#rrggbb");
export const OptHex = z
  .union([Hex, z.literal("none")])
  .describe('#rrggbb, or "none" = feature absent / same colour as the garment');
export const Ramp = z
  .object({
    base: Hex,
    shadow: Hex.describe("#rrggbb, ~20-30% darker than base, slightly hue-shifted"),
    light: Hex.describe("#rrggbb, ~15-20% lighter than base"),
  })
  .describe("3-step colour ramp");
export type Ramp = z.infer<typeof Ramp>;

export const PATTERN_KINDS = [
  "none",
  "dots",
  "pinstripe",
  "stripes",
  "check",
  "plaid",
  "damask",
  "floral",
  "heather",
  "worn",
  "camo",
  // crazy wardrobe (WD12)
  "leopard",
  "zebra",
  "flames",
  "tie-dye",
  "sequins",
  "galaxy",
] as const;
export const Pattern = z
  .object({
    kind: z
      .enum(PATTERN_KINDS)
      .describe(
        'fabric pattern; "worn" = blotchy patina (a = lighter patches, b = darker patches)',
      ),
    a: Hex.describe("#rrggbb main motif colour"),
    b: OptHex.describe('#rrggbb second motif colour, or "none"'),
  })
  .describe("pattern drawn over the garment ramp");
export type Pattern = z.infer<typeof Pattern>;

export const BUTTON_SIZES = ["small", "large"] as const;
/** single = one row down the centre; double = two rows (double-breasted) */
export const BUTTON_LAYOUTS = ["single", "double"] as const;
export const MAX_BUTTONS = 8;
export const Buttons = z
  .object({
    count: z.number().int().min(0).max(MAX_BUTTONS).describe("number of visible buttons, 0-8"),
    color: Hex,
    rim: OptHex.describe('#rrggbb rim/edge colour of each button, or "none"'),
    size: z.enum(BUTTON_SIZES),
    /**
     * Added later: missing in stored looks (then a coat is double-breasted, everything else
     * single). A bad value is dropped, not the whole look. Only the outer garment uses it.
     */
    layout: z
      .enum(BUTTON_LAYOUTS)
      .optional()
      .catch(undefined)
      .describe(
        "single = one row of buttons down the centre; double = two rows (double-breasted). Only used on the outer garment; a closed coat is double-breasted unless this says single",
      ),
  })
  .describe("button row");
export type Buttons = z.infer<typeof Buttons>;

/** torso width -1/0/+1 texel per side */
export const BUILDS = ["slim", "average", "broad"] as const;
export const FACE_SHAPES = ["round", "oval", "narrow", "square"] as const;
export const EARS = ["hidden", "small", "visible", "elf"] as const;
/** happy = ^^ closed */
export const EYES = [
  "dot",
  "round",
  "narrow",
  "happy",
  "star",
  "heart",
  "spiral",
  "glowing",
] as const;
/** colour = hair.ramp.shadow */
export const BROWS = ["none", "thin", "thick"] as const;
/** grin = wide open smile showing upper teeth */
export const EXPRESSIONS = [
  "neutral",
  "smile",
  "big-smile",
  "grin",
  "smirk",
  "serious",
  "surprised",
  // crazy wardrobe (WD12)
  "tongue-out",
  "fangs",
] as const;
export const CHEEKS = ["none", "blush", "freckles", "whiskers", "war-paint", "glitter"] as const;
export const HAIR_CUTS = [
  "bald",
  "buzz",
  "short",
  "slicked-back",
  "side-part",
  "curly",
  "afro",
  "bob",
  /** shoulder length, centre parting, curtain fringe, ends flipped outwards */
  "flip",
  "long",
  "ponytail",
  "bun",
  "mohawk",
  // wardrobe (WD1)
  "pixie",
  "undercut",
  "mullet",
  "pigtails",
  "braids",
  "dreadlocks",
  "space-buns",
  "long-wavy",
  // crazy wardrobe (WD12)
  "anime-spikes",
  "beehive",
  "pompadour",
  "afro-puffs",
  "snakes",
] as const;
export const HAIR_CLIPS = ["none", "few", "many"] as const;
export const FACIAL_HAIR_STYLES = [
  "none",
  "stubble",
  "mustache",
  "goatee",
  "beard",
  "handlebar",
  "mutton-chops",
  "wizard-beard",
  "viking-braids",
] as const;
export const EYEWEAR_STYLES = [
  "none",
  "round",
  "panto",
  "square",
  "rectangle",
  "aviator",
  "cat-eye",
  // crazy wardrobe (WD12)
  "heart",
  "star",
  "3d",
  "monocle",
  "cyber-visor",
] as const;
/** tortoiseshell = speckles of frameAccent */
export const FRAME_PATTERNS = ["solid", "tortoiseshell"] as const;
/** light = eyes faintly visible through lens colour; dark = opaque */
export const LENS_TINTS = ["clear", "light", "dark"] as const;
export const HEADWEAR_STYLES = [
  "none",
  "beanie",
  "cap",
  "cap-backwards",
  "bucket-hat",
  "felt-hat",
  "headband",
  /** thin curved band over the crown, ends behind the ears (Alice band); hidden from behind */
  "hairband",
  "bow",
  "headphones",
  // novelty headwear (catalog accessories of the same name, look editor / party)
  "cat-ears",
  "fox-ears",
  "bunny-ears",
  "devil-horns",
  "halo",
  "crown",
  "wizard-hat",
  "party-hat",
  "antenna",
  // wardrobe (WD1): drawn natively at 2x, may rise into the headroom
  "top-hat",
  "cowboy-hat",
  /** Tirolerhut: accent = feather */
  "tyrolean-hat",
  "chef-hat",
  "witch-hat",
  "beret",
  "hard-hat",
  "flower-crown",
  "headscarf",
  "turban",
  "hijab",
  "tiara",
  "santa-hat",
  "tricorn",
  "captain-hat",
  "viking-helmet",
  // crazy wardrobe (WD12)
  "unicorn-horn",
  "propeller-cap",
  "traffic-cone",
  "jester-hat",
  "sombrero",
  "shark-hat",
  "rubber-duck",
  "pharaoh",
] as const;
export const EARRING_STYLES = ["none", "stud", "hoop", "dangle", "feather"] as const;
export const SHIRT_KINDS = [
  "tshirt",
  "longsleeve",
  "shirt",
  "trachten-shirt",
  "polo",
  "hoodie",
  "sweater",
  "turtleneck",
  "blouse",
  "tank",
  // wardrobe (WD1); none = bare torso (underwear / skin shows)
  "none",
  "crop-top",
  "camisole",
  /** white, low round neckline, puff sleeves */
  "dirndl-blouse",
  "jersey",
  // crazy wardrobe (WD12)
  "hawaiian",
  "ugly-sweater",
  "mesh-top",
  "tuxedo-tee",
  "sequin-top",
] as const;
export const COLLARS = [
  "none",
  "crew",
  "v-neck",
  "shirt",
  "stand-up",
  "polo",
  "hood",
  "turtleneck",
  "lapel",
  "shawl",
] as const;
export const SHIRT_LENGTHS = ["tucked", "untucked", "long"] as const;
export const NECKWEAR = ["none", "tie", "bow-tie", "scarf", "bandana"] as const;
export const SLEEVES = ["short", "long", "rolled", "none", "puff"] as const;
export const VEST_KINDS = [
  "none",
  "waistcoat",
  "trachten-vest",
  "sweater-vest",
  "puffer-vest",
  /** Mieder: fitted, laced front (piping = lacing) */
  "dirndl-bodice",
  "corset",
] as const;
export const OUTER_KINDS = [
  "none",
  "jacket",
  "blazer",
  "janker",
  "cardigan",
  "zip-hoodie",
  "hoodie",
  "denim-jacket",
  "leather-jacket",
  "bomber",
  "coat",
  "lab-coat",
  // wardrobe (WD1)
  "tuxedo",
  "tailcoat",
  "trench-coat",
  "parka",
  "puffer-jacket",
  "rain-jacket",
  "varsity",
  "track-jacket",
  "kimono",
  "bathrobe",
  "cape",
  "poncho",
  // crazy wardrobe (WD12)
  "fur-coat",
  "wizard-robe",
  "hazmat",
  "chainmail",
  "astronaut-suit",
] as const;
export const OUTER_LENGTHS = ["cropped", "waist", "hip", "thigh", "knee", "ankle"] as const;
export const POCKETS = ["none", "flap", "patch", "welt", "kangaroo"] as const;
export const BOTTOM_KINDS = [
  "trousers",
  "jeans",
  "chinos",
  "joggers",
  "shorts",
  "lederhosen",
  "kneebund-lederhosen",
  "skirt",
  "dress",
  "overalls",
  // wardrobe (WD1); none = no bottoms (underwear / skin shows)
  "none",
  "cargo",
  "leggings",
  "mini-skirt",
  "pencil-skirt",
  "pleated-skirt",
  "maxi-skirt",
  "dirndl-skirt",
  "kilt",
  "tutu",
  /** floor-length */
  "gown",
  "jumpsuit",
  "bike-shorts",
  // crazy wardrobe (WD12)
  "hula-skirt",
  "bell-bottoms",
  "mermaid-tail",
  "harem-pants",
  "hoop-skirt",
] as const;
export const EMBROIDERY_MOTIFS = ["none", "vine", "oak-leaf", "edelweiss", "geometric"] as const;
export const SUSPENDERS = ["none", "plain", "h-bridge"] as const;
export const HEMS = ["plain", "cuffed", "rolled", "lacing", "frayed", "flared"] as const;
/** none = bare legs (skin) */
export const LEGWEAR_KINDS = [
  "none",
  "ankle-socks",
  "crew-socks",
  "knee-socks",
  "loferl",
  "tights",
  // wardrobe (WD1)
  "stockings",
  "fishnets",
  "thigh-highs",
  "leg-warmers",
  // crazy wardrobe (WD12)
  "striped-stockings",
  "ripped-tights",
  "glitter-tights",
] as const;
export const SHOE_KINDS = [
  "sneakers",
  "high-tops",
  "boots",
  "loafers",
  "haferl",
  "sandals",
  "heels",
  "slippers",
  // wardrobe (WD1); none = barefoot
  "none",
  "oxfords",
  "ballet-flats",
  "platforms",
  "flip-flops",
  "rain-boots",
  "cowboy-boots",
  "clogs",
  "crocs",
  "roller-skates",
  // crazy wardrobe (WD12)
  "clown-shoes",
  "bunny-slippers",
  "flippers",
  "moon-boots",
  "ice-skates",
  "rocket-boots",
] as const;
/** hand-in-pocket = viewer's-left arm (the character's right) */
export const HAND_POSES = [
  "relaxed",
  "hand-in-pocket",
  "hands-in-pockets",
  "hands-on-hips",
  "arms-crossed",
] as const;
export const STANCES = ["neutral", "wide"] as const;

// ---- wardrobe (WD1): body, underwear, apron, accessories ------------------------------------
/** leg length: -4 / -2 / 0 / +2 / +4 texels (±2 world px); the feet stay put */
export const HEIGHTS = ["petite", "short", "average", "tall", "very-tall"] as const;
export const HEIGHT_LIFT: Record<(typeof HEIGHTS)[number], number> = {
  petite: -4,
  short: -2,
  average: 0,
  tall: 2,
  "very-tall": 4,
};
/** curvy = narrow waist, wider hips; belly = round tummy; muscular = broad shoulders */
export const FIGURES = ["neutral", "curvy", "belly", "muscular"] as const;
export const UNDERWEAR_TOPS = [
  "none",
  "undershirt",
  "tank",
  "bra",
  "sports-bra",
  "bikini-top",
  /** one-piece swimsuit: covers the hips too (the bottom is ignored) */
  "swimsuit",
] as const;
export const UNDERWEAR_BOTTOMS = [
  "none",
  "briefs",
  "boxers",
  "boxer-briefs",
  "panties",
  "bikini",
  "swim-trunks",
] as const;
export const APRON_KINDS = ["none", "dirndl", "kitchen", "waist"] as const;
/** where the apron ribbon is knotted (dirndl: left = single, right = taken) */
export const APRON_BOWS = ["left", "right", "front", "back"] as const;
export const MASKS = [
  "none",
  "eye-mask",
  "ninja",
  "clown-nose",
  "surgical",
  "luchador",
  "gas-mask",
  "disguise",
  "plague-doctor",
] as const;
export const WINGS = [
  "none",
  "angel",
  "fairy",
  "bat",
  "butterfly",
  "dragon",
  "jetpack",
  "phoenix",
] as const;
export const TAILS = [
  "none",
  "cat",
  "devil",
  "dino",
  "fox",
  "peacock",
  "monkey",
  "squirrel",
  "robot",
] as const;
export const GLOVES = [
  "none",
  "short",
  "long",
  "boxing",
  "cartoon",
  "foam-finger",
  "claws",
  "oven-mitts",
] as const;
export const NECKLACES = [
  "none",
  "chain",
  "pearls",
  "medal",
  "lei",
  "bling",
  "ruff",
  "bell-collar",
  "dog-tags",
] as const;
export const BAGS = [
  "none",
  "backpack",
  "tote",
  "crossbody",
  "fanny-pack",
  "guitar",
  "turtle-shell",
  "baguettes",
] as const;
// crazy wardrobe (WD12): optional in `accessories`, missing = none
/** a small animal riding on the shoulder (viewer's right in the front view) */
export const PETS = [
  "none",
  "parrot",
  "cat",
  "hamster",
  "octopus",
  "rubber-duck",
  "dragon",
] as const;
/** an effect around the whole character */
export const AURAS = [
  "none",
  "sparkles",
  "fire",
  "rain-cloud",
  "hearts",
  "bees",
  "lightning",
] as const;

// ---- extras: things from the look editor catalog (same ids as catalog.ts) ------------------
/** Something held in a hand (catalog `HELD_ITEMS`). */
export const HELD_KINDS = [
  "none",
  "beer",
  "joint",
  "phone",
  "coffee",
  "lightsaber",
  "confetti",
  "cigarette",
  "bubble-wand",
  "disco-ball",
  "magic-wand",
  "balloon",
  "water-pistol",
  "maracas",
  "umbrella",
  "skull",
  // crazy wardrobe (WD12)
  "rubber-chicken",
  "trident",
  "pizza",
  "ice-cream",
  "torch",
  "boombox",
  "plunger",
  "megaphone",
] as const;
/** Costume details drawn over the clothes (catalog outfits that are costumes). */
export const COSTUME_KINDS = [
  "none",
  "cat",
  "robot",
  "astronaut",
  "pirate",
  "vampire",
  "disco",
  // crazy wardrobe (WD12)
  "banana",
  "skeleton",
  "mummy",
  "knight",
  "hotdog",
] as const;
/** Bracelets (catalog `WRISTWEAR`). */
export const WRIST_KINDS = [
  "none",
  "neon-cyan",
  "neon-pink",
  "neon-lime",
  "rainbow",
  "gold-cuffs",
  "spiked",
  "friendship",
] as const;

export const Extras = z
  .object({
    leftHand: z
      .enum(HELD_KINDS)
      .describe("held in the hand on the viewer's left in the front view; none = empty"),
    rightHand: z.enum(HELD_KINDS).describe("held in the other hand; none = empty"),
    costume: z.enum(COSTUME_KINDS).describe("costume details over the clothes; none = no costume"),
    wrist: z.enum(WRIST_KINDS).describe("bracelets on both wrists; none = no bracelets"),
    accent: Hex.describe(
      "#rrggbb accent colour of coloured held items (lightsaber, balloon, umbrella), the party hat and costume lights",
    ),
    // wardrobe (WD7): recolour items drawn from fixed art; missing / bad = original colours
    leftTint: OptHex.optional()
      .catch(undefined)
      .describe('#rrggbb main colour of the left held item, or "none" = its usual colours'),
    rightTint: OptHex.optional()
      .catch(undefined)
      .describe('#rrggbb main colour of the right held item, or "none" = its usual colours'),
    costumeTint: OptHex.optional()
      .catch(undefined)
      .describe('#rrggbb main colour of the costume details, or "none" = their usual colours'),
    wristTint: OptHex.optional()
      .catch(undefined)
      .describe('#rrggbb bracelet colour, or "none" = their usual neon colours'),
  })
  .describe("held items, costume details, bracelets: none unless the description asks for them");
export type Extras = z.infer<typeof Extras>;

const Part = <T extends readonly [string, ...string[]]>(kinds: T, what: string) =>
  z.object({ kind: z.enum(kinds).describe(`${what}; none = not worn`), color: Hex });

export const Body = z
  .object({
    height: z.enum(HEIGHTS).describe("body height (leg length); average unless described"),
    figure: z
      .enum(FIGURES)
      .describe(
        "curvy = narrow waist and wider hips; belly = round tummy; muscular = broad shoulders",
      ),
  })
  .describe("height and figure");
export type Body = z.infer<typeof Body>;

export const Underwear = z
  .object({
    top: z.enum(UNDERWEAR_TOPS).describe("worn under everything; shows when there is no shirt"),
    topRamp: Ramp,
    bottom: z
      .enum(UNDERWEAR_BOTTOMS)
      .describe("worn under everything; shows when there are no bottoms"),
    bottomRamp: Ramp,
    pattern: Pattern,
    trim: OptHex.describe('#rrggbb waistband / strap trim, or "none"'),
  })
  .describe(
    "underwear and swimwear. With no shirt, bottoms, underwear, legwear and shoes the character is a smooth, featureless doll body in the skin colour",
  );
export type Underwear = z.infer<typeof Underwear>;

export const Apron = z
  .object({
    kind: z.enum(APRON_KINDS).describe("dirndl = the apron of a dirndl; none = no apron"),
    ramp: Ramp,
    pattern: Pattern,
    bow: z.enum(APRON_BOWS).describe("where the ribbon is knotted"),
  })
  .describe("apron over the skirt / trousers");
export type Apron = z.infer<typeof Apron>;

export const Accessories = z
  .object({
    mask: Part(MASKS, "face mask"),
    wings: Part(WINGS, "wings on the back"),
    tail: Part(TAILS, "tail"),
    gloves: Part(GLOVES, "gloves"),
    necklace: Part(NECKLACES, "necklace"),
    bag: Part(BAGS, "bag"),
    // crazy wardrobe (WD12): missing in looks stored before it; a bad value drops only that part
    pet: Part(PETS, "pet riding on the shoulder").optional().catch(undefined),
    aura: Part(AURAS, "effect around the whole character").optional().catch(undefined),
  })
  .describe("costume and everyday accessories, each with its colour; none unless described");
export type Accessories = z.infer<typeof Accessories>;

/** Defaults of the wardrobe sections for looks stored before they existed. */
export const DEFAULT_BODY: Body = { height: "average", figure: "neutral" };

export const CharacterLook = z.object({
  v: z.literal(LOOK_VERSION),
  build: z.enum(BUILDS).describe("body width: slim / average / broad"),
  skin: Ramp,
  face: z.object({
    shape: z.enum(FACE_SHAPES),
    ears: z.enum(EARS),
    eyes: z.enum(EYES).describe('eye shape; "happy" = closed ^^ eyes'),
    eyeColor: Hex,
    brows: z.enum(BROWS).describe("eyebrows, drawn in hair.ramp.shadow"),
    expression: z
      .enum(EXPRESSIONS)
      .describe('mouth; "grin" = wide open smile showing the upper teeth'),
    cheeks: z.enum(CHEEKS),
    /** wardrobe (WD1): missing in stored looks; a bad value drops only the makeup */
    makeup: z
      .object({
        lips: OptHex.describe('#rrggbb lipstick, or "none"'),
        eyeshadow: OptHex.describe('#rrggbb eyeshadow, or "none"'),
      })
      .optional()
      .catch(undefined),
  }),
  hair: z.object({
    cut: z.enum(HAIR_CUTS),
    ramp: Ramp,
    sheen: z.boolean().describe("small light highlight streak in the hair"),
    /** wardrobe (WD1): missing in stored looks */
    tips: OptHex.optional().catch(undefined).describe('#rrggbb dyed ends / highlights, or "none"'),
    /** added later: missing in stored looks (= none); a bad value is dropped */
    clips: z
      .enum(HAIR_CLIPS)
      .optional()
      .catch(undefined)
      .describe("colourful snap clips in the hair: none, a few (3) or many (8)"),
  }),
  facialHair: z.object({ style: z.enum(FACIAL_HAIR_STYLES), color: Hex }),
  eyewear: z.object({
    style: z.enum(EYEWEAR_STYLES),
    frame: Hex,
    frameAccent: Hex.describe("#rrggbb speckle colour for tortoiseshell frames"),
    framePattern: z
      .enum(FRAME_PATTERNS)
      .describe("tortoiseshell = frame speckled with frameAccent"),
    lens: Hex,
    tint: z
      .enum(LENS_TINTS)
      .describe(
        "clear = plain glasses; light = tinted, eyes faintly visible through the lens colour; dark = opaque sunglasses",
      ),
  }),
  headwear: z.object({
    style: z.enum(HEADWEAR_STYLES),
    ramp: Ramp,
    accent: Hex.describe(
      "#rrggbb secondary colour: beanie pompom, cap brim, hat band, headband stripe, bow knot, headphones band",
    ),
    /** added later: missing in stored looks; a bad value is dropped, not the whole look */
    logo: OptHex.optional()
      .catch(undefined)
      .describe('#rrggbb small logo on the front of a cap, or "none"'),
  }),
  earrings: z.object({ style: z.enum(EARRING_STYLES), color: Hex }),
  shirt: z.object({
    kind: z.enum(SHIRT_KINDS),
    ramp: Ramp,
    pattern: Pattern,
    collar: z.enum(COLLARS),
    collarColor: OptHex,
    neckwear: z.enum(NECKWEAR),
    neckwearColor: Hex,
    sleeves: z.enum(SLEEVES),
    buttons: Buttons,
    peeksAtWaist: z
      .boolean()
      .describe("a strip of the shirt shows below the vest/jacket at the waist"),
    /**
     * Added later: missing in stored looks (then the kind decides: sweaters, hoodies, tees
     * hang over the waistband, the rest is tucked in). A bad value is dropped.
     */
    length: z
      .enum(SHIRT_LENGTHS)
      .optional()
      .catch(undefined)
      .describe(
        "tucked = tucked into the waistband; untucked = just over the waistband; long = oversized, down over the hips",
      ),
  }),
  vest: z.object({
    kind: z.enum(VEST_KINDS),
    ramp: Ramp,
    pattern: Pattern,
    collar: z.enum(COLLARS),
    piping: OptHex.describe('#rrggbb trim along the vest edges, or "none"'),
    buttons: Buttons,
  }),
  outer: z.object({
    kind: z.enum(OUTER_KINDS),
    agentColored: z
      .boolean()
      .describe(
        "true = draw this garment in the coding agent's colour (use when no outer-garment colour is stated); false = keep ramp and show the agent colour as an armband/badge",
      ),
    ramp: Ramp,
    pattern: Pattern,
    open: z.boolean().describe("worn open (the layers underneath show down the front)"),
    length: z.enum(OUTER_LENGTHS),
    collar: z.enum(COLLARS),
    collarColor: OptHex,
    collarPiping: OptHex.describe('#rrggbb thin trim along the collar edge, or "none"'),
    piping: OptHex.describe('#rrggbb trim along the front edges/hem, or "none"'),
    buttons: Buttons,
    pockets: z.enum(POCKETS),
    pocketPiping: OptHex,
    yoke: z.boolean().describe("yoke seam across the shoulders (visible from behind)"),
  }),
  bottoms: z.object({
    kind: z.enum(BOTTOM_KINDS),
    ramp: Ramp,
    pattern: Pattern,
    flap: z.boolean().describe("drop-front flap (lederhosen Hosentürl)"),
    embroidery: z.object({
      motif: z.enum(EMBROIDERY_MOTIFS),
      color: Hex,
      stitching: OptHex.describe('#rrggbb decorative outline stitching, or "none"'),
    }),
    buttons: Buttons,
    suspenders: z.enum(SUSPENDERS),
    suspendersColor: Hex,
    belt: OptHex.describe('#rrggbb belt colour, or "none" = no belt'),
    hem: z.enum(HEMS),
  }),
  legwear: z.object({
    kind: z.enum(LEGWEAR_KINDS).describe('"none" = bare legs (skin)'),
    color: Hex,
    accent: OptHex.describe('#rrggbb stripe/cuff colour, or "none"'),
  }),
  shoes: z.object({
    kind: z.enum(SHOE_KINDS),
    ramp: Ramp,
    sole: Hex,
    accent: OptHex.describe('#rrggbb heel tab / collar / logo colour, or "none"'),
    laces: OptHex,
  }),
  pose: z.object({
    hands: z
      .enum(HAND_POSES)
      .describe(
        "standing pose of the arms; hand-in-pocket = the character's right hand (viewer's left) in the trouser pocket",
      ),
    stance: z.enum(STANCES).describe("wide = feet shoulder-width apart, toes out"),
    headTilt: z.boolean().describe("head tilted very slightly"),
  }),
  /**
   * Added later (look editor items): missing in stored looks. Without it the renderer takes
   * them from the avatar's catalog fields (`resolveLook`). A bad value drops only this section.
   */
  extras: Extras.optional().catch(undefined),
  // ---- wardrobe (WD1): missing in stored looks; a bad value drops only that section ----
  body: Body.optional().catch(undefined),
  underwear: Underwear.optional().catch(undefined),
  apron: Apron.optional().catch(undefined),
  accessories: Accessories.optional().catch(undefined),
});
export type CharacterLook = z.infer<typeof CharacterLook>;

/** Top-level sections of a look ("v", "build", "skin", "face", …), in schema order. */
export const LOOK_SECTIONS = Object.keys(CharacterLook.shape) as (keyof CharacterLook)[];

/** The optional sections the wardrobe added (WD1); stored looks before it have none of them. */
export const WARDROBE_SECTIONS: readonly (keyof CharacterLook)[] = [
  "body",
  "underwear",
  "apron",
  "accessories",
];
