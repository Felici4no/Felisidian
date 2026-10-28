import { moment } from "obsidian";

export type Language = "en" | "pt";
export type LanguagePreference = "auto" | Language;

/** [English, Portuguese] */
const S = {
  // content types
  "kind.source": ["Source", "Fonte"],
  "kind.reading-note": ["Reading note", "Nota de leitura"],
  "kind.idea": ["Idea", "Ideia"],
  "kind.capture": ["Quick capture", "Captura rápida"],
  "kind.notebook": ["Notebook", "Caderno"],
  // formats
  "format.book": ["Book", "Livro"],
  "format.article": ["Article", "Artigo"],
  "format.video": ["Video", "Vídeo"],
  "format.other": ["Other", "Outro"],
  // reading status (about the source) and elaboration (about the notes)
  "status.want": ["Want to read", "Quero ler"],
  "status.reading": ["Reading", "Lendo"],
  "status.paused": ["Paused", "Pausado"],
  "status.done": ["Done", "Concluído"],
  "elab.pending": ["Pending", "Pendente"],
  "elab.developing": ["Developing", "Em desenvolvimento"],
  "elab.done": ["Developed", "Desenvolvida"],
  // sidebar views
  "view.library": ["Library", "Biblioteca"],
  "view.reading": ["Reading now", "Lendo agora"],
  "view.captures": ["Captures", "Capturas"],
  "view.ideas": ["Ideas", "Ideias"],
  "view.recent": ["Recent", "Recentes"],
  "side.subjects": ["Subjects", "Assuntos"],
  "side.newTag": ["New tag +", "Nova tag +"],
  "side.views": ["Views", "Visões"],
  "side.menu": ["Views and subjects", "Visões e assuntos"],
  // library
  "lib.root": ["My library", "Minha biblioteca"],
  "tab.items": ["Items", "Itens"],
  "tab.notebooks": ["Notebooks", "Cadernos"],
  "tab.canvases": ["Canvases", "Canvases"],
  "lib.add": ["Add", "Adicionar"],
  "lib.search": ["Search title, author or text", "Buscar título, autor ou texto"],
  "lib.results": ["{n} results", "{n} resultados"],
  "lib.result1": ["1 result", "1 resultado"],
  "lib.emptyLibrary": [
    "Your library is empty. Add a source or a quick capture to begin.",
    "Sua biblioteca está vazia. Adicione uma fonte ou uma captura para começar.",
  ],
  "lib.noResults": ["No results for these filters.", "Nenhum resultado para esses filtros."],
  "lib.emptyView": ["Nothing here yet.", "Nada por aqui ainda."],
  "lib.noCanvases": ["No canvases here yet.", "Nenhum canvas aqui ainda."],
  // sort
  "sort.manual": ["Manual order", "Ordem manual"],
  "sort.recent": ["Recently modified", "Modificados recentemente"],
  "sort.title": ["Title", "Título"],
  "sort.year": ["Year", "Ano"],
  "sort.progress": ["Progress", "Progresso"],
  // filters
  "f.type": ["Type", "Tipo"],
  "f.status": ["Reading status", "Estado da leitura"],
  "f.authors": ["Authors", "Autores"],
  "f.more": ["More filters", "Mais filtros"],
  "f.subject": ["Subject", "Assunto"],
  "f.format": ["Format", "Formato"],
  "f.source": ["Linked source", "Fonte vinculada"],
  "f.elab": ["Elaboration", "Elaboração"],
  "f.conn": ["Connections", "Conexões"],
  "f.connWith": ["With connections", "Com conexões"],
  "f.connWithout": ["Without connections", "Sem conexões"],
  "f.clear": ["Clear filters", "Limpar filtros"],
  "f.remove": ["Remove filter", "Remover filtro"],
  "f.searchAuthors": ["Find an author", "Buscar autor"],
  "f.active": ["Active filters", "Filtros ativos"],
  // cards
  "card.canDevelop": ["Can be developed", "Pode ser desenvolvida"],
  "card.connections": ["{n} connections", "{n} conexões"],
  "card.connection1": ["1 connection", "1 conexão"],
  "card.notes": ["{n} notes", "{n} notas"],
  "card.note1": ["1 note", "1 nota"],
  // reader
  "reader.back": ["Back to {name}", "Voltar para {name}"],
  "reader.hint": [
    "Reading mode: this page is read-only. Select text to highlight it or turn it into a reading note.",
    "Modo de leitura: esta página é somente leitura. Selecione um trecho para destacar ou criar uma nota de leitura.",
  ],
  "reader.edit": ["Edit note", "Editar nota"],
  "reader.highlight": ["Highlight", "Destacar"],
  "reader.removeHighlight": ["Remove highlight", "Remover destaque"],
  "reader.createReadingNote": ["Create reading note", "Criar nota de leitura"],
  "reader.developIdea": ["Develop idea", "Desenvolver ideia"],
  "reader.page": ["Page", "Página"],
  "reader.of": ["of {n}", "de {n}"],
  "reader.readingNotes": ["Reading notes", "Notas de leitura"],
  "reader.relatedIdeas": ["Related ideas", "Ideias relacionadas"],
  "reader.connections": ["Connected notes", "Notas conectadas"],
  "reader.newReadingNote": ["New reading note", "Nova nota de leitura"],
  "reader.noReadingNotes": [
    "No reading notes yet. Select a passage while reading, or add one here.",
    "Nenhuma nota de leitura ainda. Selecione um trecho ao ler ou adicione uma aqui.",
  ],
  "reader.noIdeas": ["No related ideas yet.", "Nenhuma ideia relacionada ainda."],
  "reader.quote": ["Passage", "Trecho"],
  "reader.own": ["In my own words", "Com minhas palavras"],
  "reader.ownEmpty": [
    "Nothing written yet. Use Edit note to write your understanding.",
    "Nada escrito ainda. Use Editar nota para escrever seu entendimento.",
  ],
  "reader.source": ["Source", "Fonte"],
  "reader.location": ["Location", "Localização"],
  "reader.notFound": ["This note could not be found.", "Não encontrei esta nota."],
  "reader.selectMultiParagraph": [
    "Select text within a single paragraph to highlight it.",
    "Selecione texto dentro de um único parágrafo para destacar.",
  ],
  "reader.cannotLocate": [
    "Could not locate that text in the note. Try selecting plain text.",
    "Não consegui localizar esse trecho na nota. Tente selecionar texto simples.",
  ],
  // modals
  "modal.newTag": ["New tag", "Nova tag"],
  "modal.name": ["Name", "Nome"],
  "modal.parentTag": ["Parent tag", "Tag pai"],
  "modal.parentTagDesc": ["Leave empty to create a top-level tag.", "Deixe vazio para criar uma tag principal."],
  "modal.none": ["None", "Nenhuma"],
  "modal.color": ["Color", "Cor"],
  "modal.createTag": ["Create tag", "Criar tag"],
  "modal.tagName": ["Tag name", "Nome da tag"],
  "modal.tagPreview": ["Preview of a note in this tag", "Prévia de uma nota nesta tag"],
  "modal.giveName": ["Give the tag a name.", "Dê um nome à tag."],
  "modal.newSource": ["New source", "Nova fonte"],
  "modal.newNotebook": ["New notebook", "Novo caderno"],
  "modal.title": ["Title", "Título"],
  "modal.authors": ["Authors", "Autores"],
  "modal.authorsDesc": ["Separate with commas.", "Separe com vírgulas."],
  "modal.year": ["Year", "Ano"],
  "modal.pages": ["Pages", "Páginas"],
  "modal.format": ["Format", "Formato"],
  "modal.status": ["Reading status", "Estado da leitura"],
  "modal.tag": ["Tag", "Tag"],
  "modal.colorDesc": [
    "Defaults to the tag's color. Tag colors are changed in the plugin settings.",
    "Segue a cor da tag. As cores das tags são alteradas nas configurações do plugin.",
  ],
  "modal.create": ["Create", "Criar"],
  "modal.cancel": ["Cancel", "Cancelar"],
  "modal.readingNote": ["New reading note", "Nova nota de leitura"],
  "modal.passage": ["Passage", "Trecho"],
  "modal.passageDesc": [
    "Copied from the text you selected. It is kept apart from your own words.",
    "Copiado do texto selecionado. Fica separado das suas próprias palavras.",
  ],
  "modal.location": ["Page or location", "Página ou localização"],
  "modal.locationPh": ["e.g. p. 42, ch. 3, 12:30", "ex.: p. 42, cap. 3, 12:30"],
  "modal.source": ["Source", "Fonte"],
  "modal.noSource": ["No source", "Sem fonte"],
  "modal.ownWords": ["In my own words", "Com minhas palavras"],
  "modal.ownWordsPh": [
    "Write your understanding. Nothing is written for you.",
    "Escreva seu entendimento. Nada é escrito por você.",
  ],
  "modal.noteTitleOpt": ["Title (optional)", "Título (opcional)"],
  "modal.newIdea": ["Develop idea", "Desenvolver ideia"],
  "modal.newIdeaStandalone": ["New idea", "Nova ideia"],
  "modal.ideaTitle": ["Idea", "Ideia"],
  "modal.ideaTitleDesc": [
    "Write it as a statement of the idea.",
    "Escreva como uma afirmação da ideia.",
  ],
  "modal.argument": ["Argument", "Argumento"],
  "modal.argumentPh": ["Explain the idea in your own words: what it claims and why you believe it.", "Explique a ideia com suas próprias palavras: o que ela afirma e por que você acredita nisso."],
  "modal.origin": ["Grew from", "Nasceu de"],
  "modal.linkNotes": ["Link other notes", "Vincular outras notas"],
  "modal.linkNotesPh": ["Search notes to link…", "Buscar notas para vincular…"],
  "modal.remove": ["Remove", "Remover"],
  "modal.newCapture": ["Quick capture", "Captura rápida"],
  "modal.captureText": ["What came to mind?", "O que veio à cabeça?"],
  "modal.capturePh": ["A short thought. You can develop it later.", "Um pensamento breve. Você pode desenvolvê-lo depois."],
  "modal.save": ["Save", "Salvar"],
  "modal.writeSomething": ["Write something first.", "Escreva algo primeiro."],
  "modal.giveIdea": ["Give the idea a title.", "Dê um título à ideia."],
  "modal.subject": ["Subject", "Assunto"],
  // writing windows
  "modal.ideaQuestion": ["Which idea do you want to record?", "Qual ideia você quer registrar?"],
  "modal.ideaTitlePh": ["Write the idea as a sentence", "Escreva a ideia como uma frase"],
  "modal.createIdea": ["Create idea", "Criar ideia"],
  "modal.createReadingNote": ["Create reading note", "Criar nota de leitura"],
  "modal.saveCapture": ["Save capture", "Salvar captura"],
  "modal.elabOptional": ["Elaboration (optional)", "Elaboração (opcional)"],
  "modal.notSet": ["Not set", "Não definida"],
  "modal.linkedNotes": ["Linked notes", "Notas vinculadas"],
  "modal.linkHint": ["Type to search. Enter adds the first result.", "Digite para buscar. Enter adiciona o primeiro resultado."],
  "modal.shortcut": ["Ctrl+Enter to save", "Ctrl+Enter para salvar"],
  // add menu
  "add.source": ["New source", "Nova fonte"],
  "add.capture": ["Quick capture", "Captura rápida"],
  "add.idea": ["New idea", "Nova ideia"],
  "add.readingNote": ["New reading note", "Nova nota de leitura"],
  "add.notebook": ["New notebook", "Novo caderno"],
  // misc
  "misc.uncategorized": ["Uncategorized", "Sem assunto"],
  "misc.backToLibrary": ["Back to library", "Voltar para a biblioteca"],
  "misc.library": ["library", "biblioteca"],
  "misc.demo": ["Demo", "Demonstração"],
} as const;

export type StringKey = keyof typeof S;

let current: Language = "en";

export function resolveLanguage(pref: LanguagePreference): Language {
  if (pref !== "auto") return pref;
  return moment.locale().toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function setLanguage(pref: LanguagePreference): void {
  current = resolveLanguage(pref);
}

export function language(): Language {
  return current;
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const pair = S[key];
  let text: string = current === "pt" ? pair[1] : pair[0];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  }
  return text;
}
