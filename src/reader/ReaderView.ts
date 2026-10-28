import {
  ItemView,
  MarkdownRenderer,
  Menu,
  Notice,
  Platform,
  TFile,
  ViewStateResult,
  WorkspaceLeaf,
  debounce,
  setIcon,
} from "obsidian";
import { language, t } from "../i18n";
import type FelisidianPlugin from "../main";
import type { NavPage, NavTarget } from "../nav";
import { VIEW_TYPE_READER } from "../nav";
import { KIND_ICONS, fillCard, itemTint, kindLabel } from "../library/cards";
import { categoryColor } from "../library/colors";
import { collectItems, hydratePreviews } from "../library/model";
import { frontmatterLength, splitNoteBody } from "../library/text";
import { ELABORATIONS, LibraryItem, READING_STATUSES } from "../library/types";
import { renderRing } from "../library/ui";

export { VIEW_TYPE_READER };

const NEUTRAL = "#b8a88f";

/**
 * One page for every kind of note. It is read-only: nothing changes unless the
 * user highlights text, creates a note, edits a status or clicks Edit.
 */
export class ReaderView extends ItemView implements NavPage {
  private path: string | null = null;
  private pendingScroll: number | null = null;
  private title = "";
  private bodyEl: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private lastSelection = "";
  private items: LibraryItem[] = [];
  private current: LibraryItem | undefined;

  constructor(leaf: WorkspaceLeaf, private plugin: FelisidianPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_READER;
  }

  getDisplayText() {
    return this.title || this.file()?.basename || "Reader";
  }

  getIcon() {
    return this.current ? KIND_ICONS[this.current.kind] : "book-open";
  }

  snapshot(): NavTarget {
    return {
      type: "reader",
      path: this.path ?? "",
      title: this.title || this.file()?.basename || "",
      scroll: this.contentEl.scrollTop,
    };
  }

  getState() {
    return { path: this.path };
  }

  async setState(state: { path?: string | null; scroll?: number }, result: ViewStateResult) {
    this.path = state?.path ?? null;
    this.pendingScroll = typeof state?.scroll === "number" ? state.scroll : null;
    await this.render();
    await super.setState(state, result);
  }

  rerender() {
    return this.render();
  }

  async onOpen() {
    this.contentEl.addClass("fel-reader");

    const rerender = debounce(() => this.render(), 300, true);
    this.registerEvent(this.app.vault.on("modify", () => rerender()));
    this.registerEvent(this.app.metadataCache.on("changed", () => rerender()));
    this.registerEvent(this.app.vault.on("create", () => rerender()));

    // Touch selection fires no mouseup; the selection itself is the signal.
    this.registerDomEvent(
      document,
      "selectionchange",
      debounce(() => this.onSelect(), 250, true)
    );

    // Scrolling moves the selection: put the toolbar back next to it (or hide it).
    this.registerDomEvent(
      this.contentEl,
      "scroll",
      debounce(
        () => {
          this.hideToolbar();
          this.lastSelection = "";
          this.onSelect();
        },
        120,
        true
      )
    );

    this.registerDomEvent(document, "mousedown", (evt) => {
      if (this.toolbar && !this.toolbar.contains(evt.target as Node)) this.hideToolbar();
    });
  }

  async onClose() {
    this.hideToolbar();
  }

  private file(): TFile | null {
    return this.path ? this.app.vault.getFileByPath(this.path) : null;
  }

  private byPath(path: string): LibraryItem | undefined {
    return this.items.find((i) => i.path === path);
  }

  // ---- rendering ------------------------------------------------------------------

  private async render() {
    const root = this.contentEl;
    const scroll = this.pendingScroll ?? root.scrollTop;
    this.pendingScroll = null;
    root.empty();
    this.hideToolbar();

    const file = this.file();
    if (!file) {
      root.createDiv({ cls: "fel-empty", text: t("reader.notFound") });
      return;
    }

    this.items = collectItems(this.app, this.plugin.previews);
    const item = this.byPath(file.path);
    this.current = item;
    this.title = item?.title ?? file.basename;

    const subject = item?.category.length ? categoryColor(item.category.join("/"), this.plugin.settings.categoryColors) : NEUTRAL;
    const color = item ? itemTint(item, subject) : NEUTRAL;
    this.containerEl.style.setProperty("--fel-cat", color);

    const page = root.createDiv({ cls: "fel-reader-page" });
    this.renderTopBar(page, item, file);
    this.renderHeader(page, item, file);

    page.createDiv({ cls: "fel-reader-hint", text: t("reader.hint") });

    if (item?.kind === "source") this.renderSourceSections(page, item);
    else if (item) this.renderConnections(page, item);

    const content = await this.app.vault.cachedRead(file);
    const body = content.slice(frontmatterLength(content));
    const bodyEl = page.createDiv({ cls: "fel-reader-body markdown-rendered" });
    await this.renderBody(bodyEl, body, file, item);
    this.bodyEl = bodyEl;

    bodyEl.addEventListener("mouseup", () => this.onSelect());
    bodyEl.addEventListener("touchend", () => window.setTimeout(() => this.onSelect(), 50));
    bodyEl.addEventListener("click", (evt) => {
      const target = evt.target as HTMLElement;
      const mark = target.closest("mark");
      if (mark && bodyEl.contains(mark) && window.getSelection()?.isCollapsed) {
        this.markMenu(evt, mark, bodyEl);
        return;
      }
      // Internal links keep working inside the reader, and Back returns here.
      const a = target.closest("a.internal-link");
      if (!a) return;
      evt.preventDefault();
      const href = a.getAttribute("data-href") ?? "";
      const dest = this.app.metadataCache.getFirstLinkpathDest(href, file.path);
      if (dest) void this.plugin.nav.openReader(dest.path, this.leaf);
    });

    root.scrollTop = scroll;
    requestAnimationFrame(() => (root.scrollTop = scroll));
    // The tab and header title follow the note being shown.
    (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
    this.containerEl.querySelector(".view-header-title")?.setText(this.title);
    void this.hydrate();
  }

  /** Reads the user's own writing for note cards, then redraws once. */
  private async hydrate() {
    const changed = await hydratePreviews(this.app, this.items, this.plugin.previews);
    if (changed && this.contentEl.isConnected) void this.render();
  }

  private renderTopBar(page: HTMLElement, item: LibraryItem | undefined, file: TFile) {
    const bar = page.createDiv({ cls: "fel-topbar" });

    const back = bar.createEl("button", { cls: "fel-back" });
    setIcon(back.createSpan(), "arrow-left");
    back.createSpan({ text: this.plugin.nav.backLabel(this.leaf) });
    back.addEventListener("click", () => void this.plugin.nav.back(this.leaf));

    const bc = bar.createDiv({ cls: "fel-crumbs" });
    const root = bc.createSpan({ cls: "fel-crumb", text: t("lib.root"), attr: { role: "button", tabindex: "0" } });
    const goRoot = () => void this.plugin.nav.openSubject(this.leaf, null);
    root.addEventListener("click", goRoot);
    root.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && goRoot());

    const path = item?.category ?? [];
    path.forEach((seg, i) => {
      bc.createSpan({ cls: "fel-crumb-sep", text: "/" });
      const key = path.slice(0, i + 1).join("/");
      const crumb = bc.createSpan({ cls: "fel-crumb", text: seg, attr: { role: "button", tabindex: "0" } });
      const go = () => void this.plugin.nav.openSubject(this.leaf, key);
      crumb.addEventListener("click", go);
      crumb.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && go());
    });
    bc.createSpan({ cls: "fel-crumb-sep", text: "/" });
    bc.createSpan({ cls: "fel-crumb is-current", text: item?.title ?? file.basename });
  }

  private renderHeader(page: HTMLElement, item: LibraryItem | undefined, file: TFile) {
    const head = page.createDiv({ cls: "fel-reader-head" });

    if (item) {
      const chip = head.createDiv({ cls: "fel-kind fel-kind-lg" });
      setIcon(chip.createSpan({ cls: "fel-kind-icon" }), KIND_ICONS[item.kind]);
      chip.createSpan({ text: kindLabel(item) });
    }

    head.createEl("h1", { text: item?.title ?? file.basename });
    if (item?.authors.length) head.createDiv({ cls: "fel-reader-authors", text: item.authors.join(", ") });

    const meta = head.createDiv({ cls: "fel-reader-meta" });
    if (item?.kind === "source") {
      if (item.year) meta.createSpan({ cls: "fel-badge", text: String(item.year) });
      this.renderSelect(meta, file, "status", t("modal.status"), READING_STATUSES.map((s) => [s, t(`status.${s}`)]), item.status ?? "");
      this.renderProgress(meta, file, item);
    } else if (item) {
      this.renderNoteMeta(meta, item, file);
    }

    const actions = meta.createDiv({ cls: "fel-reader-actions" });
    if (item && (item.kind === "reading-note" || item.kind === "capture")) {
      const dev = actions.createEl("button", { cls: "fel-btn fel-btn-primary" });
      setIcon(dev.createSpan(), "lightbulb");
      dev.createSpan({ text: t("reader.developIdea") });
      dev.addEventListener("click", () => void this.developIdea(item, file));
    }
    const edit = actions.createEl("button", { cls: "fel-btn" });
    setIcon(edit.createSpan(), "pencil");
    edit.createSpan({ text: t("reader.edit") });
    edit.addEventListener("click", () => {
      void this.leaf.setViewState({
        type: "markdown",
        state: { file: file.path, mode: "source" },
        active: true,
      });
    });
  }

  private renderNoteMeta(meta: HTMLElement, item: LibraryItem, file: TFile) {
    if (item.kind === "capture") {
      meta.createSpan({
        cls: "fel-badge",
        text: new Date(item.created).toLocaleDateString(language() === "pt" ? "pt-BR" : "en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      });
    }
    if (item.kind === "reading-note") {
      const source = item.sourcePath ? this.byPath(item.sourcePath) : undefined;
      if (source) {
        const chip = meta.createEl("button", { cls: "fel-source-chip is-link" });
        setIcon(chip.createSpan({ cls: "fel-notes-icon" }), "book-open");
        chip.createSpan({ text: source.title });
        chip.addEventListener("click", () => void this.plugin.nav.openReader(source.path, this.leaf));
      }
      if (item.location) meta.createSpan({ cls: "fel-location", text: item.location });
    }
    if (item.kind === "idea") {
      item.sourcePaths
        .map((p) => this.byPath(p))
        .filter((s): s is LibraryItem => !!s)
        .forEach((source) => {
          const chip = meta.createEl("button", { cls: "fel-source-chip is-link" });
          setIcon(chip.createSpan({ cls: "fel-notes-icon" }), "book-open");
          chip.createSpan({ text: source.title });
          chip.addEventListener("click", () => void this.plugin.nav.openReader(source.path, this.leaf));
        });
    }
    this.renderSelect(
      meta,
      file,
      "elaboration",
      t("f.elab"),
      ELABORATIONS.map((e) => [e, t(`elab.${e}`)]),
      item.elaboration ?? (item.kind === "capture" ? "pending" : ""),
      item.kind !== "capture"
    );
  }

  /** A property picker; changing it is an explicit edit of the note. */
  private renderSelect(
    parent: HTMLElement,
    file: TFile,
    property: string,
    label: string,
    options: string[][],
    value: string,
    allowEmpty = false
  ) {
    const wrap = parent.createDiv({ cls: "fel-select-wrap" });
    const id = `fel-${property}-${Math.random().toString(36).slice(2, 7)}`;
    wrap.createEl("label", { text: label, attr: { for: id } });
    const select = wrap.createEl("select", { cls: "dropdown", attr: { id } });
    // An empty choice lets the user leave the state unset (ideas are not tasks).
    if (!value || allowEmpty) {
      const none = select.createEl("option", { value: "", text: t("modal.notSet") });
      none.selected = !value;
    }
    options.forEach(([v, text]) => {
      const opt = select.createEl("option", { value: v, text });
      opt.selected = v === value;
    });
    select.addEventListener("change", () => {
      const chosen = select.value;
      if (!chosen && !allowEmpty) return;
      void this.app.fileManager.processFrontMatter(file, (fm) => {
        if (chosen) fm[property] = chosen;
        else delete fm[property];
      });
    });
  }

  private renderProgress(parent: HTMLElement, file: TFile, item: LibraryItem) {
    const pages = item.pages;
    if (!pages) return;
    const wrap = parent.createDiv({ cls: "fel-progress" });
    renderRing(wrap, item.progress, 26);
    const id = `fel-page-${Math.random().toString(36).slice(2, 7)}`;
    wrap.createEl("label", { text: t("reader.page"), attr: { for: id } });
    const input = wrap.createEl("input", { type: "number", attr: { id } });
    input.value = String(item.currentPage ?? 0);
    input.min = "0";
    input.max = String(pages);
    wrap.createSpan({ text: t("reader.of", { n: pages }) });

    input.addEventListener("change", () => {
      const n = Math.min(pages, Math.max(0, Math.round(Number(input.value) || 0)));
      void this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.current_page = n;
      });
    });
  }

  // ---- relations -------------------------------------------------------------------

  private miniCards(parent: HTMLElement, list: LibraryItem[], empty: string) {
    const grid = parent.createDiv({ cls: "fel-mini-grid" });
    if (list.length === 0) {
      grid.createDiv({ cls: "fel-mini-empty", text: empty });
      return;
    }
    list.forEach((it) => {
      const card = grid.createDiv({ cls: "fel-card", attr: { role: "button", tabindex: "0" } });
      const subject = it.category.length ? categoryColor(it.category.join("/"), this.plugin.settings.categoryColors) : NEUTRAL;
      const source = it.sourcePath ? this.byPath(it.sourcePath) : undefined;
      fillCard(card, it, { color: itemTint(it, subject), sourceTitle: source?.title, compact: true });
      const open = () => void this.plugin.nav.openReader(it.path, this.leaf);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });
  }

  private section(parent: HTMLElement, title: string, count: number): HTMLElement {
    const sec = parent.createDiv({ cls: "fel-reader-section" });
    const head = sec.createDiv({ cls: "fel-section-head" });
    head.createEl("h2", { text: title });
    head.createSpan({ cls: "fel-count", text: String(count) });
    return sec;
  }

  private renderSourceSections(page: HTMLElement, source: LibraryItem) {
    const notes = this.items
      .filter((i) => i.kind === "reading-note" && i.sourcePaths.includes(source.path))
      .sort((a, b) => b.mtime - a.mtime);
    const notePaths = new Set(notes.map((n) => n.path));
    const ideas = this.items
      .filter(
        (i) =>
          i.kind === "idea" &&
          (i.sourcePaths.includes(source.path) ||
            [...i.links, ...i.backlinks].some((p) => notePaths.has(p)))
      )
      .sort((a, b) => b.mtime - a.mtime);

    const notesSec = this.section(page, t("reader.readingNotes"), notes.length);
    const add = notesSec.querySelector(".fel-section-head")?.createEl("button", { cls: "fel-btn" });
    if (add) {
      setIcon(add.createSpan(), "plus");
      add.createSpan({ text: t("reader.newReadingNote") });
      add.addEventListener("click", () => this.plugin.openReadingNoteModal(source, "", this.leaf));
    }
    this.miniCards(notesSec, notes, t("reader.noReadingNotes"));

    const ideasSec = this.section(page, t("reader.relatedIdeas"), ideas.length);
    this.miniCards(ideasSec, ideas, t("reader.noIdeas"));
  }

  /** Other library notes connected to this one, in either direction. */
  private renderConnections(page: HTMLElement, item: LibraryItem) {
    const linked = [...new Set([...item.links, ...item.backlinks])]
      .map((p) => this.byPath(p))
      .filter((i): i is LibraryItem => !!i && i.kind !== "source");
    if (linked.length === 0) return;
    const sec = this.section(page, t("reader.connections"), linked.length);
    this.miniCards(sec, linked, "");
  }

  private async developIdea(item: LibraryItem, file: TFile) {
    this.plugin.openIdeaModal(file, item.preview, item.sourcePaths, this.leaf);
  }

  // ---- body ------------------------------------------------------------------------------

  /**
   * Reading notes show the passage and the user's own words as two different
   * blocks, in the order they appear in the note.
   */
  private async renderBody(el: HTMLElement, body: string, file: TFile, item?: LibraryItem) {
    if (item?.kind !== "reading-note") {
      await MarkdownRenderer.render(this.app, body, el, file.path, this);
      return;
    }

    const segments = splitNoteBody(body);
    let hasOwn = false;
    for (const seg of segments) {
      if (seg.kind === "quote") {
        const block = el.createDiv({ cls: "fel-quote-block" });
        block.createDiv({ cls: "fel-block-label", text: t("reader.quote") });
        const text = seg.text
          .split("\n")
          .map((l) => l.replace(/^\s*>\s?/, ""))
          .filter((l) => !/^\[!quote\]/i.test(l.trim()))
          .join("\n");
        await MarkdownRenderer.render(this.app, text, block.createDiv(), file.path, this);
      } else {
        hasOwn = true;
        const block = el.createDiv({ cls: "fel-own-block" });
        block.createDiv({ cls: "fel-block-label", text: t("reader.own") });
        await MarkdownRenderer.render(this.app, seg.text, block.createDiv(), file.path, this);
      }
    }
    if (!hasOwn) {
      const block = el.createDiv({ cls: "fel-own-block is-empty" });
      block.createDiv({ cls: "fel-block-label", text: t("reader.own") });
      block.createDiv({ cls: "fel-own-empty", text: t("reader.ownEmpty") });
    }
  }

  // ---- selection: highlight or create a reading note -----------------------------------

  private hideToolbar() {
    this.toolbar?.remove();
    this.toolbar = null;
    this.lastSelection = "";
  }

  private onSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !this.bodyEl) {
      this.hideToolbar();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!this.bodyEl.contains(range.commonAncestorContainer)) return;

    // Same selection, toolbar already there: nothing to redraw.
    const text = sel.toString();
    if (this.toolbar && text === this.lastSelection) return;
    this.lastSelection = text;

    this.hideToolbar();
    const rect = range.getBoundingClientRect();
    // A selection scrolled out of view gets no toolbar.
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const bar = document.body.createDiv({ cls: "fel-toolbar", attr: { role: "toolbar" } });
    // On touch screens the system menu sits above the selection, so ours goes below.
    const below = Platform.isMobile;
    bar.toggleClass("is-below", below);
    bar.style.top = below ? `${rect.bottom + 14}px` : `${rect.top - 8}px`;
    const centre = rect.left + rect.width / 2;

    const hl = bar.createEl("button", { cls: "fel-btn" });
    setIcon(hl.createSpan(), "highlighter");
    hl.createSpan({ text: t("reader.highlight") });
    hl.addEventListener("click", () => {
      void this.highlight(range);
      this.hideToolbar();
    });

    const note = bar.createEl("button", { cls: "fel-btn" });
    setIcon(note.createSpan(), "quote");
    note.createSpan({ text: t("reader.createReadingNote") });
    const quote = sel.toString().trim();
    note.addEventListener("click", () => {
      this.createReadingNote(quote);
      this.hideToolbar();
      window.getSelection()?.removeAllRanges();
    });
    // Keep the toolbar inside the screen.
    const half = bar.offsetWidth / 2;
    bar.style.left = `${Math.max(8 + half, Math.min(centre, window.innerWidth - 8 - half))}px`;
    // Obsidian mobile floats a navigation bar at the bottom: if there is no room
    // under the selection, put the toolbar above it instead.
    if (below && rect.bottom + 14 + bar.offsetHeight > window.innerHeight - 96) {
      bar.removeClass("is-below");
      bar.style.top = `${Math.max(8, rect.top - 14)}px`;
    }
    this.toolbar = bar;
  }

  /** Opens the reading-note window with the passage and, if known, the source. */
  private createReadingNote(quote: string) {
    const here = this.current;
    let source: LibraryItem | null = null;
    if (here?.kind === "source") source = here;
    else if (here?.sourcePath) source = this.byPath(here.sourcePath) ?? null;

    let hint = "";
    if (here?.kind === "reading-note" && here.location) hint = here.location;
    else if (source?.currentPage) hint = `p. ${source.currentPage}`;
    this.plugin.openReadingNoteModal(source, quote, this.leaf, hint);
  }

  /** Wraps the selected text in ==...== in the note's source. */
  private async highlight(range: Range) {
    const file = this.file();
    const bodyEl = this.bodyEl;
    if (!file || !bodyEl) return;

    const raw = range.toString();
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text || raw.includes("\n")) {
      new Notice(t("reader.selectMultiParagraph"));
      return;
    }

    // How many times the text already appeared before the selection.
    const pre = document.createRange();
    pre.selectNodeContents(bodyEl);
    pre.setEnd(range.startContainer, range.startOffset);
    const before = pre.toString().replace(/\s+/g, " ");
    let skip = 0;
    for (let i = before.indexOf(text); i !== -1; i = before.indexOf(text, i + 1)) skip++;

    let done = false;
    await this.app.vault.process(file, (data) => {
      let idx = frontmatterLength(data) - 1;
      for (let k = 0; k <= skip; k++) {
        idx = data.indexOf(text, idx + 1);
        if (idx < 0) return data;
      }
      done = true;
      return data.slice(0, idx) + "==" + text + "==" + data.slice(idx + text.length);
    });

    window.getSelection()?.removeAllRanges();
    if (!done) new Notice(t("reader.cannotLocate"));
  }

  private markMenu(evt: MouseEvent, mark: Element, bodyEl: HTMLElement) {
    const index = Array.from<Element>(bodyEl.querySelectorAll("mark")).indexOf(mark);
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(t("reader.removeHighlight"))
        .setIcon("eraser")
        .onClick(() => void this.removeHighlight(index))
    );
    menu.showAtMouseEvent(evt);
  }

  private async removeHighlight(index: number) {
    const file = this.file();
    if (!file) return;
    await this.app.vault.process(file, (data) => {
      const re = /==(?!=)([^=\n]+?)==/g;
      re.lastIndex = frontmatterLength(data);
      let count = 0;
      for (let m = re.exec(data); m; m = re.exec(data)) {
        if (count++ === index) {
          return data.slice(0, m.index) + m[1] + data.slice(m.index + m[0].length);
        }
      }
      return data;
    });
  }
}
