# Visual da coordenação — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A equipe encontra e trata um caso com menos rolagem e menos ruído, no computador e no celular: barra lateral em altura total, fila compacta, página do caso com hierarquia, Mapa e Relatórios mais claros.

**Architecture:** Só front-end (React 19 + TS). Reorganização de `App.tsx`, `Navegacao.tsx`, `Fila.tsx`, `Caso.tsx`, `Conversa.tsx`, `Relatorios.tsx` e `mapa/Mapa.tsx`, com CSS novo composto apenas por tokens e cores já existentes em `coord.css` e `fluent.css`. Nenhuma mudança de API ou de backend.

**Tech Stack:** React 19, Vitest + Testing Library (`cd frontend; npx vitest run --config vite.coord.config.ts --maxWorkers=1 <arquivos>`), Playwright com Chrome instalado para a verificação final.

**Spec:** `docs/superpowers/specs/2026-10-25-coordenacao-visual-design.md` (auditoria e capturas de antes em `C:\Users\Pichau\AppData\Local\Temp\claude\D--Prototipo-seguran-a-integral\307493c3-0374-49ae-a149-960e4d4ac117\scratchpad\verif3-shots\` e `...\scratchpad\coord-auditoria.md`).

## Global Constraints

- Português do Brasil em código, comentários, testes, textos e commits; sem travessões longos em texto novo.
- Preservar o visual Fluent: azul `#0f6cbd`, Segoe UI Variable, bordas finas, o fundo metálico animado e o botão "Pausar efeito". Nenhuma cor, fonte ou variável CSS nova; compor só com tokens existentes (`--espaco-*`, `--borda-suave`, `--primaria-suave`, `--prioridade-*`, `--gravidade-*`, `--texto-pequeno` etc.).
- Manter todos os papéis ARIA atuais (tabela da fila, `tablist`/`tab`/`tabpanel`, `role="status"` e `role="alert"`), a navegação por setas/Home/End das abas, e o comportamento de editar/excluir mensagens (spec de 22/10/2026).
- Alvos de toque de 44 px de altura mínima nos controles novos; sem rolagem horizontal em 375, 768 e 1280 px.
- A linha clicável da fila nunca é a única forma de abrir um caso: o assunto continua sendo o botão focável (`aria-label` "Caso {id}. Abrir.").
- TDD. Vitest sempre com `--maxWorkers=1` e nunca duas execuções ao mesmo tempo; suítes completas e builds só na Task 6.
- Nenhum dado novo é exibido; backend, `shared/api.ts` e contratos não mudam (salvo tipos já existentes).
- Nunca usar subagente opus. Sem push nas tarefas 1 a 5. Commits só com os arquivos da task; nunca adicionar pastas não rastreadas (`.impeccable`, `anti-slop`, `docs/mapa-codigo`, `output`, Vault, capturas).

## Review Focus

1. Linha clicável da fila: clique na linha abre o caso, mas clique em selos ou texto selecionável não deve duplicar a ação; teclado só pelo assunto; leitor de tela lê uma ação por caso (Task 2).
2. Menu "⋯" da conversa: foco, Esc, setas, clique fora e leitor de tela; editar e excluir continuam funcionando com os mesmos fluxos e testes (Task 4).
3. Barra lateral em altura total: `position: sticky` não pode ser anulado por `overflow` de ancestral; efeito metálico preenche a altura e continua pausável; sem custo de rolagem horizontal (Task 1).
4. Contadores e ponto de mensagem nova nas abas: valores corretos com listas vazias, mensagens apagadas não contam como novas (Task 3).
5. Relatórios em largura estreita: nenhuma informação da tabela se perde na lista empilhada; nota de "pouco histórico" só quando há menos de 3 pontos (Task 5).

---

### Task 1: Casca e barra lateral

**Files:**
- Modify: `frontend/src/coord/App.tsx`, `Navegacao.tsx`, `MetalLiquido.tsx`, `coord.css`, `fluent.css`, `motion.css`
- Test: `frontend/src/coord/App.test.tsx`, `portal.test.tsx`, `polimento.test.tsx`

**Interfaces:**
- Produces: mesma assinatura de `Navegacao({ tela, admin, pendencias, aoIr })` e de `MetalLiquido()`. Classes novas: `.coord-lateral-rodape` (sessão, "Sair", "Pausar efeito" na base da barra), `.coord-marca-linha` (marca e sessão numa linha no celular).

- [ ] **Step 1: Write the failing tests:** (a) a barra lateral contém, nesta ordem, marca, navegação e rodapé com o nome da sessão e "Sair"; (b) o item de navegação atual tem `aria-current="page"` e, ao montar e ao trocar de tela, `scrollIntoView` é chamado nele com `{ inline: 'nearest', block: 'nearest' }` (mock em jsdom); (c) o texto "Atualizações ao vivo" continua na coluna principal; (d) a contagem de pós-resolução continua em `nav-contagem`; (e) o botão "Pausar efeito" continua alternando `data-pausado`.
- [ ] **Step 2: Run** `npx vitest run --config vite.coord.config.ts --maxWorkers=1 src/coord/App.test.tsx src/coord/portal.test.tsx src/coord/polimento.test.tsx` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** a barra em altura total em telas de 760 px ou mais (`.coord-lateral { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column }`, rodapé empurrado para baixo, `.metal-liquido` com `inset: 0` e SVG cobrindo a altura via `preserveAspectRatio="xMidYMid slice"`; confirmar que nenhum ancestral tem `overflow` que anule o sticky); abaixo de 760 px, faixa superior compacta: marca e sessão/"Sair" na primeira linha, navegação rolável na segunda (meta de altura do cabeçalho em 375 px: até 130 px), item atual rolado para a vista; alvos de 44 px.
- [ ] **Step 4: Run** os mesmos arquivos mais `Geral.test.tsx` e `Fila.test.tsx` (só para garantir que a casca não os quebrou), depois `npm run build:coord` — Expected: PASS.
- [ ] **Step 5: Commit** `git add frontend/src/coord && git commit -m "Coordenacao: barra lateral em altura total e cabecalho compacto no celular"` (só os arquivos da task).

### Task 2: Fila de casos compacta

**Files:**
- Modify: `frontend/src/coord/Fila.tsx`, `coord.css`
- Test: `frontend/src/coord/Fila.test.tsx` (e outros testes que citem o botão "Abrir": `grep -rn "Abrir" frontend/src/coord/*.test.tsx`)

**Interfaces:**
- Produces: `Fila` com as mesmas props. Marcação por caso: `<tr className="casos-linha" data-gravidade onClick>` com o assunto como `<button type="button" className="casos-assunto" aria-label="Caso {id}. Abrir.">`; classe `.casos-motivos` (selos de atenção, no máximo dois e `+N`); `.casos-meta` (linha 3 em texto pequeno); filtros: `.fila-visoes` em uma linha rolável, `details.filtros-detalhados` com o resumo "Filtros detalhados (N ativos)".

- [ ] **Step 1: Write the failing tests:** (a) não existe botão com nome "Abrir"; o assunto é um botão com `aria-label` "Caso {id}. Abrir." que chama `aoAbrir(id)`; (b) clicar na linha (fora de botões e links) chama `aoAbrir(id)` uma vez; clicar no assunto chama uma vez só (sem duplicar); (c) caso com mensagens novas mostra o selo "N mensagens novas" na linha 1; (d) o resumo aparece uma vez, o texto de motivo ("Por que: ...") e a última mensagem seguem no DOM mas dentro de `.casos-meta`/linha 2 conforme a spec; (e) com três motivos de atenção aparecem dois selos e "+1"; (f) o texto de ajuda dos filtros (`filtros-ajuda`) está dentro de `details.filtros-detalhados`; (g) todas as visões e contagens existentes continuam (teste atual de visões); (h) `role="status"` e o anúncio de casos novos continuam.
- [ ] **Step 2: Run** `npx vitest run --config vite.coord.config.ts --maxWorkers=1 src/coord/Fila.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** a linha compacta (celular e abaixo de 960 px) com as três linhas da spec e a tabela densa a partir de 960 px sem a coluna do botão; `onClick` na linha ignora cliques que vieram de `button`, `a`, `summary`, `input`, `select` (`e.target.closest`) e seleção de texto (`window.getSelection()?.toString()`); remover o botão "Abrir" e a regra `.casos-abrir`; manter o cabeçalho da coluna acessível (`so-leitor`). Meta com os 14 casos de teste em 375 px: fila até 1.700 px.
- [ ] **Step 4: Run** `Fila.test.tsx`, `Atendimento.test.tsx`, `App.test.tsx`, `portal.test.tsx`, `polling.test.tsx` e `npm run build:coord` — Expected: PASS.
- [ ] **Step 5: Commit** `git add frontend/src/coord && git commit -m "Coordenacao: fila de casos compacta com linha clicavel"`.

### Task 3: Página do caso (cabeçalho, ações, abas, painel lateral)

**Files:**
- Modify: `frontend/src/coord/Caso.tsx`, `Atendimento.tsx`, `Anexos.tsx`, `RespostasAluno.tsx`, `ReavaliarPrioridade.tsx` (só se a barra de ações exigir), `coord.css`, `atendimento.css`
- Test: `frontend/src/coord/Caso.test.tsx`, `Atendimento.test.tsx`, `RespostasAluno.test.tsx`, `ReavaliarPrioridade.test.tsx`

**Interfaces:**
- Produces: mesmas props de `Caso({ id, aoVoltar, aoMudar })`. Classes novas: `.caso-acoes` (barra), `.caso-atendimento-linha`, `.caso-lateral` (painel sticky ≥ 1100 px), `.aba-contagem`, `.aba-ponto-novo`, `.vazio-compacto`. Abas: `{ id: 'relato', nome: 'Relato e investigação' }`, `conversa` com contador de `caso.mensagens.length` e ponto quando `caso.mensagens_novas > 0` (se o campo não existir no detalhe, derivar de mensagens do aluno não lidas na lista; documentar), `notas` com `caso.notas.length`, `historico` com `caso.eventos.length`.

- [ ] **Step 1: Write the failing tests:** (a) a barra `.caso-acoes` tem Status (select), "Reavaliar prioridade", botão **Exportar para o ROE** (um `<a role="button">` ou `<button>` que abre `urlExportacao(id)` em nova aba) e **Resolver este caso** (abre o painel de resolução existente); em caso resolvido aparece "Reabrir para investigação" no lugar de Status e Resolver; (b) a nota do ROE ("Relatório de apoio para impressão ou cópia...") fica em `title` e na ajuda recolhida, não como parágrafos soltos; (c) "Organização do atendimento" vira uma linha "Responsável: X · Próxima ação: Y até DD/MM" com botão "Editar responsável e ação"; (d) "Dados do caso" continua recolhível; (e) abas mostram contadores "Conversa 8", "Notas internas 2", "Histórico 12" e o ponto de mensagem nova; navegação por setas, Home e End continua; (f) estados vazios: "O aluno não respondeu ao questionário." e "Sem anexos." em uma linha de texto secundário, sem `h2` visível (o `h2` pode existir com `so-leitor`); (g) "Por que esta prioridade?" está num `aside` (`.caso-lateral`) e, abaixo de 1100 px, num `details` aberto por padrão só para prioridade crítica ou alta.
- [ ] **Step 2: Run** `npx vitest run --config vite.coord.config.ts --maxWorkers=1 src/coord/Caso.test.tsx src/coord/Atendimento.test.tsx src/coord/RespostasAluno.test.tsx src/coord/ReavaliarPrioridade.test.tsx` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** conforme a spec: cabeçalho resumido, barra de ações, linha do atendimento (o formulário completo abre no lugar como hoje), grade de duas colunas a partir de 1100 px com o painel sticky, abas com contadores e rolagem do contêiner de abas no celular com a aba selecionada na vista. O formulário "Resolver este caso" não muda por dentro.
- [ ] **Step 4: Run** os mesmos arquivos mais `PosResolucao.test.tsx`, `RegistrarResolucao.test.tsx`, `Colaboracao.test.tsx` e `npm run build:coord` — Expected: PASS.
- [ ] **Step 5: Commit** `git add frontend/src/coord && git commit -m "Coordenacao: pagina do caso com barra de acoes, abas com contadores e painel lateral"`.

### Task 4: Conversa com menu "⋯" e campo fixo no celular

**Files:**
- Modify: `frontend/src/coord/Conversa.tsx`, `coord.css`
- Test: `frontend/src/coord/Conversa.test.tsx`, `Caso.test.tsx` (apenas onde cita Editar/Excluir por papel)

**Interfaces:**
- Produces: `Conversa` mantém as props atuais (`itens`, `aoEditar`, `aoExcluir`, `aoVerVersoes` ...). Em cada item com ações: `<button type="button" aria-haspopup="menu" aria-expanded aria-label="Ações da mensagem" className="mensagem-menu-gatilho">⋯</button>` e `<ul role="menu">` com `role="menuitem"` para "Editar", "Excluir" e "Ver versões" (ou "Ver texto original" para apagada). Edição inline, confirmação inline e lista de versões permanecem como hoje.

- [ ] **Step 1: Write the failing tests:** (a) o item não mostra mais botões "Editar" e "Excluir" soltos; mostra o gatilho "⋯"; (b) Enter, Espaço ou clique abre o menu e o foco vai ao primeiro item; setas cima/baixo e Home/End navegam; Esc fecha e devolve o foco ao gatilho; clique fora fecha; (c) escolher "Editar" abre a edição no lugar (foco no campo) e "Excluir" abre a confirmação inline com os botões "Excluir" e "Cancelar" (mesmos testes de foco da spec de 22/10/2026); (d) item apagado mostra no menu "Ver texto original"; (e) item sem permissão (`podeAlterar` falso) mostra o gatilho só se houver "Ver versões" (editada) e, se não houver nenhum item de menu, não mostra gatilho; (f) em telas estreitas (mock de `matchMedia` ≤ 760 px) o campo de nova mensagem recebe a classe `resposta-fixa-coord`.
- [ ] **Step 2: Run** `npx vitest run --config vite.coord.config.ts --maxWorkers=1 src/coord/Conversa.test.tsx src/coord/Caso.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** o menu (um componente local `MenuMensagem` no mesmo arquivo, ou novo arquivo se `Conversa.tsx` passar de ~350 linhas) e o CSS do campo fixo em ≤ 760 px (sticky com a mesma técnica do portal do aluno, altura máxima compacta de 2 linhas).
- [ ] **Step 4: Run** `Conversa.test.tsx`, `Caso.test.tsx`, `Colaboracao.test.tsx` e `npm run build:coord` — Expected: PASS.
- [ ] **Step 5: Commit** `git add frontend/src/coord && git commit -m "Coordenacao: menu de acoes da mensagem e campo fixo no celular"`.

### Task 5: Mapa e Relatórios

**Files:**
- Modify: `frontend/src/coord/mapa/Mapa.tsx`, `mapa/mapa.css`, `Relatorios.tsx`, `coord.css`
- Test: `frontend/src/coord/mapa/Mapa.test.tsx`, `Relatorios.test.tsx`

**Interfaces:**
- Produces: componentes com as mesmas props. Mapa vazio: `<section className="mapa-vazio-cartao">` com título "A planta ainda está vazia", frase "Adicione uma ala ou um ambiente para começar." e o botão que já existe para adicionar (foco no primeiro campo ao abrir). Relatórios: `.relatorio-lista` (versão empilhada da tabela) e nota "Ainda há pouco histórico: só existem dados em N dia(s) neste período."

- [ ] **Step 1: Write the failing tests:** (a) mapa sem ambientes mostra o cartão com título, frase e o botão de adicionar; com ambientes e nível vazio mostra a frase "Este nível ainda não tem ambientes." e o seletor de nível; (b) Relatórios em largura estreita (mock de `matchMedia` ≤ 600 px) renderiza a lista empilhada com todas as linhas e colunas da tabela (mesmos valores), sem `overflow-x`; na largura normal mantém a tabela; (c) com menos de 3 pontos mostra a nota com N correto; com 3 ou mais não mostra; (d) os rótulos do gráfico mantêm o tamanho mínimo de 12 px.
- [ ] **Step 2: Run** `npx vitest run --config vite.coord.config.ts --maxWorkers=1 src/coord/mapa/Mapa.test.tsx src/coord/Relatorios.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** o cartão de mapa vazio e a versão empilhada dos relatórios (CSS com media query e a tabela com `details` existente preservada na largura normal); legenda do mapa com 14 px no mínimo.
- [ ] **Step 4: Run** os mesmos arquivos mais `mapa/AppMapa.test.tsx` e `npm run build:coord` — Expected: PASS.
- [ ] **Step 5: Commit** `git add frontend/src/coord && git commit -m "Coordenacao: mapa vazio explicativo e relatorios sem rolagem lateral"`.

### Task 6: Fechamento

**Files:**
- Modify: `frontend/verificacao/*.mjs` e `docs/*.md` que citem textos alterados (botão "Abrir", ROE, "Editar/Excluir" por mensagem); `docs/acolhimento-e-conversas.md` (nota sobre o menu "⋯")
- Create: `docs/verificacao-coordenacao-visual.md`; nota do Vault (`Diário/2026-10-25.md`)

- [ ] **Step 1:** Atualizar scripts e documentos que citem os textos e botões alterados (`grep`).
- [ ] **Step 2: Suítes completas, uma por vez, em segundo plano:** `npx vitest run --config vite.coord.config.ts --maxWorkers=1`, `npx vitest run --config vite.aluno.config.ts --maxWorkers=1`, `npm run build:coord`, `npm run build:aluno` e os testes de empacotamento do backend (`test_empacotamento.py`, `test_server.py`). Expected: verde.
- [ ] **Step 3: Chrome real** (Playwright, `channel: 'chrome'`, backend com banco temporário, portas 3100/4100, nunca `C:\ProgramData`) com os mesmos 14 casos de teste da auditoria: altura da fila em 375 (meta até 1.700 px), altura do cabeçalho em 375 (meta até 130 px), barra lateral em 1280x1100 sem corte, página do caso em 375, 768 e 1280, menu "⋯" por teclado, mapa vazio, Relatórios sem rolagem lateral; capturas lidas e comparadas com as da auditoria.
- [ ] **Step 4:** Registrar em `docs/verificacao-coordenacao-visual.md`, atualizar o Vault, `trail note`, commit, e `git push origin feature/v1`.
