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
