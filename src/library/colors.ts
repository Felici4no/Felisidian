/** Base colors; cards, notes and pages are tinted from these (pastel via CSS). */
export const PALETTE: Record<string, string> = {
  purple: "#a77bdc",
  yellow: "#e6c84f",
  blue: "#5b8fe0",
  lime: "#8fcf4a",
  orange: "#f09a52",
  teal: "#3fc0a8",
  pink: "#ec6fa6",
  green: "#52bd6f",
  red: "#ea6a6a",
  indigo: "#7c7ce8",
  brown: "#a9794c",
  slate: "#8a97a8",
};

export const PALETTE_KEYS = Object.keys(PALETTE);

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Accepts a palette key ("pink") or a hex color; anything else is undefined. */
export function toHex(value?: string): string | undefined {
  if (!value) return undefined;
  if (PALETTE[value]) return PALETTE[value];
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined;
}

/** Palette key for a category: the user's choice, else stable per path. */
export function colorKeyFor(path: string, overrides: Record<string, string>): string {
  const chosen = overrides[path];
  if (chosen && PALETTE[chosen]) return chosen;
  return PALETTE_KEYS[hash(path) % PALETTE_KEYS.length];
}

export function categoryColor(path: string, overrides: Record<string, string>): string {
  return toHex(overrides[path]) ?? PALETTE[colorKeyFor(path, overrides)];
}
