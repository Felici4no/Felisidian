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

type SortKey = "manual" | "recent" | "title" | "year" | "progress";
type Tab = "items" | "notebooks" | "canvases";
type Mode = "all" | "recent" | "reading";

const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual order",
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

const LEAVE_MS = 170;
const MOVE_MS = 320;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export class LibraryView extends ItemView {
  private items: LibraryItem[] = [];
  private itemByPath = new Map<string, LibraryItem>();
  private descriptions: Record<string, string> = {};
  private category: string | null = null;
  private mode: Mode = "all";
  private tab: Tab = "items";
  private authors = new Set<string>();
  private sort: SortKey = "recent";
  private query = "";

  private sideEl: HTMLElement;
  private sideListEl: HTMLElement;
  private indicatorEl: HTMLElement;
  private mainEl: HTMLElement;
  private gridEl: HTMLElement;
  private countEl: HTMLElement;
  private sortEl: HTMLSelectElement | null = null;

  /** Card elements by note path; they survive re-renders so they can animate. */
  private cards = new Map<string, HTMLElement>();
  private gridToken = 0;
  private dragEl: HTMLElement | null = null;

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
    this.indicatorEl = this.sideEl.createDiv({ cls: "fel-indicator is-hidden" });
    this.sideListEl = this.sideEl.createDiv({ cls: "fel-side-list" });
    this.mainEl = this.contentEl.createDiv({ cls: "fel-main" });

    this.gridEl = createDiv({ cls: "fel-grid" });
    this.setupDrag(this.gridEl);

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
    this.itemByPath = new Map(this.items.map((i) => [i.path, i]));
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
    const list = this.sideListEl;
    list.empty();

    const shortcut = (label: string, mode: Mode, count?: number) => {
      const active = this.mode === mode && this.category === null;
      const row = list.createDiv({
        cls: "fel-side-link fel-plain" + (active ? " is-active" : ""),
      });
      row.createSpan({ cls: "fel-name", text: label });
      if (count !== undefined) row.createSpan({ cls: "fel-count", text: String(count) });
      row.addEventListener("click", () => this.go(null, mode));
    };
    shortcut("Recent", "recent");
    shortcut("Reading list", "reading", this.reading().length);

    const heading = list.createDiv({
      cls: "fel-side-heading" + (this.mode === "all" && !this.category ? " is-active" : ""),
      text: "My library",
    });
    heading.addEventListener("click", () => this.go(null));

    const tree = list.createDiv({ cls: "fel-tree" });
    const own = this.items.filter((i) => i.kind === "item");
    buildTree(own, this.plugin.settings.customCategories).forEach((node) =>
      this.renderNode(tree, node, 0)
    );

    const add = list.createDiv({ cls: "fel-side-add", text: "New tag +" });
    add.addEventListener("click", () => {
      new NewTagModal(this.app, this.plugin, this.categoryPaths(), this.category, (path) =>
        this.go(path)
      ).open();
    });

    this.moveIndicator();
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

  /** Slides the highlight from the previous selection to the new one. */
  private moveIndicator() {
    const ind = this.indicatorEl;
    const active = this.sideListEl.querySelector<HTMLElement>(
      ".fel-side-link.is-active, .fel-side-heading.is-active"
    );
    if (!active) {
      ind.addClass("is-hidden");
      return;
    }

    const color = this.category ? this.color(this.category) : "#b8a88f";
    ind.style.setProperty("--ind", color);
    // Measure against the scrolling sidebar itself, whatever the row's offsetParent is.
    const side = this.sideEl.getBoundingClientRect();
    const row = active.getBoundingClientRect();
    const x = row.left - side.left - this.sideEl.clientLeft + this.sideEl.scrollLeft;
    const y = row.top - side.top - this.sideEl.clientTop + this.sideEl.scrollTop;
    ind.style.height = `${row.height}px`;
    ind.style.width = `${row.width}px`;
    ind.style.transform = `translate(${x}px, ${y}px)`;

    if (ind.hasClass("is-hidden")) {
      // First placement: jump there, then enable transitions.
      ind.removeClass("is-hidden");
      requestAnimationFrame(() => ind.addClass("is-ready"));
    }
  }

  // ---- main area ---------------------------------------------------------

  private title(): string {
    if (this.category) return this.category.split("/").pop() ?? "";
    if (this.mode === "recent") return "Recent";
    if (this.mode === "reading") return "Reading list";
    return "My Library";
  }

  private renderMain() {
    const first = this.captureRects();
    const main = this.mainEl;
    main.empty();

    this.renderBreadcrumb(main);

    const head = main.createDiv({ cls: "fel-head" });
    head.createEl("h1", { text: this.title() });
    const desc = this.category ? this.descriptions[this.category] : undefined;
    if (desc) main.createEl("p", { cls: "fel-desc", text: desc });

    this.renderTabs(main);

    if (this.tab === "canvases") {
      this.cards.clear();
      this.gridEl.empty();
      this.sortEl = null;
      this.renderCanvases(main);
      return;
    }

    const body = main.createDiv({ cls: "fel-tab-body" });
    this.renderAuthors(body, this.scoped());
    this.renderBar(body);
    main.appendChild(this.gridEl);
    this.renderGrid(first);
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

  private renderBar(parent: HTMLElement) {
    const bar = parent.createDiv({ cls: "fel-bar" });
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
    this.sortEl = select;
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

  /** The Authors section can be collapsed; the choice is remembered. */
  private renderAuthors(parent: HTMLElement, scoped: LibraryItem[]) {
    const counts = new Map<string, number>();
    scoped.forEach((i) =>
      i.authors.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1))
    );
    if (counts.size === 0) return;

    const open = this.plugin.settings.authorsOpen;
    const label = parent.createDiv({
      cls: "fel-section",
      attr: { role: "button", "aria-expanded": String(open), title: "Show or hide authors" },
    });
    const chev = label.createSpan({ cls: "fel-chev" + (open ? " is-open" : "") });
    setIcon(chev, "chevron-down");
    label.createSpan({ text: "Authors" });
    label.createDiv({ cls: "fel-rule" });

    const collapse = parent.createDiv({ cls: "fel-collapse" + (open ? " is-open" : "") });
    const wrap = collapse.createDiv({ cls: "fel-collapse-inner" }).createDiv({ cls: "fel-chips" });

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
          chip.toggleClass("is-active", this.authors.has(author));
          this.renderGrid();
        });
      });

    label.addEventListener("click", () => {
      const next = !collapse.hasClass("is-open");
      collapse.toggleClass("is-open", next);
      chev.toggleClass("is-open", next);
      label.setAttr("aria-expanded", String(next));
      this.plugin.settings.authorsOpen = next;
      void this.plugin.saveData(this.plugin.settings);
    });
  }

  // ---- cards: filtering, ordering, animation ----------------------------

  private scopeKey(): string {
    return `${this.mode}|${this.tab}|${this.category ?? ""}`;
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

    if (this.sort === "manual") {
      const order = this.plugin.settings.cardOrder[this.scopeKey()] ?? [];
      const rank = (p: string) => {
        const i = order.indexOf(p);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      return list.sort((a, b) => rank(a.path) - rank(b.path) || b.mtime - a.mtime);
    }

    const cmp: Record<Exclude<SortKey, "manual">, (a: LibraryItem, b: LibraryItem) => number> = {
      recent: (a, b) => b.mtime - a.mtime,
      title: (a, b) => a.title.localeCompare(b.title),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      progress: (a, b) => (b.progress ?? -1) - (a.progress ?? -1),
    };
    const sorted = list.sort(cmp[this.sort]);
    return this.mode === "recent" ? sorted.slice(0, 24) : sorted;
  }

  private captureRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    this.cards.forEach((el, path) => rects.set(path, el.getBoundingClientRect()));
    return rects;
  }

  /** Plays cards from their previous position to the current one (FLIP). */
  private flip(first: Map<string, DOMRect>, skip?: HTMLElement) {
    if (reducedMotion()) return;
    this.cards.forEach((el, path) => {
      if (el === skip) return;
      const before = first.get(path);
      if (!before) return;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: MOVE_MS, easing: EASE }
      );
    });
  }

  /**
   * Re-renders the grid. Cards that no longer match fade out first; the rest
   * then glide into their new positions and new matches fade in.
   */
  private renderGrid(first: Map<string, DOMRect> = this.captureRects()) {
    if (!this.gridEl.isConnected) return;
    const token = ++this.gridToken;
    const list = this.visible();
    const label = this.tab === "notebooks" ? "Notebooks" : "Items";
    this.countEl?.setText(`${label} (${list.length})`);
    if (this.sortEl) this.sortEl.value = this.sort;

    const wanted = new Set(list.map((i) => i.path));
    const leaving: HTMLElement[] = [];
    this.cards.forEach((el, path) => {
      if (!wanted.has(path)) {
        leaving.push(el);
        this.cards.delete(path);
      }
    });

    const animate = !reducedMotion();
    if (leaving.length && animate) {
      leaving.forEach((el) => {
        el.addClass("is-leaving");
        el.style.pointerEvents = "none";
      });
      window.setTimeout(() => {
        leaving.forEach((el) => el.remove());
        if (token === this.gridToken) this.placeCards(list, first, animate);
      }, LEAVE_MS);
    } else {
      leaving.forEach((el) => el.remove());
      this.placeCards(list, first, animate);
    }
  }

  private placeCards(list: LibraryItem[], first: Map<string, DOMRect>, animate: boolean) {
    const grid = this.gridEl;
    grid.querySelector(".fel-empty")?.remove();

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

    const entering: HTMLElement[] = [];
    list.forEach((item) => {
      let el = this.cards.get(item.path);
      if (!el) {
        el = this.createCard(item.path);
        this.cards.set(item.path, el);
        entering.push(el);
      }
      this.fillCard(el, item);
      grid.appendChild(el); // appending in order also re-orders existing cards
    });

    if (!animate) return;
    this.flip(first);
    entering.forEach((el) => {
      el.animate(
        [
          { opacity: 0, transform: "scale(0.9)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: MOVE_MS, easing: EASE }
      );
    });
  }

  private createCard(path: string): HTMLElement {
    const el = createDiv({ cls: "fel-card" });
    el.dataset.path = path;
    el.draggable = true;

    el.addEventListener("click", (evt) => {
      const target = el.dataset.path;
      if (target) this.plugin.openReader(target, Keymap.isModEvent(evt) ? "tab" : this.leaf);
    });
    el.addEventListener("dragstart", (evt) => {
      this.dragEl = el;
      el.addClass("is-dragging");
      evt.dataTransfer?.setData("text/plain", el.dataset.path ?? "");
      if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => this.endDrag());
    return el;
  }

  private fillCard(el: HTMLElement, item: LibraryItem) {
    el.empty();
    const key = categoryKey(item.category);
    el.style.setProperty("--fel-cat", toHex(item.color) ?? this.color(key));

    const top = el.createDiv({ cls: "fel-card-top" });
    if (item.year) top.createSpan({ cls: "fel-badge", text: String(item.year) });
    top.createSpan({ cls: "fel-card-cat", text: item.category[item.category.length - 1] });

    el.createDiv({ cls: "fel-card-title", text: item.title });
    if (item.authors.length) {
      el.createDiv({ cls: "fel-card-authors", text: item.authors.join(", ") });
    }

    const foot = el.createDiv({ cls: "fel-card-foot" });
    const notes = foot.createSpan({ cls: "fel-notes" });
    setIcon(notes.createSpan({ cls: "fel-notes-icon" }), "message-square");
    notes.createSpan({ text: String(item.notes) });
    if (item.pages) {
      foot.createSpan({ cls: "fel-pages", text: `${item.currentPage ?? 0}/${item.pages} p.` });
    }
    renderRing(foot, item.progress);
  }

  // ---- drag to reorder ---------------------------------------------------

  private setupDrag(grid: HTMLElement) {
    grid.addEventListener("dragover", (evt) => {
      const dragged = this.dragEl;
      if (!dragged) return;
      evt.preventDefault();
      if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";

      const over = (evt.target as HTMLElement).closest<HTMLElement>(".fel-card");
      if (!over || over === dragged || over.hasClass("is-leaving")) return;

      const rect = over.getBoundingClientRect();
      const after = evt.clientX > rect.left + rect.width / 2;
      const reference = after ? over.nextElementSibling : over;
      // Already sitting in that slot.
      if (reference === dragged || dragged.nextElementSibling === reference) return;

      const first = this.captureRects();
      grid.insertBefore(dragged, reference);
      this.flip(first, dragged);
    });
    grid.addEventListener("drop", (evt) => evt.preventDefault());
  }

  private endDrag() {
    const dragged = this.dragEl;
    if (!dragged) return;
    dragged.removeClass("is-dragging");
    this.dragEl = null;

    const order = Array.from(this.gridEl.querySelectorAll<HTMLElement>(".fel-card"))
      .map((c) => c.dataset.path)
      .filter((p): p is string => !!p);
    this.plugin.settings.cardOrder[this.scopeKey()] = order;
    this.sort = "manual";
    if (this.sortEl) this.sortEl.value = "manual";
    void this.plugin.saveData(this.plugin.settings);
  }

  // ---- canvases / add ------------------------------------------------------

  private renderCanvases(parent: HTMLElement) {
    const needle = this.category?.split("/").pop()?.toLowerCase();
    const files = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "canvas")
      .filter((f) => !needle || f.path.toLowerCase().includes(needle));

    const list = parent.createDiv({ cls: "fel-tab-body fel-rows" });
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
