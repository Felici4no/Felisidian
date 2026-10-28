import type { FelisidianSettings } from "./settings";

const BODY_CLASS = "felisidian";
const VARS = ["--fel-accent", "--fel-font-size", "--fel-radius"] as const;

/** Applies the settings as a body class plus CSS variables. */
export function applyTheme(settings: FelisidianSettings): void {
  const body = document.body;
  body.toggleClass(BODY_CLASS, settings.enabled);

  if (!settings.enabled) {
    clearVars();
    return;
  }

  body.style.setProperty("--fel-accent", settings.accentColor);
  body.style.setProperty("--fel-font-size", `${settings.fontSize}px`);
  body.style.setProperty("--fel-radius", `${settings.radius}px`);
}

export function clearTheme(): void {
  document.body.removeClass(BODY_CLASS);
  clearVars();
}

function clearVars(): void {
  for (const v of VARS) document.body.style.removeProperty(v);
}
