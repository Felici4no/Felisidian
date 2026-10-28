import { App } from "obsidian";

export interface LibraryItem {
  /** "notebook" for notes declaring `type: notebook`, otherwise "item". */
  kind: "item" | "notebook";
  path: string;
  title: string;
  authors: string[];
  year?: number;
  /** Full category path, e.g. ["Computer Science", "Machine learning"]. */
  category: string[];
  pages?: number;
  currentPage?: number;
  /** 0..1, undefined when the page count is unknown. */
  progress?: number;
  notes: number;
  mtime: number;
  /** Palette key or hex from the note's `color` property. */
  color?: string;
}

export interface CategoryNode {
  name: string;
  path: string;
  count: number;
  children: CategoryNode[];
}

const SEP = "/";

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== "" ? n : undefined;
}

/** Reads every note that declares a `category` property. */
export function collectItems(app: App): LibraryItem[] {
  const backlinks = new Map<string, number>();
  const resolved = app.metadataCache.resolvedLinks;
  for (const source of Object.keys(resolved)) {
    for (const target of Object.keys(resolved[source])) {
      backlinks.set(target, (backlinks.get(target) ?? 0) + 1);
    }
  }

  const items: LibraryItem[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    const category = asList(fm?.category)[0];
    if (!fm || !category) continue;

    const pages = asNumber(fm.pages);
    const currentPage = asNumber(fm.current_page);
    const progress =
      pages && pages > 0
        ? Math.min(1, Math.max(0, (currentPage ?? 0) / pages))
        : undefined;

    items.push({
      kind: fm.type === "notebook" ? "notebook" : "item",
      path: file.path,
      title: typeof fm.title === "string" && fm.title ? fm.title : file.basename,
      authors: asList(fm.authors),
      year: asNumber(fm.year),
      category: category.split(SEP).map((s) => s.trim()).filter(Boolean),
      pages,
      currentPage,
      progress,
      notes: backlinks.get(file.path) ?? 0,
      mtime: file.stat.mtime,
      color: typeof fm.color === "string" ? fm.color : undefined,
    });
  }
  return items;
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

/** Every category path in the tree, parents before children. */
export function flattenTree(nodes: CategoryNode[]): string[] {
  return nodes.flatMap((n) => [n.path, ...flattenTree(n.children)]);
}

export function categoryKey(path: string[]): string {
  return path.join(SEP);
}

export function inCategory(item: LibraryItem, key: string | null): boolean {
  if (key === null) return true;
  const own = categoryKey(item.category);
  return own === key || own.startsWith(key + SEP);
}

/**
 * Builds the category tree; a parent's count includes its children.
 * `extra` are category paths created by the user that may have no items yet.
 */
export function buildTree(items: LibraryItem[], extra: string[] = []): CategoryNode[] {
  const roots: CategoryNode[] = [];
  const add = (segments: string[], counts: boolean) => {
    let level = roots;
    segments.forEach((name, i) => {
      const path = categoryKey(segments.slice(0, i + 1));
      let node = level.find((n) => n.path === path);
      if (!node) {
        node = { name, path, count: 0, children: [] };
        level.push(node);
      }
      if (counts) node.count++;
      level = node.children;
    });
  };
  items.forEach((item) => add(item.category, true));
  extra.forEach((p) => add(p.split(SEP).map((s) => s.trim()).filter(Boolean), false));

  const sort = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
