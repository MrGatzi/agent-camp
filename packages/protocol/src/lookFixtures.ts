/**
 * Hand-authored looks for the deterministic (non-AI) path: mocked-provider tests, the web
 * `?look=` parameter, the dev gallery and screenshots.
 *
 * tracht: "Tracht meets streetwear", the acceptance character; its free-text description
 * is fixtures/looks/tracht.description.md.
 * dirndl, tuxedo, underwear: wardrobe looks (WD1): short and curvy in a dirndl with braids,
 * very tall and muscular in a tuxedo, underwear with a belly and a tinted coffee.
 */
import dirndl from "../fixtures/looks/dirndl.json";
import tracht from "../fixtures/looks/tracht.json";
import tuxedo from "../fixtures/looks/tuxedo.json";
import underwear from "../fixtures/looks/underwear.json";
import { AvatarSpec } from "./catalog.ts";
import { CharacterLook } from "./look.ts";

/** Strict on purpose: a broken fixture look must fail loudly, not be caught to undefined. */
const WithLook = AvatarSpec.extend({ look: CharacterLook });

export const LOOK_FIXTURES = {
  tracht: WithLook.parse(tracht),
  dirndl: WithLook.parse(dirndl),
  tuxedo: WithLook.parse(tuxedo),
  underwear: WithLook.parse(underwear),
} as const;
export type LookFixtureName = keyof typeof LOOK_FIXTURES;
