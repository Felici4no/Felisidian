/** A list of checkboxes shown in a popover. Multi-select; OR within a section. */
export interface ChecklistOption {
  value: string;
  label: string;
  /** Hex of a small color dot, e.g. a subject's color. */
  color?: string;
  indent?: number;
}

export interface ChecklistSection {
  title?: string;
  options: ChecklistOption[];
  isSelected(value: string): boolean;
  toggle(value: string): void;
  /** Results this value would give right now; shown next to the label. */
  count(value: string): number;
  searchable?: { placeholder: string };
}

let openPopoverEl: HTMLElement | null = null;
let closeCurrent: (() => void) | null = null;

export function closePopover(): void {
  closeCurrent?.();
}

/**
 * Opens a small dialog anchored to a button. Rows are real checkboxes inside
 * labels, so the keyboard works: Tab/Space to toggle, Escape to close and give
 * focus back to the button.
 */
export function openChecklistPopover(
  anchor: HTMLElement,
  label: string,
  sections: ChecklistSection[],
  onChange: () => void
): void {
  closePopover();

  const pop = document.body.createDiv({
    cls: "fel-popover",
    attr: { role: "dialog", "aria-label": label },
  });
  openPopoverEl = pop;

  const updaters: (() => void)[] = [];

  sections.forEach((section) => {
    const block = pop.createDiv({ cls: "fel-pop-section" });
    if (section.title) block.createDiv({ cls: "fel-pop-title", text: section.title });

    let search: HTMLInputElement | null = null;
    if (section.searchable) {
      search = block.createEl("input", {
        cls: "fel-pop-search",
        type: "search",
        placeholder: section.searchable.placeholder,
        attr: { "aria-label": section.searchable.placeholder },
      });
    }

    const list = block.createDiv({ cls: "fel-pop-list" });
    const rows: { opt: ChecklistOption; row: HTMLElement; box: HTMLInputElement; n: HTMLElement }[] = [];

    section.options.forEach((opt) => {
      const row = list.createEl("label", { cls: "fel-pop-row" });
      row.style.paddingLeft = `${8 + (opt.indent ?? 0) * 14}px`;
      const box = row.createEl("input", { type: "checkbox" });
      if (opt.color) {
        const dot = row.createSpan({ cls: "fel-dot" });
        dot.style.backgroundColor = opt.color;
      }
      row.createSpan({ cls: "fel-pop-label", text: opt.label });
      const n = row.createSpan({ cls: "fel-pop-count" });
      box.addEventListener("change", () => {
        section.toggle(opt.value);
        onChange();
        updaters.forEach((u) => u());
      });
      rows.push({ opt, row, box, n });
    });

    const update = () => {
      rows.forEach(({ opt, row, box, n }) => {
        const selected = section.isSelected(opt.value);
        const count = section.count(opt.value);
        box.checked = selected;
        n.setText(String(count));
        row.toggleClass("is-empty", count === 0 && !selected);
      });
    };
    updaters.push(update);
    update();

    search?.addEventListener("input", () => {
      const q = search?.value.trim().toLowerCase() ?? "";
      rows.forEach(({ opt, row }) => row.toggleClass("is-hidden", !!q && !opt.label.toLowerCase().includes(q)));
    });
  });

  // Position under the button, kept inside the window.
  const place = () => {
    const a = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - width - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${a.bottom + 6}px`;
    pop.style.maxHeight = `${Math.max(180, window.innerHeight - a.bottom - 24)}px`;
  };
  place();

  const onDown = (evt: MouseEvent) => {
    const target = evt.target as Node;
    if (!pop.contains(target) && !anchor.contains(target)) close(false);
  };
  const onKey = (evt: KeyboardEvent) => {
    if (evt.key === "Escape") {
      evt.stopPropagation();
      close(true);
    }
  };
  const close = (refocus: boolean) => {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    pop.remove();
    if (openPopoverEl === pop) {
      openPopoverEl = null;
      closeCurrent = null;
    }
    anchor.setAttr("aria-expanded", "false");
    if (refocus) anchor.focus();
  };
  closeCurrent = () => close(false);

  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  anchor.setAttr("aria-expanded", "true");

  const first = pop.querySelector<HTMLElement>("input");
  first?.focus();
}
