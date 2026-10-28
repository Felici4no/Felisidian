const PALETTE = [
  "#a855f7", // purple
  "#e0b93a", // yellow
  "#3b82f6", // blue
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
  "#ec4899", // pink
  "#22c55e", // green
  "#ef4444", // red
  "#6366f1", // indigo
  "#a16207", // brown
  "#64748b", // slate
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable color per category path; user overrides win. */
export function categoryColor(
  path: string,
  overrides: Record<string, string>
): string {
  return overrides[path] ?? PALETTE[hash(path) % PALETTE.length];
}
