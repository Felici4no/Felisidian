# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Phone layout: sidebar drawer, wrapped toolbar, one-column cards, touch-sized targets, full-width filter menus and writing windows that keep their actions visible. See docs/MOBILE.md for what was and was not validated.
- Selection toolbar works with touch selection, stays on screen and repositions when the page scrolls.
- Reading notes no longer start with an elaboration state (only captures start as pending); the choice is explicit and optional.
- The preview of an idea ignores its list of connections.
- Inside a view the breadcrumb keeps the view (Library / Ideas / Subject).

- Writing windows (idea, reading note, quick capture) redesigned for writing: full-width title, large editor, collapsed origin, linked notes as chips, visible Save and Cancel, keyboard-complete.
- Windows use the library look (cream paper, serif titles, pill buttons) in light and dark themes.
- Cards show the format (Book, Article, Video) instead of repeating "Source".
- A view defines its own type: Ideas, Captures and Reading now show no redundant Type filter or chip.
- Ideas have no elaboration state by default (optional); captures stay pending.
- Larger, higher-contrast secondary text, also in the dark theme.

### Added

- Content types (source, reading note, idea, quick capture) with their own cards.
- Sidebar views and a compact filter bar with removable chips, facet counts and combined filters.
- Reading page for all types; reading notes from selected passages; Develop idea window; navigation that restores filters and scroll.
- Portuguese and English interface, unit tests for filters and note building, demo content.

- Project scaffold: TypeScript, esbuild, CI and release workflows.
- Theming base: accent color, font size and corner radius settings.
- Requirements document and visual reference.
