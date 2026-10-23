# Portal do estudante: Início e Conversa — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encurtar o Início do portal do estudante (três ações, blocos recolhíveis) e transformar a Conversa em um chat compacto com campo de resposta fixo, sem mudar a identidade visual.

**Architecture:** Só front-end (React 19 + TS). `Inicio.tsx` e `Acompanhar.tsx` são reorganizados; `aluno.css` ganha classes novas compostas apenas com variáveis e cores já existentes. Nenhuma mudança de API ou de backend.

**Tech Stack:** React 19, Vitest + Testing Library (`cd frontend; npx vitest run --config vite.aluno.config.ts --maxWorkers=1 <arquivos>`), Playwright com Chrome instalado (`channel: 'chrome'`) para a verificação final.

**Spec:** `docs/superpowers/specs/2026-10-22-portal-estudante-inicio-conversa-design.md`

## Global Constraints

- Português do Brasil em código, comentários, testes e commits; sem travessões longos em texto novo.
- Preservar o visual: nenhuma cor, fonte ou variável CSS nova. Reutilizar `--fundo-superficie`, `--borda-suave`, `--primaria-suave` (`#E1F200`), `--bilhete-fundo`/`#FF694F`, `--linha-fina`, `--espaco-*` e o padrão de `details` dos `grupos-v3`.
- Rótulos fixos: **Preciso de ajuda**, **Conversar sem me identificar** (antes "Quero acolhimento anônimo"), **Ver meu caso**, **Acompanhar**, **Continuar meu caso**, **Abrir caso {código}**, **Apagar acesso {código}**, **Apagar todos os acessos**, **Como funciona**, **Seus dados e privacidade**, **Seu código**, **Novas mensagens**, **Enviar resposta**, **Atualizar conversa**.
- Manter: `role="log"`, `aria-live="polite"`, `aria-label="Mensagens do caso"`, foco inicial no título "Conversa com a coordenação", `aria-label="Etapas do caso"` com `aria-current="step"`, limite de 2000 caracteres e as mensagens de erro atuais, marcas "(editada)" e "Mensagem apagada".
- `<details>`/`<summary>` nativos, fechados por padrão, `summary` com altura mínima de 44 px. Nenhum texto de privacidade é removido.
- TDD. Vitest sempre com `--maxWorkers=1`; nunca duas execuções ao mesmo tempo. Suítes completas e builds só na Task 4.
- Não usar subagentes opus. Não fazer push. Commits só dos arquivos da task; nunca adicionar pastas não rastreadas (`.impeccable`, `anti-slop`, `docs/mapa-codigo`, `output`, Vault, capturas).

## Review Focus

1. Navegação depois do renomeio de rótulos: `App.test.tsx` e os fluxos Início → acolhimento / pedido / acompanhar continuam funcionando (Task 1).
2. Cartão "Continuar meu caso": aparece só com acessos salvos, vem antes da abertura, e apagar o último acesso o remove sem erro (Task 1).
3. Conexão sem tempo real (navegador sem `EventSource` ou queda): o botão "Atualizar conversa" precisa continuar acessível exatamente quando a conexão não está `online` nem `conectando`, para o estudante nunca ficar sem como atualizar (Task 2).
4. Mensagens apagadas, editadas e novas misturadas: o separador "Novas mensagens" só antecede mensagem nova da coordenação não apagada, e o agrupamento por autor não esconde de leitor de tela quem escreveu (Task 3).
5. Campo fixo cobrindo a última mensagem ou o botão com o teclado do celular aberto (viewport 375x480): tem de ser verificado no Chrome real (Task 4).

---

### Task 1: Início enxuto

**Files:**
- Modify: `frontend/src/aluno/Inicio.tsx`, `frontend/src/aluno/aluno.css`
- Test: `frontend/src/aluno/Inicio.test.tsx`, `frontend/src/aluno/InicioAcessos.test.tsx`, `frontend/src/aluno/App.test.tsx`

**Interfaces:**
- Produces: `Inicio({ onAjuda, onAcompanhar, onAcolhimento }: { onAjuda: () => void; onAcompanhar: (codigo: string) => void; onAcolhimento?: () => void })` — mesma assinatura de hoje. Classes novas em `aluno.css`: `.continuar-caso`, `.inicio-acoes`, `.acao-cartao`, `.privacidade-linha`, `.recolhivel` (aplicada a `<details>`).
- Ordem no DOM: (1) `<section class="continuar-caso">` só se `lerAcessos().length > 0`; (2) `.boas-vindas` com `h1`, um parágrafo e o `aside.bilhete`; (3) `.inicio-acoes` com três `.acao-cartao`; (4) `<p class="privacidade-linha">`; (5) dois `<details class="recolhivel">`.

- [ ] **Step 1: Write the failing tests** em `Inicio.test.tsx`/`InicioAcessos.test.tsx`/`App.test.tsx` (atualizando os que citam rótulos antigos):
  - `mostra as três ações com os rótulos novos`: botões "Preciso de ajuda" e "Conversar sem me identificar"; campo com rótulo "Código de acompanhamento" e botão "Acompanhar" no cartão "Ver meu caso".
  - `não exibe os rótulos antigos`: sem "Quero acolhimento anônimo", sem o título "Como usar este canal" nem "Já conversou com a gente?".
  - `abertura tem uma frase só`: o texto "Se algo está te preocupando, na escola, na internet ou em casa, conte para a coordenação. No seu tempo e sem precisar dizer seu nome." presente; o parágrafo "Para iniciar uma denúncia, toque em" ausente.
  - `linha de privacidade sempre visível`: "A escola guarda o que você enviar para cuidar do caso. O nome é opcional." fora de qualquer `details`.
  - `blocos recolhíveis fechados por padrão`: `details` com summary "Como funciona" e "Seus dados e privacidade", ambos sem atributo `open`; o texto de privacidade completo (relato, imagens e mensagens; rede local e registros de acesso; rascunho de 24 horas) está no DOM; abrir com `userEvent.click` no summary define `open`.
  - `código vazio mostra erro`: submeter "Ver meu caso" vazio mostra role="alert" "Digite seu código para acompanhar."; código preenchido chama `onAcompanhar` com o valor.
  - `cartão Continuar meu caso só com acessos salvos` (usar o mock/armazenamento de `acessos.ts` como em `InicioAcessos.test.tsx`): sem acessos o texto "Continuar meu caso" não existe e a seção vem depois; com acessos, a seção é o primeiro bloco do `main` do componente, mostra "Abrir caso {código}" e "Apagar acesso {código}", e "Apagar todos os acessos" quando houver mais de um; apagar o último remove o cartão.
  - `App`: clicar "Preciso de ajuda", "Conversar sem me identificar" e "Acompanhar" no Início leva às mesmas telas de antes.

- [ ] **Step 2: Run** `npx vitest run --config vite.aluno.config.ts --maxWorkers=1 src/aluno/Inicio.test.tsx src/aluno/InicioAcessos.test.tsx src/aluno/App.test.tsx` — Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement** `Inicio.tsx` conforme a ordem acima, mantendo `lerAcessos`, `removerAcesso` e o aviso de falha de armazenamento (`role="status"`). O texto do guia ("Como funciona") reaproveita os quatro blocos atuais, encurtados a no máximo duas frases cada, sem mudar o sentido. CSS: `.inicio-acoes` em grade de uma coluna e três colunas a partir de 768 px; `.acao-cartao` com o mesmo cartão de `.acompanhamento-inicio` (borda 2 px preta, sombra 4 px); `.recolhivel` herdando o estilo de `.grupos-v3 details` (`summary` com `min-height: 44px`, aberto com fundo `--primaria-suave`); reduzir a margem entre blocos para `--espaco-6`.

- [ ] **Step 4: Run** os mesmos arquivos mais `src/aluno/Acolhimento.test.tsx` — Expected: PASS; depois `npm run build:aluno` sem erro de `tsc`.

- [ ] **Step 5: Commit** `git add frontend/src/aluno/Inicio.tsx frontend/src/aluno/aluno.css frontend/src/aluno/Inicio.test.tsx frontend/src/aluno/InicioAcessos.test.tsx frontend/src/aluno/App.test.tsx && git commit -m "Aluno: inicio enxuto com tres acoes e blocos recolhiveis"`

### Task 2: Conversa, cabeçalho compacto, código e conexão

**Files:**
- Modify: `frontend/src/aluno/Acompanhar.tsx`, `frontend/src/aluno/aluno.css`
- Test: `frontend/src/aluno/Acompanhar.test.tsx`, `frontend/src/aluno/TempoReal.test.tsx`

**Interfaces:**
- Produces: `Acompanhar({ codigoInicial }: { codigoInicial?: string })` — assinatura inalterada. Classes novas: `.codigo-caso` (o `<details class="recolhivel codigo-caso">`), `.so-leitor` (texto visualmente oculto; usar utilitário equivalente se já existir em `shared/tema.css`, senão definir com o padrão de recorte clássico, sem cores), `.linha-conexao`.
- Consumes: `useTempoReal(...)` devolve `conexao` com valores `'online'`, `'conectando'` e um terceiro valor de queda; usar `conexao !== 'online' && conexao !== 'conectando'` para "fora do ar".

- [ ] **Step 1: Write the failing tests** (atualizar os que citam textos antigos):
  - `etapas ficam em uma linha com o estado só para leitor de tela`: três itens em `ol[aria-label="Etapas do caso"]`, a atual com `aria-current="step"`; o texto "Etapa atual" existe dentro de `.so-leitor`.
  - `código fica em Seu código, fechado por padrão`: `details` com summary "Seu código", sem `open`, contendo o código normalizado e "Anote em um lugar seguro."; o aviso de armazenamento (quando `guardarAcesso` falha) aparece fora do bloco fechado.
  - `não mostra Atualizações ao vivo nem o botão quando online`: com `conexao` online não existe "Atualizações ao vivo" nem "Atualizar conversa".
  - `fora do ar mostra a linha e o botão`: com a conexão em queda aparece "Reconectando; atualização a cada 8 segundos" e o botão "Atualizar conversa", que chama a consulta ao ser clicado e mostra "Conversa atualizada.".
  - `conectando não mostra o botão` (evita piscar na abertura).
  - `foco inicial continua no título Conversa com a coordenação`.

- [ ] **Step 2: Run** `npx vitest run --config vite.aluno.config.ts --maxWorkers=1 src/aluno/Acompanhar.test.tsx src/aluno/TempoReal.test.tsx` — Expected: FAIL nos novos.

- [ ] **Step 3: Implement** em `Acompanhar.tsx`: etapas com `<span class="etapa-estado so-leitor">`; bloco `<details>` do código com o aviso de `avisoStorage` fora dele quando existir; linha de conexão e botão condicionados como descrito. CSS: `.etapas` sempre em três colunas (inclusive em 375 px, nome da etapa em fonte pequena, marca de 28 px) e `.etapa` mais compacta; remover o `margin-bottom` grande.

- [ ] **Step 4: Run** os mesmos arquivos mais `src/aluno/PosResolucao.test.tsx` — Expected: PASS; `npm run build:aluno` sem erro.

- [ ] **Step 5: Commit** `git add frontend/src/aluno/Acompanhar.tsx frontend/src/aluno/aluno.css frontend/src/aluno/Acompanhar.test.tsx frontend/src/aluno/TempoReal.test.tsx && git commit -m "Aluno: conversa com cabecalho compacto, codigo recolhivel e conexao discreta"`

### Task 3: Conversa, mensagens agrupadas, separador e campo fixo

**Files:**
- Modify: `frontend/src/aluno/Acompanhar.tsx` (extrair `frontend/src/aluno/ListaMensagens.tsx` somente se o arquivo passar de ~250 linhas), `frontend/src/aluno/aluno.css`
- Test: `frontend/src/aluno/Acompanhar.test.tsx` (e `ListaMensagens.test.tsx` se extraído)

**Interfaces:**
- Produces: dentro do `role="log"`: cada mensagem é `<article class="mensagem" data-autor aria-label="Você" | "Coordenação">`; o `<h3>` com o nome só na primeira mensagem de cada grupo de autor consecutivo; separador `<div role="separator" class="novas-divisor">Novas mensagens</div>` antes da primeira mensagem nova da coordenação não apagada. O formulário de resposta vira `<form class="resposta resposta-fixa">` depois do log, com `textarea rows={2}` que cresce até 6 linhas (altura calculada a partir de `scrollHeight`, limite de 6 linhas) e o contador "N de 2000 caracteres".
- Consumes: lógica `novas` e `registrar` já existentes (mensagens apagadas nunca entram em `novas`); marcas "(editada)" e "Mensagem apagada" da spec de editar/excluir.

- [ ] **Step 1: Write the failing tests**:
  - `nome do autor só na primeira mensagem do grupo`: três mensagens (aluno, aluno, coordenação) mostram dois `h3` ("Você" e "Coordenação"), e as três têm `aria-label` com o autor.
  - `separador único Novas mensagens`: com duas mensagens novas da coordenação existe exatamente um `role="separator"` com o texto, antes da primeira nova; sem mensagens novas não existe; mensagem nova apagada não gera separador; o texto "Mensagem nova" por balão não existe mais.
  - `contagem de novas continua em role status`: "Uma mensagem nova da coordenação." / "2 mensagens novas da coordenação.".
  - `campo de resposta fica depois do log e tem a classe resposta-fixa`; o `textarea` começa com `rows` 2 e o contador mostra "0 de 2000 caracteres".
  - `digitar não se perde ao receber mensagens`: com texto digitado, um novo carregamento da conversa mantém o valor.
  - `enviar continua igual`: texto vazio mostra "Escreva uma resposta de 1 a 2000 caracteres."; envio válido chama `enviarMensagem` e mostra "Resposta enviada.".
  - `rola até o separador ou a última mensagem sem mover o foco`: com `Element.prototype.scrollIntoView` espiado, ao carregar com novas rola o separador; sem novas rola a última mensagem; `document.activeElement` continua sendo o título.

- [ ] **Step 2: Run** `npx vitest run --config vite.aluno.config.ts --maxWorkers=1 src/aluno/Acompanhar.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** o agrupamento por autor (comparar `autor` com o item anterior), o separador, o `ref` de rolagem (usar `scrollIntoView?.({ block: 'nearest' })` com encadeamento opcional, pois o jsdom não implementa), o auto-crescimento do `textarea` e o CSS: `.resposta-fixa { position: sticky; bottom: 0; background: var(--fundo-base); border-top: 3px solid #101010; padding: var(--espaco-3) var(--espaco-4) calc(var(--espaco-3) + env(safe-area-inset-bottom)); }`, balões com `padding` menor e hierarquia mais leve, `.novas-divisor` com linha de 2 px e rótulo em fundo `--primaria-suave`.

- [ ] **Step 4: Run** `Acompanhar.test.tsx`, `TempoReal.test.tsx` e `npm run build:aluno` — Expected: PASS.

- [ ] **Step 5: Commit** `git add frontend/src/aluno && git commit -m "Aluno: conversa em formato de chat com separador de novas e resposta fixa"` (só os arquivos alterados desta task).

### Task 4: Fechamento

**Files:**
- Modify: `frontend/verificacao/acolhimento-conversas.mjs`, `frontend/verificacao/aluno.mjs`, `frontend/verificacao/navegador.mjs`, `frontend/src/revisao-aluno/main.tsx`, `frontend/docs/MAPA-INTERFACES.md`, `docs/acolhimento-e-conversas.md` (rótulo "Quero acolhimento anônimo" vira "Conversar sem me identificar"; "Mensagem nova" por balão vira o separador; novo parágrafo sobre Início e Conversa), `PRODUCT.md` só se citar o rótulo antigo
- Create: `docs/verificacao-portal-estudante-inicio-conversa.md`, nota `Diário/2026-10-22` do Vault (acrescentar ao arquivo existente do dia)

- [ ] **Step 1:** Atualizar os scripts de verificação, a prévia e os documentos para os rótulos novos (`grep` pelos textos antigos nos arquivos listados; o panfleto em `output/` não entra).
- [ ] **Step 2: Suítes completas, uma por vez, em segundo plano:** `npx vitest run --config vite.aluno.config.ts --maxWorkers=1`, `npx vitest run --config vite.coord.config.ts --maxWorkers=1`, `npm run build:aluno`, `npm run build:coord`. Expected: tudo verde. Backend não muda; rodar só o arquivo de teste que cobre os assets estáticos, se existir.
- [ ] **Step 3: Chrome real** (Playwright, `channel: 'chrome'`, banco temporário e portas 3100/4100 ou API simulada, nunca tocar `C:\ProgramData`): capturar Início (sem e com casos salvos) e Conversa em 375, 768 e 1280. Medir `scrollHeight` do Início em 375 (meta até 1.900 px) e confirmar que o campo de resposta cabe na primeira tela com 5 mensagens em 375; `scrollWidth <= innerWidth`; teclado (Tab, Enter e Espaço nos `summary`); viewport 375x480 simulando teclado aberto, com o campo fixo sem cobrir o último balão nem o botão. Ler cada captura e comparar com `scratchpad/aluno-hoje/`.
- [ ] **Step 4:** Registrar o resultado em `docs/verificacao-portal-estudante-inicio-conversa.md`, atualizar o Vault e salvar o aprendizado com `trail note`; commit dos arquivos desta task.
