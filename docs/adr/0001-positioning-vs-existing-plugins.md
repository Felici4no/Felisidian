# ADR-0001: Posicionamento do Felisidian frente a plugins livres existentes

**Status:** Proposed
**Data:** 2026-10-28
**Decisores:** Lucas Feliciano

> Fontes: listagens do diretório de plugins, do Obsidian Stats, changelog oficial e fóruns,
> consultados em 2026-10-28. Funcionalidades vêm dos resumos das listagens; **não** li o
> código nem testei esses plugins. Itens marcados *(não verificado)* precisam de checagem
> antes de virarem argumento público (README, página do marketplace).

## Contexto

O Felisidian entrega hoje: biblioteca visual (árvore de tags coloridas, cards pastel,
filtros por autor, busca, ordenação manual por arrastar), página de leitura somente-leitura
com marca-texto `==texto==`, notas tingidas pela cor da tag, janelas para criar tag/nota,
fonte configurável e blocos de código estilo IDE.

O Obsidian passou a ter **Bases** (plugin core, lançado na 1.9.0 em maio de 2025): qualquer
conjunto de notas vira uma "base de dados" com views. Em cima dele surgiu um ecossistema de
views da comunidade. Isso muda o terreno: a grade de cards deixou de ser um diferencial
raro e passou a ser uma commodity.

## Panorama comparativo

| Plugin / recurso | O que faz (segundo a listagem) | Sobreposição com o Felisidian |
|---|---|---|
| **Bases** (core) | Views de tabela sobre notas; base da plataforma | Alta: é a fonte de dados "oficial" para o que fazemos |
| **Bookshelf Base** | View de estante (capas) para Bases; serve para livros, papers, cursos | Alta na visualização; sem árvore de tags colorida nem leitor |
| **Tome** | Busca ISBN/título em Open Library, Google Books e OpenAlex e cria a nota; capas em Cards de Bases | Média: resolve a **entrada de dados**, que nós não resolvemos |
| **Card Viewer** | Cards de filmes, séries, livros e música com capa | Média |
| **Colecao Livros Quadrinhos** | Catálogo de livros/quadrinhos via Google Books/Open Library, galeria com Bases | Baixa-média |
| **Literature Flow** | Referências e citações, índice de cards em barra lateral | Média: foco em literatura acadêmica |
| **Projects Plus** (fork do Projects, que foi descontinuado em mai/2025) | Dashboards: tabela, board, calendário, galeria sobre propriedades | Média: galeria + propriedades |
| **Extended Base / WCC Base Views** | Views extras para Bases (board, kanban, calendário, timeline) | Baixa: outro uso |
| **Gallery View / Board View** | Galeria e quadro de notas | Média na grade |
| **Reader Highlighter Tags** | Marca-texto, tags e anotações **sem sair do modo de leitura**; desktop e mobile | **Alta** no nosso leitor/marca-texto |
| **Annotator / PDF Annotator / Zotero Integration / ZotFlow** | Anotação de PDF/EPUB, sincronização com Zotero | Baixa hoje (não lemos PDF), alta se formos para papers |
| **Dataview** (e Datacore) | Consultas e listas sobre notas | Baixa: é ferramenta de consulta, não de UI pronta *(estado de manutenção não verificado)* |

## Onde o Felisidian é diferente (hipóteses de valor)

1. **Tags como cidadãs de primeira classe**: árvore hierárquica com cor, contador, criação
   por janela e cor herdada pelas notas. Não encontrei isso combinado nos plugins acima
   *(não verificado a fundo)*.
2. **Nota colorida por dentro**: a cor da tag tinge a nota aberta e a página de leitura, não
   só o card.
3. **Biblioteca + leitura no mesmo fluxo**: rota biblioteca → tag → nota, com progresso de
   páginas ligado ao anel do card.
4. **Movimento**: seleção que desliza, filtro que reorganiza (FLIP), arrastar para ordenar.
5. **Código estilo IDE** e fonte configurável, que não são específicos de biblioteca mas
   entram no pacote visual.

## Onde estamos atrás

| Lacuna | Quem já resolve |
|---|---|
| Entrada de dados (buscar livro/paper, capa, metadados) | Tome, Colecao Livros, Card Viewer |
| Integração com **Bases** (hoje lemos o `metadataCache` direto) | Bookshelf Base, Extended Base |
| PDF/EPUB, anotações em arquivo, Zotero | Annotator, PDF Annotator, Zotero Integration, ZotFlow |
| Marca-texto com tags/anotações e suporte mobile | Reader Highlighter Tags |
| Capas/imagens nos cards | Bookshelf Base, Tome, Card Viewer |
| Testes automatizados, mobile validado, acessibilidade auditada | (nós: nenhum dos três ainda) |

## Decisão

**Não competir como "mais uma grade de cards".** Posicionar o Felisidian como a camada de
**organização por tags coloridas + leitura**, e tratar a grade como uma *view* sobre os
dados, não como o produto.

## Opções consideradas

### Opção A: Plugin independente (estado atual)
| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa (já feito) |
| Custo | Manter schema próprio (`category`, `authors`, `pages`…) |
| Risco | Alto: Bases + views da comunidade comoditizam a grade |
| Familiaridade | Alta |

**Prós:** controle total de UX, animações e rota; sem dependência da API de Bases.
**Contras:** reimplementa o que o core faz; usuários de Bases veem duplicação; sem capas.

### Opção B: Reescrever como view de Bases
| Dimensão | Avaliação |
|---|---|
| Complexidade | Média-alta *(API de views de Bases não verificada por mim)* |
| Risco | Depende de API recente; exige `minAppVersion` alto |
| Escalabilidade | Boa: filtros/ordenação/propriedades vêm do core |

**Prós:** alinha com a plataforma e o público; menos código próprio.
**Contras:** perde parte do controle (sidebar de árvore, animações, rota); dependência de
uma API ainda jovem.

### Opção C: Híbrido (recomendada)
| Dimensão | Avaliação |
|---|---|
| Complexidade | Média |
| Risco | Médio |
| Diferenciação | Alta |

Manter como **núcleo próprio** o que é único (sistema de tags coloridas, tinta nas notas,
leitor com marca-texto, janelas de criação, tema/código) e expor a grade também como
**view de Bases** quando a API for validada; a biblioteca standalone vira a "experiência
guiada" para quem não usa Bases.

**Prós:** diferencial preservado, caminho de migração, cobre os dois públicos.
**Contras:** duas superfícies para manter; precisa de uma camada de dados comum.

## Análise de trade-offs

- **Controle de UX vs alinhamento com a plataforma:** A maximiza o primeiro, B o segundo;
  C aceita custo de manutenção para ter ambos.
- **Escopo:** hoje o plugin mistura biblioteca, leitor, tema e editor de código. Para o
  marketplace, uma descrição curta e um caso de uso claro importam mais que a lista de
  recursos. A revisão do Obsidian também exige foco e descrição de até 250 caracteres.
- **Concorrência direta real é o leitor**, não a biblioteca: Reader Highlighter Tags faz
  marca-texto em modo de leitura com tags e mobile. Precisamos de motivo para ser melhor
  (integração com progresso, cor da tag, rota da biblioteca) ou aceitar coexistência.

## Consequências

- **Fica mais fácil:** mensagem de produto clara; reaproveitar dados de Bases; capas e
  busca de metadados via integração em vez de reinventar.
- **Fica mais difícil:** manter duas fontes de dados (metadataCache + Bases) sem divergir.
- **A revisitar:** quando a API de views de Bases estiver estável; se Reader Highlighter
  Tags cobrir o fluxo de leitura que temos; se o público é livros, papers ou ambos.

## Ações

1. [ ] Verificar manualmente os plugins marcados *(não verificado)* (README, código, mobile).
2. [ ] Validar a API de views do Bases e definir o `minAppVersion` possível.
3. [ ] Extrair uma camada de dados comum (`LibraryItem`) independente da fonte.
4. [ ] Escolher o público inicial: livros **ou** papers (define capas, ISBN/DOI, PDF).
5. [ ] Reescrever descrição do manifest e README em torno do diferencial (tags coloridas + leitura).
6. [ ] Testar mobile e tema escuro antes de qualquer release.
7. [ ] Adicionar testes para `model.ts` (árvore, filtros, ordem manual) e para marca-texto.
