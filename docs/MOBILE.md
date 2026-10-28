# Mobile

Status of the phone layout, kept honest about what was and was not checked.

## Validated: narrow layout (emulated)

Checked on Windows with Obsidian's own phone emulation (`app.emulateMobile(true)`) and the
window narrowed to 430 px wide. This proves the **layout**, not the touch behavior.

- Sidebar is a drawer ("Views and subjects"); choosing a view or subject closes it.
- Filter buttons, search, sort and Add wrap to the width; chips and "Clear filters" are reachable.
- Cards are one column and readable; filter menus use the full width.
- Quick capture, reading note and idea windows fit the screen; Save and Cancel stay visible.
- A very short visible area (about 290 px, similar to a screen with the keyboard open, simulated
  by shrinking the window height) keeps the title, the start of the argument and the buttons in view.
- Reading page: back button, breadcrumb, status, sections and cards stack correctly.
- The highlight / reading-note toolbar sits next to the selection, stays inside the screen and
  moves above the selection when Obsidian's floating bar would cover it. The selection was made
  by script, then the toolbar was checked.
- Back restores filters and scroll position.
- Plugin settings (language, font, tag colors) fit a narrow screen.

## Not validated

- **Touch gestures on a real device**: long-press selection with the system handles and menu,
  taps with a finger, scrolling while a selection is active.
- **The real virtual keyboard**: how the visible area changes, whether a focused field scrolls
  into view, and the modal height with the keyboard open (only simulated by window height).
- **iOS and Android differences**, safe areas, `dvh` behavior, and performance on a phone.

## Known limits

- Reordering cards by drag is disabled on touch (HTML5 drag and drop does not work by touch).
  The order set on desktop is kept. There is no touch alternative yet.

## How to repeat the layout check

In the developer console of the test vault: `app.emulateMobile(true)`, narrow the window,
open the library; turn it off with `app.emulateMobile(false)`.
