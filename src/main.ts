import { MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { categoryColor, toHex } from "./library/colors";
import { LibraryView, VIEW_TYPE_LIBRARY } from "./library/LibraryView";
import { buildTree, collectItems, flattenTree } from "./library/model";
import { ReaderView, VIEW_TYPE_READER } from "./reader/ReaderView";
import { NewNoteModal, NewTagModal } from "./ui/modals";
import {
  DEFAULT_SETTINGS,
  FelisidianSettings,
  FelisidianSettingTab,
} from "./settings";
import { applyTheme, clearTheme } from "./theme";

export default class FelisidianPlugin extends Plugin {
  settings: FelisidianSettings;
  private libraryActions = new Map<MarkdownView, HTMLElement>();

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
      id: "back-to-library",
      name: "Back to library",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        this.openLibrary(file ? this.categoryOf(file) : null);
      },
    });

    this.addCommand({
      id: "new-tag",
      name: "New tag",
      callback: () => new NewTagModal(this.app, this, this.categoryPaths(), null).open(),
    });

    this.addCommand({
      id: "new-note",
      name: "New library note",
      callback: () => new NewNoteModal(this.app, this, this.categoryPaths(), null, false).open(),
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

    const tint = () => this.tintNotes();
    this.registerEvent(this.app.workspace.on("file-open", tint));
    this.registerEvent(this.app.workspace.on("active-leaf-change", tint));
    this.registerEvent(this.app.workspace.on("layout-change", tint));
    this.registerEvent(this.app.metadataCache.on("changed", tint));
    this.app.workspace.onLayoutReady(tint);
  }

  onunload() {
    clearTheme();
    this.clearTint();
  }

  categoryPaths(): string[] {
    const items = collectItems(this.app).filter((i) => i.kind === "item");
    return flattenTree(buildTree(items, this.settings.customCategories));
  }

  /** Category path of a note ("A/B"), or null when it has none. */
  categoryOf(file: TFile): string | null {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const raw = Array.isArray(fm?.category) ? fm?.category[0] : fm?.category;
    if (!raw) return null;
    const path = String(raw).split("/").map((s) => s.trim()).filter(Boolean).join("/");
    return path || null;
  }

  /** The note's own color, else the color of its category. */
  noteColor(file: TFile): string | undefined {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const own = toHex(typeof fm?.color === "string" ? fm.color : undefined);
    if (own) return own;
    const category = this.categoryOf(file);
    return category ? categoryColor(category, this.settings.categoryColors) : undefined;
  }

  /** Gives opened Markdown notes a pastel background from their color. */
  tintNotes() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      const el = view.containerEl;
      if (!this.libraryActions.has(view)) {
        const action = view.addAction("library", "Back to library", () => {
          const f = view.file;
          this.openLibrary(f ? this.categoryOf(f) : null, view.leaf);
        });
        this.libraryActions.set(view, action);
      }
      const color = this.settings.tintNotes && view.file ? this.noteColor(view.file) : undefined;
      if (color) {
        el.style.setProperty("--fel-note", color);
        el.addClass("fel-tinted-note");
      } else {
        el.style.removeProperty("--fel-note");
        el.removeClass("fel-tinted-note");
      }
    });
  }

  private clearTint() {
    this.libraryActions.forEach((el) => el.remove());
    this.libraryActions.clear();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      leaf.view.containerEl.style.removeProperty("--fel-note");
      leaf.view.containerEl.removeClass("fel-tinted-note");
    });
  }

  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY).forEach((leaf) => {
      if (leaf.view instanceof LibraryView) leaf.view.refresh();
    });
    this.app.workspace.getLeavesOfType(VIEW_TYPE_READER).forEach((leaf) => {
      if (leaf.view instanceof ReaderView) leaf.view.rerender();
    });
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
    this.tintNotes();
    this.refreshViews();
  }
}
