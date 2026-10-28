import { PALETTE, PALETTE_KEYS } from "./colors";

/**
 * Row of color swatches. Returns a function that moves the selection
 * (without firing `onPick`).
 */
export function renderSwatches(
  parent: HTMLElement,
  selected: string,
  onPick: (key: string) => void,
  small = false
): (key: string) => void {
  const wrap = parent.createDiv({ cls: "fel-swatches" + (small ? " is-small" : "") });
  const els = new Map<string, HTMLElement>();
  const mark = (key: string) =>
    els.forEach((el, k) => el.toggleClass("is-selected", k === key));

  PALETTE_KEYS.forEach((key) => {
    const el = wrap.createDiv({ cls: "fel-swatch", attr: { title: key, "aria-label": key } });
    el.style.setProperty("--sw", PALETTE[key]);
    el.addEventListener("click", () => {
      mark(key);
      onPick(key);
    });
    els.set(key, el);
  });
  mark(selected);
  return mark;
}

/** Circular reading-progress indicator (0..1). */
export function renderRing(parent: HTMLElement, progress?: number, size = 22): void {
  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  const c = size / 2;
  const svg = parent.createSvg("svg", {
    cls: "fel-ring",
    attr: { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
  });
  svg.createSvg("circle", {
    cls: "fel-ring-bg",
    attr: { cx: c, cy: c, r, fill: "none", "stroke-width": 3 },
  });
  if (progress !== undefined && progress > 0) {
    svg.createSvg("circle", {
      cls: "fel-ring-fg",
      attr: {
        cx: c,
        cy: c,
        r,
        fill: "none",
        "stroke-width": 3,
        "stroke-dasharray": `${circ * progress} ${circ}`,
        transform: `rotate(-90 ${c} ${c})`,
      },
    });
  }
}
