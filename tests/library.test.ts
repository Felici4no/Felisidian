import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  applicability,
  applyFilters,
  emptyFilters,
  facetCounts,
  hasAnyFilter,
  presetFilters,
  sortItems,
} from "../src/library/filters";
import {
  buildCapture,
  buildIdeaNote,
  buildReadingNote,
  captureFileName,
  extractPreview,
  kindOfType,
  parseWikiLink,
  safeFileName,
  splitNoteBody,
} from "../src/library/text";
import { buildTree, flattenTree, inCategory } from "../src/library/tree";
import type { LibraryItem } from "../src/library/types";

function item(over: Partial<LibraryItem>): LibraryItem {
  return {
    kind: "source",
    path: "x.md",
    title: "X",
    authors: [],
    category: [],
    notes: 0,
    mtime: 0,
    created: 0,
    sourcePaths: [],
    preview: "",
    links: [],
    backlinks: [],
    connections: 0,
    ...over,
  };
}

const book = item({
  path: "ahrens.md",
  title: "Como escrever boas notas",
  kind: "source",
  authors: ["Sönke Ahrens"],
  format: "book",
  status: "reading",
  category: ["Aprendizagem"],
});
const article = item({
  path: "art.md",
  title: "Um artigo",
  kind: "source",
  authors: ["Ana"],
  format: "article",
  status: "done",
  category: ["Aprendizagem", "Memória"],
});
const video = item({ path: "vid.md", title: "Uma aula", format: "video", status: "want" });
const note = item({
  path: "n.md",
  title: "Nota",
  kind: "reading-note",
  sourcePath: "ahrens.md",
  sourcePaths: ["ahrens.md"],
  elaboration: "pending",
  category: ["Aprendizagem"],
  preview: "Escrevo com minhas palavras",
  connections: 1,
});
const idea = item({
  path: "i.md",
  title: "Escrever revela lacunas",
  kind: "idea",
  sourcePaths: ["ahrens.md"],
  elaboration: "developing",
  connections: 2,
});
const capture = item({ path: "c.md", title: "c", kind: "capture", elaboration: "pending" });
const all = [book, article, video, note, idea, capture];
const paths = (l: LibraryItem[]) => l.map((i) => i.path).sort();

test("no filters returns everything", () => {
  assert.equal(applyFilters(all, emptyFilters()).length, all.length);
});

test("OR inside one filter", () => {
  const f = { ...emptyFilters(), formats: ["book", "article"] as LibraryItem["format"][] };
  assert.deepEqual(paths(applyFilters(all, f as never)), ["ahrens.md", "art.md"]);
});

test("AND across filters: books + reading + subject", () => {
  const f = {
    ...emptyFilters(),
    types: ["source" as const],
    formats: ["book" as const],
    statuses: ["reading" as const],
    categories: ["Aprendizagem"],
  };
  assert.deepEqual(paths(applyFilters(all, f)), ["ahrens.md"]);
});

test("subject matches its children", () => {
  const f = { ...emptyFilters(), categories: ["Aprendizagem"] };
  assert.ok(applyFilters(all, f).some((i) => i.path === "art.md"));
  assert.ok(inCategory(article, "Aprendizagem"));
  assert.ok(!inCategory(book, "Aprendizagem/Memória"));
});

test("a filter that does not apply excludes the item", () => {
  const f = { ...emptyFilters(), statuses: ["reading" as const] };
  assert.deepEqual(paths(applyFilters(all, f)), ["ahrens.md"]);
});

test("items without optional fields are handled", () => {
  const f = { ...emptyFilters(), authors: ["Ana"] };
  assert.deepEqual(paths(applyFilters(all, f)), ["art.md"]);
  const g = { ...emptyFilters(), formats: ["book" as const] };
  assert.ok(!applyFilters([capture, idea], g).length);
});

test("linked source and elaboration filters", () => {
  const f = { ...emptyFilters(), sources: ["ahrens.md"], elaborations: ["developing" as const] };
  assert.deepEqual(paths(applyFilters(all, f)), ["i.md"]);
});

test("connections filter", () => {
  assert.deepEqual(
    paths(applyFilters(all, { ...emptyFilters(), connections: "with" })),
    ["i.md", "n.md"]
  );
  assert.ok(
    applyFilters(all, { ...emptyFilters(), connections: "without" }).every(
      (i) => i.connections === 0
    )
  );
});

test("search looks at title, authors and the user's own text", () => {
  assert.deepEqual(paths(applyFilters(all, { ...emptyFilters(), query: "sönke" })), ["ahrens.md"]);
  assert.deepEqual(paths(applyFilters(all, { ...emptyFilters(), query: "minhas palavras" })), ["n.md"]);
});

test("hasAnyFilter tells empty library apart from no results", () => {
  assert.equal(hasAnyFilter(emptyFilters()), false);
  assert.equal(hasAnyFilter({ ...emptyFilters(), query: "zzz" }), true);
  assert.equal(applyFilters([], emptyFilters()).length, 0);
});

test("view presets are filters over the same notes", () => {
  assert.deepEqual(paths(applyFilters(all, presetFilters("reading"))), ["ahrens.md"]);
  assert.deepEqual(paths(applyFilters(all, presetFilters("ideas"))), ["i.md"]);
  assert.deepEqual(paths(applyFilters(all, presetFilters("captures"))), ["c.md"]);
  assert.equal(applyFilters(all, presetFilters("library")).length, all.length);
});

test("facet counts ignore the filter being counted", () => {
  const f = { ...emptyFilters(), types: ["source" as const], statuses: ["reading" as const] };
  const counts = facetCounts(all, f, "statuses", (i) => (i.status ? [i.status] : []));
  assert.equal(counts.get("reading"), 1);
  assert.equal(counts.get("done"), 1);
  assert.equal(counts.get("want"), 1);
});

test("applicability only offers filters that make sense", () => {
  const onlyIdeas = applicability(all, { ...emptyFilters(), types: ["idea"] });
  assert.equal(onlyIdeas.status, false);
  assert.equal(onlyIdeas.format, false);
  assert.equal(onlyIdeas.elaboration, true);
  const onlySources = applicability(all, { ...emptyFilters(), types: ["source"] });
  assert.equal(onlySources.status, true);
  assert.equal(onlySources.elaboration, false);
  assert.equal(onlySources.format, true);
});

test("sorting: manual order puts unknown items last", () => {
  const sorted = sortItems([note, book, idea], "manual", ["i.md", "ahrens.md"]);
  assert.deepEqual(sorted.map((i) => i.path), ["i.md", "ahrens.md", "n.md"]);
});

test("tree counts include children and extra tags", () => {
  const tree = buildTree([book, article], ["Design"]);
  const names = flattenTree(tree);
  assert.deepEqual(names, ["Aprendizagem", "Aprendizagem/Memória", "Design"]);
  assert.equal(tree.find((n) => n.path === "Aprendizagem")?.count, 2);
  assert.equal(tree.find((n) => n.path === "Design")?.count, 0);
});

test("parseWikiLink", () => {
  assert.equal(parseWikiLink("[[Como escrever|livro]]"), "Como escrever");
  assert.equal(parseWikiLink("[[Nota#Seção]]"), "Nota");
  assert.equal(parseWikiLink("Nota simples"), "Nota simples");
  assert.equal(parseWikiLink(""), null);
  assert.equal(parseWikiLink(42), null);
});

test("kindOfType accepts aliases and rejects unknown types", () => {
  assert.equal(kindOfType("idea"), "idea");
  assert.equal(kindOfType("Ideia"), "idea");
  assert.equal(kindOfType("nota-de-leitura"), "reading-note");
  assert.equal(kindOfType("whatever"), null);
  assert.equal(kindOfType(undefined), null);
});

test("extractPreview keeps only the user's own words", () => {
  const body = [
    "---",
    "type: reading-note",
    "---",
    "",
    "> [!quote]",
    "> uma citação que não é minha",
    "",
    "## Com minhas palavras",
    "",
    "Penso que **escrever** obriga a [[Nota|decidir]] o que entendi.",
  ].join("\n");
  assert.equal(extractPreview(body), "Penso que escrever obriga a decidir o que entendi.");
  assert.equal(extractPreview("> só citação"), "");
});

test("splitNoteBody separates the quote from the user's text, in order", () => {
  const body = "> [!quote]\n> trecho\n\n## Com minhas palavras\n\nminha parte";
  const parts = splitNoteBody(body);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].kind, "quote");
  assert.equal(parts[1].kind, "own");
  assert.equal(parts[1].text, "minha parte");
  assert.deepEqual(splitNoteBody("só texto").map((p) => p.kind), ["own"]);
});

test("reading note keeps the source link and location, and writes nothing for the user", () => {
  const md = buildReadingNote({
    quote: "linha 1\nlinha 2",
    source: "Fonte de teste",
    location: "cap. 2",
    own: "",
    ownHeading: "Com minhas palavras",
    elaboration: "pending",
    date: new Date("2026-10-28T10:00:00Z"),
  });
  assert.match(md, /type: reading-note/);
  assert.match(md, /source: "\[\[Fonte de teste\]\]"/);
  assert.match(md, /location: "cap\. 2"/);
  assert.match(md, /> linha 2/);
  assert.match(md, /## Com minhas palavras\n\n\n$/);
  const parts = splitNoteBody(md.slice(md.indexOf("> [!quote]")));
  assert.equal(parts[0].kind, "quote");
});

test("reading note without source or location has no empty fields", () => {
  const md = buildReadingNote({
    quote: "t",
    ownHeading: "In my own words",
    elaboration: "pending",
    date: new Date(),
  });
  assert.doesNotMatch(md, /source:/);
  assert.doesNotMatch(md, /location:/);
});

test("idea links its origin and related notes", () => {
  const md = buildIdeaNote({
    title: "Uma ideia",
    argument: "meu argumento",
    origin: "Nota de leitura",
    sources: ["Fonte"],
    related: ["Outra ideia"],
    elaboration: "developing",
    connectionsHeading: "Conexões",
    originLabel: "Origem",
    date: new Date("2026-10-28T10:00:00Z"),
  });
  assert.match(md, /type: idea/);
  assert.match(md, /origin: "\[\[Nota de leitura\]\]"/);
  assert.match(md, /- "\[\[Fonte\]\]"/);
  assert.match(md, /- \[\[Outra ideia\]\]/);
  assert.match(md, /meu argumento/);
});

test("capture is short, dated and marked as undeveloped", () => {
  const md = buildCapture({ text: "  pensar nisso depois ", date: new Date("2026-10-28T10:00:00Z") });
  assert.match(md, /type: capture/);
  assert.match(md, /elaboration: pending/);
  assert.match(md, /created: 2026-10-28T10:00:00.000Z/);
  assert.match(md, /pensar nisso depois\n$/);
  assert.match(captureFileName("pensar nisso depois com calma ok", new Date("2026-10-28T10:00:00Z")), /^2026-10-28 1000 /);
});

test("safeFileName removes characters Obsidian forbids", () => {
  assert.equal(safeFileName('a/b:c*d?"e'), "a-b-c-d--e");
  assert.equal(safeFileName("   "), "Untitled");
});
