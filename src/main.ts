import { Plugin } from "obsidian";
import { LibraryView, VIEW_TYPE_LIBRARY } from "./library/LibraryView";
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

    this.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, this));
    this.addRibbonIcon("library", "Open library", () => this.openLibrary());

    this.addCommand({
      id: "open-library",
      name: "Open library",
      callback: () => this.openLibrary(),
    });

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

  async openLibrary() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    applyTheme(this.settings);
  }
}
