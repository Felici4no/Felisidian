import { Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  FelisidianSettings,
  FelisidianSettingTab,
} from "./settings";
import { applyTheme, clearTheme } from "./theme";

export default class FelisidianPlugin extends Plugin {
  settings: FelisidianSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new FelisidianSettingTab(this.app, this));

    this.addCommand({
      id: "toggle-styles",
      name: "Toggle styles",
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
      },
    });

    applyTheme(this.settings);
  }

  onunload() {
    clearTheme();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    applyTheme(this.settings);
  }
}
