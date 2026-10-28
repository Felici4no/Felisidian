# Properties

Felisidian reads plain Markdown notes and their properties (frontmatter). Everything is
stored in your notes; relations are native Obsidian links. No migration is needed: a note
that has a `category` and no `type` is treated as a **source**, as before.

## Content types (`type`)

| `type` | What it is | Key properties |
|---|---|---|
| `source` | Something you read or watch: book, article, video… | `title`, `authors`, `year`, `format`, `status`, `pages`, `current_page`, `category` |
| `reading-note` | A passage plus your own words | `source` (link), `location`, `elaboration` |
| `idea` | An idea in its own note, a statement | `origin` (link), `sources` (links), `elaboration`, `category` |
| `capture` | A short thought to develop later | `elaboration`, `category`, `created` |
| `notebook` | Free-form notes shown on the Notebooks tab | `title`, `category` |

Portuguese aliases are accepted: `fonte`, `nota-de-leitura`, `ideia`, `captura`, `caderno`.

## Two separate states

- **Reading status** (`status`) is about the *source*: `want`, `reading`, `paused`, `done`.
  When absent it is inferred from `pages` and `current_page` so older notes keep working.
- **Elaboration** (`elaboration`) is about *your notes*: `pending`, `developing`, `done`.
  A finished book can still have notes in development. Only **captures** start as
  `pending` (that is their purpose). **Reading notes and ideas have no state unless you
  set one**: having text, or being empty, does not turn a note into a to-do.

## Source formats (`format`)

`book`, `article`, `video`, `other` (Portuguese `livro`, `artigo`, `vídeo`, `outro` also work).

## Links

- A reading note points to its source with `source: "[[Source title]]"`; the passage also
  links the source in the note body.
- An idea may list several sources in `sources`, point to the note it grew from with
  `origin`, and link anything else in its body. An idea belongs to no single book.
- Library notes without a `category` inherit the subject of their source.

## Colors

A note uses its own `color` (a palette name such as `pink`, or a hex) if it has one,
otherwise the color of its subject. Subject colors are edited in the plugin settings.

## Subjects

`category: Learning` or `category: Learning/Memory` for a hierarchy.
A note with `fel_category: <subject>` and a `description` provides the text under that
subject's title.

## Demo content

Notes in `dev-vault/` marked `demo: true` are illustrative. They do not quote or
paraphrase any book.
