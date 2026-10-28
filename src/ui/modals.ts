import { App, Modal, Notice, Setting, TFile } from "obsidian";
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
import type { LibraryItem } from "../library/types";
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

function submitOnEnter(modal: Modal, submit: () => void) {
  modal.contentEl.addEventListener("keydown", (evt) => {
    const el = evt.target as HTMLElement;
    if (evt.key === "Enter" && el.tagName === "INPUT" && (el as HTMLInputElement).type === "text") {
      evt.preventDefault();
      submit();
    }
  });
}

/** Ctrl/Cmd+Enter saves from a text area. */
function submitOnModEnter(modal: Modal, submit: () => void) {
  modal.contentEl.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
      evt.preventDefault();
      submit();
    }
  });
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

    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t("modal.createTag")).setCta().onClick(() => this.submit())
    );
    submitOnEnter(this, () => this.submit());
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

    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t("modal.create")).setCta().onClick(() => this.submit())
    );
    submitOnEnter(this, () => this.submit());
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
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(t("modal.newCapture"));

    new Setting(contentEl)
      .setName(t("modal.captureText"))
      .addTextArea((area) => {
        area.setPlaceholder(t("modal.capturePh")).onChange((v) => (this.text = v));
        area.inputEl.rows = 4;
        area.inputEl.addClass("fel-textarea");
        window.setTimeout(() => area.inputEl.focus(), 0);
      });

    new Setting(contentEl).setName(t("modal.subject")).addDropdown((d) => {
      d.addOption("", t("modal.none"));
      this.paths.forEach((p) => d.addOption(p, p));
      d.setValue(this.category).onChange((v) => (this.category = v));
    });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t("modal.save")).setCta().onClick(() => this.submit())
    );
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
  leaf: import("obsidian").WorkspaceLeaf;
}

/**
 * Creates a reading note from a passage. The passage and the user's own
 * understanding are separate fields; nothing is written for the user.
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
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(t("modal.readingNote"));

    new Setting(contentEl).setName(t("modal.source")).addDropdown((d) => {
      d.addOption("", t("modal.noSource"));
      this.opts.sources.forEach((s) => d.addOption(s.path, s.title));
      d.setValue(this.sourcePath).onChange((v) => (this.sourcePath = v));
    });

    new Setting(contentEl)
      .setName(t("modal.location"))
      .addText((text) =>
        text
          .setPlaceholder(t("modal.locationPh"))
          .setValue(this.location)
          .onChange((v) => (this.location = v))
      );

    if (this.opts.quote) {
      const block = contentEl.createDiv({ cls: "fel-quote-field" });
      block.createDiv({ cls: "fel-field-label", text: t("modal.passage") });
      block.createDiv({ cls: "fel-quote-preview", text: this.opts.quote });
      block.createDiv({ cls: "setting-item-description", text: t("modal.passageDesc") });
    } else {
      new Setting(contentEl).setName(t("modal.passage")).addTextArea((area) => {
        area.onChange((v) => (this.quote = v));
        area.inputEl.rows = 3;
        area.inputEl.addClass("fel-textarea");
      });
    }

    const own = contentEl.createDiv({ cls: "fel-own-field" });
    own.createDiv({ cls: "fel-field-label", text: t("modal.ownWords") });
    const area = own.createEl("textarea", {
      cls: "fel-textarea",
      attr: { rows: "5", placeholder: t("modal.ownWordsPh"), "aria-label": t("modal.ownWords") },
    });
    area.addEventListener("input", () => (this.own = area.value));
    window.setTimeout(() => area.focus(), 0);

    new Setting(contentEl)
      .setName(t("modal.noteTitleOpt"))
      .addText((text) => text.onChange((v) => (this.title = v)));

    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t("modal.create")).setCta().onClick(() => this.submit())
    );
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
  leaf: import("obsidian").WorkspaceLeaf;
}

/** An idea is its own note, linked to its origin and to any other notes. */
export class IdeaModal extends Modal {
  private title = "";
  private argument = "";
  private related: TFile[] = [];
  private chipsEl: HTMLElement;
  private resultsEl: HTMLElement;

  constructor(
    app: App,
    private plugin: FelisidianPlugin,
    private opts: IdeaOptions
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(this.opts.origin ? t("modal.newIdea") : t("modal.newIdeaStandalone"));

    if (this.opts.origin) {
      const origin = contentEl.createDiv({ cls: "fel-origin" });
      origin.createDiv({ cls: "fel-field-label", text: t("modal.origin") });
      origin.createDiv({ cls: "fel-origin-name", text: this.opts.origin.basename });
      if (this.opts.originContext) {
        origin.createDiv({ cls: "fel-quote-preview", text: this.opts.originContext });
      }
    }

    new Setting(contentEl)
      .setName(t("modal.ideaTitle"))
      .setDesc(t("modal.ideaTitleDesc"))
      .addText((text) => {
        text.onChange((v) => (this.title = v));
        window.setTimeout(() => text.inputEl.focus(), 0);
      });

    const arg = contentEl.createDiv({ cls: "fel-own-field" });
    arg.createDiv({ cls: "fel-field-label", text: t("modal.argument") });
    const area = arg.createEl("textarea", {
      cls: "fel-textarea",
      attr: { rows: "5", placeholder: t("modal.argumentPh"), "aria-label": t("modal.argument") },
    });
    area.addEventListener("input", () => (this.argument = area.value));

    this.renderLinkPicker(contentEl);

    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t("modal.create")).setCta().onClick(() => this.submit())
    );
    submitOnEnter(this, () => this.submit());
    submitOnModEnter(this, () => this.submit());
  }

  /** Type to search notes, click to link them. */
  private renderLinkPicker(parent: HTMLElement) {
    const wrap = parent.createDiv({ cls: "fel-linkpicker" });
    wrap.createDiv({ cls: "fel-field-label", text: t("modal.linkNotes") });
    const input = wrap.createEl("input", {
      type: "search",
      cls: "fel-pop-search",
      placeholder: t("modal.linkNotesPh"),
      attr: { "aria-label": t("modal.linkNotes") },
    });
    this.resultsEl = wrap.createDiv({ cls: "fel-linkresults" });
    this.chipsEl = wrap.createDiv({ cls: "fel-linkchips" });

    input.addEventListener("input", () => this.renderResults(input.value));
  }

  private renderResults(query: string) {
    this.resultsEl.empty();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const taken = new Set([this.opts.origin?.path, ...this.related.map((f) => f.path)]);
    const matches = this.app.vault
      .getMarkdownFiles()
      .filter((f) => !taken.has(f.path) && f.basename.toLowerCase().includes(q))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 8);
    matches.forEach((file) => {
      const row = this.resultsEl.createEl("button", { cls: "fel-linkresult", text: file.basename });
      row.addEventListener("click", () => {
        this.related.push(file);
        this.renderChips();
        this.renderResults(query);
      });
    });
  }

  private renderChips() {
    this.chipsEl.empty();
    this.related.forEach((file) => {
      const chip = this.chipsEl.createDiv({ cls: "fel-active-chip" });
      chip.createSpan({ text: file.basename });
      const x = chip.createEl("button", {
        cls: "fel-chip-x",
        attr: { "aria-label": `${t("modal.remove")}: ${file.basename}` },
      });
      x.setText("×");
      x.addEventListener("click", () => {
        this.related = this.related.filter((f) => f !== file);
        this.renderChips();
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
      elaboration: this.argument.trim() ? "developing" : "pending",
      connectionsHeading: t("f.conn"),
      originLabel: t("modal.origin"),
      date: new Date(),
    });
    const file = await createLibraryNote(this.app, title, content);
    this.close();
    await this.plugin.nav.openReader(file.path, this.opts.leaf);
  }
}
