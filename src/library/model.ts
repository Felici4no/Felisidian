import { App, TFile } from "obsidian";
import { extractPreview, kindOfType, parseWikiLink } from "./text";
import {
  ELABORATIONS,
  Elaboration,
  FORMATS,
  ItemKind,
  LibraryItem,
  READING_STATUSES,
  ReadingStatus,
  SourceFormat,
} from "./types";

export { buildTree, categoryKey, flattenTree, inCategory } from "./tree";
export type { CategoryNode, LibraryItem } from "./types";

export type PreviewCache = Map<string, { mtime: number; text: string }>;

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== "" ? n : undefined;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

const FORMAT_ALIASES: Record<string, SourceFormat> = {
  livro: "book",
  artigo: "article",
  video: "video",
  vídeo: "video",
  outro: "other",
};

function asFormat(value: unknown): SourceFormat | undefined {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return FORMAT_ALIASES[v] ?? asEnum(v, FORMATS);
}

/**
 * Reading status: the user's `status` property wins; otherwise it is inferred
 * from page progress so notes written before this property still sort sensibly.
 */
export function deriveStatus(value: unknown, progress?: number): ReadingStatus | undefined {
  const explicit = asEnum(value, READING_STATUSES);
  if (explicit) return explicit;
  if (progress === undefined) return undefined;
  if (progress >= 1) return "done";
  return progress > 0 ? "reading" : undefined;
}

function frontmatterLinks(app: App, file: TFile, value: unknown): string[] {
  const out: string[] = [];
  asList(value).forEach((v) => {
    const name = parseWikiLink(v);
    const target = name ? app.metadataCache.getFirstLinkpathDest(name, file.path) : null;
    if (target) out.push(target.path);
  });
  return out;
}

/** Reads every note that is a library item: it has a known `type` or a `category`. */
export function collectItems(app: App, previews: PreviewCache = new Map()): LibraryItem[] {
  const resolved = app.metadataCache.resolvedLinks;
  const incoming = new Map<string, Set<string>>();
  for (const source of Object.keys(resolved)) {
    for (const target of Object.keys(resolved[source])) {
      if (!incoming.has(target)) incoming.set(target, new Set());
      incoming.get(target)?.add(source);
    }
  }

  const items: LibraryItem[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;

    const category = asList(fm.category)[0];
    const kind: ItemKind | null = kindOfType(fm.type) ?? (category ? "source" : null);
    if (!kind) continue;

    const pages = asNumber(fm.pages);
    const currentPage = asNumber(fm.current_page);
    const progress =
      kind === "source" && pages && pages > 0
        ? Math.min(1, Math.max(0, (currentPage ?? 0) / pages))
        : undefined;

    const isNote = kind === "reading-note" || kind === "idea" || kind === "capture";
    const sourcePaths = isNote
      ? [
          ...frontmatterLinks(app, file, fm.source),
          ...frontmatterLinks(app, file, fm.sources),
        ]
      : [];

    const cached = previews.get(file.path);
    const created = Date.parse(String(fm.created ?? ""));

    items.push({
      kind,
      path: file.path,
      title: typeof fm.title === "string" && fm.title ? fm.title : file.basename,
      authors: kind === "source" ? asList(fm.authors) : [],
      year: asNumber(fm.year),
      category: category ? category.split("/").map((s) => s.trim()).filter(Boolean) : [],
      pages: kind === "source" ? pages : undefined,
      currentPage: kind === "source" ? currentPage : undefined,
      progress,
      notes: incoming.get(file.path)?.size ?? 0,
      mtime: file.stat.mtime,
      created: Number.isFinite(created) ? created : file.stat.ctime,
      color: typeof fm.color === "string" ? fm.color : undefined,
      format: kind === "source" ? asFormat(fm.format) : undefined,
      status: kind === "source" ? deriveStatus(fm.status, progress) : undefined,
      // Only captures start as pending: that is their purpose. Reading notes and
      // ideas have no state unless the user sets one; having text or being empty
      // does not turn them into a to-do.
      elaboration: isNote
        ? asEnum<Elaboration>(fm.elaboration, ELABORATIONS) ?? (kind === "capture" ? "pending" : undefined)
        : undefined,
      sourcePath: sourcePaths[0],
      location: typeof fm.location === "string" && fm.location ? fm.location : undefined,
      sourcePaths: [...new Set(sourcePaths)],
      preview: cached && cached.mtime === file.stat.mtime ? cached.text : "",
      links: [],
      backlinks: [],
      connections: 0,
    });
  }

  // Second pass: relations between library notes and inherited subjects.
  const byPath = new Map(items.map((i) => [i.path, i]));
  for (const item of items) {
    const outgoing = Object.keys(resolved[item.path] ?? {});
    item.links = outgoing.filter((p) => p !== item.path && byPath.has(p));
    item.backlinks = [...(incoming.get(item.path) ?? [])].filter(
      (p) => p !== item.path && byPath.has(p)
    );
    item.connections = new Set([...item.links, ...item.backlinks]).size;

    if (item.kind !== "source" && item.kind !== "notebook") {
      const linkedSources = item.links.filter((p) => byPath.get(p)?.kind === "source");
      item.sourcePaths = [...new Set([...item.sourcePaths, ...linkedSources])];
      item.sourcePath = item.sourcePath ?? item.sourcePaths[0];
    }
  }
  // Notes without their own subject take the subject of their source.
  for (const item of items) {
    if (item.category.length === 0 && item.sourcePath) {
      const source = byPath.get(item.sourcePath);
      if (source) item.category = source.category;
    }
  }
  return items;
}

/**
 * Reads the notes that need a preview (reading notes, ideas, captures) and
 * stores the user's own writing. Returns true when anything changed.
 */
export async function hydratePreviews(
  app: App,
  items: LibraryItem[],
  cache: PreviewCache
): Promise<boolean> {
  let changed = false;
  for (const item of items) {
    if (item.kind === "source" || item.kind === "notebook") continue;
    const hit = cache.get(item.path);
    if (hit && hit.mtime === item.mtime) continue;
    const file = app.vault.getFileByPath(item.path);
    if (!file) continue;
    const raw = await app.vault.cachedRead(file);
    cache.set(item.path, {
      mtime: item.mtime,
      text: extractPreview(raw, item.kind === "capture" ? 220 : 200),
    });
    changed = true;
  }
  return changed;
}

/**
 * Category descriptions: notes with `fel_category: <path>` and
 * `description: <text>` describe that category's page.
 */
export function collectCategoryDescriptions(app: App): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm && typeof fm.fel_category === "string" && typeof fm.description === "string") {
      out[fm.fel_category] = fm.description;
    }
  }
  return out;
}
