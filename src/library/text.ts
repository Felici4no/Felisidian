import type { Elaboration, ItemKind } from "./types";

/** Headings recognised as "the user's own words" in a reading note. */
export const OWN_HEADINGS = ["Com minhas palavras", "In my own words"];

/** Length of the YAML frontmatter block (including its closing fence). */
export function frontmatterLength(data: string): number {
  const m = data.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? m[0].length : 0;
}

/** "[[Note|alias]]" / "[[Note#Heading]]" / "Note" -> "Note". Anything else -> null. */
export function parseWikiLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const m = raw.match(/^\[\[([^\]]+)\]\]$/);
  const inner = (m ? m[1] : raw).split("|")[0].split("#")[0].trim();
  return inner || null;
}

/** Shortens text at a word boundary. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

/**
 * The user's own writing, shortened: quotes, headings, code and markup are
 * dropped so only the text they wrote remains.
 */
/** Sections that only list links; they are not the user's argument. */
const LINK_SECTION = /^#{1,6}\s+(conexões|connections)\s*$/im;

export function extractPreview(body: string, max = 200): string {
  const own = body.slice(frontmatterLength(body));
  const cut = own.search(LINK_SECTION);
  const text = (cut >= 0 ? own.slice(0, cut) : own)
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim();
      return l && !l.startsWith(">") && !l.startsWith("#") && l !== "---";
    })
    .join(" ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~=]/g, "")
    .replace(/^\s*[-+]\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(text, max);
}

export interface BodySegment {
  kind: "quote" | "own";
  text: string;
}

/**
 * Splits a reading note into the quoted passage and the user's own text,
 * keeping source order, so the two can be drawn as visibly different blocks.
 */
export function splitNoteBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  const push = (kind: BodySegment["kind"], line: string) => {
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.text += "\n" + line;
    else segments.push({ kind, text: line });
  };

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (OWN_HEADINGS.some((h) => trimmed.toLowerCase() === `## ${h}`.toLowerCase())) return;
    if (trimmed.startsWith(">")) push("quote", line);
    else if (trimmed || segments.length) push("own", line);
  });

  return segments
    .map((s) => ({ ...s, text: s.text.replace(/^\n+|\n+$/g, "") }))
    .filter((s) => s.text.trim());
}

/** Turns a title into something safe to use as a file name. */
export function safeFileName(name: string, fallback = "Untitled"): string {
  const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim();
  return truncate(clean, 80).replace(/…$/, "") || fallback;
}

const q = (s: string) => JSON.stringify(s);

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface ReadingNoteInput {
  quote: string;
  /** File name (without extension) of the source, if any. */
  source?: string;
  location?: string;
  /** The user's own words. Left empty when the user wrote nothing. */
  own?: string;
  title?: string;
  ownHeading: string;
  /** Optional: only what the user chose. */
  elaboration?: Elaboration;
  date: Date;
}

/** Markdown for a new reading note. Nothing is written on the user's behalf. */
export function buildReadingNote(input: ReadingNoteInput): string {
  const fm = ["---", "type: reading-note"];
  if (input.title) fm.push(`title: ${q(input.title)}`);
  if (input.source) fm.push(`source: ${q(`[[${input.source}]]`)}`);
  if (input.location) fm.push(`location: ${q(input.location)}`);
  if (input.elaboration) fm.push(`elaboration: ${input.elaboration}`);
  fm.push(`created: ${isoDate(input.date)}`, "---", "");

  const out = [...fm];
  const quote = input.quote.trim();
  if (quote) {
    out.push("> [!quote]");
    quote.split(/\r?\n/).forEach((l) => out.push(`> ${l}`));
    if (input.source) {
      out.push(`> — [[${input.source}]]${input.location ? `, ${input.location}` : ""}`);
    }
    out.push("");
  }
  out.push(`## ${input.ownHeading}`, "", (input.own ?? "").trim(), "");
  return out.join("\n");
}

export interface IdeaInput {
  title: string;
  argument?: string;
  /** File name of the note this idea grew from. */
  origin?: string;
  sources: string[];
  related: string[];
  /** Optional: an idea is not unfinished work by default. */
  elaboration?: Elaboration;
  connectionsHeading: string;
  originLabel: string;
  date: Date;
}

export function buildIdeaNote(input: IdeaInput): string {
  const fm = ["---", "type: idea", `title: ${q(input.title)}`];
  if (input.origin) fm.push(`origin: ${q(`[[${input.origin}]]`)}`);
  if (input.sources.length) {
    fm.push("sources:", ...input.sources.map((s) => `  - ${q(`[[${s}]]`)}`));
  }
  if (input.elaboration) fm.push(`elaboration: ${input.elaboration}`);
  fm.push(`created: ${isoDate(input.date)}`, "---", "");

  const out = [...fm, (input.argument ?? "").trim(), ""];
  const links: string[] = [];
  if (input.origin) links.push(`- ${input.originLabel}: [[${input.origin}]]`);
  input.related.forEach((r) => links.push(`- [[${r}]]`));
  if (links.length) out.push(`## ${input.connectionsHeading}`, "", ...links, "");
  return out.join("\n");
}

export interface CaptureInput {
  text: string;
  category?: string;
  date: Date;
}

export function buildCapture(input: CaptureInput): string {
  const fm = ["---", "type: capture", "elaboration: pending"];
  if (input.category) fm.push(`category: ${q(input.category)}`);
  fm.push(`created: ${input.date.toISOString()}`, "---", "");
  return [...fm, input.text.trim(), ""].join("\n");
}

/** A readable file name for a capture, from its first words. */
export function captureFileName(text: string, date: Date): string {
  const stamp = date.toISOString().slice(0, 16).replace("T", " ").replace(":", "");
  const words = safeFileName(text.split(/\s+/).slice(0, 6).join(" "), "Capture");
  return `${stamp} ${words}`;
}

export function kindOfType(value: unknown): ItemKind | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const aliases: Record<string, ItemKind> = {
    source: "source",
    fonte: "source",
    "reading-note": "reading-note",
    "nota-de-leitura": "reading-note",
    idea: "idea",
    ideia: "idea",
    capture: "capture",
    captura: "capture",
    notebook: "notebook",
    caderno: "notebook",
  };
  return aliases[v] ?? null;
}
