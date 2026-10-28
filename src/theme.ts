import type { FelisidianSettings } from "./settings";

const BODY_CLASSES = ["felisidian", "fel-font-all", "fel-ide-code"] as const;
const VARS = ["--fel-accent", "--fel-font-size", "--fel-radius", "--fel-font"] as const;

const FONT_STACKS = {
  serif: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
  sans: '-apple-system, "Segoe UI", Inter, Roboto, "Helvetica Neue", sans-serif',
  mono: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
} as const;

function fontStack(settings: FelisidianSettings): string {
  if (settings.fontFamily !== "custom") return FONT_STACKS[settings.fontFamily];
  // Keep only characters that are valid in a font name.
  const name = settings.customFont.replace(/[^\w\s-]/g, "").trim();
  return name ? `"${name}", ${FONT_STACKS.serif}` : FONT_STACKS.serif;
}

/** Applies the settings as body classes plus CSS variables. */
export function applyTheme(settings: FelisidianSettings): void {
  const body = document.body;
  body.toggleClass("felisidian", settings.enabled);
  body.toggleClass("fel-font-all", settings.enabled && settings.fontEverywhere);
  body.toggleClass("fel-ide-code", settings.enabled && settings.ideCode);

  if (!settings.enabled) {
    clearVars();
    return;
  }

  body.style.setProperty("--fel-accent", settings.accentColor);
  body.style.setProperty("--fel-font-size", `${settings.fontSize}px`);
  body.style.setProperty("--fel-radius", `${settings.radius}px`);
  body.style.setProperty("--fel-font", fontStack(settings));
}

export function clearTheme(): void {
  document.body.removeClasses([...BODY_CLASSES]);
  clearVars();
}

function clearVars(): void {
  for (const v of VARS) document.body.style.removeProperty(v);
}
