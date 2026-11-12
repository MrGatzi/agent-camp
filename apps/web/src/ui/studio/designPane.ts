/**
 * The "Design it" pane of the look studio (WD8): section tabs (Outfits, Body, Face, ...), one
 * ◀ value ▶ carousel per part with its colour chips, an inline colour picker (swatches, none,
 * any colour), outfit cards with live previews and a dice. The host (hud.ts) owns the draft,
 * saving and the preview; this pane only edits the draft through `change`.
 */
import {
  applyPreset,
  type CharacterLook,
  EYE_COLORS,
  FABRIC_COLORS,
  HAIR_HEXES,
  OUTFIT_PRESETS,
  randomLook,
  SKIN_COLORS,
} from "@agent-office/protocol";
import { cycleOption } from "../carousel.ts";
import {
  type ColorSlot,
  DESIGN_SECTIONS,
  type DesignRow,
  type Draft,
  type Palette,
  visibleColors,
  visibleRows,
} from "./design.ts";

const PALETTES: Record<Palette, readonly string[]> = {
  fabric: FABRIC_COLORS,
  skin: SKIN_COLORS,
  hair: HAIR_HEXES,
  eyes: [...EYE_COLORS, "#3e8948", "#0099db", "#b55088", "#e43b44"],
};

export type DesignPane = {
  /** tabs + body, to mount in the studio's side column */
  el: HTMLElement;
  /** redraw values, chips and the rows that show (after any change of the draft) */
  paint: () => void;
  /** carousel rows that show now, in order (keyboard ▲ ▼) */
  rows: () => { row: DesignRow; el: HTMLElement }[];
  /** flip a carousel (keyboard ◀ ▶) */
  step: (row: DesignRow, dir: -1 | 1) => void;
};

type Opts = {
  draft: () => Draft;
  /** mutate the draft, then the host repaints everything (this pane included) */
  change: (mutate: (d: Draft) => void) => void;
  /** a small front view of a look (outfit cards) */
  thumb: (look: CharacterLook) => HTMLCanvasElement;
  esc: (s: string) => string;
};

const OUTFITS = "outfits";

export function buildDesignPane(o: Opts): DesignPane {
  const { esc } = o;
  const el = document.createElement("div");
  el.className = "design";
  let section = OUTFITS;
  /** colour chip whose picker is open */
  let picking: string | null = null;
  let dice = Math.floor(Math.random() * 1e6);

  const tabs = [{ id: OUTFITS, title: "Outfits" }, ...DESIGN_SECTIONS];
  el.innerHTML = `
    <div class="design-tabs" role="tablist" aria-label="Parts of your look">${tabs
      .map(
        (t) =>
          `<button type="button" role="tab" class="design-tab" data-section="${t.id}">${esc(t.title)}</button>`,
      )
      .join("")}</div>
    <div class="design-body"></div>`;
  const body = el.querySelector<HTMLElement>(".design-body")!;
  const tabEls = [...el.querySelectorAll<HTMLButtonElement>(".design-tab")];
  let rowEls: { row: DesignRow; el: HTMLElement }[] = [];
  /** the section's markup is rebuilt when the rows that show change */
  let builtFor = "";

  const chip = (c: ColorSlot, d: Draft) => {
    const v = c.get(d);
    const none = v === "none";
    return `<button type="button" class="color-chip${none ? " none" : ""}${picking === c.id ? " open" : ""}" data-chip="${c.id}" title="${esc(c.label)}" aria-label="${esc(`${c.label}: ${none ? "none" : v}`)}" style="--chip:${none ? "transparent" : v}"></button>`;
  };
  const picker = (c: ColorSlot, d: Draft) => {
    const v = c.get(d);
    const swatches = PALETTES[c.palette ?? "fabric"];
    return `<div class="color-pop" data-for="${c.id}" role="group" aria-label="${esc(c.label)}">
      <span class="color-pop-label">${esc(c.label)}</span>
      <div class="swatches">${swatches
        .map(
          (h) =>
            `<button type="button" class="swatch${h === v ? " on" : ""}" data-hex="${h}" style="--chip:${h}" aria-label="${h}"></button>`,
        )
        .join("")}${
        c.none
          ? `<button type="button" class="swatch none${v === "none" ? " on" : ""}" data-hex="none" aria-label="none" title="none"></button>`
          : ""
      }</div>
      <label class="color-any">Any colour <input type="color" value="${v === "none" ? "#ffffff" : v}"></label>
    </div>`;
  };
  const rowHtml = (r: DesignRow, d: Draft) => {
    const colors = visibleColors(r, d);
    const open = colors.find((c) => c.id === picking);
    const carousel = r.options.length
      ? `<button type="button" class="pixel-btn arrow prev" aria-label="Previous ${esc(r.label.toLowerCase())}">&#9664;</button>
        <span class="row-value" aria-live="polite"></span>
        <button type="button" class="pixel-btn arrow next" aria-label="Next ${esc(r.label.toLowerCase())}">&#9654;</button>`
      : `<span class="row-value"></span>`;
    return `<div class="look-row design-row${r.options.length ? "" : " colors-only"}" data-field="${r.id}" tabindex="0" role="group" aria-label="${esc(r.label)}">
        <span class="row-label">${esc(r.label)}</span>
        ${carousel}
        <span class="row-colors">${colors.map((c) => chip(c, d)).join("")}</span>
      </div>${open ? picker(open, d) : ""}`;
  };

  const sectionOf = () => DESIGN_SECTIONS.find((s) => s.id === section);

  const buildOutfits = () => {
    const d = o.draft();
    body.innerHTML = `
      <div class="outfit-head">
        <span class="dim">One click dresses you; then fine-tune every part and colour in the other tabs.</span>
        <button type="button" class="pixel-btn dice" title="A random look: everything, from hair to shoes">&#127922; Surprise me</button>
      </div>
      <div class="outfit-grid"></div>`;
    const grid = body.querySelector<HTMLElement>(".outfit-grid")!;
    for (const p of OUTFIT_PRESETS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "outfit-card";
      b.dataset.preset = p.id;
      const c = o.thumb(applyPreset(d.look, p.id));
      c.className = "outfit-thumb";
      b.append(c);
      const label = document.createElement("span");
      label.textContent = p.label;
      b.append(label);
      grid.append(b);
    }
    rowEls = [];
    builtFor = OUTFITS;
  };

  const buildRows = () => {
    const s = sectionOf()!;
    const d = o.draft();
    const rows = visibleRows(s, d);
    body.innerHTML = `<div class="studio-rows design-rows">${rows.map((r) => rowHtml(r, d)).join("")}</div>`;
    rowEls = rows.map((row) => ({
      row,
      el: body.querySelector<HTMLElement>(`.design-row[data-field="${row.id}"]`)!,
    }));
    builtFor = shapeKey();
  };

  /** what decides the section's markup: which rows and chips show, which picker is open */
  const shapeKey = () => {
    const s = sectionOf();
    if (!s) return OUTFITS;
    const d = o.draft();
    return JSON.stringify([
      s.id,
      picking,
      visibleRows(s, d).map((r) => [r.id, visibleColors(r, d).map((c) => [c.id, c.get(d)])]),
    ]);
  };

  const paintValues = () => {
    const d = o.draft();
    for (const { row, el: e } of rowEls) {
      if (!row.options.length) continue;
      const value = row.get(d);
      const idx = row.options.findIndex((x) => x.id === value);
      e.dataset.value = value;
      e.querySelector(".row-value")!.innerHTML =
        `<span class="row-text">${esc(row.options[idx]?.label ?? value)}</span><span class="row-count">${idx + 1}/${row.options.length}</span>`;
    }
  };

  const paint = () => {
    for (const t of tabEls) {
      const on = t.dataset.section === section;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    }
    if (section === OUTFITS) {
      if (builtFor !== OUTFITS) buildOutfits();
      return;
    }
    if (builtFor !== shapeKey()) {
      // keep focus on the same row across a rebuild
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
        ".design-row",
      )?.dataset.field;
      buildRows();
      if (focused) rowEls.find((r) => r.row.id === focused)?.el.focus();
    }
    paintValues();
  };

  const step = (row: DesignRow, dir: -1 | 1) =>
    o.change((d) => row.set(d, cycleOption(row.options, row.get(d), dir, row.skip?.(d))));

  const setSection = (id: string, focus = false) => {
    section = id;
    picking = null;
    builtFor = "";
    paint();
    if (focus) tabEls.find((t) => t.dataset.section === id)?.focus();
  };

  const allSlots = () => DESIGN_SECTIONS.flatMap((s) => s.rows).flatMap((r) => r.colors ?? []);

  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>(".design-tab");
    if (tab) return setSection(tab.dataset.section!);
    const card = t.closest<HTMLElement>(".outfit-card");
    if (card) {
      o.change((d) => {
        d.look = { ...d.look, ...applyPreset(d.look, card.dataset.preset!) } as Draft["look"];
      });
      builtFor = ""; // the cards show the new body / hair with each outfit
      return;
    }
    if (t.closest(".dice")) {
      o.change((d) => {
        d.look = randomLook(dice++);
      });
      builtFor = "";
      return;
    }
    const chipEl = t.closest<HTMLElement>(".color-chip");
    if (chipEl) {
      picking = picking === chipEl.dataset.chip ? null : chipEl.dataset.chip!;
      paint();
      return;
    }
    const sw = t.closest<HTMLElement>(".swatch");
    if (sw) {
      const slot = allSlots().find((c) => c.id === picking);
      if (slot) o.change((d) => slot.set(d, sw.dataset.hex!));
      return;
    }
    const arrow = t.closest<HTMLElement>(".arrow");
    if (arrow) {
      const rowEl = arrow.closest<HTMLElement>(".design-row");
      const row = rowEls.find((r) => r.el === rowEl)?.row;
      if (row) step(row, arrow.classList.contains("prev") ? -1 : 1);
    }
  });
  el.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.type !== "color") return;
    const slot = allSlots().find((c) => c.id === picking);
    if (slot) o.change((d) => slot.set(d, input.value.toLowerCase()));
  });

  paint();
  return {
    el,
    paint,
    rows: () => rowEls.filter((r) => r.row.options.length > 0),
    step,
  };
}

/** Switch tabs of the design pane with ◀ ▶ while a tab has focus. */
export function designTabStep(pane: DesignPane, dir: -1 | 1): boolean {
  const tabs = [...pane.el.querySelectorAll<HTMLButtonElement>(".design-tab")];
  const at = tabs.findIndex((t) => t === document.activeElement);
  if (at < 0) return false;
  const next = tabs[(at + dir + tabs.length) % tabs.length]!;
  next.click();
  next.focus();
  return true;
}
