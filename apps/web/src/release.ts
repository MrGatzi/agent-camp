/**
 * Releases as the office sees them: the changelog format, "is this the first load of a new build?" for the celebration, and when an update
 * that was found may reload the page on its own.
 */
export type ChangelogSection = { title: string; items: string[] };

/** `## heading` sections with their `- item` lines, newest (topmost) first. */
export function parseChangelog(md: string): ChangelogSection[] {
  const out: ChangelogSection[] = [];
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      out.push({ title: h[1]!, items: [] });
      continue;
    }
    const item = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (item && out.length > 0) out[out.length - 1]!.items.push(item[1]!);
  }
  return out.filter((s) => s.items.length > 0);
}

export type SeenRelease = { build: string; version?: string };

const SEEN_KEY = "ao-seen-release";

export function loadSeen(): SeenRelease | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const v = raw ? (JSON.parse(raw) as SeenRelease) : null;
    return v && typeof v.build === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveSeen(seen: SeenRelease) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // storage blocked: the celebration just shows again next time
  }
}

/** Celebrate a build only if this browser ran an older one before (never on a first visit). */
export function shouldCelebrate(seen: SeenRelease | null, build: string): boolean {
  return build !== "dev" && seen !== null && seen.build !== build;
}

/**
 * The version to put on the banner. The server learns the release number from GitHub a little
 * after the deploy, so the version it reports can still be the previous one: then null.
 */
export function newVersionLabel(seen: SeenRelease | null, version: string | undefined) {
  const v = version?.replace(/^v/, "");
  if (!v || v === "0.0.0" || v === seen?.version?.replace(/^v/, "")) return null;
  return `v${v}`;
}

export const IDLE_BEFORE_RELOAD_MS = 60_000;

/** Reload on its own only when nobody is in the middle of something. */
export function mayAutoReload(s: {
  kiosk: boolean;
  hidden: boolean;
  busy: boolean;
  idleMs: number;
}): boolean {
  if (s.kiosk || s.hidden) return true;
  return !s.busy && s.idleMs >= IDLE_BEFORE_RELOAD_MS;
}
