import { App, Modal, Notice, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { t } from "../i18n";
import type FelisidianPlugin from "../main";
import { PALETTE, PALETTE_KEYS, colorKeyFor } from "../library/colors";
import {
  buildCapture,
  buildIdeaNote,
  buildReadingNote,
  captureFileName,
  safeFileName,
  truncate,
} from "../library/text";
import { ELABORATIONS, Elaboration, LibraryItem } from "../library/types";
import { renderSwatches } from "../library/ui";

const LIBRARY_FOLDER = "Library";

/** Creates a note in the library folder, avoiding name clashes. */
export async function createLibraryNote(
  app: App,
  baseName: string,
  content: string
): Promise<TFile> {
  if (!app.vault.getFolderByPath(LIBRARY_FOLDER)) await app.vault.createFolder(LIBRARY_FOLDER);
  const base = safeFileName(baseName);
  let path = `${LIBRARY_FOLDER}/${base}.md`;
  for (let n = 2; app.vault.getAbstractFileByPath(path); n++) {
    path = `${LIBRARY_FOLDER}/${base} ${n}.md`;
  }
  return app.vault.create(path, content);
}

/** Gives a window the library's look: cream paper, serif titles, pill buttons. */
function skin(modal: Modal, wide = false) {
  modal.modalEl.addClass("fel-modal");
  modal.modalEl.toggleClass("is-wide", wide);
}

function submitOnEnter(modal: Modal, submit: () => void) {
  modal.contentEl.addEventListener("keydown", (evt) => {
    const el = evt.target as HTMLElement;
    if (evt.key === "Enter" && el.tagName === "INPUT" && (el as HTMLInputElement).type === "text") {
      evt.preventDefault();
      submit();
    }
  });
}

/** Ctrl/Cmd+Enter saves from anywhere in the window. */
function submitOnModEnter(modal: Modal, submit: () => void) {
  modal.contentEl.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
      evt.preventDefault();
      submit();
    }
  });
}

let uid = 0;

/** A label above a full-width control, tied together for screen readers. */
function field(parent: HTMLElement, label: string, cls = ""): { wrap: HTMLElement; id: string } {
  const id = `fel-f-${++uid}`;
  const wrap = parent.createDiv({ cls: `fel-field ${cls}`.trim() });
  wrap.createEl("label", { cls: "fel-field-label", text: label, attr: { for: id } });
  return { wrap, id };
}

/** Cancel + main action, with the keyboard shortcut spelled out. */
function footer(parent: HTMLElement, modal: Modal, okText: string, onOk: () => void) {
  const foot = parent.createDiv({ cls: "fel-modal-foot" });
  foot.createSpan({ cls: "fel-kbd-hint", text: t("modal.shortcut") });
  const cancel = foot.createEl("button", { cls: "fel-modal-cancel", text: t("modal.cancel") });
  cancel.addEventListener("click", () => modal.close());
  const ok = foot.createEl("button", { cls: "mod-cta fel-modal-ok", text: okText });
  ok.addEventListener("click", onOk);
}

// ---- tag ---------------------------------------------------------------------

/** Window to create a tag (subject) with a pastel color. */
export class NewTagModal extends Modal {
  private name = "";
  private color = PALETTE_KEYS[Math.floor(Math.random() * PALETTE_KEYS.length)];
  private previewEl: HTMLElement;

  constructor(
    app: App,
    private plugin: FelisidianPlugin,
    private paths: string[],
    private parent: string | null,
    private onDone?: (path: string) => void
  ) {
    super(app);
  }

  onOpen() {
    skin(this);
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(t("modal.newTag"));

    new Setting(contentEl).setName(t("modal.name")).addText((text) => {
      text.setPlaceholder("Machine learning").onChange((v) => {
        this.name = v;
        this.renderPreview();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });

    new Setting(contentEl)
      .setName(t("modal.parentTag"))
      .setDesc(t("modal.parentTagDesc"))
      .addDropdown((d) => {
        d.addOption("", t("modal.none"));
        this.paths.forEach((p) => d.addOption(p, p));
        d.setValue(this.parent ?? "").onChange((v) => (this.parent = v || null));
      });

    const colorRow = new Setting(contentEl).setName(t("modal.color"));
    renderSwatches(colorRow.controlEl, this.color, (k) => {
      this.color = k;
      this.renderPreview();
    });

    this.previewEl = contentEl.createDiv({ cls: "fel-preview" });
    this.renderPreview();

    footer(contentEl, this, t("modal.createTag"), () => this.submit());
    submitOnEnter(this, () => this.submit());
    submitOnModEnter(this, () => this.submit());
  }

  private renderPreview() {
    this.previewEl.empty();
    const card = this.previewEl.createDiv({ cls: "fel-preview-card" });
    card.style.setProperty("--fel-cat", PALETTE[this.color]);
    const top = card.createDiv({ cls: "fel-card-top" });
    top.createSpan({ cls: "fel-badge", text: String(new Date().getFullYear()) });
    top.createSpan({ text: this.name.trim() || t("modal.tagName") });
    card.createDiv({ cls: "fel-card-title", text: t("modal.tagPreview") });
  }

  private async submit() {
    const name = this.name.trim().replace(/\//g, "-");
    if (!name) {
      new Notice(t("modal.giveName"));
      return;
    }
    const path = this.parent ? `${this.parent}/${name}` : name;
    const s = this.plugin.settings;
    if (!s.customCategories.includes(path)) s.customCategories.push(path);
    s.categoryColors[path] = this.color;
    await this.plugin.saveSettings();
    this.close();
    this.onDone?.(path);
  }
}

// ---- source / notebook -------------------------------------------------------------

/** Window to create a source (book, article, video…) or a notebook. */
export class SourceModal extends Modal {
  private title = "";
  private authors = "";
  private year = String(new Date().getFullYear());
  private pages = "";
  private format = "book";
  private status = "want";
  private category: string;
  private color: string;
  private colorTouched = false;
  private setSwatch: (key: string) => void;

  constructor(
    app: App,
    private plugin: FelisidianPlugin,
    private paths: string[],
    category: string | null,
    private notebook: boolean
  ) {
    super(app);
    this.category = category ?? paths[0] ?? t("misc.uncategorized");
    this.color = colorKeyFor(this.category, plugin.settings.categoryColors);
  }

  onOpen() {
    skin(this);
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(this.notebook ? t("modal.newNotebook") : t("modal.newSource"));

    new Setting(contentEl).setName(t("modal.title")).addText((text) => {
      text.onChange((v) => (this.title = v));
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(contentEl)
      .setName(t("modal.authors"))
      .setDesc(t("modal.authorsDesc"))
      .addText((text) => text.onChange((v) => (this.authors = v)));
    new Setting(contentEl)
      .setName(t("modal.year"))
      .addText((text) => text.setValue(this.year).onChange((v) => (this.year = v)));

    if (!this.notebook) {
      new Setting(contentEl).setName(t("modal.format")).addDropdown((d) => {
        (["book", "article", "video", "other"] as const).forEach((f) => d.addOption(f, t(`format.${f}`)));
        d.setValue(this.format).onChange((v) => (this.format = v));
      });
      new Setting(contentEl).setName(t("modal.status")).addDropdown((d) => {
        (["want", "reading", "paused", "done"] as const).forEach((s) => d.addOption(s, t(`status.${s}`)));
        d.setValue(this.status).onChange((v) => (this.status = v));
      });
      new Setting(contentEl)
        .setName(t("modal.pages"))
        .addText((text) => text.setPlaceholder("320").onChange((v) => (this.pages = v)));
    }

    new Setting(contentEl).setName(t("modal.tag")).addDropdown((d) => {
      const options = this.paths.length ? this.paths : [this.category];
      options.forEach((p) => d.addOption(p, p));
      d.setValue(this.category).onChange((v) => {
        this.category = v;
        if (!this.colorTouched) {
          this.color = colorKeyFor(v, this.plugin.settings.categoryColors);
          this.setSwatch(this.color);
        }
      });
    });

    const colorRow = new Setting(contentEl).setName(t("modal.color")).setDesc(t("modal.colorDesc"));
    this.setSwatch = renderSwatches(colorRow.controlEl, this.color, (k) => {
      this.color = k;
      this.colorTouched = true;
    });

    footer(contentEl, this, t("modal.create"), () => this.submit());
    submitOnEnter(this, () => this.submit());
    submitOnModEnter(this, () => this.submit());
  }

  private async submit() {
    const title = this.title.trim();
    const quote = (s: string) => JSON.stringify(s);
    const authors = this.authors.split(",").map((a) => a.trim()).filter(Boolean);
    const year = Number(this.year);
    const pages = Number(this.pages);

    const lines = ["---", `type: ${this.notebook ? "notebook" : "source"}`];
    if (title) lines.push(`title: ${quote(title)}`);
    if (authors.length) lines.push("authors:", ...authors.map((a) => `  - ${quote(a)}`));
    if (Number.isFinite(year) && year > 0) lines.push(`year: ${year}`);
    if (!this.notebook) {
      lines.push(`format: ${this.format}`, `status: ${this.status}`);
      if (pages > 0) lines.push(`pages: ${pages}`, "current_page: 0");
    }
    lines.push(`category: ${quote(this.category)}`);
    // Only store a color when it differs from the tag's; otherwise the note
    // follows its tag, whose color is edited in the plugin settings.
    const tagKey = colorKeyFor(this.category, this.plugin.settings.categoryColors);
    if (this.colorTouched && this.color !== tagKey) lines.push(`color: ${this.color}`);
    lines.push("---", "", "");

    const file = await createLibraryNote(this.app, title || "Untitled", lines.join("\n"));
    this.close();
    await this.plugin.nav.openReader(file.path, this.app.workspace.getLeaf(false));
  }
}

// ---- quick capture ------------------------------------------------------------------

/** A short thought, saved in seconds and developed later. */
export class CaptureModal extends Modal {
  private text = "";
  private category: string;

  constructor(
    app: App,
    private plugin: FelisidianPlugin,
    private paths: string[],
    category: string | null
  ) {
    super(app);
    this.category = category ?? "";
  }

  onOpen() {
    skin(this);
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(t("modal.newCapture"));

    const text = field(contentEl, t("modal.captureText"));
    const area = text.wrap.createEl("textarea", {
      cls: "fel-textarea fel-write",
      attr: { id: text.id, rows: "6", placeholder: t("modal.capturePh") },
    });
    area.addEventListener("input", () => (this.text = area.value));
    window.setTimeout(() => area.focus(), 0);

    const subject = field(contentEl, t("modal.subject"), "fel-field-inline");
    const select = subject.wrap.createEl("select", { cls: "dropdown", attr: { id: subject.id } });
    select.createEl("option", { value: "", text: t("modal.none") });
    this.paths.forEach((p) => {
      const opt = select.createEl("option", { value: p, text: p });
      opt.selected = p === this.category;
    });
    select.addEventListener("change", () => (this.category = select.value));

    footer(contentEl, this, t("modal.saveCapture"), () => this.submit());
    submitOnModEnter(this, () => this.submit());
  }

  private async submit() {
    if (!this.text.trim()) {
      new Notice(t("modal.writeSomething"));
      return;
    }
    const now = new Date();
    await createLibraryNote(
      this.app,
      captureFileName(this.text, now),
      buildCapture({ text: this.text, category: this.category || undefined, date: now })
    );
    this.close();
  }
}

// ---- reading note ---------------------------------------------------------------------

export interface ReadingNoteOptions {
  sources: LibraryItem[];
  /** Pre-selected source path. */
  sourcePath: string | null;
  /** The selected text; empty when the user will type the passage. */
  quote: string;
  /** Suggested location, e.g. from the user's current page. Editable. */
  locationHint: string;
  leaf: WorkspaceLeaf;
}

/**
 * Creates a reading note from a passage. The passage and the user's own
 * understanding are separate; nothing is written for the user.
 */
export class ReadingNoteModal extends Modal {
  private sourcePath: string;
  private location: string;
  private quote: string;
  private own = "";
  private title = "";

  constructor(
    app: App,
    private plugin: FelisidianPlugin,
    private opts: ReadingNoteOptions
  ) {
    super(app);
    this.sourcePath = opts.sourcePath ?? "";
    this.location = opts.locationHint;
    this.quote = opts.quote;
  }

  onOpen() {
    skin(this, true);
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(t("modal.readingNote"));

    // Where it comes from: two short fields side by side.
    const meta = contentEl.createDiv({ cls: "fel-row2" });
    const src = field(meta, t("modal.source"));
    const select = src.wrap.createEl("select", { cls: "dropdown", attr: { id: src.id } });
    select.createEl("option", { value: "", text: t("modal.noSource") });
    this.opts.sources.forEach((s) => {
      const opt = select.createEl("option", { value: s.path, text: s.title });
      opt.selected = s.path === this.sourcePath;
    });
    select.addEventListener("change", () => (this.sourcePath = select.value));

    const loc = field(meta, t("modal.location"));
    const locInput = loc.wrap.createEl("input", {
      type: "text",
      cls: "fel-input",
      attr: { id: loc.id, placeholder: t("modal.locationPh") },
    });
    locInput.value = this.location;
    locInput.addEventListener("input", () => (this.location = locInput.value));

    // The passage, visibly apart from the user's own words.
    if (this.opts.quote) {
      const block = contentEl.createDiv({ cls: "fel-field" });
      block.createDiv({ cls: "fel-field-label", text: t("modal.passage") });
      block.createDiv({ cls: "fel-quote-preview", text: this.opts.quote, attr: { tabindex: "0" } });
    } else {
      const pass = field(contentEl, t("modal.passage"));
      const area = pass.wrap.createEl("textarea", {
        cls: "fel-textarea",
        attr: { id: pass.id, rows: "3" },
      });
      area.addEventListener("input", () => (this.quote = area.value));
    }

    const own = field(contentEl, t("modal.ownWords"), "fel-own-field");
    const ownArea = own.wrap.createEl("textarea", {
      cls: "fel-textarea fel-write",
      attr: { id: own.id, rows: "9", placeholder: t("modal.ownWordsPh") },
    });
    ownArea.addEventListener("input", () => (this.own = ownArea.value));
    window.setTimeout(() => ownArea.focus(), 0);

    const title = field(contentEl, t("modal.noteTitleOpt"));
    const titleInput = title.wrap.createEl("input", {
      type: "text",
      cls: "fel-input",
      attr: { id: title.id },
    });
    titleInput.addEventListener("input", () => (this.title = titleInput.value));

    footer(contentEl, this, t("modal.createReadingNote"), () => this.submit());
    submitOnModEnter(this, () => this.submit());
  }

  private async submit() {
    if (!this.quote.trim() && !this.own.trim()) {
      new Notice(t("modal.writeSomething"));
      return;
    }
    const sourceFile = this.sourcePath ? this.app.vault.getFileByPath(this.sourcePath) : null;
    const sourceLink = sourceFile ? this.app.metadataCache.fileToLinktext(sourceFile, "") : undefined;
    const sourceTitle = this.opts.sources.find((s) => s.path === this.sourcePath)?.title;
    const location = this.location.trim();
    const now = new Date();

    const content = buildReadingNote({
      quote: this.quote,
      source: sourceLink,
      location: location || undefined,
      own: this.own,
      title: this.title.trim() || undefined,
      ownHeading: t("modal.ownWords"),
      elaboration: this.own.trim() ? "developing" : "pending",
      date: now,
    });
    const name =
      this.title.trim() ||
      [sourceTitle, location].filter(Boolean).join(" — ") ||
      truncate(this.quote.trim().replace(/\s+/g, " "), 40);
    const file = await createLibraryNote(this.app, name, content);
    this.close();
    await this.plugin.nav.openReader(file.path, this.opts.leaf);
  }
}

// ---- idea --------------------------------------------------------------------------------

export interface IdeaOptions {
  /** Note the idea grows from, if any. */
  origin: TFile | null;
  /** Text of the origin, shown for context only. Never copied into the idea. */
  originContext: string;
  /** Source paths inherited from the origin. */
  sourcePaths: string[];
  leaf: WorkspaceLeaf;
}

/**
 * Space to think. The idea is the title and the argument; the origin is a
 * collapsed reminder, and linked notes are chips. Everything works by keyboard.
 */
export class IdeaModal extends Modal {
  private title = "";
  private argument = "";
  private elaboration: Elaboration | "" = "";
  private related: TFile[] = [];
  private chipsEl: HTMLElement;
  private resultsEl: HTMLElement;
  private searchEl: HTMLInputElement;

  constructor(
    app: App,
    private plugin: FelisidianPlugin,
    private opts: IdeaOptions
  ) {
    super(app);
  }

  onOpen() {
    skin(this, true);
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(this.opts.origin ? t("modal.newIdea") : t("modal.newIdeaStandalone"));

    if (this.opts.origin) this.renderOrigin(contentEl);

    // The idea itself: a full-width sentence, then room to argue it.
    const idea = field(contentEl, t("modal.ideaQuestion"), "fel-field-idea");
    const titleInput = idea.wrap.createEl("input", {
      type: "text",
      cls: "fel-title-input",
      attr: {
        id: idea.id,
        placeholder: t("modal.ideaTitlePh"),
        autocomplete: "off",
        "aria-describedby": `${idea.id}-hint`,
      },
    });
    idea.wrap.createDiv({ cls: "fel-hint", text: t("modal.ideaTitleDesc"), attr: { id: `${idea.id}-hint` } });
    titleInput.addEventListener("input", () => (this.title = titleInput.value));

    const arg = field(contentEl, t("modal.argument"), "fel-field-write");
    const area = arg.wrap.createEl("textarea", {
      cls: "fel-textarea fel-write fel-write-lg",
      attr: { id: arg.id, rows: "8", placeholder: t("modal.argumentPh") },
    });
    area.addEventListener("input", () => (this.argument = area.value));

    // Enter on the title moves on to the argument instead of saving.
    titleInput.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && !evt.ctrlKey && !evt.metaKey) {
        evt.preventDefault();
        area.focus();
      }
    });

    this.renderLinkPicker(contentEl);
    this.renderElaboration(contentEl);

    footer(contentEl, this, t("modal.createIdea"), () => this.submit());
    submitOnModEnter(this, () => this.submit());
    window.setTimeout(() => titleInput.focus(), 0);
  }

  /** A compact, collapsed reminder of where the idea comes from. */
  private renderOrigin(parent: HTMLElement) {
    const box = parent.createEl("details", { cls: "fel-origin" });
    const summary = box.createEl("summary");
    summary.createSpan({ cls: "fel-origin-label", text: `${t("modal.origin")}:` });
    summary.createSpan({ cls: "fel-origin-name", text: this.opts.origin?.basename ?? "" });
    if (this.opts.originContext) {
      box.createDiv({ cls: "fel-quote-preview", text: this.opts.originContext });
    }
  }

  private renderElaboration(parent: HTMLElement) {
    const f = field(parent, t("modal.elabOptional"), "fel-field-inline");
    const select = f.wrap.createEl("select", { cls: "dropdown", attr: { id: f.id } });
    select.createEl("option", { value: "", text: t("modal.notSet") });
    ELABORATIONS.forEach((e) => select.createEl("option", { value: e, text: t(`elab.${e}`) }));
    select.addEventListener("change", () => (this.elaboration = select.value as Elaboration | ""));
  }

  /** Notes linked as chips; search by typing, add with Enter or by choosing a result. */
  private renderLinkPicker(parent: HTMLElement) {
    const f = field(parent, t("modal.linkNotes"), "fel-linkpicker");
    this.chipsEl = f.wrap.createDiv({
      cls: "fel-linkchips",
      attr: { role: "list", "aria-label": t("modal.linkedNotes") },
    });
    this.searchEl = f.wrap.createEl("input", {
      type: "text",
      cls: "fel-input",
      attr: {
        id: f.id,
        placeholder: t("modal.linkNotesPh"),
        autocomplete: "off",
        "aria-describedby": `${f.id}-hint`,
      },
    });
    f.wrap.createDiv({ cls: "fel-hint", text: t("modal.linkHint"), attr: { id: `${f.id}-hint` } });
    this.resultsEl = f.wrap.createDiv({ cls: "fel-linkresults", attr: { role: "listbox" } });

    this.searchEl.addEventListener("input", () => this.renderResults());
    this.searchEl.addEventListener("keydown", (evt) => {
      const first = this.resultsEl.querySelector<HTMLElement>("button");
      if (evt.key === "Enter" && !evt.ctrlKey && !evt.metaKey) {
        evt.preventDefault();
        first?.click();
      } else if (evt.key === "ArrowDown" && first) {
        evt.preventDefault();
        first.focus();
      } else if (evt.key === "Escape" && this.searchEl.value) {
        evt.stopPropagation();
        this.searchEl.value = "";
        this.renderResults();
      }
    });
  }

  private renderResults() {
    this.resultsEl.empty();
    const q = this.searchEl.value.trim().toLowerCase();
    if (!q) return;
    const taken = new Set([this.opts.origin?.path, ...this.related.map((f) => f.path)]);
    const matches = this.app.vault
      .getMarkdownFiles()
      .filter((f) => !taken.has(f.path) && f.basename.toLowerCase().includes(q))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 8);

    const buttons: HTMLButtonElement[] = [];
    matches.forEach((file) => {
      const row = this.resultsEl.createEl("button", {
        cls: "fel-linkresult",
        text: file.basename,
        attr: { type: "button", role: "option" },
      });
      row.addEventListener("click", () => this.addLink(file));
      buttons.push(row);
    });
    // Arrow keys move through the results; Up from the first returns to the search box.
    buttons.forEach((btn, i) => {
      btn.addEventListener("keydown", (evt) => {
        if (evt.key === "ArrowDown") {
          evt.preventDefault();
          buttons[Math.min(i + 1, buttons.length - 1)].focus();
        } else if (evt.key === "ArrowUp") {
          evt.preventDefault();
          (i === 0 ? this.searchEl : buttons[i - 1]).focus();
        }
      });
    });
  }

  private addLink(file: TFile) {
    this.related.push(file);
    this.renderChips();
    this.searchEl.value = "";
    this.renderResults();
    this.searchEl.focus();
  }

  private renderChips() {
    this.chipsEl.empty();
    this.related.forEach((file) => {
      const chip = this.chipsEl.createDiv({ cls: "fel-active-chip", attr: { role: "listitem" } });
      chip.createSpan({ text: file.basename });
      const x = chip.createEl("button", {
        cls: "fel-chip-x",
        attr: { type: "button", "aria-label": `${t("modal.remove")}: ${file.basename}` },
      });
      x.setText("×");
      x.addEventListener("click", () => {
        this.related = this.related.filter((f) => f !== file);
        this.renderChips();
        this.searchEl.focus();
      });
    });
  }

  private link(file: TFile): string {
    return this.app.metadataCache.fileToLinktext(file, "");
  }

  private async submit() {
    const title = this.title.trim();
    if (!title) {
      new Notice(t("modal.giveIdea"));
      return;
    }
    const sources = this.opts.sourcePaths
      .map((p) => this.app.vault.getFileByPath(p))
      .filter((f): f is TFile => !!f)
      .map((f) => this.link(f));

    const content = buildIdeaNote({
      title,
      argument: this.argument,
      origin: this.opts.origin ? this.link(this.opts.origin) : undefined,
      sources,
      related: this.related.map((f) => this.link(f)),
      // Only what the user chose: an idea is not unfinished work by default.
      elaboration: this.elaboration || undefined,
      connectionsHeading: t("f.conn"),
      originLabel: t("modal.origin"),
      date: new Date(),
    });
    const file = await createLibraryNote(this.app, title, content);
    this.close();
    await this.plugin.nav.openReader(file.path, this.opts.leaf);
  }
}
