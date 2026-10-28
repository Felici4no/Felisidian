# Requisitos — Biblioteca visual para Obsidian

Referência visual: `assets/images/reference/library-reference.webp`

Visão: **uma biblioteca** dentro do Obsidian, com **tags/categorias vistas de forma diferente**, **cards de pré-visualização**, **páginas**, **círculos de cor por categoria** e metadados (nº de páginas etc.).

---

## 1. O que existe na imagem

### 1.1 Estrutura geral
- Janela com **breadcrumb** no topo: `My Library / ● Computer Science` (a bolinha colorida acompanha a categoria).
- **Sidebar esquerda** + **área principal** com cabeçalho, abas, filtros e grade de cards.
- Fundo/estética: tons quentes de papel (bege/creme), tipografia serifada nos títulos, sans nos metadados, cantos bem arredondados.

### 1.2 Sidebar
- Atalhos: **Recent**, **Reading list** (com contador, ex. 24), **Discover**.
- Seção **My library** com **categorias em árvore** (2 níveis ou mais):
  - cada categoria tem **círculo colorido** próprio;
  - **contador** de itens à direita (18, 22, 58, 39…);
  - **subcategorias** indentadas (ex.: Computer Science → Knowledge graphs, Machine learning, Cyber security; AI → Agents, Vision, LLMs, Transformers);
  - categoria ativa com destaque (texto mais forte / fundo);
  - scroll independente na lista.
- Rodapé: **New category +** e **Settings**.

### 1.3 Cabeçalho da coleção
- **Título grande** (serifado) + botão de **editar** (ícone de lápis em círculo).
- **Descrição** em texto corrido da categoria.

### 1.4 Abas
- **Items**, **Notebooks**, **Canvases** (aba ativa "levanta" visualmente, com ícone em cada).

### 1.5 Filtro por autores
- Seção **Authors** com **chips/pílulas** (nome + contagem: "Frank Arute 2").
- Quebra em múltiplas linhas; clicar em chip filtra.

### 1.6 Barra de itens
- **Items (58)** — total filtrado.
- Botão **+ Add**.
- Ordenação: **Recently accessed** (dropdown/ícone de ordenar).

### 1.7 Card de item (grade responsiva, 3–4 colunas)
- **Cor de fundo do card** = cor da categoria/status (verde, lilás, amarelo, rosa, marrom…), pastel.
- Topo: **badge do ano** (2023, 2007…) + **nome da categoria**.
- **Título** em serifada, até ~4 linhas.
- **Autores** (texto menor, truncado em ~3 linhas).
- Rodapé: ícone de **anotações/notas + contagem** (1, 4, 3, 0) e **indicador circular de progresso** (anel parcial/completo = progresso de leitura).
- Hover/seleção, clique abre o item.

---

## 2. Mapeamento para o Obsidian (o que vira o quê)

| Na imagem | No Obsidian |
|---|---|
| Item / paper | Nota `.md` com frontmatter (Properties) |
| Categoria + cor | Propriedade `category` (ou tag) + cor configurada no plugin |
| Subcategoria | Tag hierárquica (`#cs/ml`) ou `category: [CS, ML]` |
| Autores | Propriedade `authors` (lista) |
| Ano | Propriedade `year` |
| Nº de páginas | Propriedade `pages` |
| Progresso de leitura | Propriedade `current_page` (ou `progress` 0–100) |
| Contador de notas | Contagem de backlinks / notas filhas / anotações |
| Notebooks | Pasta/notas ligadas ao item |
| Canvases | Arquivos `.canvas` ligados ao item |
| Reading list | Filtro `status: reading` |
| Recent | Ordenar por `mtime` / último aberto |

---

## 3. Requisitos funcionais

### MVP (v0.1–0.3)
1. **View customizada** (`ItemView`) "Library" aberta por ribbon icon + comando.
2. **Sidebar de categorias** em árvore, com cor, contador e subcategorias; criar/renomear/excluir categoria.
3. **Grade de cards** lendo notas do vault via `metadataCache` (sem varrer arquivos manualmente).
4. **Card** com: ano, categoria, título, autores, nº de notas, anel de progresso.
5. **Cor por categoria** (color picker nas settings; paleta pastel padrão que respeita claro/escuro).
6. **Propriedades configuráveis**: o usuário mapeia quais campos do frontmatter são título/autores/ano/páginas/progresso/categoria.
7. **Filtro por autor** (chips com contagem) e por tag.
8. **Ordenação**: recentes, título, ano, progresso.
9. **Busca** na biblioteca.
10. **Clique no card** abre a nota; ctrl/cmd+clique abre em nova aba.
11. **Atualização em tempo real** ao criar/editar/renomear/excluir notas (eventos do vault/metadataCache).
12. **Settings tab** (pasta-raiz da biblioteca, mapeamento de campos, cores, densidade).

### Depois (v0.4+)
13. Botão **+ Add** → modal que cria nota com template/frontmatter.
14. **Abas Items / Notebooks / Canvases**.
15. **Reading list** e **Recent** como visões salvas.
16. **Progresso editável** (clicar no anel / "li até a página X").
17. Descrição editável da coleção (arquivo de nota da categoria).
18. Importação (BibTeX / DOI / PDF) — opcional.
19. Capas/preview de PDF (primeira página como thumbnail).
20. Drag & drop para mudar categoria.
21. Visão alternativa: lista, estantes (livraria).
22. API/código para outros plugins e suporte a **Bases** (core do Obsidian) como fonte de dados.

---

## 4. Requisitos técnicos

- TypeScript + esbuild (já configurado).
- **Sem framework obrigatório**; se quiser reatividade, Svelte ou React são comuns (cuidado com tamanho do bundle).
- Usar `registerEvent`, `registerDomEvent`, `registerInterval` para limpeza automática.
- Estado salvo com `loadData/saveData`; **nunca** assumir `data.json` existente.
- Performance: virtualizar/paginar a grade com 1000+ notas; debounce nos eventos de metadata.
- Estilos 100% por **variáveis CSS do Obsidian** (`--background-primary`, `--text-normal`…) para funcionar com qualquer tema, claro e escuro.
- **Mobile**: layout responsivo (1–2 colunas), alvos de toque ≥ 44px. Se não suportar, `isDesktopOnly: true`.
- Acessibilidade: foco visível, navegação por teclado, `aria-label` nos botões de ícone, contraste nas cores pastel.
- i18n: textos em inglês por padrão (exigido pelo diretório); PT-BR como tradução opcional.

---

## 5. Requisitos para publicar no marketplace (Community Plugins)

### 5.1 Repositório GitHub (público)
- [ ] `README.md` claro: o que faz, screenshots/GIFs, instalação, uso, settings, limitações.
- [ ] `LICENSE` (MIT é o comum).
- [ ] `manifest.json` válido na raiz.
- [ ] `versions.json` na raiz (mapeia versão do plugin → `minAppVersion`).
- [ ] `.gitignore` sem `main.js`/`node_modules` versionados (já ok).
- [ ] Opcional: `CHANGELOG.md`, `FUNDING.yml`/`fundingUrl`.

### 5.2 `manifest.json`
- [ ] `id`: único, minúsculo, **sem a palavra "obsidian"**, não terminar em "plugin", **imutável depois de publicado**.
- [ ] `name`: não conter "Obsidian"; único.
- [ ] `version`: semver (`1.0.0`).
- [ ] `minAppVersion`: a menor versão que realmente suporta as APIs usadas.
- [ ] `description`: **até 250 caracteres**, termina com ponto, em inglês, sem "This is a plugin that…".
- [ ] `author` e `authorUrl` (opcional).
- [ ] `isDesktopOnly`: `true` se usar Node/Electron APIs.

### 5.3 Release no GitHub
- [ ] Tag **igual** à versão do manifest, **sem prefixo `v`** (`1.0.0`).
- [ ] Release com assets anexados individualmente: **`main.js`**, **`manifest.json`**, **`styles.css`** (não zipados).
- [ ] Versão do `manifest.json` na release = a da tag.
- [ ] Idealmente automatizar com GitHub Actions ao empurrar a tag.

### 5.4 Submissão
- [ ] Abrir **Pull Request** em `obsidianmd/obsidian-releases` adicionando uma entrada em `community-plugins.json` (`id`, `name`, `author`, `description`, `repo`), seguindo o template do PR e marcando o checklist.
- [ ] Revisão pela equipe do Obsidian (pode levar semanas); ajustar conforme feedback.
- [ ] Depois de aprovado, atualizações saem só criando novas releases (não precisa de novo PR).

### 5.5 Diretrizes de código (o que costuma barrar o PR)
- [ ] Sem `innerHTML`/`outerHTML`/`insertAdjacentHTML` com conteúdo dinâmico (usar `createEl`, `createDiv`, `setText`).
- [ ] Sem `console.log` de debug em produção.
- [ ] Tudo registrado é desfeito no `onunload` (ou via `register*`).
- [ ] Não usar `var`; evitar `any` desnecessário; não acessar `app.workspace.activeLeaf` (deprecated).
- [ ] Não sobrescrever/monkey-patch API interna sem necessidade; evitar APIs não documentadas.
- [ ] Settings: texto em *sentence case*, sem repetir "settings" no título, usar `setHeading()` em vez de `<h2>`.
- [ ] Não mexer em estilos globais com `!important`/seletores amplos; escopar tudo (já feito com `body.felisidian`).
- [ ] Ler/escrever arquivos via `app.vault` (`Vault.process`/`cachedRead`), não `fs`.
- [ ] Comandos sem hotkey padrão (deixar o usuário escolher) e sem prefixar o nome do plugin no `name` do comando.
- [ ] Sem telemetria, anúncios ou rede sem **divulgação clara no README** (política de privacidade/rede/dados externos).
- [ ] Sem código ofuscado; o `main.js` deve ser build do código público.
- [ ] Licenciamento: atribuir qualquer código/assets/ícones/fontes de terceiros e respeitar licença.

### 5.6 Qualidade antes de enviar
- [ ] Testar em Windows/macOS/Linux e mobile (ou marcar desktop-only).
- [ ] Testar com vault grande e vault vazio.
- [ ] Testar com tema padrão claro/escuro e 1–2 temas da comunidade.
- [ ] Testar desinstalar/reinstalar (sem lixo no vault).
- [ ] Screenshots/GIFs no README.

---

## 6. Decisões em aberto (precisam de você)

1. **Fonte dos itens**: notas com frontmatter (recomendado), pasta de PDFs, ou ambos?
2. **Foco**: papers/artigos (como na imagem) ou **livros** (capa, nº de páginas, estante)?
3. **Categoria** = tag, propriedade, ou pasta?
4. **Progresso**: manual (página atual) ou automático (lendo PDF)?
5. **Desktop-only** ou mobile também?
6. **Nome final** do plugin (definido: **Felisidian**).
7. **Mantém a parte de tema** (cor/fonte/raio) como módulo opcional ou remove?

---

## 7. Roadmap sugerido

| Marco | Entrega |
|---|---|
| 0.1 | View Library + sidebar de categorias + grade de cards (dados do frontmatter) |
| 0.2 | Cores por categoria, contadores, subcategorias, chips de autor |
| 0.3 | Progresso circular, ordenação, busca, settings de mapeamento |
| 0.4 | Add item (modal), abas Notebooks/Canvases, responsivo/mobile |
| 0.9 | README com GIFs, LICENSE, release automatizada, teste em vaults reais |
| 1.0 | PR no `obsidian-releases` |
