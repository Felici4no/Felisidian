# Contributing

## Setup

```bash
npm install
npm run dev
```

## Conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`.
- One logical change per commit.
- Run `npm run build` before opening a pull request; it must pass.
- Follow the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines): no `innerHTML` with dynamic content, clean up everything in `onunload`, scope all CSS under `body.felisidian`.

## Layout

| Path | Purpose |
|---|---|
| `src/main.ts` | Plugin lifecycle and commands |
| `src/settings.ts` | Settings model and settings tab |
| `src/theme.ts` | Applies settings as CSS variables |
| `styles.css` | Plugin styles |
| `docs/` | Requirements |
| `assets/images/` | **All** images (see its README); nothing else may hold images |
