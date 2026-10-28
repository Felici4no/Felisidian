import {
  ItemView,
  MarkdownRenderer,
  Menu,
  Notice,
  TFile,
  ViewStateResult,
  WorkspaceLeaf,
  debounce,
  setIcon,
} from "obsidian";
import type FelisidianPlugin from "../main";
import { categoryColor, toHex } from "../library/colors";
import { renderRing } from "../library/ui";

export const VIEW_TYPE_READER = "felisidian-reader";

/** Length of the YAML frontmatter block (including its closing fence). */
function frontmatterLength(data: string): number {
  const m = data.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? m[0].length : 0;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return typeof value === "string" && value ? [value] : [];
}

/**
 * Read-only page for a library note. Nothing here edits the note unless the
 * user explicitly highlights text, changes the page counter or clicks Edit.
 */
export class ReaderView extends ItemView {
  private path: string | null = null;
  private bodyEl: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: FelisidianPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_READER;
  }

  getDisplayText() {
    const file = this.file();
    return file ? file.basename : "Reader";
  }

  getIcon() {
    return "book-open";
  }

  rerender() {
    return this.render();
  }

  getState() {
    return { path: this.path };
  }

  async setState(state: { path?: string | null }, result: ViewStateResult) {
    this.path = state?.path ?? null;
    await this.render();
    await super.setState(state, result);
  }

  async onOpen() {
    this.contentEl.addClass("fel-reader");

    const rerender = debounce(() => this.render(), 200, true);
    const same = (f: { path: string }) => f.path === this.path;
    this.registerEvent(this.app.vault.on("modify", (f) => same(f) && rerender()));
    this.registerEvent(this.app.metadataCache.on("changed", (f) => same(f) && rerender()));

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

  // ---- rendering ---------------------------------------------------------

  private async render() {
    const root = this.contentEl;
    const scroll = root.scrollTop;
    root.empty();
    this.hideToolbar();

    const file = this.file();
    if (!file) {
      root.createDiv({ cls: "fel-empty", text: "This note could not be found." });
      return;
    }

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const category = asList(fm.category)[0] ?? "";
    const catPath = category.split("/").map((s) => s.trim()).filter(Boolean);
    const title = typeof fm.title === "string" && fm.title ? fm.title : file.basename;
    const pages = Number(fm.pages) > 0 ? Number(fm.pages) : undefined;
    const current = Number(fm.current_page) || 0;
    const catKey = catPath.join("/");
    const overrides = this.plugin.settings.categoryColors;
    const color = toHex(typeof fm.color === "string" ? fm.color : undefined) ?? categoryColor(catKey, overrides);
    // The whole page takes the note's pastel color.
    this.containerEl.style.setProperty("--fel-cat", color);
    const page = root.createDiv({ cls: "fel-reader-page" });

    const back = page.createDiv({ cls: "fel-back", attr: { role: "button" } });
    setIcon(back.createSpan(), "arrow-left");
    back.createSpan({ text: "Back to library" });
    back.addEventListener("click", () => this.plugin.openLibrary(catKey || null, this.leaf));

    this.renderCrumbs(page, catPath, title);

    const head = page.createDiv({ cls: "fel-reader-head" });
    head.createEl("h1", { text: title });
    const authors = asList(fm.authors);
    if (authors.length) head.createDiv({ cls: "fel-reader-authors", text: authors.join(", ") });

    const meta = head.createDiv({ cls: "fel-reader-meta" });
    if (fm.year) meta.createSpan({ cls: "fel-badge", text: String(fm.year) });
    if (catPath.length) meta.createSpan({ cls: "fel-reader-cat", text: catPath[catPath.length - 1] });

    this.renderProgress(meta, file, current, pages);


    const edit = meta.createEl("button", { cls: "fel-btn fel-edit" });
    setIcon(edit.createSpan(), "pencil");
    edit.createSpan({ text: "Edit note" });
    edit.addEventListener("click", () => {
      this.leaf.setViewState({
        type: "markdown",
        state: { file: file.path, mode: "source" },
        active: true,
      });
    });

    page.createDiv({
      cls: "fel-reader-hint",
      text: "Reading mode: this page is read-only. Select text to highlight it; click a highlight to remove it.",
    });

    const content = await this.app.vault.cachedRead(file);
    const body = content.slice(frontmatterLength(content));
    const bodyEl = page.createDiv({ cls: "fel-reader-body markdown-rendered" });
    await MarkdownRenderer.render(this.app, body, bodyEl, file.path, this);
    this.bodyEl = bodyEl;

    bodyEl.addEventListener("mouseup", () => this.onSelect());
    bodyEl.addEventListener("click", (evt) => {
      const mark = (evt.target as HTMLElement).closest("mark");
      if (mark && bodyEl.contains(mark) && window.getSelection()?.isCollapsed) {
        this.markMenu(evt, mark, bodyEl);
      }
    });
    // Internal links keep working inside the reader.
    bodyEl.addEventListener("click", (evt) => {
      const a = (evt.target as HTMLElement).closest("a.internal-link");
      if (!a) return;
      evt.preventDefault();
      const href = a.getAttribute("data-href") ?? "";
      const target = this.app.metadataCache.getFirstLinkpathDest(href, file.path);
      if (target) this.plugin.openReader(target.path, this.leaf);
    });

    root.scrollTop = scroll;
  }

  private renderCrumbs(parent: HTMLElement, catPath: string[], title: string) {
    const bc = parent.createDiv({ cls: "fel-crumbs" });
    const root = bc.createSpan({ cls: "fel-crumb", text: "My Library" });
    root.addEventListener("click", () => this.plugin.openLibrary(null, this.leaf));

    catPath.forEach((seg, i) => {
      bc.createSpan({ cls: "fel-crumb-sep", text: "/" });
      const key = catPath.slice(0, i + 1).join("/");
      const crumb = bc.createSpan({ cls: "fel-crumb", text: seg });
      crumb.addEventListener("click", () => this.plugin.openLibrary(key, this.leaf));
    });
    bc.createSpan({ cls: "fel-crumb-sep", text: "/" });
    bc.createSpan({ cls: "fel-crumb is-current", text: title });
  }

  private renderProgress(parent: HTMLElement, file: TFile, current: number, pages?: number) {
    if (!pages) return;
    const wrap = parent.createDiv({ cls: "fel-progress" });
    renderRing(wrap, Math.min(1, current / pages), 26);
    wrap.createSpan({ text: "Page" });
    const input = wrap.createEl("input", { type: "number" });
    input.value = String(current);
    input.min = "0";
    input.max = String(pages);
    wrap.createSpan({ text: `of ${pages}` });

    input.addEventListener("change", async () => {
      const n = Math.min(pages, Math.max(0, Math.round(Number(input.value) || 0)));
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.current_page = n;
      });
    });
  }

  // ---- highlighting ------------------------------------------------------

  private hideToolbar() {
    this.toolbar?.remove();
    this.toolbar = null;
  }

  private onSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !this.bodyEl) {
      this.hideToolbar();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!this.bodyEl.contains(range.commonAncestorContainer)) return;

    this.hideToolbar();
    const rect = range.getBoundingClientRect();
    const bar = document.body.createDiv({ cls: "fel-toolbar" });
    bar.style.left = `${rect.left + rect.width / 2}px`;
    bar.style.top = `${rect.top - 8}px`;
    const btn = bar.createEl("button", { cls: "fel-btn" });
    setIcon(btn.createSpan(), "highlighter");
    btn.createSpan({ text: "Highlight" });
    btn.addEventListener("click", () => {
      this.highlight(range);
      this.hideToolbar();
    });
    this.toolbar = bar;
  }

  /** Wraps the selected text in ==...== in the note's source. */
  private async highlight(range: Range) {
    const file = this.file();
    const bodyEl = this.bodyEl;
    if (!file || !bodyEl) return;

    const raw = range.toString();
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text || raw.includes("\n")) {
      new Notice("Select text within a single paragraph to highlight it.");
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
    if (!done) {
      new Notice("Could not locate that text in the note. Try selecting plain text.");
    }
  }

  private markMenu(evt: MouseEvent, mark: Element, bodyEl: HTMLElement) {
    const index = Array.from<Element>(bodyEl.querySelectorAll("mark")).indexOf(mark);
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Remove highlight")
        .setIcon("eraser")
        .onClick(() => this.removeHighlight(index))
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
