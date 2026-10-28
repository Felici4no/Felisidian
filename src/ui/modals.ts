import { App, Modal, Notice, Setting } from "obsidian";
import type FelisidianPlugin from "../main";
import { PALETTE_KEYS, PALETTE, colorKeyFor } from "../library/colors";
import { renderSwatches } from "../library/ui";

const UNCATEGORIZED = "Uncategorized";

function submitOnEnter(modal: Modal, submit: () => void) {
  modal.contentEl.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && (evt.target as HTMLElement).tagName === "INPUT") {
      evt.preventDefault();
      submit();
    }
  });
}

/** Window to create a tag (category) with a pastel color. */
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
    this.setTitle("New tag");

    new Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder("Machine learning").onChange((v) => {
        this.name = v;
        this.renderPreview();
      });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    new Setting(contentEl)
      .setName("Parent tag")
      .setDesc("Leave empty to create a top-level tag.")
      .addDropdown((d) => {
        d.addOption("", "None");
        this.paths.forEach((p) => d.addOption(p, p));
        d.setValue(this.parent ?? "").onChange((v) => (this.parent = v || null));
      });

    const colorRow = new Setting(contentEl).setName("Color");
    renderSwatches(colorRow.controlEl, this.color, (k) => {
      this.color = k;
      this.renderPreview();
    });

    this.previewEl = contentEl.createDiv({ cls: "fel-preview" });
    this.renderPreview();

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Create tag").setCta().onClick(() => this.submit())
    );
    submitOnEnter(this, () => this.submit());
  }

  private renderPreview() {
    this.previewEl.empty();
    const card = this.previewEl.createDiv({ cls: "fel-preview-card" });
    card.style.setProperty("--fel-cat", PALETTE[this.color]);
    const top = card.createDiv({ cls: "fel-card-top" });
    top.createSpan({ cls: "fel-badge", text: String(new Date().getFullYear()) });
    top.createSpan({ text: this.name.trim() || "Tag name" });
    card.createDiv({ cls: "fel-card-title", text: "Preview of a note in this tag" });
  }

  private async submit() {
    const name = this.name.trim().replace(/\//g, "-");
    if (!name) {
      new Notice("Give the tag a name.");
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

/** Window to create a library note with its tag and color. */
export class NewNoteModal extends Modal {
  private title = "";
  private authors = "";
  private year = String(new Date().getFullYear());
  private pages = "";
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
    this.category = category ?? paths[0] ?? UNCATEGORIZED;
    this.color = colorKeyFor(this.category, plugin.settings.categoryColors);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(this.notebook ? "New notebook" : "New library note");

    new Setting(contentEl).setName("Title").addText((t) => {
      t.onChange((v) => (this.title = v));
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(contentEl)
      .setName("Authors")
      .setDesc("Separate with commas.")
      .addText((t) => t.onChange((v) => (this.authors = v)));
    new Setting(contentEl)
      .setName("Year")
      .addText((t) => t.setValue(this.year).onChange((v) => (this.year = v)));
    if (!this.notebook) {
      new Setting(contentEl)
        .setName("Pages")
        .addText((t) => t.setPlaceholder("e.g. 320").onChange((v) => (this.pages = v)));
    }

    new Setting(contentEl).setName("Tag").addDropdown((d) => {
      const options = this.paths.length ? this.paths : [UNCATEGORIZED];
      options.forEach((p) => d.addOption(p, p));
      d.setValue(this.category).onChange((v) => {
        this.category = v;
        if (!this.colorTouched) {
          this.color = colorKeyFor(v, this.plugin.settings.categoryColors);
          this.setSwatch(this.color);
        }
      });
    });

    const colorRow = new Setting(contentEl)
      .setName("Color")
      .setDesc("Defaults to the tag's color. Tag colors are changed in the plugin settings.");
    this.setSwatch = renderSwatches(colorRow.controlEl, this.color, (k) => {
      this.color = k;
      this.colorTouched = true;
    });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Create").setCta().onClick(() => this.submit())
    );
    submitOnEnter(this, () => this.submit());
  }

  private async submit() {
    const title = this.title.trim();
    const quote = (s: string) => JSON.stringify(s);
    const authors = this.authors.split(",").map((a) => a.trim()).filter(Boolean);
    const year = Number(this.year);
    const pages = Number(this.pages);

    const lines = ["---"];
    if (this.notebook) lines.push("type: notebook");
    if (title) lines.push(`title: ${quote(title)}`);
    lines.push(authors.length ? "authors:" : "authors: []");
    authors.forEach((a) => lines.push(`  - ${quote(a)}`));
    if (Number.isFinite(year) && year > 0) lines.push(`year: ${year}`);
    lines.push(`category: ${quote(this.category)}`);
    if (!this.notebook && pages > 0) lines.push(`pages: ${pages}`, "current_page: 0");
    // Only store a color when it differs from the tag's; otherwise the note
    // follows its tag, whose color is edited in the plugin settings.
    const tagKey = colorKeyFor(this.category, this.plugin.settings.categoryColors);
    if (this.colorTouched && this.color !== tagKey) lines.push(`color: ${this.color}`);
    lines.push("---", "", "");

    const folder = "Library";
    if (!this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder);

    const base = (title || "Untitled").replace(/[\\/:*?"<>|#^[\]]/g, "-");
    let path = `${folder}/${base}.md`;
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) {
      path = `${folder}/${base} ${n}.md`;
    }

    const file = await this.app.vault.create(path, lines.join("\n"));
    this.close();
    await this.app.workspace.getLeaf(true).openFile(file);
  }
}
