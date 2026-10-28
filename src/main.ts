import { Plugin, WorkspaceLeaf } from "obsidian";
import { LibraryView, VIEW_TYPE_LIBRARY } from "./library/LibraryView";
import { ReaderView, VIEW_TYPE_READER } from "./reader/ReaderView";
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
    this.registerView(VIEW_TYPE_READER, (leaf) => new ReaderView(leaf, this));
    this.addRibbonIcon("library", "Open library", () => this.openLibrary());

    this.addCommand({
      id: "open-library",
      name: "Open library",
      callback: () => this.openLibrary(),
    });

    this.addCommand({
      id: "read-current-note",
      name: "Read current note in reading mode",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) this.openReader(file.path, this.app.workspace.getLeaf(false));
        return true;
      },
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

  /** Opens the library, optionally on a category and in a given leaf. */
  async openLibrary(category: string | null = null, leaf?: WorkspaceLeaf) {
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, state: { category }, active: true });
      return;
    }
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
    const created = this.app.workspace.getLeaf(true);
    await created.setViewState({ type: VIEW_TYPE_LIBRARY, state: { category }, active: true });
    this.app.workspace.revealLeaf(created);
  }

  /** Opens a note in the read-only reader, in place or in a new tab. */
  async openReader(path: string, target: WorkspaceLeaf | "tab") {
    const leaf = target === "tab" ? this.app.workspace.getLeaf("tab") : target;
    await leaf.setViewState({ type: VIEW_TYPE_READER, state: { path }, active: true });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    applyTheme(this.settings);
  }
}
