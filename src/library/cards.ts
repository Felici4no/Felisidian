import { setIcon } from "obsidian";
import { language, t } from "../i18n";
import type { StringKey } from "../i18n";
import { toHex } from "./colors";
import { renderRing } from "./ui";
import { kindLabelKey } from "./types";
import type { ItemKind, LibraryItem } from "./types";

export const KIND_ICONS: Record<ItemKind, string> = {
  source: "book-open",
  "reading-note": "quote",
  idea: "lightbulb",
  capture: "zap",
  notebook: "notebook",
};

const KIND_CLASSES = (Object.keys(KIND_ICONS) as ItemKind[]).map((k) => `fel-card-${k}`);

export interface CardContext {
  /** Hex used for the card's tint: the note's own color or its subject's. */
  color: string;
  /** Title of the linked source, when there is one. */
  sourceTitle?: string;
  compact?: boolean;
}

export function itemTint(item: LibraryItem, subjectColor: string): string {
  return toHex(item.color) ?? subjectColor;
}

export function kindLabel(item: LibraryItem): string {
  return t(kindLabelKey(item) as StringKey);
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(language() === "pt" ? "pt-BR" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

function pill(parent: HTMLElement, text: string, cls = ""): HTMLElement {
  return parent.createSpan({ cls: `fel-pill ${cls}`.trim(), text });
}

function countLabel(n: number, one: "card.note1" | "card.connection1", many: "card.notes" | "card.connections") {
  return n === 1 ? t(one) : t(many, { n });
}

/**
 * Draws a card. All types share one structure (type chip, body, footer) and
 * only show the fields that exist for them: no empty authors, no progress ring
 * on ideas.
 */
export function fillCard(el: HTMLElement, item: LibraryItem, ctx: CardContext): void {
  el.empty();
  el.classList.remove(...KIND_CLASSES);
  el.addClass("fel-card", `fel-card-${item.kind}`);
  el.toggleClass("is-compact", !!ctx.compact);
  el.style.setProperty("--fel-cat", ctx.color);
  el.setAttr("aria-label", item.title);

  const top = el.createDiv({ cls: "fel-card-top" });
  const chip = top.createSpan({ cls: "fel-kind" });
  setIcon(chip.createSpan({ cls: "fel-kind-icon" }), KIND_ICONS[item.kind]);
  chip.createSpan({ text: kindLabel(item) });

  switch (item.kind) {
    case "source":
      drawSource(el, top, item, ctx);
      break;
    case "reading-note":
      drawReadingNote(el, top, item, ctx);
      break;
    case "idea":
      drawIdea(el, top, item);
      break;
    case "capture":
      drawCapture(el, top, item);
      break;
    default:
      el.createDiv({ cls: "fel-card-title", text: item.title });
  }
}

function drawSource(el: HTMLElement, top: HTMLElement, item: LibraryItem, ctx: CardContext) {
  if (item.status) pill(top, t(`status.${item.status}`), `is-${item.status}`);
  if (item.year && !ctx.compact) top.createSpan({ cls: "fel-badge", text: String(item.year) });

  el.createDiv({ cls: "fel-card-title", text: item.title });
  if (item.authors.length) {
    el.createDiv({ cls: "fel-card-authors", text: item.authors.join(", ") });
  }

  const foot = el.createDiv({ cls: "fel-card-foot" });
  if (item.notes > 0) {
    const notes = foot.createSpan({ cls: "fel-notes" });
    setIcon(notes.createSpan({ cls: "fel-notes-icon" }), "message-square");
    notes.createSpan({ text: countLabel(item.notes, "card.note1", "card.notes") });
  }
  if (item.pages) {
    foot.createSpan({ cls: "fel-pages", text: `${item.currentPage ?? 0}/${item.pages} p.` });
    renderRing(foot, item.progress);
  }
}

function drawReadingNote(el: HTMLElement, top: HTMLElement, item: LibraryItem, ctx: CardContext) {
  if (item.location) top.createSpan({ cls: "fel-location", text: item.location });

  el.createDiv({ cls: "fel-card-title", text: item.title });
  if (item.preview) {
    el.createDiv({ cls: "fel-card-preview", text: item.preview });
  }

  const foot = el.createDiv({ cls: "fel-card-foot" });
  if (ctx.sourceTitle) {
    const src = foot.createSpan({ cls: "fel-source-chip" });
    setIcon(src.createSpan({ cls: "fel-notes-icon" }), "book-open");
    src.createSpan({ text: ctx.sourceTitle });
  }
  if (item.elaboration && item.elaboration !== "done") {
    pill(foot, t(`elab.${item.elaboration}`), `fel-foot-end is-${item.elaboration}`);
  }
}

function drawIdea(el: HTMLElement, top: HTMLElement, item: LibraryItem) {
  el.createDiv({ cls: "fel-card-title fel-idea-title", text: item.title });
  if (item.preview) el.createDiv({ cls: "fel-card-preview", text: item.preview });

  const foot = el.createDiv({ cls: "fel-card-foot" });
  if (item.connections > 0) {
    const c = foot.createSpan({ cls: "fel-notes" });
    setIcon(c.createSpan({ cls: "fel-notes-icon" }), "link-2");
    c.createSpan({ text: countLabel(item.connections, "card.connection1", "card.connections") });
  }
  if (item.elaboration && item.elaboration !== "done") {
    pill(foot, t(`elab.${item.elaboration}`), `fel-foot-end is-${item.elaboration}`);
  }
  void top;
}

function drawCapture(el: HTMLElement, top: HTMLElement, item: LibraryItem) {
  top.createSpan({ cls: "fel-date", text: shortDate(item.created) });
  el.createDiv({ cls: "fel-capture-text", text: item.preview || item.title });

  if (item.elaboration !== "done") {
    const foot = el.createDiv({ cls: "fel-card-foot" });
    const hint = foot.createSpan({ cls: "fel-develop-hint" });
    setIcon(hint.createSpan({ cls: "fel-notes-icon" }), "sprout");
    hint.createSpan({ text: t("card.canDevelop") });
  }
}
