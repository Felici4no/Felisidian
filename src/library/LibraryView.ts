import {
  ItemView,
  Keymap,
  Menu,
  ViewStateResult,
  WorkspaceLeaf,
  debounce,
  setIcon,
} from "obsidian";
import { t } from "../i18n";
import type { NavPage, NavTarget } from "../nav";
import { VIEW_TYPE_LIBRARY } from "../nav";
import type FelisidianPlugin from "../main";
import { ChecklistSection, closePopover, openChecklistPopover } from "../ui/popover";
import { fillCard, itemTint } from "./cards";
import { categoryColor } from "./colors";
import {
  FilterKey,
  LibraryState,
  RECENT_LIMIT,
  SortKey,
  Tab,
  VIEW_IDS,
  ViewId,
  additionalCount,
  applicability,
  applyFilters,
  cloneState,
  defaultLibraryState,
  emptyFilters,
  enforceView,
  facetCounts,
  lockedKeys,
  presetFilters,
  sortItems,
} from "./filters";
import {
  collectCategoryDescriptions,
  collectItems,
  hydratePreviews,
} from "./model";
import { buildTree, categoryKey, flattenTree } from "./tree";
import {
  CONTENT_KINDS,
  CategoryNode,
  ELABORATIONS,
  FORMATS,
  LibraryItem,
  READING_STATUSES,
} from "./types";

export { VIEW_TYPE_LIBRARY };

const TABS: { id: Tab; icon: string }[] = [
  { id: "items", icon: "file-text" },
  { id: "notebooks", icon: "notebook" },
  { id: "canvases", icon: "layout-dashboard" },
];

const VIEW_ICONS: Record<ViewId, string> = {
  library: "library",
  reading: "book-open",
  captures: "zap",
  ideas: "lightbulb",
  recent: "clock",
};

const SORTS: SortKey[] = ["manual", "recent", "title", "year", "progress"];
const NEUTRAL = "#b8a88f";
const LEAVE_MS = 170;
const MOVE_MS = 320;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type ListFilterKey = "types" | "statuses" | "authors" | "formats" | "sources" | "elaborations" | "categories";

export class LibraryView extends ItemView implements NavPage {
  private state: LibraryState = defaultLibraryState();
  private items: LibraryItem[] = [];
  private itemByPath = new Map<string, LibraryItem>();
  private descriptions: Record<string, string> = {};

  private sideEl: HTMLElement;
  private sideListEl: HTMLElement;
  private indicatorEl: HTMLElement;
  private mainEl: HTMLElement;
  private gridEl: HTMLElement;
  private chipsEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private filterBtns = new Map<string, HTMLButtonElement>();
  private searchEl: HTMLInputElement | null = null;
  private sortEl: HTMLSelectElement | null = null;

  /** Card elements by note path; they survive re-renders so they can animate. */
  private cards = new Map<string, HTMLElement>();
  private gridToken = 0;
  private hydrateToken = 0;
  private dragEl: HTMLElement | null = null;
  private facetMemo = new Map<string, Map<string, number>>();

  constructor(leaf: WorkspaceLeaf, private plugin: FelisidianPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_LIBRARY;
  }

  getDisplayText() {
    return t("view.library");
  }

  getIcon() {
    return "library";
  }

  // ---- state, persistence, navigation --------------------------------------

  private currentState(): LibraryState {
    const s = cloneState(this.state);
    if (this.mainEl) s.scrollTop = this.mainEl.scrollTop;
    return s;
  }

  /** Remembers where the user is so coming back restores it. */
  private persist() {
    this.plugin.libraryState = this.currentState();
  }

  snapshot(): NavTarget {
    return { type: "library", state: this.currentState() };
  }

  getState() {
    return { lib: this.currentState() };
  }

  async setState(
    state: { restore?: boolean; category?: string | null; lib?: LibraryState },
    result: ViewStateResult
  ) {
    if (state?.lib) {
      this.state = cloneState(state.lib);
    } else if (state?.restore) {
      this.state = cloneState(this.plugin.libraryState);
    } else if (state && "category" in state) {
      this.state = defaultLibraryState();
      if (state.category) this.state.filters.categories = [state.category];
    }
    if (this.mainEl) {
      this.refresh();
      this.restoreScroll(this.state.scrollTop);
    }
    await super.setState(state, result);
  }

  private restoreScroll(top: number) {
    const apply = () => {
      this.mainEl.scrollTop = top;
    };
    apply();
    requestAnimationFrame(apply);
    window.setTimeout(apply, 120);
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

    this.state = cloneState(this.plugin.libraryState);

    const refresh = debounce(() => this.refresh(), 250, true);
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.app.metadataCache.on("resolved", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.vault.on("create", refresh));

    this.refresh();
    this.restoreScroll(this.state.scrollTop);
  }

  async onClose() {
    closePopover();
    this.persist();
  }

  // ---- data ------------------------------------------------------------------

  private color(path: string): string {
    return categoryColor(path, this.plugin.settings.categoryColors);
  }

  private contentItems(): LibraryItem[] {
    return this.items.filter((i) => i.kind !== "notebook");
  }

  private categoryPaths(): string[] {
    return flattenTree(buildTree(this.contentItems(), this.plugin.settings.customCategories));
  }

  private itemColor(item: LibraryItem): string {
    const subject = item.category.length ? this.color(categoryKey(item.category)) : NEUTRAL;
    return itemTint(item, subject);
  }

  refresh() {
    this.items = collectItems(this.app, this.plugin.previews);
    this.itemByPath = new Map(this.items.map((i) => [i.path, i]));
    this.descriptions = collectCategoryDescriptions(this.app);
    this.facetMemo.clear();

    this.state.filters = enforceView(this.state.filters, this.state.view);
    const known = new Set(this.categoryPaths());
    this.state.filters.categories = this.state.filters.categories.filter((c) => known.has(c));

    this.renderSide();
    this.renderMain(true);
    void this.hydrate();
  }

  /** Reads the user's own writing for note cards, then refreshes them. */
  private async hydrate() {
    const token = ++this.hydrateToken;
    const changed = await hydratePreviews(this.app, this.items, this.plugin.previews);
    if (!changed || token !== this.hydrateToken || !this.mainEl.isConnected) return;
    this.items = collectItems(this.app, this.plugin.previews);
    this.itemByPath = new Map(this.items.map((i) => [i.path, i]));
    this.facetMemo.clear();
    this.renderGrid();
  }

  // ---- sidebar -----------------------------------------------------------------

  private viewCount(view: ViewId): number | undefined {
    if (view === "recent") return undefined;
    return applyFilters(this.contentItems(), presetFilters(view)).length;
  }

  private selectView(view: ViewId) {
    this.state.view = view;
    this.state.tab = "items";
    this.state.filters = presetFilters(view);
    this.state.sort = view === "recent" ? "recent" : this.state.sort;
    this.afterNavigation();
  }

  private selectSubject(path: string) {
    this.state.view = "library";
    this.state.tab = "items";
    this.state.filters = { ...emptyFilters(), categories: [path] };
    this.afterNavigation();
  }

  private afterNavigation() {
    this.persist();
    this.renderSide();
    this.renderMain(false);
  }

  private singleSubject(): string | null {
    const c = this.state.filters.categories;
    return c.length === 1 ? c[0] : null;
  }

  private renderSide() {
    const list = this.sideListEl;
    list.empty();

    VIEW_IDS.forEach((view) => {
      const active = this.state.view === view && this.state.filters.categories.length === 0;
      const row = list.createDiv({
        cls: "fel-side-link fel-plain" + (active ? " is-active" : ""),
        attr: { role: "button", tabindex: "0" },
      });
      setIcon(row.createSpan({ cls: "fel-side-icon" }), VIEW_ICONS[view]);
      row.createSpan({ cls: "fel-name", text: t(`view.${view}`) });
      const n = this.viewCount(view);
      if (n !== undefined) row.createSpan({ cls: "fel-count", text: String(n) });
      this.onActivate(row, () => this.selectView(view));
    });

    list.createDiv({ cls: "fel-side-heading", text: t("side.subjects") });

    const tree = list.createDiv({ cls: "fel-tree" });
    buildTree(this.contentItems(), this.plugin.settings.customCategories).forEach((node) =>
      this.renderNode(tree, node, 0)
    );

    const add = list.createDiv({
      cls: "fel-side-add",
      text: t("side.newTag"),
      attr: { role: "button", tabindex: "0" },
    });
    this.onActivate(add, () => this.plugin.openTagModal(this.singleSubject(), (p) => this.selectSubject(p)));

    this.moveIndicator();
  }

  /** Click, Enter or Space. */
  private onActivate(el: HTMLElement, fn: (evt: Event) => void) {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        fn(evt);
      }
    });
  }

  private renderNode(parent: HTMLElement, node: CategoryNode, depth: number) {
    const active = this.singleSubject() === node.path;
    const row = parent.createDiv({
      cls: "fel-side-link" + (active ? " is-active" : ""),
      attr: { role: "button", tabindex: "0" },
    });
    row.style.paddingLeft = `${8 + depth * 18}px`;
    const dot = row.createSpan({ cls: "fel-dot" });
    dot.style.backgroundColor = this.color(node.path);
    row.createSpan({ cls: "fel-name", text: node.name });
    row.createSpan({ cls: "fel-count", text: String(node.count) });
    this.onActivate(row, () => this.selectSubject(node.path));
    node.children.forEach((c) => this.renderNode(parent, c, depth + 1));
  }

  /** Slides the highlight from the previous selection to the new one. */
  private moveIndicator() {
    const ind = this.indicatorEl;
    const active = this.sideListEl.querySelector<HTMLElement>(".fel-side-link.is-active");
    if (!active) {
      ind.addClass("is-hidden");
      return;
    }

    const subject = this.singleSubject();
    ind.style.setProperty("--ind", subject ? this.color(subject) : NEUTRAL);

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

  // ---- main area ----------------------------------------------------------------

  private title(): string {
    const subject = this.singleSubject();
    if (subject) return subject.split("/").pop() ?? subject;
    if (this.state.view !== "library") return t(`view.${this.state.view}`);
    return t("lib.root");
  }

  private renderMain(keepScroll: boolean) {
    const first = this.captureRects();
    const main = this.mainEl;
    const scroll = main.scrollTop;
    closePopover();
    main.empty();
    this.filterBtns.clear();
    this.chipsEl = null;
    this.countEl = null;

    this.renderBreadcrumb(main);

    main.createDiv({ cls: "fel-head" }).createEl("h1", { text: this.title() });
    const subject = this.singleSubject();
    const desc = subject ? this.descriptions[subject] : undefined;
    if (desc) main.createEl("p", { cls: "fel-desc", text: desc });

    this.renderTabs(main);

    if (this.state.tab === "canvases") {
      this.cards.clear();
      this.gridEl.empty();
      this.renderCanvases(main);
    } else {
      const body = main.createDiv({ cls: "fel-tab-body" });
      this.renderToolbar(body);
      main.appendChild(this.gridEl);
      this.updateFilterUI();
      this.renderGrid(first);
    }
    if (keepScroll) main.scrollTop = scroll;
  }

  private renderBreadcrumb(parent: HTMLElement) {
    const bc = parent.createDiv({ cls: "fel-crumbs" });
    const root = bc.createSpan({
      cls: "fel-crumb",
      text: t("lib.root"),
      attr: { role: "button", tabindex: "0" },
    });
    this.onActivate(root, () => this.selectView("library"));

    const subject = this.singleSubject();
    if (!subject) {
      if (this.state.view !== "library") {
        bc.createSpan({ cls: "fel-crumb-sep", text: "/" });
        bc.createSpan({ cls: "fel-crumb is-current", text: t(`view.${this.state.view}`) });
      }
      return;
    }

    const segs = subject.split("/");
    segs.forEach((seg, i) => {
      bc.createSpan({ cls: "fel-crumb-sep", text: "/" });
      const key = segs.slice(0, i + 1).join("/");
      const crumb = bc.createSpan({ cls: "fel-crumb", attr: { role: "button", tabindex: "0" } });
      if (i === segs.length - 1) {
        const dot = crumb.createSpan({ cls: "fel-dot" });
        dot.style.backgroundColor = this.color(key);
      }
      crumb.createSpan({ text: seg });
      this.onActivate(crumb, () => this.selectSubject(key));
    });
  }

  private renderTabs(parent: HTMLElement) {
    const tabs = parent.createDiv({ cls: "fel-tabs", attr: { role: "tablist" } });
    TABS.forEach((tab) => {
      const active = this.state.tab === tab.id;
      const el = tabs.createDiv({
        cls: "fel-tab" + (active ? " is-active" : ""),
        attr: { role: "tab", tabindex: "0", "aria-selected": String(active) },
      });
      setIcon(el.createSpan({ cls: "fel-tab-icon" }), tab.icon);
      el.createSpan({ text: t(`tab.${tab.id}`) });
      this.onActivate(el, () => {
        this.state.tab = tab.id;
        this.persist();
        this.renderMain(false);
      });
    });
  }

  // ---- toolbar: filters, search, sort ------------------------------------------

  private renderToolbar(parent: HTMLElement) {
    const f = this.state.filters;
    const bar = parent.createDiv({ cls: "fel-tools" });
    const left = bar.createDiv({ cls: "fel-filterbar", attr: { role: "group", "aria-label": t("f.active") } });

    if (this.state.tab === "items") {
      const appl = applicability(this.contentItems(), f);
      // Filters a view defines (Ideas = the idea type) are part of the view, not extra filters.
      const locked = lockedKeys(this.state.view);
      if (!locked.includes("types")) {
        this.filterButton(left, "types", t("f.type"), () => [this.typeSection()]);
      }
      if (appl.status && !locked.includes("statuses")) {
        this.filterButton(left, "statuses", t("f.status"), () => [this.statusSection()]);
      }
      if (appl.authors) this.filterButton(left, "authors", t("f.authors"), () => [this.authorsSection()]);
      const more = this.moreSections(appl);
      if (more.length) this.filterButton(left, "more", t("f.more"), () => this.moreSections(applicability(this.contentItems(), this.state.filters)));
    }

    const right = bar.createDiv({ cls: "fel-tools-end" });

    const search = right.createEl("input", {
      cls: "fel-search",
      type: "search",
      placeholder: t("lib.search"),
      attr: { "aria-label": t("lib.search") },
    });
    search.value = f.query;
    search.addEventListener("input", () => {
      this.state.filters.query = search.value;
      this.onFiltersChanged();
    });
    this.searchEl = search;

    const select = right.createEl("select", { cls: "dropdown fel-sort", attr: { "aria-label": t("f.more") } });
    SORTS.forEach((key) => {
      const opt = select.createEl("option", { value: key, text: t(`sort.${key}`) });
      opt.selected = key === this.state.sort;
    });
    select.addEventListener("change", () => {
      this.state.sort = select.value as SortKey;
      this.persist();
      this.renderGrid();
    });
    this.sortEl = select;

    const add = right.createEl("button", { cls: "fel-btn" });
    setIcon(add.createSpan(), "plus");
    add.createSpan({ text: t("lib.add") });
    add.addEventListener("click", (evt) => this.openAddMenu(evt));

    const row = parent.createDiv({ cls: "fel-chiprow" });
    this.chipsEl = row.createDiv({ cls: "fel-chips", attr: { role: "list", "aria-label": t("f.active") } });
    this.countEl = row.createDiv({ cls: "fel-total", attr: { "aria-live": "polite" } });
  }

  private openAddMenu(evt: MouseEvent) {
    if (this.state.tab === "notebooks") {
      this.plugin.openSourceModal(this.singleSubject(), true);
      return;
    }
    const subject = this.singleSubject();
    const menu = new Menu();
    menu.addItem((i) => i.setTitle(t("add.source")).setIcon("book-open").onClick(() => this.plugin.openSourceModal(subject, false)));
    menu.addItem((i) => i.setTitle(t("add.capture")).setIcon("zap").onClick(() => this.plugin.openCaptureModal(subject)));
    menu.addItem((i) => i.setTitle(t("add.idea")).setIcon("lightbulb").onClick(() => this.plugin.openIdeaModal(null)));
    menu.addItem((i) => i.setTitle(t("add.readingNote")).setIcon("quote").onClick(() => this.plugin.openReadingNoteModal(null, "")));
    menu.addItem((i) => i.setTitle(t("add.notebook")).setIcon("notebook").onClick(() => this.plugin.openSourceModal(subject, true)));
    menu.showAtMouseEvent(evt);
  }

  private filterButton(
    parent: HTMLElement,
    id: string,
    label: string,
    sections: () => ChecklistSection[]
  ) {
    const btn = parent.createEl("button", {
      cls: "fel-filter-btn",
      attr: { "aria-haspopup": "dialog", "aria-expanded": "false" },
    });
    btn.createSpan({ cls: "fel-filter-label", text: label });
    btn.createSpan({ cls: "fel-filter-badge" });
    setIcon(btn.createSpan({ cls: "fel-filter-chev" }), "chevron-down");
    btn.addEventListener("click", () => {
      if (btn.getAttr("aria-expanded") === "true") {
        closePopover();
        return;
      }
      openChecklistPopover(btn, label, sections(), () => this.onFiltersChanged(false));
    });
    this.filterBtns.set(id, btn);
  }

  // ---- filter sections ----------------------------------------------------------

  /** Counts per value for one filter, given all the other active filters. */
  private counts(key: FilterKey, valuesOf: (i: LibraryItem) => string[]): Map<string, number> {
    let memo = this.facetMemo.get(key);
    if (!memo) {
      memo = facetCounts(this.contentItems(), this.state.filters, key, valuesOf);
      this.facetMemo.set(key, memo);
    }
    return memo;
  }

  private toggleValue(key: ListFilterKey, value: string) {
    const list = this.state.filters[key] as string[];
    const at = list.indexOf(value);
    if (at >= 0) list.splice(at, 1);
    else list.push(value);
  }

  private listSection(
    key: ListFilterKey,
    title: string | undefined,
    options: ChecklistSection["options"],
    valuesOf: (i: LibraryItem) => string[],
    extra: Partial<ChecklistSection> = {}
  ): ChecklistSection {
    return {
      title,
      options,
      isSelected: (v) => (this.state.filters[key] as string[]).includes(v),
      toggle: (v) => this.toggleValue(key, v),
      count: (v) => this.counts(key, valuesOf).get(v) ?? 0,
      ...extra,
    };
  }

  private typeSection(): ChecklistSection {
    return this.listSection(
      "types",
      undefined,
      CONTENT_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) })),
      (i) => [i.kind]
    );
  }

  private statusSection(): ChecklistSection {
    return this.listSection(
      "statuses",
      undefined,
      READING_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
      (i) => (i.status ? [i.status] : [])
    );
  }

  private authorsSection(): ChecklistSection {
    const tally = new Map<string, number>();
    this.contentItems().forEach((i) => i.authors.forEach((a) => tally.set(a, (tally.get(a) ?? 0) + 1)));
    const names = [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([a]) => a);
    return this.listSection(
      "authors",
      undefined,
      names.map((a) => ({ value: a, label: a })),
      (i) => i.authors,
      { searchable: { placeholder: t("f.searchAuthors") } }
    );
  }

  private moreSections(appl: ReturnType<typeof applicability>): ChecklistSection[] {
    const sections: ChecklistSection[] = [];
    const items = this.contentItems();

    if (appl.subject) {
      const tree = buildTree(items, this.plugin.settings.customCategories);
      const options: ChecklistSection["options"] = [];
      const walk = (nodes: CategoryNode[], depth: number) =>
        nodes.forEach((n) => {
          options.push({ value: n.path, label: n.name, color: this.color(n.path), indent: depth });
          walk(n.children, depth + 1);
        });
      walk(tree, 0);
      sections.push(
        this.listSection("categories", t("f.subject"), options, (i) =>
          // The item's subject and each of its parents.
          i.category.map((_, n) => categoryKey(i.category.slice(0, n + 1)))
        )
      );
    }

    if (appl.format) {
      sections.push(
        this.listSection(
          "formats",
          t("f.format"),
          FORMATS.map((f) => ({ value: f, label: t(`format.${f}`) })),
          (i) => (i.format ? [i.format] : [])
        )
      );
    }

    if (appl.source) {
      const linked = new Set<string>();
      items.forEach((i) => i.kind !== "source" && i.sourcePaths.forEach((p) => linked.add(p)));
      const options = [...linked]
        .map((p) => this.itemByPath.get(p))
        .filter((s): s is LibraryItem => !!s)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((s) => ({ value: s.path, label: s.title }));
      if (options.length) {
        sections.push(this.listSection("sources", t("f.source"), options, (i) => i.sourcePaths));
      }
    }

    if (appl.elaboration) {
      sections.push(
        this.listSection(
          "elaborations",
          t("f.elab"),
          ELABORATIONS.map((e) => ({ value: e, label: t(`elab.${e}`) })),
          (i) => (i.elaboration ? [i.elaboration] : [])
        )
      );
    }

    if (appl.connections) {
      sections.push({
        title: t("f.conn"),
        options: [
          { value: "with", label: t("f.connWith") },
          { value: "without", label: t("f.connWithout") },
        ],
        isSelected: (v) => this.state.filters.connections === v,
        toggle: (v) => {
          this.state.filters.connections =
            this.state.filters.connections === v ? null : (v as "with" | "without");
        },
        count: (v) => {
          const pool = applyFilters(items, this.state.filters, ["connections"]);
          return pool.filter((i) => (v === "with" ? i.connections > 0 : i.connections === 0)).length;
        },
      });
    }
    return sections;
  }

  // ---- active filters: chips and counts --------------------------------------------

  private onFiltersChanged(rebuildToolbar = false) {
    this.facetMemo.clear();
    this.persist();
    if (rebuildToolbar) this.renderMain(true);
    else {
      this.updateFilterUI();
      this.renderGrid();
    }
  }

  private chipList(): { label: string; remove: () => void }[] {
    const f = this.state.filters;
    const locked = lockedKeys(this.state.view);
    const chips: { label: string; remove: () => void }[] = [];
    const add = (group: string, value: string, remove: () => void) =>
      chips.push({ label: `${group}: ${value}`, remove });
    const dropFrom = (key: ListFilterKey, v: string) => () => {
      this.state.filters[key] = (this.state.filters[key] as string[]).filter((x) => x !== v) as never;
    };

    if (!locked.includes("types")) {
      f.types.forEach((v) => add(t("f.type"), t(`kind.${v}`), dropFrom("types", v)));
    }
    if (!locked.includes("statuses")) {
      f.statuses.forEach((v) => add(t("f.status"), t(`status.${v}`), dropFrom("statuses", v)));
    }
    f.authors.forEach((v) => add(t("f.authors"), v, dropFrom("authors", v)));
    f.categories.forEach((v) => add(t("f.subject"), v.split("/").pop() ?? v, dropFrom("categories", v)));
    f.formats.forEach((v) => add(t("f.format"), t(`format.${v}`), dropFrom("formats", v)));
    f.sources.forEach((v) => add(t("f.source"), this.itemByPath.get(v)?.title ?? v, dropFrom("sources", v)));
    f.elaborations.forEach((v) => add(t("f.elab"), t(`elab.${v}`), dropFrom("elaborations", v)));
    if (f.connections) {
      add(t("f.conn"), t(f.connections === "with" ? "f.connWith" : "f.connWithout"), () => {
        this.state.filters.connections = null;
      });
    }
    return chips;
  }

  private clearFilters() {
    this.state.filters = enforceView(emptyFilters(), this.state.view);
    if (this.searchEl) this.searchEl.value = "";
    this.onFiltersChanged(true);
  }

  /** Button badges, removable chips and the result count. */
  private updateFilterUI() {
    const f = this.state.filters;
    const perButton: Record<string, number> = {
      types: f.types.length,
      statuses: f.statuses.length,
      authors: f.authors.length,
      more:
        f.categories.length +
        f.formats.length +
        f.sources.length +
        f.elaborations.length +
        (f.connections ? 1 : 0),
    };
    this.filterBtns.forEach((btn, id) => {
      const n = perButton[id] ?? 0;
      btn.toggleClass("is-active", n > 0);
      const badge = btn.querySelector<HTMLElement>(".fel-filter-badge");
      badge?.setText(n > 0 ? String(n) : "");
      badge?.toggleClass("is-visible", n > 0);
    });

    const chipsEl = this.chipsEl;
    if (!chipsEl) return;
    chipsEl.empty();
    const chips = this.state.tab === "items" ? this.chipList() : [];
    chips.forEach((chip) => {
      const el = chipsEl.createDiv({ cls: "fel-active-chip", attr: { role: "listitem" } });
      el.createSpan({ text: chip.label });
      const x = el.createEl("button", {
        cls: "fel-chip-x",
        attr: { "aria-label": `${t("f.remove")}: ${chip.label}` },
      });
      setIcon(x, "x");
      x.addEventListener("click", () => {
        chip.remove();
        this.onFiltersChanged(true);
      });
    });
    if (additionalCount(f, this.state.view) > 0) {
      const clear = chipsEl.createEl("button", { cls: "fel-clear", text: t("f.clear") });
      clear.addEventListener("click", () => this.clearFilters());
    }
  }

  // ---- cards: filtering, ordering, animation ------------------------------------------

  private scopeKey(): string {
    return `${this.state.view}|${this.state.tab}|${this.state.filters.categories.join("+")}`;
  }

  private visible(): LibraryItem[] {
    const f = this.state.filters;
    let list: LibraryItem[];
    if (this.state.tab === "notebooks") {
      list = applyFilters(
        this.items.filter((i) => i.kind === "notebook"),
        { ...emptyFilters(), query: f.query }
      );
    } else {
      list = applyFilters(this.contentItems(), f);
    }

    const order = this.plugin.settings.cardOrder[this.scopeKey()] ?? [];
    const sorted = sortItems(list, this.state.sort, order);
    const limited =
      this.state.view === "recent" && this.state.sort === "recent" && this.state.tab === "items";
    return limited ? sorted.slice(0, RECENT_LIMIT) : sorted;
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
    this.countEl?.setText(list.length === 1 ? t("lib.result1") : t("lib.results", { n: list.length }));
    if (this.sortEl) this.sortEl.value = this.state.sort;

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

  private emptyMessage(): { text: string; clear: boolean } {
    const hasContent = this.state.tab === "notebooks"
      ? this.items.some((i) => i.kind === "notebook")
      : this.contentItems().length > 0;
    if (!hasContent && this.state.tab === "items") return { text: t("lib.emptyLibrary"), clear: false };

    // Only filters the user added count: an empty Ideas view is just empty.
    if (additionalCount(this.state.filters, this.state.view) === 0) {
      return { text: t("lib.emptyView"), clear: false };
    }
    return { text: t("lib.noResults"), clear: true };
  }

  private placeCards(list: LibraryItem[], first: Map<string, DOMRect>, animate: boolean) {
    const grid = this.gridEl;
    grid.querySelector(".fel-empty")?.remove();

    if (list.length === 0) {
      const empty = grid.createDiv({ cls: "fel-empty" });
      const msg = this.emptyMessage();
      empty.createDiv({ text: msg.text });
      if (msg.clear) {
        const btn = empty.createEl("button", { cls: "fel-btn", text: t("f.clear") });
        btn.addEventListener("click", () => this.clearFilters());
      }
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
      this.fill(el, item);
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

  private fill(el: HTMLElement, item: LibraryItem) {
    const source = item.sourcePath ? this.itemByPath.get(item.sourcePath) : undefined;
    fillCard(el, item, { color: this.itemColor(item), sourceTitle: source?.title });
  }

  private openNote(path: string | undefined, evt: Event) {
    if (!path) return;
    const modifier = evt instanceof MouseEvent && Keymap.isModEvent(evt);
    void this.plugin.nav.openReader(path, modifier ? "tab" : this.leaf);
  }

  private createCard(path: string): HTMLElement {
    const el = createDiv({ cls: "fel-card" });
    el.dataset.path = path;
    el.draggable = true;
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");

    el.addEventListener("click", (evt) => this.openNote(el.dataset.path, evt));
    el.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        this.openNote(el.dataset.path, evt);
      }
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

  // ---- drag to reorder -------------------------------------------------------------

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
    this.state.sort = "manual";
    if (this.sortEl) this.sortEl.value = "manual";
    this.persist();
    void this.plugin.saveData(this.plugin.settings);
  }

  // ---- canvases -----------------------------------------------------------------------

  private renderCanvases(parent: HTMLElement) {
    const subject = this.singleSubject();
    const needle = subject?.split("/").pop()?.toLowerCase();
    const files = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "canvas")
      .filter((f) => !needle || f.path.toLowerCase().includes(needle));

    const list = parent.createDiv({ cls: "fel-tab-body fel-rows" });
    if (files.length === 0) {
      list.createDiv({ cls: "fel-empty", text: t("lib.noCanvases") });
      return;
    }
    files.forEach((file) => {
      const row = list.createDiv({ cls: "fel-row", attr: { role: "button", tabindex: "0" } });
      setIcon(row.createSpan(), "layout-dashboard");
      row.createSpan({ text: file.basename });
      this.onActivate(row, (evt) => {
        const modifier = evt instanceof MouseEvent && Keymap.isModEvent(evt);
        void this.app.workspace.getLeaf(modifier).openFile(file);
      });
    });
  }
}
