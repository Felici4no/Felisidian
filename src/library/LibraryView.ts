import { ItemView, Keymap, WorkspaceLeaf, debounce } from "obsidian";
import type FelisidianPlugin from "../main";
import { categoryColor } from "./colors";
import {
  CategoryNode,
  LibraryItem,
  buildTree,
  categoryKey,
  collectItems,
  inCategory,
} from "./model";

export const VIEW_TYPE_LIBRARY = "felisidian-library";

type SortKey = "recent" | "title" | "year" | "progress";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently modified",
  title: "Title",
  year: "Year",
  progress: "Progress",
};

export class LibraryView extends ItemView {
  private items: LibraryItem[] = [];
  private category: string | null = null;
  private authors = new Set<string>();
  private sort: SortKey = "recent";
  private query = "";

  private sideEl: HTMLElement;
  private mainEl: HTMLElement;
  private gridEl: HTMLElement;
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

    this.refresh();
  }

  private color(path: string): string {
    return categoryColor(path, this.plugin.settings.categoryColors);
  }

  private refresh() {
    this.items = collectItems(this.app);
    if (this.category && !this.items.some((i) => inCategory(i, this.category))) {
      this.category = null;
    }
    this.renderSide();
    this.renderMain();
  }

  // ---- sidebar -----------------------------------------------------------

  private renderSide() {
    const side = this.sideEl;
    side.empty();

    const all = side.createDiv({
      cls: "fel-side-link" + (this.category === null ? " is-active" : ""),
    });
    all.createSpan({ text: "All items" });
    all.createSpan({ cls: "fel-count", text: String(this.items.length) });
    all.addEventListener("click", () => this.selectCategory(null));

    side.createDiv({ cls: "fel-side-heading", text: "My library" });
    const tree = side.createDiv({ cls: "fel-tree" });
    buildTree(this.items).forEach((node) => this.renderNode(tree, node, 0));
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
    row.addEventListener("click", () => this.selectCategory(node.path));
    node.children.forEach((c) => this.renderNode(parent, c, depth + 1));
  }

  private selectCategory(path: string | null) {
    this.category = path;
    this.authors.clear();
    this.renderSide();
    this.renderMain();
  }

  // ---- main area ---------------------------------------------------------

  private scoped(): LibraryItem[] {
    return this.items.filter((i) => inCategory(i, this.category));
  }

  private renderMain() {
    const main = this.mainEl;
    main.empty();

    const scoped = this.scoped();
    const name = this.category ? this.category.split("/").pop() : "Library";
    const head = main.createDiv({ cls: "fel-head" });
    if (this.category) {
      const dot = head.createSpan({ cls: "fel-dot fel-dot-lg" });
      dot.style.backgroundColor = this.color(this.category);
    }
    head.createEl("h1", { text: name });

    this.renderAuthors(main, scoped);

    const bar = main.createDiv({ cls: "fel-bar" });
    this.countEl = bar.createSpan({ cls: "fel-total" });

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

    const select = bar.createEl("select", { cls: "dropdown" });
    (Object.keys(SORT_LABELS) as SortKey[]).forEach((key) => {
      const opt = select.createEl("option", { value: key, text: SORT_LABELS[key] });
      opt.selected = key === this.sort;
    });
    select.addEventListener("change", () => {
      this.sort = select.value as SortKey;
      this.renderGrid();
    });

    this.gridEl = main.createDiv({ cls: "fel-grid" });
    this.renderGrid();
  }

  private renderAuthors(parent: HTMLElement, scoped: LibraryItem[]) {
    const counts = new Map<string, number>();
    scoped.forEach((i) =>
      i.authors.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1))
    );
    if (counts.size === 0) return;

    parent.createDiv({ cls: "fel-section", text: "Authors" });
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
          this.renderMain();
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
    return list.sort(cmp[this.sort]);
  }

  private renderGrid() {
    const list = this.visible();
    this.countEl.setText(`Items (${list.length})`);
    this.gridEl.empty();

    if (list.length === 0) {
      const empty = this.gridEl.createDiv({ cls: "fel-empty" });
      empty.createDiv({
        text:
          this.items.length === 0
            ? "No items yet. Add a category property to a note to see it here."
            : "No items match the current filters.",
      });
      return;
    }
    list.forEach((item) => this.renderCard(item));
  }

  private renderCard(item: LibraryItem) {
    const key = categoryKey(item.category);
    const card = this.gridEl.createDiv({ cls: "fel-card" });
    card.style.setProperty("--fel-cat", this.color(key));

    const top = card.createDiv({ cls: "fel-card-top" });
    if (item.year) top.createSpan({ cls: "fel-badge", text: String(item.year) });
    top.createSpan({ cls: "fel-card-cat", text: item.category[item.category.length - 1] });

    card.createDiv({ cls: "fel-card-title", text: item.title });
    if (item.authors.length) {
      card.createDiv({ cls: "fel-card-authors", text: item.authors.join(", ") });
    }

    const foot = card.createDiv({ cls: "fel-card-foot" });
    const notes = foot.createSpan({ cls: "fel-notes" });
    notes.setText(`${item.notes} ${item.notes === 1 ? "note" : "notes"}`);
    if (item.pages) {
      foot.createSpan({
        cls: "fel-pages",
        text: `${item.currentPage ?? 0}/${item.pages} p.`,
      });
    }
    this.renderRing(foot, item.progress);

    card.addEventListener("click", (evt) => {
      const file = this.app.vault.getFileByPath(item.path);
      if (file) {
        this.app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file);
      }
    });
  }

  private renderRing(parent: HTMLElement, progress?: number) {
    const size = 22;
    const r = 8;
    const circ = 2 * Math.PI * r;
    const svg = parent.createSvg("svg", {
      cls: "fel-ring",
      attr: { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    });
    svg.createSvg("circle", {
      cls: "fel-ring-bg",
      attr: { cx: size / 2, cy: size / 2, r, fill: "none", "stroke-width": 3 },
    });
    if (progress !== undefined && progress > 0) {
      svg.createSvg("circle", {
        cls: "fel-ring-fg",
        attr: {
          cx: size / 2,
          cy: size / 2,
          r,
          fill: "none",
          "stroke-width": 3,
          "stroke-dasharray": `${circ * progress} ${circ}`,
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
        },
      });
    }
  }
}
