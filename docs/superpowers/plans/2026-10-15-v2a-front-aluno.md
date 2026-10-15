# v2 A Front do Aluno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o portal do aluno (porta 3000) à direção visual aprovada (jovem e expressiva, ameixa e pêssego) e ao fluxo da v2 A: pedido de ajuda com situações e desdobramentos, acompanhamento em 3 estados, resolução visível e área pós-resolução ("melhorou" ou "voltou a acontecer"), mais os itens de privacidade já pedidos.

**Architecture:** O portal continua React + Vite + TypeScript em `frontend/src/aluno`. O visual novo entra como tema escopado em `.aluno-app` (arquivo novo `aluno.css`) que redefine os tokens de `shared/tema.css`; o portal da coordenação e `tema.css` não mudam. O conteúdo das situações e opções vive num módulo de dados (`situacoes.ts`) com a função que compõe o relato. As telas continuam componentes pequenos testados com `fetch` simulado.

**Tech Stack:** React 18, Vite, TypeScript, Vitest + Testing Library (jsdom), Playwright (Chrome real). Sem dependência nova; fonte Atkinson Hyperlegible já empacotada.

**Spec:** `docs/superpowers/specs/2026-10-15-v2a-fluxo-de-investigacao-design.md` (seções "Front do aluno", "API (portal do aluno)", "Erros e segurança"). Contrato: `docs/v2-requisitos-do-front.md`, seção "Contrato final da API v2 A" (o contrato vence). Referência visual e de conteúdo aprovada (somente leitura, nada é escrito lá): `D:\Prototipo Segurança Integral front\src\revisao-aluno\main.tsx` e `aluno.css`, e `docs\DEFINICOES.md` da mesma pasta.

## Global Constraints

- Português do Brasil, tom próximo e acolhedor, sem infantilizar (público de 15 a 21 anos). Texto novo sem travessão longo (nenhum "—" nem "–").
- Sem estilos ou scripts inline, sem CDN (CSP do portal). Fonte `@fontsource/atkinson-hyperlegible` (400 e 700).
- Acessibilidade: texto com contraste de pelo menos 4,5:1; bordas, ícones e foco com 3:1; status e escolhas nunca só por cor; foco visível; alvo de toque de pelo menos 44 px; `prefers-reduced-motion` respeitado; temas claro e escuro; uso no celular e no computador.
- Verificação em Chrome real em 375, 768 e 1280 e nos temas claro e escuro.
- Privacidade: o código de acompanhamento nunca vai para URL, `localStorage` nem `sessionStorage`; o aluno não vê prioridade, autoria da equipe nem notas (o backend não envia; a UI não inventa). Textos escritos pela equipe (`providencias`, `resultado`) são renderizados como texto, nunca como HTML.
- Valores fixos: status `novo`, `em_investigacao`, `resolvido`; situação do aluno `melhorou` ou `voltou`; `tipo` do pedido `cyberbullying`, `ameaca`, `vazamento`, `golpe`, `perfil_falso`, `aliciamento`, `outro`.
- Desdobramentos (opções marcadas) entram no texto do relato, em bloco `Situações marcadas:` seguido de uma linha `- <opção>` por opção, depois do texto do aluno e de uma linha em branco; o relato final tem de ter de 10 a 5000 caracteres.
- Aliciamento permanece como sexta situação (decisão do usuário em 15/10/2026), sem desdobramentos aprovados.
- Rascunho: expira em 24 horas (guarda `salvoEm`), chave `si-aluno-rascunho-v2`; a chave antiga `si-aluno-rascunho-v1` é apagada ao abrir. Não guarda código, imagens nem conversa.
- Consentimento: acrescentar o aviso "Para anonimato total, use dados móveis (4G), não o Wi-Fi da escola; o horário do envio pode ser cruzado com os registros de rede da escola."
- Não alterar `frontend/src/coord`, `frontend/src/shared/tema.css` nem o backend. Commits em português, terminados com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; sem push.
- Copy: aplicar a skill `antislop` (núcleo) e registrar no relatório que foi aplicada; a direção visual já está decidida, então `impeccable` só em dúvida de polimento.
- Testes: uma execução por vez, `cd frontend && npx vitest run --config vite.aluno.config.ts <arquivos>`; conferir o código de saída (sem `| tail`).

## Review Focus

- Rascunho antigo (chave v1), expirado, adulterado, com JSON inválido ou com armazenamento bloqueado: a tela abre vazia e sem erro (Tasks 1 e 4).
- Opções marcadas somadas ao relato passando de 5000 caracteres, e voltar e avançar entre passos sem duplicar o bloco `Situações marcadas:` (Task 4).
- Girar imagem de GIF, de arquivo corrompido ou com canvas indisponível; imagem que passa de 5 MB depois de girar: mensagem clara e a original continua anexada (Task 5).
- Marcar "voltou" duas vezes, "melhorou" depois de "voltou", resposta 409 (caso não resolvido), 404 e 429: mensagens definidas e estado coerente (Task 6).
- Texto das providências com marcação HTML: aparece como texto (Task 6).
- Reabertura do caso pelo backend: a área pós-resolução some e a resolução antiga não aparece (Task 6).
- As opções marcadas não distorcem a triagem: nenhum texto de opção eleva a prioridade sozinho (Task 7, com o backend real).

---

### Task 1: Cliente da API, vocabulário e conteúdo das situações

**Files:**
- Modify: `frontend/src/shared/api.ts` (somente a parte do aluno), `frontend/src/shared/api.test.ts`
- Create: `frontend/src/aluno/situacoes.ts`, `frontend/src/aluno/rotulos.ts`
- Test: `frontend/src/aluno/situacoes.test.ts`, `frontend/src/aluno/rotulos.test.ts`, `frontend/src/shared/api.test.ts`

**Interfaces:**
- Produces em `api.ts`: tipos `StatusAluno = 'novo' | 'em_investigacao' | 'resolvido'`, `Situacao = 'melhorou' | 'voltou'`, `ResolucaoAluno = {desfecho: 'solucionada' | 'intervencao_realizada', providencias: string, resultado: string, criado_em: string}`, `Caso = {status: StatusAluno, mensagens: Mensagem[], resolucao: ResolucaoAluno | null, pos_resolucao: boolean, ultima_situacao: Situacao | null}`; `enviarSituacao(codigo: string, situacao: Situacao): Promise<void>` (POST `/api/acompanhar/situacao` com `{codigo, situacao}` no corpo, nunca na URL); `mensagemErro` passa a tratar 409 (`"Esse caso ainda não foi resolvido."` para a rota de situação) sem mudar os textos atuais dos outros códigos.
- Produces em `situacoes.ts`: `type Situacao6 = {id: string, tipo: Tipo, nome: string, descricao: string, opcoes: string[]}`; `SITUACOES: Situacao6[]` (nesta ordem: Cyberbullying, Ameaças, Vazamento de conteúdo particular, Perfil falso ou página de fofoca, Golpe, Aliciamento, Outros), com nomes, descrições e as 5 opções aprovadas de cada uma das cinco primeiras copiados literalmente de `revisao-aluno/main.tsx` (Aliciamento e Outros têm `opcoes: []`; a descrição de Aliciamento é redigida na mesma voz: alguém tentando se aproximar de forma que incomoda ou assusta); `tipoDe(id: string): Tipo`; `comporRelato(texto: string, marcadas: string[]): string` (devolve `texto.trim()` quando não há marcadas; senão `texto.trim() + "\n\nSituações marcadas:\n" + marcadas.map(o => "- " + o).join("\n")`); `LIMITE_RELATO = 5000`.
- Produces em `rotulos.ts`: `rotuloStatus(v: string): string` (`novo` "Recebido", `em_investigacao` "Em investigação", `resolvido` "Resolvido"; valores antigos da v1 `em_analise`, `aguardando_aluno`, `encaminhado` viram "Em investigação"; desconhecido "Status indisponível"), `rotuloDesfecho(v)` ("Situação solucionada" / "Intervenção realizada"), `dataLegivel(v)`.

- [ ] **Step 1: Testes que falham.** `situacoes.test.ts`: são 7 situações na ordem acima; cada uma das cinco primeiras tem exatamente 5 opções não vazias; Aliciamento e Outros têm 0; `tipoDe` mapeia cada id ao `tipo` do backend (Cyberbullying→`cyberbullying`, Ameaças→`ameaca`, Vazamento→`vazamento`, Perfil falso→`perfil_falso`, Golpe→`golpe`, Aliciamento→`aliciamento`, Outros→`outro`); nenhum texto de `SITUACOES` contém travessão longo; `comporRelato('  oi  ', [])` é `'oi'`; com duas marcadas é `'oi\n\nSituações marcadas:\n- A\n- B'`; chamar `comporRelato` duas vezes sobre o mesmo texto base dá o mesmo resultado (sem acumular bloco). `rotulos.test.ts`: todos os mapeamentos acima, inclusive os legados e o desconhecido; `dataLegivel('lixo')` é `'Data indisponível'`. `api.test.ts`: `enviarSituacao('abcd-1234', 'voltou')` faz POST em `/api/acompanhar/situacao` com `Content-Type: application/json`, corpo `{codigo, situacao}`, e a URL não contém o código; 409 vira mensagem amigável; as outras funções do aluno seguem iguais.
- [ ] **Step 2:** Rodar os três arquivos; esperado: FAIL.
- [ ] **Step 3: Implementar** os módulos e tipos conforme as interfaces. `Acompanhar.tsx` e outros componentes atuais que usam `Caso`/`status` podem ficar com adaptadores mínimos para compilar (serão refeitos nas Tasks 3 a 6), sem `it.skip` sem o comentário `// refeito na Task N`.
- [ ] **Step 4:** Rodar os três arquivos e `npx tsc --noEmit`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Vocabulario da v2 A e conteudo das situacoes no portal do aluno"`.

---

### Task 2: Tema ameixa e pêssego e casca do portal

**Files:**
- Create: `frontend/src/aluno/aluno.css`
- Modify: `frontend/src/aluno/App.tsx`, `frontend/src/aluno/main.tsx`, `frontend/verificacao/contraste.mjs`
- Test: `frontend/src/aluno/App.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: o raiz do `App` é `<div className="aluno-app">` em todas as telas; cabeçalho com a marca "Segurança Integral" (link para o início) e a navegação "Início", "Pedir ajuda", "Acompanhar" (botões; o atual tem `aria-current="page"`); rodapé "Um canal da escola para ouvir e cuidar."; o `Tela` atual (`inicio`, `denuncia`, `confirmacao`, `acompanhar`) e seus gatilhos não mudam; link "Pular para o conteúdo"; foco no `main` ao trocar de tela (a Denúncia continua focando o próprio título a cada passo).

- [ ] **Step 1: Testes que falham** (`App.test.tsx`): o raiz tem a classe `aluno-app`; cabeçalho com a marca e a navegação com os três itens e `aria-current` no item da tela atual; "Pedir ajuda" abre o pedido; "Acompanhar" abre a consulta de código; "Início" volta; durante o envio de um pedido a navegação fica desabilitada (comportamento atual de "Voltar ao início" preservado); rodapé presente; "Pular para o conteúdo" leva o foco ao `main`.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar.** `aluno.css` define `.aluno-app` redefinindo os tokens de `shared/tema.css` com a paleta da prévia (claro: fundo `#fff9f4`, superfície `#ffffff`, texto `#432741`, secundário `#725a6d`, primária `#71385e`, suave `#f1dfed`, linha `#e9d9df`, bilhete `#ffddd0`, foco `#9d6b22`) e o escuro correspondente em `@media (prefers-color-scheme: dark)`, mais layout (cabeçalho, bilhete, cartões de situação, rodapé) com `border-radius` e títulos marcantes como na prévia; breakpoints compatíveis com 375, 768 e 1280. O escuro redefine todo token que o claro redefine. `main.tsx` importa `./aluno.css` depois de `tema.css`. Em `contraste.mjs`, ler também o bloco `.aluno-app` (claro e escuro) e medir os pares novos (texto principal e secundário sobre fundo, superfície e suave; primária sobre suave; texto sobre primária; bilhete; foco); `npm run contraste` sai 0 e falha com mensagem clara se o marcador de fim de tokens sumir.
- [ ] **Step 4:** Rodar `App.test.tsx`, a suíte do aluno, `npm run contraste` e `npx tsc --noEmit`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Tema ameixa e pessego e casca do portal do aluno"`.

---

### Task 3: Início com apoio, consentimento e acompanhamento por código

**Files:**
- Modify: `frontend/src/aluno/Inicio.tsx`, `frontend/src/aluno/aluno.css`
- Test: `frontend/src/aluno/Inicio.test.tsx` (e ajustes em `portal.test.tsx`/`polimento.test.tsx`)

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `Inicio({onAjuda: () => void, onAcompanhar: (codigo: string) => void})` com a mesma assinatura de hoje.

- [ ] **Step 1: Testes que falham**: h1 acolhedor ("Você não precisa lidar com isso sozinho." ou equivalente na voz da prévia) e o bilhete "Não precisa ter as palavras certas."; botão "Preciso de ajuda" chama `onAjuda`; bloco "Já conversou com a gente?" com o campo "Acompanhar meu caso" que chama `onAcompanhar(codigo)` e mostra "Digite seu código para acompanhar." quando vazio; consentimento "Antes de contar" mantém o texto de hoje e ganha o aviso de dados móveis exato das Global Constraints; o texto sobre o rascunho passa a dizer "O texto do rascunho fica neste navegador por até 24 horas ou até o envio."; sem travessão longo; nomes acessíveis dos controles inalterados para os testes atuais.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar** o layout de boas-vindas da prévia (texto à esquerda, bilhete à direita em telas largas; empilhado em estreitas).
- [ ] **Step 4:** Rodar `Inicio.test.tsx` e a suíte do aluno; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Inicio do aluno com apoio, consentimento e aviso de dados moveis"`.

---

### Task 4: Pedido de ajuda em quatro passos, com desdobramentos e rascunho de 24 horas

**Files:**
- Modify: `frontend/src/aluno/Denuncia.tsx`, `frontend/src/aluno/aluno.css`
- Create: `frontend/src/aluno/rascunho.ts`
- Test: `frontend/src/aluno/rascunho.test.ts`, `frontend/src/aluno/Denuncia.test.tsx` (migrando os testes de pedido de `portal.test.tsx` e `polimento.test.tsx` sem enfraquecê-los)

**Interfaces:**
- Consumes: Task 1 (`SITUACOES`, `tipoDe`, `comporRelato`, `LIMITE_RELATO`).
- Produces em `rascunho.ts`: `type DadosRascunho = {situacaoId: string, marcadas: string[], relato: string, quando: string, onde: string, em_andamento: boolean, anonimo: boolean, nome: string, turma: string}`; `lerRascunho(agora?: number): DadosRascunho | null` (null se ausente, expirado há mais de 24 h, JSON inválido, formato inesperado ou armazenamento bloqueado; limita o tamanho dos textos; apaga a chave antiga `si-aluno-rascunho-v1` e as expiradas); `salvarRascunho(dados: DadosRascunho, agora?: number): boolean`; `apagarRascunho(): void`.
- `Denuncia({onEnviado, onEnviando, ...})` mantém as props atuais úteis aos testes; passos: 1 "Situação" (cartões com nome e descrição, uma escolha), 2 "Detalhes" (opções da situação em caixas de seleção, pelo menos uma; pulado para Aliciamento e Outros, e o botão Voltar do passo 3 volta ao 1 nesses casos), 3 "Relato" (relato, quando, onde, "Está acontecendo agora?"), 4 "Provas e identificação" (imagens, anônimo ou identificado). Ao enviar, o campo `tipo` vai com `tipoDe(situacaoId)` e o campo `relato` com `comporRelato(relato, marcadas)`.

- [ ] **Step 1: Testes que falham.** `rascunho.test.ts` (com relógio injetado): grava e lê de volta dentro de 24 h; com 24 h e 1 ms é `null` e a chave some; JSON inválido, objeto de outro formato e `localStorage` que lança são `null` sem exceção; a chave v1 é apagada; textos longos são cortados nos limites (relato 5000, quando/onde 200, nome 200, turma 50); `anonimo: true` zera nome e turma. `Denuncia.test.tsx`: os quatro passos e a barra de passos com `aria-current="step"`; passo 1 exige uma situação ("Escolha uma situação para continuar."); passo 2 exige ao menos uma opção ("Escolha pelo menos uma opção.") e não aparece para "Outros" nem "Aliciamento"; passo 3 exige de 10 a 5000 caracteres no relato final (texto mais o bloco das opções marcadas): relato curto → "Conte um pouco mais, com pelo menos 10 caracteres."; relato que passa de 5000 depois do bloco → mensagem que diz quantos caracteres sobram e não avança; o contador mostra o limite efetivo; voltar e avançar entre passos mantém as escolhas e NÃO duplica o bloco no envio; o FormData enviado tem `tipo` correto, `relato` composto (conferir o texto exato com o bloco `Situações marcadas:`), `anonimo`, e `nome`/`turma` vazios quando anônimo; os testes atuais de anexos (formato, 5 MB, 5 imagens, remover), nome obrigatório ao se identificar, falha de envio mantendo o relato, bloqueio dos controles durante o envio, "Limpar rascunho" e aviso de armazenamento bloqueado continuam valendo com asserções iguais; rascunho restaurado ao reabrir com a situação, as opções marcadas e o relato; rascunho expirado não é restaurado.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar** `rascunho.ts` e reescrever `Denuncia.tsx` nos quatro passos; foco no título do passo a cada mudança (como hoje); mensagens de erro em `role="alert"`; textos de ajuda acolhedores ("Um passo de cada vez."). O envio e a limpeza do rascunho após sucesso permanecem.
- [ ] **Step 4:** Rodar `rascunho.test.ts`, `Denuncia.test.tsx`, a suíte do aluno e `npx tsc --noEmit`; esperado: PASS, sem `it.skip` sem comentário.
- [ ] **Step 5: Commit** `git commit -m "Pedido de ajuda em quatro passos com desdobramentos e rascunho de 24 horas"`.

---

### Task 5: Girar imagem antes do envio

**Files:**
- Create: `frontend/src/aluno/girarImagem.ts`
- Modify: `frontend/src/aluno/Denuncia.tsx` (passo 4), `frontend/src/aluno/aluno.css`
- Test: `frontend/src/aluno/girarImagem.test.ts`, `frontend/src/aluno/Denuncia.test.tsx` (acréscimos)

**Interfaces:**
- Produces: `girarImagem(arquivo: File, graus: 90 | 180 | 270): Promise<File>` (decodifica com `createImageBitmap`, desenha num canvas girado e recodifica com `toBlob` no mesmo tipo, mantendo o nome; rejeita com `Error('girar-indisponivel')` quando o tipo é GIF, quando não há `createImageBitmap`/canvas, ou quando a decodificação falha; rejeita com `Error('girar-grande')` se o resultado passar de 5 MB). Cada anexo da prévia ganha o botão "Girar" (gira 90° no sentido horário a cada clique), com nome acessível "Girar <nome>"; no GIF o botão não aparece.

- [ ] **Step 1: Testes que falham**: `girarImagem.test.ts` com `createImageBitmap` e canvas simulados: 90° troca largura e altura do canvas; 180° mantém; devolve `File` com o mesmo `name` e `type`; GIF rejeita `girar-indisponivel` sem tocar no canvas; falha de decodificação rejeita `girar-indisponivel`; resultado acima de 5 MB rejeita `girar-grande`. `Denuncia.test.tsx`: o botão "Girar" aparece para PNG e JPEG e não para GIF; ao clicar, o arquivo enviado no FormData é o girado (o simulado); falha mostra "Não foi possível girar esta imagem. Ela continua anexada como estava." e mantém o original; `girar-grande` mostra "A imagem girada passa de 5 MB. Ela continua anexada como estava."; o botão fica desabilitado enquanto gira; remover continua funcionando.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar** o módulo (função pura, injetável nos testes pelo `globalThis`) e a integração no passo 4, liberando a `URL` antiga do arquivo substituído.
- [ ] **Step 4:** Rodar `girarImagem.test.ts`, `Denuncia.test.tsx` e a suíte do aluno; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Girar imagem antes do envio"`.

---

### Task 6: Confirmação, acompanhamento em três estados e pós-resolução

**Files:**
- Modify: `frontend/src/aluno/Confirmacao.tsx`, `frontend/src/aluno/Acompanhar.tsx`, `frontend/src/aluno/aluno.css`
- Create: `frontend/src/aluno/PosResolucao.tsx`
- Test: `frontend/src/aluno/Confirmacao.test.tsx`, `frontend/src/aluno/Acompanhar.test.tsx`, `frontend/src/aluno/PosResolucao.test.tsx` (migrando os testes atuais de acompanhamento sem enfraquecê-los)

**Interfaces:**
- Consumes: Task 1 (`Caso`, `enviarSituacao`, `rotuloStatus`, `rotuloDesfecho`).
- Produces: `PosResolucao({caso: Caso, aoInformar: (s: Situacao) => Promise<void>, ocupado: boolean})`.

- [ ] **Step 1: Testes que falham.** `Confirmacao`: "Você deu o primeiro passo." (ou equivalente na voz da prévia), código em destaque, "Copiar código" com sucesso/falha anunciados, imagens recusadas em `role="alert"`, "Acompanhar meu caso" chama `onAcompanhar`; o código aparece só nesta tela. `Acompanhar`: consulta por código (404 → "Não encontramos esse código..." via `mensagemErro`), indicador de 3 estados em linha do tempo acessível (Recebido, Em investigação, Resolvido) com o atual marcado por texto e `aria-current="step"`; conversa com "Você" e "Coordenação", "Atualizar conversa" e "Enviar resposta" (1 a 2000) como hoje; a conversa continua disponível com o caso resolvido; `status` legado (`em_analise`) mostra "Em investigação". `PosResolucao` (só quando `caso.pos_resolucao`): mostra "Seu caso foi resolvido" com o desfecho (`rotuloDesfecho`), as providências e o resultado como TEXTO (um valor com `<b>x</b>` aparece literal) e a data; pergunta "Como você está agora?" com os botões "Melhorou" e "Voltou a acontecer"; clicar chama `aoInformar` e mostra "Obrigado por contar. A equipe vai ver." ou, para "voltou", "Obrigado por contar. A equipe vai rever o que foi feito."; com `ultima_situacao` já preenchida mostra "Você informou: <rótulo>" e continua permitindo informar de novo; botões desabilitados durante o envio (sem duplo clique); 409 → "Esse caso ainda não foi resolvido." e recarrega; 429 → "Muitas tentativas. Tente de novo em alguns minutos."; falha de rede mantém a tela; depois de informar, o caso é recarregado e `ultima_situacao` reflete. Com `pos_resolucao: false` (inclusive caso reaberto, `resolucao: null`) o bloco não aparece.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3: Implementar** os componentes; o estado de erro e as mensagens usam `role="alert"`/`role="status"` como o restante; o foco vai ao título do bloco depois de informar.
- [ ] **Step 4:** Rodar os três arquivos, a suíte do aluno e `npx tsc --noEmit`; esperado: PASS.
- [ ] **Step 5: Commit** `git commit -m "Acompanhamento em tres estados e area pos-resolucao do aluno"`.

---

### Task 7: Fechamento, verificação em Chrome real e Setup

**Files:**
- Create: `frontend/verificacao/aluno.mjs` (percurso do aluno em navegador real)
- Modify: `frontend/README.md` (seção do portal do aluno), `frontend/docs/MAPA-INTERFACES.md` (fluxo e telas do aluno)
- Test: suítes completas

- [ ] **Step 1:** Rodar, uma de cada vez e conferindo o código de saída: `npx vitest run --config vite.aluno.config.ts`, `npx vitest run --config vite.coord.config.ts`, `npx tsc --noEmit`, `npm run contraste`, `npm run build:aluno`, `npm run build:coord`; e uma vez, sozinha, a suíte do backend (`python -m pytest -q`).
- [ ] **Step 2:** Escrever `verificacao/aluno.mjs` e rodar em Chrome real (Playwright, `channel: 'chrome'`) contra um servidor REAL de teste (pasta temporária própria, portas livres altas, `python backend/entrada.py --data-dir <pasta>`, administrador criado pelo primeiro acesso com senha de teste que nunca é impressa; limites de taxa podem ficar desligados no ensaio; apagar servidor e pasta ao final), em 375, 768 e 1280 e nos temas claro e escuro: início → pedido de ajuda completo (situação com desdobramentos, relato, imagem com "Girar", identificação anônima) → confirmação com código → acompanhar por código → conversa → (pela API da coordenação, resolver o caso) → área pós-resolução → "Voltou a acontecer" → a coordenação vê o alerta de recorrência. Em cada combinação: sem rolagem horizontal da página, sem violações de CSP, sem erros de console, foco visível, nada cortado em 375. Olhar as capturas (git-ignoradas) e corrigir defeitos visuais.
- [ ] **Step 3:** Triagem com o backend real: para cada uma das cinco situações com opções, enviar pelo `POST /api/denuncias` um pedido com um relato neutro de 20 caracteres e TODAS as opções da situação no bloco `Situações marcadas:`, e conferir pela API da coordenação que nenhum fica `critica` nem `alta` só pelas opções (registrar no relatório os motivos e a prioridade de cada um; se algum texto de opção disparar termo de risco, listar o termo e a opção, sem alterar o texto aprovado nem o backend: decisão do usuário).
- [ ] **Step 4:** Documentar o portal do aluno (README e MAPA: passos, telas, rascunho de 24 h, girar imagem, pós-resolução, privacidade do código). Rodar `installer\build.ps1 -SemTestes` (as suítes do Step 1 já rodaram; saída para arquivo em %TEMP% pelo `cmd.exe`) e conferir que `dist\SegurancaIntegral-Setup.exe` é novo (> 10 MB). Não instalar.
- [ ] **Step 5: Commit** `git commit -m "Verificacao em navegador real e fechamento do front do aluno"`; atualizar a memória do projeto com o estado.
