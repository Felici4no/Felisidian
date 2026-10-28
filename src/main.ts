import { MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { setLanguage, t } from "./i18n";
import { categoryColor, toHex } from "./library/colors";
import { LibraryState, defaultLibraryState } from "./library/filters";
import { LibraryView } from "./library/LibraryView";
import { PreviewCache, collectItems } from "./library/model";
import { buildTree, flattenTree } from "./library/tree";
import type { LibraryItem } from "./library/types";
import { Navigator, VIEW_TYPE_LIBRARY, VIEW_TYPE_READER } from "./nav";
import { ReaderView } from "./reader/ReaderView";
import {
  DEFAULT_SETTINGS,
  FelisidianSettings,
  FelisidianSettingTab,
} from "./settings";
import { applyTheme, clearTheme } from "./theme";
import {
  CaptureModal,
  IdeaModal,
  NewTagModal,
  ReadingNoteModal,
  SourceModal,
} from "./ui/modals";

export default class FelisidianPlugin extends Plugin {
  settings: FelisidianSettings;
  nav: Navigator;
  /** Where the user was in the library; restored when they come back. */
  libraryState: LibraryState = defaultLibraryState();
  /** The user's own writing for note cards, keyed by path. */
  previews: PreviewCache = new Map();
  private libraryActions = new Map<MarkdownView, HTMLElement>();

  async onload() {
    await this.loadSettings();
    setLanguage(this.settings.language);
    this.nav = new Navigator(this);
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
      id: "back-to-library",
      name: "Back to library",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        this.openLibrary(file ? this.categoryOf(file) : null);
      },
    });

    this.addCommand({
      id: "read-current-note",
      name: "Read current note in reading mode",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.nav.openReader(file.path, this.app.workspace.getLeaf(false));
        return true;
      },
    });

    this.addCommand({
      id: "quick-capture",
      name: "Quick capture",
      callback: () => this.openCaptureModal(null),
    });

    this.addCommand({
      id: "new-source",
      name: "New source",
      callback: () => this.openSourceModal(null, false),
    });

    this.addCommand({
      id: "new-idea",
      name: "New idea",
      callback: () => this.openIdeaModal(null),
    });

    this.addCommand({
      id: "new-tag",
      name: "New tag",
      callback: () => this.openTagModal(null),
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

  // ---- windows -------------------------------------------------------------------

  categoryPaths(): string[] {
    const items = collectItems(this.app, this.previews).filter((i) => i.kind !== "notebook");
    return flattenTree(buildTree(items, this.settings.customCategories));
  }

  openTagModal(parent: string | null, onDone?: (path: string) => void) {
    new NewTagModal(this.app, this, this.categoryPaths(), parent, onDone).open();
  }

  openSourceModal(category: string | null, notebook: boolean) {
    new SourceModal(this.app, this, this.categoryPaths(), category, notebook).open();
  }

  openCaptureModal(category: string | null) {
    new CaptureModal(this.app, this, this.categoryPaths(), category).open();
  }

  /** Reading note from a passage; `source` is optional and can be changed in the window. */
  openReadingNoteModal(
    source: LibraryItem | null,
    quote: string,
    leaf?: WorkspaceLeaf,
    locationHint = ""
  ) {
    const sources = collectItems(this.app, this.previews).filter((i) => i.kind === "source");
    new ReadingNoteModal(this.app, this, {
      sources,
      sourcePath: source?.path ?? null,
      quote,
      locationHint,
      leaf: leaf ?? this.app.workspace.getLeaf(false),
    }).open();
  }

  /** An idea as its own note, optionally growing from another note. */
  openIdeaModal(
    origin: TFile | null,
    originContext = "",
    sourcePaths: string[] = [],
    leaf?: WorkspaceLeaf
  ) {
    new IdeaModal(this.app, this, {
      origin,
      originContext,
      sourcePaths,
      leaf: leaf ?? this.app.workspace.getLeaf(false),
    }).open();
  }

  // ---- navigation ----------------------------------------------------------------

  /** Opens the library; with a category it jumps there, otherwise it restores the last state. */
  async openLibrary(category?: string | null, leaf?: WorkspaceLeaf) {
    if (leaf) {
      await this.nav.openSubject(leaf, category ?? null);
      return;
    }
    if (category !== undefined) {
      const state = defaultLibraryState();
      if (category) state.filters.categories = [category];
      this.libraryState = state;
    }
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0];
    if (existing) {
      if (category !== undefined) {
        await existing.setViewState({ type: VIEW_TYPE_LIBRARY, state: { restore: true }, active: true });
      }
      this.app.workspace.revealLeaf(existing);
      return;
    }
    const created = this.app.workspace.getLeaf(true);
    await created.setViewState({ type: VIEW_TYPE_LIBRARY, state: { restore: true }, active: true });
    this.app.workspace.revealLeaf(created);
  }

  // ---- note colors ------------------------------------------------------------------

  /** Category path of a note (\"A/B\"), or null when it has none. */
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
        const action = view.addAction("library", t("misc.backToLibrary"), () => {
          const f = view.file;
          void this.openLibrary(f ? this.categoryOf(f) : null, view.leaf);
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
      if (leaf.view instanceof ReaderView) void leaf.view.rerender();
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    setLanguage(this.settings.language);
    applyTheme(this.settings);
    this.tintNotes();
    this.refreshViews();
  }
}
