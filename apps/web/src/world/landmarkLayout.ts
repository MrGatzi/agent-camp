/** Shared district dimensions, collision footprints and deterministic flight choreography. */
export const DISTRICT_X = 80;
export const DISTRICT_COLS = 40;
/** Northern scenery uses negative world Y, keeping all office/arena grid coordinates stable. */
export const NORTH_TOP = -496;
export const WORLD_COLS = DISTRICT_X + DISTRICT_COLS;
export const AIRPORT_X = 82;
export const LANDMARKS = [
  { name: "sagrada", label: "Sagrada Familia", x: 2, y: -31, w: 18, h: 29 },
  { name: "burj", label: "Burj Khalifa", x: 23, y: -31, w: 17, h: 29 },
  { name: "ars", label: "Ars Electronica Center", x: 43, y: -31, w: 19, h: 29 },
  { name: "airport", label: "Airport", x: AIRPORT_X, y: 1, w: 37, h: 26 },
] as const;

export const FLIGHT_SECONDS = 72;
export type FlightPhase = "landing" | "taxi-in" | "parked" | "taxi-out" | "takeoff" | "away";
/** Coordinates local to the airport; one runway, no overlapping movements. */
export function flightAt(time: number) {
  const t = ((time % FLIGHT_SECONDS) + FLIGHT_SECONDS) % FLIGHT_SECONDS;
  const legs: { end: number; x: number; y: number; altitude: number; phase: FlightPhase }[] = [
    { end: 0, x: 20, y: 108, altitude: 34, phase: "landing" },
    { end: 10, x: 470, y: 108, altitude: 0, phase: "landing" },
    { end: 15, x: 514, y: 108, altitude: 0, phase: "taxi-in" },
    { end: 21, x: 514, y: 210, altitude: 0, phase: "taxi-in" },
    { end: 29, x: 294, y: 210, altitude: 0, phase: "taxi-in" },
    { end: 41, x: 294, y: 210, altitude: 0, phase: "parked" },
    { end: 49, x: 70, y: 210, altitude: 0, phase: "taxi-out" },
    { end: 55, x: 70, y: 108, altitude: 0, phase: "taxi-out" },
    { end: 65, x: 570, y: 108, altitude: 48, phase: "takeoff" },
    { end: 72, x: 570, y: 108, altitude: 48, phase: "away" },
  ];
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]!;
    const b = legs[i]!;
    if (t >= b.end) continue;
    const u = (t - a.end) / (b.end - a.end);
    const progress = b.phase === "takeoff" ? u * u : u;
    return {
      x: a.x + (b.x - a.x) * progress,
      y: a.y + (b.y - a.y) * progress,
      altitude: a.altitude + (b.altitude - a.altitude) * progress,
      heading: b.phase === "parked" ? Math.PI : Math.atan2(b.y - a.y, b.x - a.x),
      phase: b.phase,
      visible: b.phase !== "away",
    };
  }
  throw new Error("Unreachable flight phase");
}
