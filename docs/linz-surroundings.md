# Linz surroundings

## Composition and invariants

An original, geographically compressed riverfront, not a literal city map or playable expansion.
Behind the office: wooded Pöstlingberg with its twin-tower basilica, angular LED-grid Ars Electronica
Center on the far quay, the Danube, then the near-bank glass Lentos with its through-building opening
and a Hauptplatz-inspired facade row. Muted colours keep the office the focus. All art is static;
there are no new POIs, animations, shader effects, copied assets or per-frame painting.

`world/linzLayout.ts` owns pure geometry, four non-overlapping strip bounds and tree exclusions.
`art/linz.ts` paints the north strip using the existing PixelCanvas offsets/clipping. Terrain still
uploads exactly four surround textures, owned and destroyed by the existing floor rebuild lifecycle.
The southern sidewalk, road, vehicle lanes, office, garden, businesses, paths and map dimensions
are unchanged. Night eyes shelter in a bounded low planted bed on the near bank, while the
werewolf uses a separate unobstructed promenade segment. Both stay inside the shallow visible
north band at normal laptop, 1080p wall and kiosk office fit, clear of the river, museums, historic
facades, benches and office walls. Full sprite bounds, not just centre points, are reserved.
Seasonal lawn/trees remain; distant hill and near-bank foliage use the existing seasonal palette.

Camera and minimap are unchanged. **Office fit is not scenery fit**: the hill/AEC can be clipped
on laptops, portrait phones and grown maps. Office legibility takes priority over showing every
landmark. The full-scene screenshots use zoom 1 at 1920×1080; normal laptop fit is 1440×900.
A foreground river sliver was considered during PR56 review but not added: keeping one continuous
Danube between the existing opposite banks avoids disconnected water or crowding the museums and
nightlife. No camera/map changes were needed for the required nightlife visibility correction.
As before, grown maps whose height fills the viewport can clip the north scenery.

## Visual references

Official photographs were viewed to understand silhouettes; none are bundled or traced:

- [Ars Electronica Center](https://ars.electronica.art/center/en/): angular gridded volume and
  lower sloping wing, with regular luminous facade panels.
- [Lentos](https://www.lentos.at/en/): long glass screen, oversized picture-frame opening and
  red entrance accent.
- [Pöstlingberg](https://www.linztourismus.at/en/leisure/discover-linz/worth-seeing/top10/adventure-world-poestlingberg):
  pale twin towers and dark caps above a wooded hillside.
- [Hauptplatz](https://www.linztourismus.at/en/leisure/discover-linz/activities/sights/main-square/):
  narrow historic fronts, cornices, uneven roofs and arched ground-floor rhythm.
- [Danube](https://www.linztourismus.at/en/leisure/discover-linz/activities/danube).

## Preview and validation

- `screenshots/linz-full-day.png`: complete riverfront by day.
- `screenshots/linz-full-night.png`: existing night overlay, no new animated lighting.
- `screenshots/linz-fit-day-laptop.png`: normal office framing and scale preserved.

These three previews use the real server and a one-person simulator scenario. PR56 visibility
review also captured normal laptop night fit and 1080p kiosk night fit: the wolf is visible on the
promenade and the eyes inside the planted bed, with no browser errors. The Danube remains visible
in full-scene views; no guarantee that every fitted view includes water or the distant landmarks.

Run `bun test apps/web/test/linzLayout.test.ts apps/web/test/map.test.ts apps/web/test/camera.test.ts`
for layout, bank/tree exclusions, deterministic pixels, seasonal isolation and growing-map coverage.
Nightlife tests also check full eye/wolf sprite bounds, obstacle exclusions and the actual unchanged
Camera fit below the HUD at laptop, 1080p, wall-kiosk and iPad-kiosk sizes.
Use the existing real-server/simulator screenshot harness for visual checks.

PR56 visibility revision: 29 focused tests and 769 full-suite tests passed (5 gated E2E skips),
plus lint, typecheck and production web build, on Bun 1.4.1; CI uses pinned Bun 1.4.4. The initial
Linz delivery also checked explicit E2E, tablet/phone and reduced-motion captures, and static
wall/road comparison crops showed unchanged initial framing and southern terrain.

Extra PR56 evidence/logs remain outside the repository in
`/private/tmp/agent-office-linz-review-evidence/pr56-visibility/`: stable laptop nightlife is in
`linz-fit-night-laptop-41.5s.png` and stable kiosk nightlife in `linz-kiosk-fit-night-40.5s.png`.
Two additional resize-transition captures are labelled as such, not as settled fit evidence.
Earlier screenshot colour oracles were false negatives: additive glow is not the unblended eye
colour, and busy-scenario characters can legitimately widen the fit when they visit the east block.
The corrected one-person capture used existing timers and visual review, not pixel-colour proxies.

A pre-existing browser exception during the live 12→13-person map-growth transition was reproduced
both with and without this feature: the rebuild destroys the graveyard sign before retained
`Graveyard.relayout()` accesses it. This change does not repair that separate ownership defect;
growth screenshots are not evidence of a clean runtime lifecycle. Hardware iPad/GPU, minimap
clicking and occupied east-business scenarios were not independently validated.
