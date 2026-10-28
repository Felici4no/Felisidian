import { App, PluginSettingTab, Setting } from "obsidian";
import type FelisidianPlugin from "./main";
import { PALETTE, colorKeyFor } from "./library/colors";
import { renderSwatches } from "./library/ui";

export type FontChoice = "serif" | "sans" | "mono" | "custom";

export interface FelisidianSettings {
  enabled: boolean;
  accentColor: string;
  fontSize: number;
  radius: number;
  fontFamily: FontChoice;
  /** Font name used when fontFamily is "custom". */
  customFont: string;
  /** Also apply the chosen font to the text of every note. */
  fontEverywhere: boolean;
  /** Dark, IDE-like code blocks. */
  ideCode: boolean;
  /** Per-category color overrides, keyed by category path. */
  categoryColors: Record<string, string>;
  /** Tags created from the "New tag" window (may have no notes yet). */
  customCategories: string[];
  /** Tint opened notes with their color. */
  tintNotes: boolean;
  /** Whether the Authors section of the library is expanded. */
  authorsOpen: boolean;
  /** Manual card order per library scope (see LibraryView). */
  cardOrder: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: FelisidianSettings = {
  enabled: true,
  accentColor: "#7c5cff",
  fontSize: 16,
  radius: 8,
  fontFamily: "serif",
  customFont: "",
  fontEverywhere: false,
  ideCode: true,
  categoryColors: {},
  customCategories: [],
  tintNotes: true,
  authorsOpen: true,
  cardOrder: {},
};

export class FelisidianSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FelisidianPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Enable styles")
      .setDesc("Turn all Felisidian style adjustments on or off.")
      .addToggle((t) =>
        t.setValue(s.enabled).onChange(async (v) => {
          s.enabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Text").setHeading();

    new Setting(containerEl)
      .setName("Font")
      .setDesc("Font used by the library, the reader and (optionally) your notes.")
      .addDropdown((d) =>
        d
          .addOption("serif", "Serif")
          .addOption("sans", "Sans-serif")
          .addOption("mono", "Monospace")
          .addOption("custom", "Custom")
          .setValue(s.fontFamily)
          .onChange(async (v) => {
            s.fontFamily = v as FontChoice;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (s.fontFamily === "custom") {
      new Setting(containerEl)
        .setName("Custom font name")
        .setDesc("Any font installed on your system, e.g. Inter or Merriweather.")
        .addText((t) =>
          t.setValue(s.customFont).onChange(async (v) => {
            s.customFont = v;
            await this.plugin.saveSettings();
          })
        );
    }

    new Setting(containerEl)
      .setName("Apply font to all notes")
      .addToggle((t) =>
        t.setValue(s.fontEverywhere).onChange(async (v) => {
          s.fontEverywhere = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Font size").addSlider((sl) =>
      sl
        .setLimits(12, 24, 1)
        .setDynamicTooltip()
        .setValue(s.fontSize)
        .onChange(async (v) => {
          s.fontSize = v;
          await this.plugin.saveSettings();
        })
    );

    new Setting(containerEl).setName("Code").setHeading();

    new Setting(containerEl)
      .setName("IDE-style code blocks")
      .setDesc("Dark background and editor-like syntax colors for code blocks.")
      .addToggle((t) =>
        t.setValue(s.ideCode).onChange(async (v) => {
          s.ideCode = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("Tint notes with their color")
      .setDesc("Opened notes get a pastel background from their color property or tag.")
      .addToggle((t) =>
        t.setValue(s.tintNotes).onChange(async (v) => {
          s.tintNotes = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Accent color").addColorPicker((c) =>
      c.setValue(s.accentColor).onChange(async (v) => {
        s.accentColor = v;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName("Corner radius")
      .setDesc("Border radius for callouts and code blocks.")
      .addSlider((sl) =>
        sl
          .setLimits(0, 20, 1)
          .setDynamicTooltip()
          .setValue(s.radius)
          .onChange(async (v) => {
            s.radius = v;
            await this.plugin.saveSettings();
          })
      );

    this.renderTagColors(containerEl);
  }

  /** Tag colors can only be changed here. */
  private renderTagColors(containerEl: HTMLElement) {
    const s = this.plugin.settings;
    new Setting(containerEl)
      .setName("Tag colors")
      .setDesc("Notes without their own color use the color of their tag.")
      .setHeading();

    const paths = this.plugin.categoryPaths();
    if (paths.length === 0) {
      containerEl.createDiv({ cls: "setting-item-description", text: "No tags yet." });
      return;
    }

    paths.forEach((path) => {
      const row = new Setting(containerEl).setName(path);
      const current = colorKeyFor(path, s.categoryColors);
      const dot = row.nameEl.createSpan({ cls: "fel-dot fel-setting-dot" });
      dot.style.backgroundColor = PALETTE[current];
      renderSwatches(row.controlEl, current, async (key) => {
        s.categoryColors[path] = key;
        dot.style.backgroundColor = PALETTE[key];
        await this.plugin.saveSettings();
      }, true);
    });
  }
}
