# Felisidian

A visual library for your Obsidian vault. Browse your notes as colored cards, grouped by category, with tags, authors, page counts and reading progress.

> **Status:** early development (0.1.0). The library view is not implemented yet; the current build only ships the theming base (accent color, font size, corner radius).

## Planned features

- Library view with a category tree: a colored circle and item count per category, with subcategories.
- Preview cards showing year, category, title, authors, notes count and a circular reading-progress ring.
- Tags and authors as filterable chips.
- Sorting (recent, title, year, progress) and search.
- Everything driven by note properties (frontmatter), so your data stays in plain Markdown.

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the full requirements and roadmap; the visual reference is kept locally and not redistributed.

## Development

```bash
npm install
npm run dev     # watch mode, writes main.js
npm run build   # type-check + production build
```

To try it in Obsidian, copy or symlink `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/felisidian/`, then enable the plugin under *Settings > Community plugins*.

## Releasing

```bash
npm version patch   # bumps package.json, manifest.json and versions.json
git push --follow-tags
```

The tag (without a `v` prefix) triggers the release workflow, which builds and attaches `main.js`, `manifest.json` and `styles.css` to a GitHub release.

## Privacy

Felisidian runs entirely locally. It makes no network requests and collects no data.

## License

[MIT](LICENSE)
