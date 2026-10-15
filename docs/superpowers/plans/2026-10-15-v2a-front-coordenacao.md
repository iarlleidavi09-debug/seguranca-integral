# v2 A Front da Coordenação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o portal da coordenação (porta 4000) ao visual acolhedor aprovado e ao fluxo da v2 A sobre a API real já entregue: visão geral, casos com busca e filtros, detalhe com reavaliação de prioridade, registro de resolução, pós-resolução e revisão de recorrência.

**Architecture:** O portal continua React + Vite + TypeScript em `frontend/src/coord`. O visual novo entra como um tema escopado em `.coord-app` que redefine os tokens de `shared/tema.css` (o portal do aluno não muda). `api.ts` e `rotulos.tsx` passam ao vocabulário da v2 (3 status, 4 prioridades). A casca ganha navegação lateral; as telas viram componentes pequenos e testados com o servidor falso já usado nos testes.

**Tech Stack:** React 18, Vite, TypeScript, Vitest + Testing Library (jsdom), Playwright (verificação em Chrome real). Sem dependência nova; fonte Atkinson Hyperlegible já empacotada.

**Spec:** `docs/superpowers/specs/2026-10-15-v2a-fluxo-de-investigacao-design.md` (seções "Front da coordenação" e "Erros e segurança"). Contrato da API: `docs/v2-requisitos-do-front.md`, seção "Contrato final da API v2 A". Referência visual aprovada: `D:\Prototipo Segurança Integral front\src\revisao\main.tsx` e `revisao.css` (somente leitura; nada é escrito nessa pasta).

## Global Constraints

- Português do Brasil em toda a interface. Texto novo sem travessão longo (nenhum "—" nem "–" em copy de interface).
- Sem estilos ou scripts inline, sem CDN: a CSP do portal permite só recursos próprios. A fonte vem de `@fontsource/atkinson-hyperlegible` (pesos 400 e 700).
- Acessibilidade: texto com contraste de pelo menos 4,5:1; bordas, ícones e anel de foco com 3:1; prioridade e status nunca só por cor (forma e texto juntos); foco visível; alvo de toque de pelo menos 42 px; `prefers-reduced-motion` respeitado; temas claro e escuro.
- Verificação em Chrome real nos tamanhos 375, 768 e 1280 e nos temas claro e escuro.
- Toda escrita envia JSON (a função `coord()` de `api.ts` já cuida); `revisao-recorrencia` envia `{}`.
- Valores fixos: status `novo`, `em_investigacao`, `resolvido`; prioridade `critica`, `alta`, `media`, `baixa`; desfecho `solucionada`, `intervencao_realizada`. Textos livres de 1 a 2000 caracteres após `trim()` (`resultado` pode ser vazio).
- `providencias` e `resultado` são lidos pelo aluno: a interface rotula esses campos como "Visível para o aluno".
- Copy e aparência: aplicar as skills `antislop` (núcleo) à copy; a direção visual já está decidida ("Acolhedora ganhou"), então `impeccable` não redesenha, só é consultada em dúvida de polimento. Registrar no relatório final que as skills foram aplicadas.
- Não alterar `frontend/src/aluno`, `shared/tema.css` nem o backend. Commits em português, terminados com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; sem push.
- Rodar uma execução de teste por vez: `cd frontend && npx vitest run --config vite.coord.config.ts <arquivos>`; conferir o código de saída (sem `| tail`).

## Review Focus

- Caso migrado da v1 com eventos antigos (`gravidade`, status `em_analise`): histórico e rótulos não quebram nem mostram valor cru (Task 1).
- Busca com `%`, `_`, aspas, acento maiúsculo e mais de 100 caracteres: o campo limita em 100 e a fila não quebra (Task 4).
- Justificativa só com espaços ou acima de 2000, e providências vazias: a interface bloqueia com mensagem clara e nada é enviado (Tasks 5 e 6).
- Resolver caso já resolvido (409), revisar recorrência sem pendência (409), sessão perdida no meio (401): mensagens amigáveis e estado coerente (Tasks 5 e 6).
- Caso reaberto com recorrência pendente: o alerta continua visível e a revisão funciona (Task 6).
- Estados vazio, carregando e erro em cada tela; teclado e leitor de tela nas abas e formulários (Tasks 3 a 6).

---

### Task 1: Vocabulário da v2 em `api.ts`, `rotulos.tsx` e utilitário de testes

**Files:**
- Modify: `frontend/src/shared/api.ts`, `frontend/src/coord/rotulos.tsx`
- Create: `frontend/src/coord/testes/servidor.ts`
- Modify: `frontend/src/shared/api.test.ts`; `frontend/src/coord/portal.test.tsx` e `polimento.test.tsx` (apenas passam a importar o utilitário; os testes que dependem da UI antiga ficam marcados `it.skip` com o comentário `// refeito na Task N` e são refeitos na task dona da tela)
- Test: `frontend/src/shared/api.test.ts`, `frontend/src/coord/rotulos.test.tsx`

**Interfaces:**
- Produces em `api.ts`: tipos `Prioridade`, `StatusCaso`, `Desfecho`, `Situacao`; `CasoFila` (`id, tipo, prioridade, pontos, status, em_andamento, anonimo, simulacao, resumo, motivos: string[], recorrencia_pendente: boolean, ultimo_acesso_por: string | null, ultimo_acesso_em: string | null, criado_em, atualizado_em`); `Resumo` (`{status: Record<StatusCaso, number>, prioridade: Record<Prioridade, number>, recorrencia_pendente: number}`); `CasoDetalhe` com os campos do contrato (inclui `prioridade_original`, `recorrencia_pendente`, `ultimo_acesso: {por: string | null, em: string} | null`, `resolucoes`, `situacoes`, `revisoes_recorrencia`, mensagens com `usuario`); `FiltrosFila = {status: string, prioridade: string, tipo: string, q: string}`; funções `listarCasos(filtros: FiltrosFila, sinal?: AbortSignal): Promise<CasoFila[]>`, `obterResumo(sinal?): Promise<Resumo>`, `mudarStatus(id: number, status: 'novo' | 'em_investigacao')`, `mudarPrioridade(id: number, prioridade: Prioridade, justificativa: string)`, `registrarResolucao(id: number, dados: {desfecho: Desfecho, providencias: string, resultado: string})`, `revisarRecorrencia(id: number)`. `mudarGravidade` é removida.
- Produces em `rotulos.tsx`: `STATUS`, `PRIORIDADES` (ordem crítica, alta, média, baixa), `DESFECHOS`, `rotuloStatus`, `rotuloPrioridade`, `rotuloDesfecho`, `status(v)`, `prioridade(v)`, `motivo(texto)`, `descricaoEvento(ev)`, componentes `Prioridade({valor})` e `Status({valor})`, `acessoLegivel(por: string | null, em: string | null): string`.
- Produces em `testes/servidor.ts`: `servidor(rotas)`, `chamadas()`, `chamadasA(metodo, caminho)` e os tipos `Rota`/`Resposta` (extraídos de `portal.test.tsx`, comportamento idêntico).

- [ ] **Step 1: Testes que falham.** `rotulos.test.tsx`: `status('em_analise')`, `status('aguardando_aluno')` e `status('encaminhado')` devolvem `"Em investigação"` (tolerância a dados antigos); `status('resolvido')` é `"Resolvido"`; `prioridade('critica')` é `"Crítica"`; `motivo('alerta: ameaca com violencia em andamento')` é `"Alerta: ameaça com violência em andamento"`, `motivo('alerta: risco de automutilacao em andamento')` é `"Alerta: risco de automutilação em andamento"`, `motivo('alerta: conteudo intimo com extorsao')` é `"Alerta: conteúdo íntimo com extorsão"`; `descricaoEvento` cobre `criado` (`prioridade alta` → "Caso recebido com prioridade alta"; detalhe antigo `gravidade alta` também), `status` (`status: novo -> em_investigacao` → "Status mudou de Novo para Em investigação por Ana"), `prioridade` (`media -> critica: motivo X` → "Prioridade mudou de Média para Crítica por Ana. Motivo: motivo X"), `resolucao` ("Caso resolvido por Ana: situação solucionada" / "intervenção realizada"), `recorrencia` ("O aluno informou que a situação voltou a acontecer"), `revisao_recorrencia`, o tipo antigo `gravidade` (tratado como `prioridade`), e um tipo desconhecido (não lança; devolve texto genérico). `acessoLegivel(null, null)` é `"Ainda não acessado"`; com valores devolve `"Ana, <data legível>"`. `api.test.ts`: `listarCasos` monta a query só com filtros preenchidos e `q` codificado (`q=100%25`); `mudarPrioridade` posta `{prioridade, justificativa}` em `/api/casos/7/prioridade`; `registrarResolucao` e `revisarRecorrencia` (corpo `{}`) usam as rotas do contrato.
- [ ] **Step 2:** Rodar `rotulos.test.tsx` e `api.test.ts`; esperado: FAIL.
- [ ] **Step 3: Implementar** os tipos, funções e rótulos acima; criar `testes/servidor.ts` movendo os helpers existentes; ajustar os imports dos testes antigos. As formas de `Prioridade` são: crítica octógono com "!", alta triângulo, média losango, baixa círculo (SVG `aria-hidden`, texto sempre ao lado).
- [ ] **Step 4:** `npx tsc --noEmit` e os testes dos três arquivos; esperado: PASS (os componentes antigos que usam `gravidade` serão trocados nas tasks seguintes: até lá `tsc` pode falhar só nesses arquivos; aceite ou ajuste mínimo para compilar, registrando no relatório).
- [ ] **Step 5: Commit** `git commit -m "Vocabulario da v2 A no cliente da API e nos rotulos"`.

---

### Task 2: Tema acolhedor, casca com navegação lateral e contraste

**Files:**
- Modify: `frontend/src/coord/coord.css`, `frontend/src/coord/App.tsx`, `frontend/src/coord/main.tsx` (se precisar importar a fonte), `frontend/verificacao/contraste.mjs`
- Create: `frontend/src/coord/Navegacao.tsx`
- Test: `frontend/src/coord/App.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`Usuario.papel`, rótulos).
- Produces: `type Tela = {nome: 'geral'} | {nome: 'casos'} | {nome: 'pos'} | {nome: 'caso', id: number} | {nome: 'usuarios'} | {nome: 'ensaio'}`; endereços: `#casos`, `#pos-resolucao`, `#caso-<1 a 9 dígitos>`, `#usuarios`, `#ensaio`; sem hash ou hash desconhecido = `geral`. `Navegacao({tela, admin, pendencias, aoIr})` (barra lateral). `App` mantém `filtros: FiltrosFila` e os repassa às telas; callbacks `ir(tela)` e `verCasos(parcial: Partial<FiltrosFila>)` (vai para `casos` com os filtros). O wrapper raiz tem a classe `coord-app`.

- [ ] **Step 1: Testes que falham** (`App.test.tsx`, com `servidor`): sem sessão mostra o Login (comportamento já existente continua); logado como admin mostra na navegação "Visão geral", "Casos", "Pós-resolução", "Usuários", "Ensaio" e o nome da pessoa e "Sair"; como coordenador não mostra "Usuários"; `#casos` abre Casos; `#pos-resolucao` abre Pós-resolução; `#caso-12` abre o detalhe 12; hash desconhecido abre Visão geral; item atual tem `aria-current="page"`; o link "Pular para o conteúdo" leva o foco ao `main`; o rótulo "Responsabilidade compartilhada" aparece no topo; a navegação tem o contador de pendências de recorrência ao lado de "Pós-resolução" (do `recorrencia_pendente` de `/api/resumo`) e o contador tem texto acessível ("2 pendentes").
- [ ] **Step 2:** Rodar `App.test.tsx`; esperado: FAIL.
- [ ] **Step 3: Implementar.** Em `coord.css`, o bloco `.coord-app` redefine os tokens de `shared/tema.css` com a paleta de `revisao.css` (claro: fundo `#f7f7f2`, superfície `#fffefa`, texto `#273d36`, secundário `#5d6b61`, linha `#dce2d8`, primária `#356450`, suave `#e7eedf`, foco `#92732e`; prioridades: crítica `#983c3b` sobre `#f9e5e2`, alta `#8c531f` sobre `#fbecd5`, média `#665a27` sobre `#f2efd8`, baixa `#426659` sobre `#e7eee8`; recorrência `#684128` sobre `#fcf0e6`) e define o escuro correspondente em `@media (prefers-color-scheme: dark)` (a mesma lógica de `tema.css`), mais o layout de duas colunas (barra lateral de 242 px, colapsando para barra superior rolável abaixo de 760 px) e os selos de prioridade/status com forma. Em `contraste.mjs`, ler também o bloco `.coord-app` (claro e escuro) e incluir os pares novos (texto/fundo de cada prioridade, recorrência, primária sobre suave, foco sobre superfície); `npm run contraste` precisa sair 0. Em `App.tsx`, trocar o cabeçalho horizontal por `Navegacao` e o novo `Tela`; manter o comportamento de sessão (verificando, perdida, Login, Setup) e o foco no `main` ao trocar de tela. Telas ainda não refeitas (Visão geral, Casos, Pós-resolução) podem renderizar a `Fila` atual temporariamente, com um comentário `// substituída na Task N`.
- [ ] **Step 4:** Rodar `App.test.tsx`, `npm run contraste`, `npx tsc --noEmit`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Tema acolhedor e navegacao lateral da coordenacao"`.

---

### Task 3: Visão geral

**Files:**
- Create: `frontend/src/coord/Geral.tsx`
- Modify: `frontend/src/coord/App.tsx` (rota `geral`), `frontend/src/coord/coord.css`
- Test: `frontend/src/coord/Geral.test.tsx`

**Interfaces:**
- Consumes: `obterResumo`, `listarCasos`, `Prioridade`/`Status` (Task 1); `verCasos`/`ir` (Task 2).
- Produces: `Geral({aoVerCasos: (parcial: Partial<FiltrosFila>) => void, aoAbrirCaso: (id: number) => void})`.

- [ ] **Step 1: Testes que falham**: título "Cada pedido merece atenção." (h1 com foco gerenciado); três cartões "Aguardando o primeiro olhar" (novos), "Investigação em andamento" e "Resolvidos" mostram os números de `/api/resumo`; clicar em um cartão chama `aoVerCasos({status})` com o status certo; quatro contadores por prioridade (Crítica, Alta, Média, Baixa) com texto e forma, e os de Crítica e Alta aparecem em destaque quando maiores que zero; com `recorrencia_pendente > 0` aparece o bloco "Um cuidado precisa ser retomado" com o número do primeiro caso pendente (buscado na fila) e o botão "Abrir caso N" que chama `aoAbrirCaso(N)`; sem pendência o bloco não existe; lista "Onde concentrar a atenção" com até 5 casos não resolvidos mais urgentes (a ordem da API) e cada linha abre o caso; estados carregando, erro (`role="alert"`, com nova tentativa automática a cada 8 s) e fila vazia ("Nenhum pedido por enquanto."); atualiza sozinha a cada 8 s e ao voltar à aba (mesma regra da fila atual).
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar** `Geral.tsx` com duas buscas em paralelo (`obterResumo`, `listarCasos` sem filtros) e o polling cancelável por `AbortController`, como em `Fila.tsx`. A cópia é acolhedora e curta.
- [ ] **Step 4:** Rodar `Geral.test.tsx` e `App.test.tsx`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Visao geral da coordenacao"`.

---

### Task 4: Casos e Pós-resolução (fila com busca e filtros)

**Files:**
- Modify: `frontend/src/coord/Fila.tsx` (reescrita), `frontend/src/coord/App.tsx`, `frontend/src/coord/coord.css`
- Test: `frontend/src/coord/Fila.test.tsx` (substitui os testes da fila antiga em `portal.test.tsx`)

**Interfaces:**
- Consumes: `FiltrosFila`, `listarCasos` (Task 1); `Tela`, `filtros` (Task 2).
- Produces: `Fila({modo: 'casos' | 'pos', filtros: FiltrosFila, aoFiltrar: (f: FiltrosFila) => void, aoAbrir: (id: number) => void})`. No modo `pos` o filtro `status` é fixo em `resolvido` e o seletor de status não aparece; os casos com `recorrencia_pendente` aparecem primeiro.

- [ ] **Step 1: Testes que falham**: tabela com colunas "Caso e situação" (tipo, resumo e, em segunda linha, "Por que: <primeiro motivo>"), "Prioridade", "Status", "Último acesso" (`acessoLegivel`; "Ainda não acessado") e a ação de abrir; chip "Voltou a acontecer" nos casos com `recorrencia_pendente`; selo "Ocorrendo agora" e "simulação" mantidos; campo de busca "Buscar por assunto ou número do caso" com `maxLength=100`, que só consulta 300 ms depois de parar de digitar (teste com timers falsos: duas teclas seguidas geram uma chamada com `q` completo; `q=100%` vai codificado); filtros Status, Prioridade e Tipo enviam a query certa; "Limpar filtros" restaura tudo; estados carregando, vazio ("Nenhum caso na fila."), sem resultados ("Nenhum caso com esses filtros.") e erro (`role="alert"` e nova tentativa em 8 s); anúncio `aria-live` quando chegam casos novos (comportamento atual preservado); modo `pos`: título "O cuidado continua.", só resolvidos, recorrência primeiro (ordenação estável por `recorrencia_pendente` mantendo a ordem da API); linha inteira clicável e acessível por teclado (botão), com nome "Caso N. Abrir.".
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar.** Reaproveitar o polling e o cancelamento atuais; `q` com debounce; ordenação do cliente só reforça a ordem crítica, alta, média, baixa sem reordenar dentro da mesma prioridade (a API já entrega do mais antigo ao mais novo).
- [ ] **Step 4:** Rodar `Fila.test.tsx`, `App.test.tsx`, `Geral.test.tsx`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Casos com busca, filtros, prioridade e ultimo acesso"`.

---

### Task 5: Detalhe do caso, status e reavaliação de prioridade

**Files:**
- Modify: `frontend/src/coord/Caso.tsx`, `frontend/src/coord/coord.css`
- Create: `frontend/src/coord/Anexos.tsx` (extraído de `Caso.tsx`, sem mudar o comportamento), `frontend/src/coord/Conversa.tsx` (extraído, idem), `frontend/src/coord/ReavaliarPrioridade.tsx`
- Test: `frontend/src/coord/Caso.test.tsx`, `frontend/src/coord/ReavaliarPrioridade.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`detalheCaso`, `mudarStatus`, `mudarPrioridade`, rótulos), Task 2 (`Tela`).
- Produces: `Anexos({caso, anexoInicial?, imagemPrevia?})`, `Conversa({...})` com as mesmas propriedades de hoje; `ReavaliarPrioridade({atual: Prioridade, aoConfirmar: (nova: Prioridade, justificativa: string) => Promise<void>, ocupado: boolean})`; `Caso({id, aoVoltar, abaInicial?, anexoInicial?, imagemPrevia?})` com a mesma assinatura de hoje (as abas e blocos novos entram na Task 6).

- [ ] **Step 1: Testes que falham** (`Caso.test.tsx`): cabeçalho "Caso N" com tipo, selo de prioridade, status, "Ocorrendo agora", anônimo/identificado; faixa de metadados com "Último acesso" mostrando o acesso anterior de `ultimo_acesso` (ou "Ainda não acessado"); seletor de status só com "Novo" e "Em investigação" quando o caso não está resolvido, e o aviso "Para resolver, registre a resolução" no lugar do seletor quando está resolvido, com o botão "Reabrir para investigação" que chama `mudarStatus(id, 'em_investigacao')`; painel lateral "Por que esta prioridade?" com os `motivos` (via `motivo()`), a prioridade atual e, se `prioridade_original` for diferente, a linha "Classificação original: Alta"; carregando e erro de carga com "Voltar aos casos"; sessão perdida (401) não mostra erro (volta ao Login pelo `App`). `ReavaliarPrioridade.test.tsx`: botão "Reavaliar prioridade" abre o formulário com seletor de nova prioridade (as 4) e campo "Justificativa" (obrigatória, `maxLength=2000`, contador "N de 2000"); enviar com justificativa vazia ou só espaços mostra "Escreva de 1 a 2000 caracteres." e não chama `aoConfirmar`; escolher a mesma prioridade atual desabilita "Confirmar"; sucesso chama `aoConfirmar(nova, justificativa.trim())`, fecha o formulário e devolve o foco ao botão que o abriu; durante o envio os controles ficam desabilitados; "Cancelar" e Escape fecham sem enviar. No `Caso`: após confirmar, o detalhe é recarregado e o aviso "Prioridade alterada para Crítica." aparece em região `aria-live`; erro 400/404 mostra mensagem amigável via `mensagemErroCoord` sem perder o texto digitado.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar.** Extrair `Anexos` e `Conversa` primeiro (os testes antigos de anexos e abas continuam verdes, migrados para `Caso.test.tsx`), depois o cabeçalho, os metadados, o seletor de status, o painel lateral e `ReavaliarPrioridade`. O layout segue `revisao.css` (`case-grid` com painel lateral de 270 px que sobe para o topo abaixo de 1100 px).
- [ ] **Step 4:** Rodar `Caso.test.tsx`, `ReavaliarPrioridade.test.tsx` e `npx tsc --noEmit`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Detalhe do caso com status e reavaliacao justificada da prioridade"`.

---

### Task 6: Resolução, pós-resolução e abas do caso

**Files:**
- Modify: `frontend/src/coord/Caso.tsx`, `frontend/src/coord/coord.css`
- Create: `frontend/src/coord/RegistrarResolucao.tsx`, `frontend/src/coord/PosResolucao.tsx`
- Test: `frontend/src/coord/RegistrarResolucao.test.tsx`, `frontend/src/coord/PosResolucao.test.tsx`, `frontend/src/coord/Caso.test.tsx` (acréscimos)

**Interfaces:**
- Consumes: Tasks 1 e 5.
- Produces: `RegistrarResolucao({aoConfirmar: (dados: {desfecho: Desfecho, providencias: string, resultado: string}) => Promise<void>, ocupado: boolean})`; `PosResolucao({caso: CasoDetalhe, aoRevisar: () => Promise<void>, ocupado: boolean})`. O `Caso` passa a ter as abas "Relato e investigação", "Conversa", "Notas internas" e "Histórico" (padrão: a primeira) com teclado (setas, Home, End) e `role="tablist"`.

- [ ] **Step 1: Testes que falham**: `RegistrarResolucao`: aparece em "Registrar resolução" só quando o caso não está resolvido; opções de desfecho em grupo de rádio "Situação solucionada" e "Intervenção realizada" (nenhuma pré-selecionada); campos "Providências" (obrigatório, até 2000) e "Resultado observado" (opcional, até 2000), ambos com a dica "Visível para o aluno"; a autoria é mostrada como "Registrado automaticamente com o seu nome e a data de hoje"; enviar sem desfecho ou sem providências mostra a mensagem do campo e não envia; sucesso chama `registrarResolucao` com textos aparados e o `Caso` recarrega, mostra "Caso resolvido." e o foco vai para o título; resposta 409 mostra "Este caso já foi resolvido. Recarregue para ver o registro." e recarrega o caso; erro 400 mantém o texto. `PosResolucao`: com `recorrencia_pendente` mostra o alerta "Situação voltou a acontecer" (`role="alert"` na primeira exibição, ícone e texto, não só cor) com a orientação "Revise o resultado da intervenção anterior e avalie medidas mais efetivas" e o botão "Registrar revisão" (chama `aoRevisar`; 409 vira "Esta recorrência já foi revisada." e recarrega); sem pendência não há alerta; lista a resolução mais recente (desfecho, providências, resultado, quem registrou e quando) e o histórico de `situacoes` ("Melhorou" / "Voltou a acontecer" com data) e de `revisoes_recorrencia` (quem revisou e quando); com o caso reaberto e recorrência ainda pendente o alerta continua e a revisão funciona. `Caso`: abas com setas/Home/End movem o foco e a seleção; "Relato e investigação" mostra relato, quando/onde, anexos, motivos e respostas; "Conversa" mostra as mensagens com o nome da pessoa da coordenação (quando houver) e o formulário "Mensagem ao aluno"; "Notas internas" com a dica "Só a coordenação vê"; "Histórico" mostra os eventos com autoria via `descricaoEvento`, inclusive eventos antigos da v1 sem quebrar; o bloco de pós-resolução aparece quando o caso está resolvido ou tem recorrência pendente.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar** os dois componentes e as abas; reaproveitar `agir()` do `Caso` (trava de reentrada, recarga e `aria-live`) para as ações novas.
- [ ] **Step 4:** Rodar os três arquivos de teste e `npx tsc --noEmit`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Resolucao do caso, pos-resolucao e revisao de recorrencia"`.

---

### Task 7: Usuários, Ensaio, Login e Setup no tema novo; prévia e documentação

**Files:**
- Modify: `frontend/src/coord/Usuarios.tsx`, `Ensaio.tsx`, `Login.tsx`, `Setup.tsx` (somente marcação/classes se o tema exigir), `frontend/src/coord/coord.css`, `frontend/src/preview/dados.ts`, `frontend/README.md`, `frontend/docs/MAPA-INTERFACES.md`
- Test: `frontend/src/coord/portal.test.tsx` e `polimento.test.tsx` (reativar e adaptar os testes marcados `it.skip` na Task 1 para Usuários, Ensaio, Login e Setup)

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: nenhuma nova; `preview/dados.ts` passa a servir os formatos da v2 (fila com `motivos`, `recorrencia_pendente`, `ultimo_acesso_*`; detalhe com `resolucoes`, `situacoes`, `revisoes_recorrencia`) para `interfaces.html`.

- [ ] **Step 1: Testes que falham/ajustes:** Usuários mostra o papel de cada pessoa ("Administrador" / "Coordenação") e continua com criar e desativar; Ensaio mantém carga e remoção com confirmação; Login e Setup renderizam dentro do tema (classe `coord-app` no raiz da página, título, foco e rótulos como hoje); nenhum teste ativo fica `it.skip` ao fim da task.
- [ ] **Step 2:** Rodar `portal.test.tsx` e `polimento.test.tsx`; esperado: FAIL nos adaptados.
- [ ] **Step 3: Implementar** os ajustes mínimos de marcação para o tema, atualizar `preview/dados.ts` (que precisa compilar com os tipos novos) e a documentação do front (README e MAPA: novas telas, endereços `#casos`, `#pos-resolucao`, `#caso-ID`, e a lista de dependências de API).
- [ ] **Step 4:** Rodar toda a suíte do portal (`npx vitest run --config vite.coord.config.ts`) e `npx tsc --noEmit`; esperado: PASS, sem `it.skip`.
- [ ] **Step 5: Commit** `git commit -m "Usuarios, ensaio, entrada e documentacao no tema novo"`.

---

### Task 8: Fechamento, verificação em Chrome real e Setup

**Files:**
- Modify: `frontend/verificacao/coordenacao.mjs` (percurso novo), `frontend/README.md`
- Test: suíte completa do front e do backend

- [ ] **Step 1:** Rodar uma vez, sem execuções paralelas: `cd frontend && npm test` (os dois portais), `npx tsc --noEmit`, `npm run contraste`, `npm run build:coord`; esperado: tudo verde e exit 0. A suíte do backend roda uma vez (`python -m pytest -q`) para provar que nada mudou.
- [ ] **Step 2:** Atualizar `verificacao/coordenacao.mjs` para o percurso novo (Visão geral, Casos com busca e filtro, caso crítico, reavaliação de prioridade com justificativa, registro de resolução, reabertura, pós-resolução com recorrência e revisão, Usuários como admin) e rodá-lo em Chrome real contra um servidor local de verdade (`backend` em porta livre, `--data-dir` temporário, conta de teste criada pelo primeiro acesso, casos criados pela API do aluno e pela simulação; apagar o diretório temporário depois), nos tamanhos 375, 768 e 1280 e nos temas claro e escuro, sem violações de CSP e sem erros de console. Guardar as capturas em `verificacao/capturas/` (git-ignorado).
- [ ] **Step 3:** Corrigir o que a verificação mostrar (overflow horizontal, foco perdido, contraste), com teste quando for comportamento; repetir o Step 1 nos arquivos tocados.
- [ ] **Step 4:** Rodar `installer\build.ps1` (gera o Setup com backend v2 A e front novo), conferir que `dist\SegurancaIntegral-Setup.exe` é novo e que o executável sobe: não instalar (exige administrador).
- [ ] **Step 5: Commit** `git commit -m "Verificacao em navegador real e fechamento do front da coordenacao"`; atualizar a memória do projeto com o estado.
