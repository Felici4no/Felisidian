import type { CategoryNode, LibraryItem } from "./types";

const SEP = "/";

export function categoryKey(path: string[]): string {
  return path.join(SEP);
}

/** True when the item sits in `key` or in one of its subcategories. */
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
  items.forEach((item) => {
    if (item.category.length) add(item.category, true);
  });
  extra.forEach((p) => add(p.split(SEP).map((s) => s.trim()).filter(Boolean), false));

  const sort = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Every category path in the tree, parents before children. */
export function flattenTree(nodes: CategoryNode[]): string[] {
  return nodes.flatMap((n) => [n.path, ...flattenTree(n.children)]);
}
