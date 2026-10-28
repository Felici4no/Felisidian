import { inCategory } from "./tree";
import type {
  Elaboration,
  ItemKind,
  LibraryItem,
  ReadingStatus,
  SourceFormat,
} from "./types";

/**
 * Library filters. Values inside one filter are OR-ed ("book OR article");
 * different filters are AND-ed ("book OR article" AND "reading").
 * A filter that does not apply to an item (e.g. reading status on an idea)
 * excludes it while it is active.
 */
export interface FilterState {
  types: ItemKind[];
  statuses: ReadingStatus[];
  authors: string[];
  formats: SourceFormat[];
  /** Paths of linked sources. */
  sources: string[];
  elaborations: Elaboration[];
  connections: "with" | "without" | null;
  /** Subjects (category paths); an item matches a subject and its children. */
  categories: string[];
  query: string;
}

export type FilterKey = Exclude<keyof FilterState, "query">;

export function emptyFilters(): FilterState {
  return {
    types: [],
    statuses: [],
    authors: [],
    formats: [],
    sources: [],
    elaborations: [],
    connections: null,
    categories: [],
    query: "",
  };
}

export function cloneFilters(f: FilterState): FilterState {
  return {
    ...f,
    types: [...f.types],
    statuses: [...f.statuses],
    authors: [...f.authors],
    formats: [...f.formats],
    sources: [...f.sources],
    elaborations: [...f.elaborations],
    categories: [...f.categories],
  };
}

export function activeCount(f: FilterState): number {
  return (
    f.types.length +
    f.statuses.length +
    f.authors.length +
    f.formats.length +
    f.sources.length +
    f.elaborations.length +
    f.categories.length +
    (f.connections ? 1 : 0)
  );
}

export function hasAnyFilter(f: FilterState): boolean {
  return activeCount(f) > 0 || f.query.trim() !== "";
}

// ---- sidebar views ---------------------------------------------------------

/** Views are presets over the same notes, not folders or copies. */
export type ViewId = "library" | "reading" | "captures" | "ideas" | "recent";
export const VIEW_IDS: ViewId[] = ["library", "reading", "captures", "ideas", "recent"];

export function presetFilters(view: ViewId): FilterState {
  const f = emptyFilters();
  if (view === "reading") {
    f.types = ["source"];
    f.statuses = ["reading"];
  } else if (view === "captures") {
    f.types = ["capture"];
  } else if (view === "ideas") {
    f.types = ["idea"];
  }
  return f;
}

export type SortKey = "manual" | "recent" | "title" | "year" | "progress";
export type Tab = "items" | "notebooks" | "canvases";

export interface LibraryState {
  view: ViewId;
  tab: Tab;
  filters: FilterState;
  sort: SortKey;
  scrollTop: number;
}

export function defaultLibraryState(): LibraryState {
  return {
    view: "library",
    tab: "items",
    filters: emptyFilters(),
    sort: "recent",
    scrollTop: 0,
  };
}

export function cloneState(s: LibraryState): LibraryState {
  return { ...s, filters: cloneFilters(s.filters) };
}

/** Recent shows only the latest notes. */
export const RECENT_LIMIT = 24;

// ---- matching --------------------------------------------------------------

function matchesQuery(item: LibraryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    item.preview.toLowerCase().includes(q) ||
    item.authors.some((a) => a.toLowerCase().includes(q))
  );
}

function matchesKey(item: LibraryItem, key: FilterKey, f: FilterState): boolean {
  switch (key) {
    case "types":
      return f.types.length === 0 || f.types.includes(item.kind);
    case "statuses":
      return f.statuses.length === 0 || (!!item.status && f.statuses.includes(item.status));
    case "authors":
      return f.authors.length === 0 || item.authors.some((a) => f.authors.includes(a));
    case "formats":
      return f.formats.length === 0 || (!!item.format && f.formats.includes(item.format));
    case "sources":
      return f.sources.length === 0 || item.sourcePaths.some((s) => f.sources.includes(s));
    case "elaborations":
      return (
        f.elaborations.length === 0 ||
        (!!item.elaboration && f.elaborations.includes(item.elaboration))
      );
    case "connections":
      if (!f.connections) return true;
      return f.connections === "with" ? item.connections > 0 : item.connections === 0;
    case "categories":
      return f.categories.length === 0 || f.categories.some((c) => inCategory(item, c));
  }
}

const KEYS: FilterKey[] = [
  "types",
  "statuses",
  "authors",
  "formats",
  "sources",
  "elaborations",
  "connections",
  "categories",
];

/** Items on the Items tab: every content kind, never notebooks. */
export function applyFilters(
  items: LibraryItem[],
  f: FilterState,
  ignore: FilterKey[] = []
): LibraryItem[] {
  return items.filter(
    (item) =>
      KEYS.every((k) => ignore.includes(k) || matchesKey(item, k, f)) &&
      matchesQuery(item, f.query)
  );
}

/**
 * How many results each value of `key` would give, given every other active
 * filter. Used to show counts in the filter menus.
 */
export function facetCounts(
  items: LibraryItem[],
  f: FilterState,
  key: FilterKey,
  valuesOf: (item: LibraryItem) => string[]
): Map<string, number> {
  const counts = new Map<string, number>();
  applyFilters(items, f, [key]).forEach((item) => {
    new Set(valuesOf(item)).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  });
  return counts;
}

/** Which filters make sense for the items currently in scope. */
export interface Applicability {
  status: boolean;
  authors: boolean;
  format: boolean;
  source: boolean;
  elaboration: boolean;
  connections: boolean;
  subject: boolean;
}

/**
 * Applicability comes from the items matching only type and subject, so that a
 * filter never disappears just because another filter emptied the results.
 */
export function applicability(items: LibraryItem[], f: FilterState): Applicability {
  const base = applyFilters(items, { ...emptyFilters(), types: f.types, categories: f.categories });
  const notes = base.filter((i) => i.kind !== "source");
  return {
    status: base.some((i) => i.kind === "source"),
    authors: base.some((i) => i.authors.length > 0),
    format: base.some((i) => i.kind === "source" && !!i.format),
    source: notes.some((i) => i.sourcePaths.length > 0),
    elaboration: notes.length > 0,
    connections: base.length > 0,
    subject: items.some((i) => i.category.length > 0),
  };
}

export function sortItems(
  list: LibraryItem[],
  sort: SortKey,
  order: string[] = []
): LibraryItem[] {
  const copy = [...list];
  if (sort === "manual") {
    const rank = (p: string) => {
      const i = order.indexOf(p);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return copy.sort((a, b) => rank(a.path) - rank(b.path) || b.mtime - a.mtime);
  }
  const cmp: Record<Exclude<SortKey, "manual">, (a: LibraryItem, b: LibraryItem) => number> = {
    recent: (a, b) => b.mtime - a.mtime,
    title: (a, b) => a.title.localeCompare(b.title),
    year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    progress: (a, b) => (b.progress ?? -1) - (a.progress ?? -1),
  };
  return copy.sort(cmp[sort]);
}
