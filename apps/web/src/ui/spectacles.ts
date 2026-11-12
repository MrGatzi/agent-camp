import type { OfficeSpectacles } from "../world/spectacles.ts";
import "./spectacles.css";

/** Explicitly local previews. Automatic scheduled spectacles appear on every viewer. */
export function spectacleControls(host: HTMLElement, world: OfficeSpectacles): void {
  const panel = document.createElement("details");
  panel.className = "spectacle-controls pixel-box";
  const summary = document.createElement("summary");
  summary.textContent = "🎪 Office nonsense";
  panel.append(summary);
  const note = document.createElement("p");
  note.textContent = "Preview on this screen. Scheduled shows happen automatically for everyone.";
  panel.append(note);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  for (const [label, action] of [
    ["🦆 Giant QUACK", () => world.quackNow()],
    ["🚂 Chair conga", () => world.trigger("conga")],
    ["🛸 UFO abduction", () => world.trigger("ufo")],
    ["🪩 Emergency disco", () => world.trigger("disco")],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pixel-btn";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (action()) {
        status.textContent = "";
        panel.open = false;
      } else
        status.textContent =
          "A show is already running, or no suitable colleague is available yet.";
    });
    panel.append(button);
  }
  panel.append(status);
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      panel.open = false;
      summary.focus();
    }
  });
  host.append(panel);
}
