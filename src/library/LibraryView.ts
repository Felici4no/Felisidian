import {
  ItemView,
  Keymap,
  ViewStateResult,
  WorkspaceLeaf,
  debounce,
  setIcon,
} from "obsidian";
import type FelisidianPlugin from "../main";
import { NewNoteModal, NewTagModal } from "../ui/modals";
import { categoryColor, toHex } from "./colors";
import {
  CategoryNode,
  LibraryItem,
  buildTree,
  categoryKey,
  collectCategoryDescriptions,
  collectItems,
  flattenTree,
  inCategory,
} from "./model";
import { renderRing } from "./ui";

export const VIEW_TYPE_LIBRARY = "felisidian-library";

type SortKey = "recent" | "title" | "year" | "progress";
type Tab = "items" | "notebooks" | "canvases";
type Mode = "all" | "recent" | "reading";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently accessed",
  title: "Title",
  year: "Year",
  progress: "Progress",
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "items", label: "Items", icon: "file-text" },
  { id: "notebooks", label: "Notebooks", icon: "notebook" },
  { id: "canvases", label: "Canvases", icon: "layout-dashboard" },
];

export class LibraryView extends ItemView {
  private items: LibraryItem[] = [];
  private descriptions: Record<string, string> = {};
  private category: string | null = null;
  private mode: Mode = "all";
  private tab: Tab = "items";
  private authors = new Set<string>();
  private sort: SortKey = "recent";
  private query = "";

  private sideEl: HTMLElement;
  private mainEl: HTMLElement;
  private bodyEl: HTMLElement;
  private countEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private plugin: FelisidianPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_LIBRARY;
  }

  getDisplayText() {
    return "Library";
  }

  getIcon() {
    return "library";
  }

  getState() {
    return { category: this.category };
  }

  async setState(state: { category?: string | null }, result: ViewStateResult) {
    this.category = state?.category ?? null;
    this.mode = "all";
    if (this.mainEl) this.refresh();
    await super.setState(state, result);
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("fel-lib");
    this.sideEl = this.contentEl.createDiv({ cls: "fel-side" });
    this.mainEl = this.contentEl.createDiv({ cls: "fel-main" });

    const refresh = debounce(() => this.refresh(), 250, true);
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.app.metadataCache.on("resolved", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.vault.on("create", refresh));

    this.refresh();
  }

  private color(path: string): string {
    return categoryColor(path, this.plugin.settings.categoryColors);
  }

  private categoryPaths(): string[] {
    const own = this.items.filter((i) => i.kind === "item");
    return flattenTree(buildTree(own, this.plugin.settings.customCategories));
  }

  refresh() {
    this.items = collectItems(this.app);
    this.descriptions = collectCategoryDescriptions(this.app);
    if (this.category && !this.categoryPaths().includes(this.category)) {
      this.category = null;
    }
    this.renderSide();
    this.renderMain();
  }

  private go(category: string | null, mode: Mode = "all") {
    this.category = category;
    this.mode = mode;
    this.authors.clear();
    this.query = "";
    this.tab = "items";
    this.renderSide();
    this.renderMain();
  }

  // ---- sidebar -----------------------------------------------------------

  private reading(): LibraryItem[] {
    return this.items.filter(
      (i) => i.kind === "item" && i.progress !== undefined && i.progress > 0 && i.progress < 1
    );
  }

  private renderSide() {
    const side = this.sideEl;
    side.empty();

    const shortcut = (label: string, mode: Mode, count?: number) => {
      const row = side.createDiv({
        cls:
          "fel-side-link fel-plain" +
          (this.mode === mode && this.category === null ? " is-active" : ""),
      });
      row.createSpan({ cls: "fel-name", text: label });
      if (count !== undefined) row.createSpan({ cls: "fel-count", text: String(count) });
      row.addEventListener("click", () => this.go(null, mode));
    };
    shortcut("Recent", "recent");
    shortcut("Reading list", "reading", this.reading().length);

    const heading = side.createDiv({ cls: "fel-side-heading", text: "My library" });
    heading.addEventListener("click", () => this.go(null));

    const tree = side.createDiv({ cls: "fel-tree" });
    const own = this.items.filter((i) => i.kind === "item");
    buildTree(own, this.plugin.settings.customCategories).forEach((node) =>
      this.renderNode(tree, node, 0)
    );

    const add = side.createDiv({ cls: "fel-side-add", text: "New tag +" });
    add.addEventListener("click", () => {
      new NewTagModal(this.app, this.plugin, this.categoryPaths(), this.category, (path) =>
        this.go(path)
      ).open();
    });
  }

  private renderNode(parent: HTMLElement, node: CategoryNode, depth: number) {
    const row = parent.createDiv({
      cls: "fel-side-link" + (this.category === node.path ? " is-active" : ""),
    });
    row.style.paddingLeft = `${8 + depth * 18}px`;
    const dot = row.createSpan({ cls: "fel-dot" });
    dot.style.backgroundColor = this.color(node.path);
    row.createSpan({ cls: "fel-name", text: node.name });
    row.createSpan({ cls: "fel-count", text: String(node.count) });
    row.addEventListener("click", () => this.go(node.path));
    node.children.forEach((c) => this.renderNode(parent, c, depth + 1));
  }

  // ---- main area ---------------------------------------------------------

  private title(): string {
    if (this.category) return this.category.split("/").pop() ?? "";
    if (this.mode === "recent") return "Recent";
    if (this.mode === "reading") return "Reading list";
    return "My Library";
  }

  private renderMain() {
    const main = this.mainEl;
    main.empty();

    this.renderBreadcrumb(main);

    const head = main.createDiv({ cls: "fel-head" });
    head.createEl("h1", { text: this.title() });
    const desc = this.category ? this.descriptions[this.category] : undefined;
    if (desc) main.createEl("p", { cls: "fel-desc", text: desc });

    this.renderTabs(main);
    this.bodyEl = main.createDiv({ cls: "fel-tab-body" });
    this.renderTabBody();
  }

  private renderBreadcrumb(parent: HTMLElement) {
    const bc = parent.createDiv({ cls: "fel-crumbs" });
    const root = bc.createSpan({ cls: "fel-crumb", text: "My Library" });
    root.addEventListener("click", () => this.go(null));
    if (!this.category) return;

    const segs = this.category.split("/");
    segs.forEach((seg, i) => {
      bc.createSpan({ cls: "fel-crumb-sep", text: "/" });
      const key = segs.slice(0, i + 1).join("/");
      const crumb = bc.createSpan({ cls: "fel-crumb" });
      if (i === segs.length - 1) {
        const dot = crumb.createSpan({ cls: "fel-dot" });
        dot.style.backgroundColor = this.color(key);
      }
      crumb.createSpan({ text: seg });
      crumb.addEventListener("click", () => this.go(key));
    });
  }

  private renderTabs(parent: HTMLElement) {
    const tabs = parent.createDiv({ cls: "fel-tabs" });
    TABS.forEach((t) => {
      const el = tabs.createDiv({ cls: "fel-tab" + (this.tab === t.id ? " is-active" : "") });
      setIcon(el.createSpan({ cls: "fel-tab-icon" }), t.icon);
      el.createSpan({ text: t.label });
      el.addEventListener("click", () => {
        this.tab = t.id;
        this.renderMain();
      });
    });
  }

  private renderTabBody() {
    this.bodyEl.empty();
    if (this.tab === "canvases") {
      this.renderCanvases();
      return;
    }

    const scoped = this.scoped();
    this.renderAuthors(this.bodyEl, scoped);

    const bar = this.bodyEl.createDiv({ cls: "fel-bar" });
    this.countEl = bar.createSpan({ cls: "fel-total" });

    const add = bar.createEl("button", { cls: "fel-btn" });
    setIcon(add.createSpan(), "plus");
    add.createSpan({ text: "Add" });
    add.addEventListener("click", () => this.addItem());

    const search = bar.createEl("input", {
      cls: "fel-search",
      type: "search",
      placeholder: "Search title or author",
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderGrid();
    });

    const select = bar.createEl("select", { cls: "dropdown fel-sort" });
    (Object.keys(SORT_LABELS) as SortKey[]).forEach((key) => {
      const opt = select.createEl("option", { value: key, text: SORT_LABELS[key] });
      opt.selected = key === this.sort;
    });
    select.addEventListener("change", () => {
      this.sort = select.value as SortKey;
      this.renderGrid();
    });

    this.bodyEl.createDiv({ cls: "fel-grid" });
    this.renderGrid();
  }

  private scoped(): LibraryItem[] {
    const kind = this.tab === "notebooks" ? "notebook" : "item";
    return this.items.filter((i) => {
      if (i.kind !== kind) return false;
      if (this.mode === "reading") {
        return i.progress !== undefined && i.progress > 0 && i.progress < 1;
      }
      return inCategory(i, this.category);
    });
  }

  private renderAuthors(parent: HTMLElement, scoped: LibraryItem[]) {
    const counts = new Map<string, number>();
    scoped.forEach((i) =>
      i.authors.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1))
    );
    if (counts.size === 0) return;

    const label = parent.createDiv({ cls: "fel-section" });
    label.createSpan({ text: "Authors" });
    label.createDiv({ cls: "fel-rule" });

    const wrap = parent.createDiv({ cls: "fel-chips" });
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 24)
      .forEach(([author, n]) => {
        const chip = wrap.createDiv({
          cls: "fel-chip" + (this.authors.has(author) ? " is-active" : ""),
        });
        chip.createSpan({ text: author });
        chip.createSpan({ cls: "fel-chip-n", text: String(n) });
        chip.addEventListener("click", () => {
          if (this.authors.has(author)) this.authors.delete(author);
          else this.authors.add(author);
          this.renderTabBody();
        });
      });
  }

  private visible(): LibraryItem[] {
    const q = this.query.trim().toLowerCase();
    const list = this.scoped().filter((i) => {
      if ([...this.authors].some((a) => !i.authors.includes(a))) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        i.authors.some((a) => a.toLowerCase().includes(q))
      );
    });

    const cmp: Record<SortKey, (a: LibraryItem, b: LibraryItem) => number> = {
      recent: (a, b) => b.mtime - a.mtime,
      title: (a, b) => a.title.localeCompare(b.title),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      progress: (a, b) => (b.progress ?? -1) - (a.progress ?? -1),
    };
    const sorted = list.sort(cmp[this.sort]);
    return this.mode === "recent" ? sorted.slice(0, 24) : sorted;
  }

  private renderGrid() {
    const grid = this.bodyEl.querySelector<HTMLElement>(".fel-grid");
    if (!grid) return;
    const list = this.visible();
    this.countEl.setText(`${this.tab === "notebooks" ? "Notebooks" : "Items"} (${list.length})`);
    grid.empty();

    if (list.length === 0) {
      grid.createDiv({
        cls: "fel-empty",
        text:
          this.items.length === 0
            ? "No items yet. Add a category property to a note to see it here."
            : "Nothing here yet.",
      });
      return;
    }
    list.forEach((item) => this.renderCard(grid, item));
  }

  private renderCard(grid: HTMLElement, item: LibraryItem) {
    const key = categoryKey(item.category);
    const card = grid.createDiv({ cls: "fel-card" });
    card.style.setProperty("--fel-cat", toHex(item.color) ?? this.color(key));

    const top = card.createDiv({ cls: "fel-card-top" });
    if (item.year) top.createSpan({ cls: "fel-badge", text: String(item.year) });
    top.createSpan({ cls: "fel-card-cat", text: item.category[item.category.length - 1] });

    card.createDiv({ cls: "fel-card-title", text: item.title });
    if (item.authors.length) {
      card.createDiv({ cls: "fel-card-authors", text: item.authors.join(", ") });
    }

    const foot = card.createDiv({ cls: "fel-card-foot" });
    const notes = foot.createSpan({ cls: "fel-notes" });
    setIcon(notes.createSpan({ cls: "fel-notes-icon" }), "message-square");
    notes.createSpan({ text: String(item.notes) });
    if (item.pages) {
      foot.createSpan({
        cls: "fel-pages",
        text: `${item.currentPage ?? 0}/${item.pages} p.`,
      });
    }
    renderRing(foot, item.progress);

    card.addEventListener("click", (evt) => {
      this.plugin.openReader(item.path, Keymap.isModEvent(evt) ? "tab" : this.leaf);
    });
  }

  private renderCanvases() {
    const needle = this.category?.split("/").pop()?.toLowerCase();
    const files = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "canvas")
      .filter((f) => !needle || f.path.toLowerCase().includes(needle));

    const list = this.bodyEl.createDiv({ cls: "fel-rows" });
    if (files.length === 0) {
      list.createDiv({ cls: "fel-empty", text: "No canvases here yet." });
      return;
    }
    files.forEach((file) => {
      const row = list.createDiv({ cls: "fel-row" });
      setIcon(row.createSpan(), "layout-dashboard");
      row.createSpan({ text: file.basename });
      row.addEventListener("click", (evt) => {
        this.app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file);
      });
    });
  }

  private addItem() {
    new NewNoteModal(
      this.app,
      this.plugin,
      this.categoryPaths(),
      this.category,
      this.tab === "notebooks"
    ).open();
  }
}
