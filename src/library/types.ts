/**
 * Content types. They live in a note's `type` property. A note that has a
 * `category` but no `type` is treated as a source, so older notes keep working.
 */
export type ItemKind = "source" | "reading-note" | "idea" | "capture" | "notebook";

/** Kinds shown on the Items tab (notebooks have their own tab). */
export const CONTENT_KINDS: ItemKind[] = ["source", "reading-note", "idea", "capture"];

/** Where the user is in a source. Separate from how developed their notes are. */
export type ReadingStatus = "want" | "reading" | "paused" | "done";
export const READING_STATUSES: ReadingStatus[] = ["want", "reading", "paused", "done"];

/** How developed a note is. Independent from the reading status of its source. */
export type Elaboration = "pending" | "developing" | "done";
export const ELABORATIONS: Elaboration[] = ["pending", "developing", "done"];

export type SourceFormat = "book" | "article" | "video" | "other";
export const FORMATS: SourceFormat[] = ["book", "article", "video", "other"];

export interface LibraryItem {
  kind: ItemKind;
  path: string;
  title: string;
  authors: string[];
  year?: number;
  /** Full category path, e.g. ["Computer Science", "Machine learning"]. */
  category: string[];
  pages?: number;
  currentPage?: number;
  /** Reading progress 0..1; only for sources with a known page count. */
  progress?: number;
  /** Number of files that link to this note. */
  notes: number;
  mtime: number;
  /** Creation time (the `created` property when present, else file ctime). */
  created: number;
  /** Palette key or hex from the note's `color` property. */
  color?: string;

  // Source only
  format?: SourceFormat;
  status?: ReadingStatus;

  // Notes (reading notes, ideas, captures)
  elaboration?: Elaboration;
  /** Path of the source this note was written from. */
  sourcePath?: string;
  /** Page or location inside the source, as typed by the user. */
  location?: string;
  /** Paths of every source this note is tied to (property or links). */
  sourcePaths: string[];
  /** The user's own writing, shortened. Filled in after reading the file. */
  preview: string;

  /** Other library notes this one links to / that link to it. */
  links: string[];
  backlinks: string[];
  /** Distinct library notes connected in either direction. */
  connections: number;
}

/**
 * Translation key for a card's type label. A source with a known format shows
 * the format ("Book") instead of repeating "Source · Book"; "Source" is kept
 * for sources whose format is unknown.
 */
export function kindLabelKey(item: Pick<LibraryItem, "kind" | "format">): string {
  if (item.kind === "source" && item.format) return `format.${item.format}`;
  return `kind.${item.kind}`;
}

export interface CategoryNode {
  name: string;
  path: string;
  count: number;
  children: CategoryNode[];
}
