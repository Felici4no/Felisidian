import { App, PluginSettingTab, Setting } from "obsidian";
import type FelisidianPlugin from "./main";

export interface FelisidianSettings {
  enabled: boolean;
  accentColor: string;
  fontSize: number;
  radius: number;
}

export const DEFAULT_SETTINGS: FelisidianSettings = {
  enabled: true,
  accentColor: "#7c5cff",
  fontSize: 16,
  radius: 8,
};

export class FelisidianSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FelisidianPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Enable styles")
      .setDesc("Turn all Felisidian style adjustments on or off.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enabled).onChange(async (v) => {
          this.plugin.settings.enabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Accent color").addColorPicker((c) =>
      c.setValue(this.plugin.settings.accentColor).onChange(async (v) => {
        this.plugin.settings.accentColor = v;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName("Font size").addSlider((s) =>
      s
        .setLimits(12, 24, 1)
        .setDynamicTooltip()
        .setValue(this.plugin.settings.fontSize)
        .onChange(async (v) => {
          this.plugin.settings.fontSize = v;
          await this.plugin.saveSettings();
        })
    );

    new Setting(containerEl)
      .setName("Corner radius")
      .setDesc("Border radius for callouts and code blocks.")
      .addSlider((s) =>
        s
          .setLimits(0, 20, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.radius)
          .onChange(async (v) => {
            this.plugin.settings.radius = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
