import type { WorkspaceLeaf } from "obsidian";
import { t } from "./i18n";
import type { LibraryState } from "./library/filters";
import { defaultLibraryState } from "./library/filters";
import type FelisidianPlugin from "./main";

/** Where a page was, so Back can return to it exactly. */
export type NavTarget =
  | { type: "library"; state: LibraryState }
  | { type: "reader"; path: string; title: string; scroll: number };

/** Implemented by the library and reader views. */
export interface NavPage {
  snapshot(): NavTarget;
}

export const VIEW_TYPE_LIBRARY = "felisidian-library";
export const VIEW_TYPE_READER = "felisidian-reader";

/**
 * Per-tab navigation: library -> source -> reading note -> idea, and back.
 * Each step remembers the filters and scroll position of the page it leaves.
 */
export class Navigator {
  private stacks = new WeakMap<WorkspaceLeaf, NavTarget[]>();

  constructor(private plugin: FelisidianPlugin) {}

  private stack(leaf: WorkspaceLeaf): NavTarget[] {
    let s = this.stacks.get(leaf);
    if (!s) {
      s = [];
      this.stacks.set(leaf, s);
    }
    return s;
  }

  private current(leaf: WorkspaceLeaf): NavTarget | null {
    const view = leaf.view as Partial<NavPage>;
    return typeof view.snapshot === "function" ? view.snapshot() : null;
  }

  /** Opens a note in the reader, in this tab (with Back) or in a new one. */
  async openReader(path: string, target: WorkspaceLeaf | "tab"): Promise<void> {
    if (target === "tab") {
      const leaf = this.plugin.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_READER, state: { path }, active: true });
      return;
    }
    const here = this.current(target);
    if (here) this.stack(target).push(here);
    await target.setViewState({ type: VIEW_TYPE_READER, state: { path }, active: true });
  }

  /** Jumps to a subject in the library, starting a fresh trail. */
  async openSubject(leaf: WorkspaceLeaf, category: string | null): Promise<void> {
    this.stacks.delete(leaf);
    const state = defaultLibraryState();
    if (category) state.filters.categories = [category];
    this.plugin.libraryState = state;
    await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, state: { restore: true }, active: true });
  }

  /** Goes one step back, restoring filters and scroll. */
  async back(leaf: WorkspaceLeaf): Promise<void> {
    const previous = this.stack(leaf).pop();
    if (previous?.type === "reader") {
      await leaf.setViewState({
        type: VIEW_TYPE_READER,
        state: { path: previous.path, scroll: previous.scroll },
        active: true,
      });
      return;
    }
    if (previous?.type === "library") this.plugin.libraryState = previous.state;
    await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, state: { restore: true }, active: true });
  }

  /** Text for the Back button: where it will lead. */
  backLabel(leaf: WorkspaceLeaf): string {
    const stack = this.stack(leaf);
    const previous = stack[stack.length - 1];
    const name = previous?.type === "reader" ? previous.title : t("misc.library");
    return t("reader.back", { name });
  }
}
