# v2 B: questionário adaptativo e triagem por respostas

Data: 15/10/2026. Origem: `docs/v2b-questionario-bifurcacoes-rascunho.md` (mapa de bifurcações), `DEFINICOES.md` da pasta do front e a conversa de 15/10/2026. Continua a spec da v2 A (`2026-10-15-v2a-fluxo-de-investigacao-design.md`), que já está entregue.

## Objetivo

Trocar os desdobramentos em texto (hoje o bloco "Situações marcadas:" dentro do relato) por um questionário que se ramifica conforme as respostas do aluno, guarda as respostas de forma estruturada, mostra-as organizadas por dimensão para a coordenação e passa a alimentar a triagem com pesos e alertas definidos pelo usuário. O aluno continua escrevendo o relato livre (mínimo de 10 caracteres próprios).

## Decisões já tomadas

- As 5 situações aprovadas mais "Outros" e **Aliciamento** (incluído pelo usuário em 15/10/2026) fazem parte do questionário.
- As 5 dimensões do aprofundamento: quando e se continua, frequência, quem teve acesso, consequências, risco agora. "Não sei" ou "Prefiro não dizer" onde fizer sentido. Nenhuma pergunta de aprofundamento é obrigatória.
- Seleção múltipla nas opções de cada situação.

## Fora do escopo

- Pesos, faixas e alertas definitivos: conteúdo do usuário. A v2 B entrega o mecanismo e o questionário; os valores nascem **zerados** (a triagem continua idêntica à da v2 A até o usuário preencher).
- Pergunta direta de risco para si mesmo e modo "testemunha" (ajudar outro aluno): decisões em aberto (ver o fim), desligadas por padrão.
- Texto da tela de apoio imediato e contatos de apoio (telefones, serviços): a escola fornece; sem eles a tela mostra só orientação para falar com a coordenação.
- LGPD, acompanhamento periódico automático.

## Arquitetura

### Definição do questionário (fonte única)

Arquivo versionado `backend/app/questionario.json`, validado na partida (o servidor recusa subir com definição inválida, com mensagem clara). Estrutura:

- `versao`: texto, por exemplo `2026-10-v1`.
- `dimensoes`: `quando`, `frequencia`, `alcance`, `consequencias`, `risco`, com o rótulo mostrado à coordenação.
- `situacoes`: `id`, `tipo` (um dos 7 tipos do backend), `nome`, `descricao`, `opcoes` (cada uma com `id`, `texto` literal e a lista de `perguntas` que abre).
- `perguntas`: `id`, `dimensao`, `texto`, `tipo` (`unica` ou `multipla`), `respostas` (`id`, `texto`, `nao_sei` opcional), `mostrar_se` (condição sobre respostas e opções marcadas) e `abre_de` (as perguntas "salto" de outra situação).
- `pesos` e `alertas`: por resposta e por combinação de respostas (ver Triagem). Entregues vazios.
- `faixas`: limiares de crítica, alta, média e baixa. Entregues com os valores atuais da v2 A.

O conteúdo inicial é gerado a partir do rascunho de bifurcações depois que o usuário o editar; os textos aprovados das opções ficam literais.

### Dados

- `casos.questionario_versao` (texto, nulo para casos anteriores).
- Tabela `respostas(id, caso_id, pergunta_id, resposta_id)` com `caso_id` em `ON DELETE CASCADE` e índice por caso. Opções marcadas ficam como respostas de pergunta sintética `opcao:<id>`.
- Casos antigos não têm respostas e continuam abrindo normalmente.
- Migração idempotente no `init_db`, sem tocar nos dados existentes, com a mesma prática de backup da v2 A só se alguma coluna de `casos` precisar mudar (a coluna nova é anulável, então o ensaio em cópia basta).

### API do aluno

- `GET /api/questionario`: devolve a definição **sem pesos, sem alertas e sem faixas** (o aluno não pode ver como a triagem decide, para não ser possível "dirigir" a prioridade). Cabeçalho de cache curto. Sem sessão, com o limitador `consultas`.
- `POST /api/denuncias` (multipart) ganha o campo opcional `respostas`: JSON com `{"versao": "...", "situacao": "<id>", "marcadas": ["<opcao-id>"], "respostas": {"<pergunta-id>": ["<resposta-id>"]}}`.
  - O servidor valida contra a definição **vigente**: situação existente e coerente com `tipo`; opções pertencentes à situação; só perguntas alcançáveis pelas opções marcadas e pelas respostas anteriores; respostas existentes da pergunta; `unica` com no máximo uma; no máximo 60 respostas no total; JSON até 8 KB. Qualquer violação responde 400 com mensagem fixa, sem gravar nada.
  - Versão diferente da vigente: aceita se todas as respostas ainda existem na versão vigente; senão 409 `questionario desatualizado` (o front recarrega o questionário e pede para revisar).
  - Sem `respostas`, o pedido segue como hoje (relato e tipo apenas).
  - O bloco "Situações marcadas:" deixa de ser gerado pelo front; o relato guarda só o texto do aluno.
- Nenhuma resposta guarda IP nem dado identificador; as perguntas são sobre a situação, não sobre o aluno.

### Triagem

`triage.classificar` passa a receber também as respostas validadas:

1. Pontos da v2 A (tipo, ocorrendo agora, termos de risco no relato) continuam iguais.
2. Soma dos `pesos` das respostas dadas (zero por padrão), com teto configurável por pergunta para uma resposta múltipla não dominar a soma.
3. Faixas de pontos definem baixa, média e alta como hoje.
4. **Alertas** (regras fixas sobre respostas ou combinações) elevam a crítica depois da soma e acrescentam o motivo legível; os três alertas por palavras da v2 A continuam valendo.
5. Cada resposta com peso diferente de zero e cada alerta entram em `motivos` com texto legível, por exemplo `resposta: Sabe onde eu moro (+3)`.

Sem pesos preenchidos o resultado é idêntico ao da v2 A (teste de equivalência obrigatório).

### API da coordenação

`GET /api/casos/<id>` passa a incluir `questionario` (nulo se o caso não tem respostas): `{versao, situacao: {id, nome}, marcadas: [{id, texto}], dimensoes: [{id, rotulo, itens: [{pergunta, respostas: [texto]}]}]}`, com os textos da versão em que foram respondidas (guardar o texto da definição no momento do envio não é necessário: a definição é versionada e o servidor guarda a versão; ao remover uma versão antiga o arquivo anterior é preservado em `questionario-historico/`). A fila continua com `motivos`.

### Front do aluno

O passo "Detalhes" vira um fluxo de perguntas encadeadas, uma pergunta por tela, com "Voltar" que mantém as respostas e "Não sei" onde existir; progresso anunciado ao leitor de tela; perguntas condicionais entram e saem sem apagar o que já foi respondido; mudar de situação descarta apenas as respostas da situação anterior. O relato livre segue no passo seguinte. Se `GET /api/questionario` falhar, o passo é pulado com aviso e o pedido segue só com situação e relato (o questionário nunca bloqueia o pedido de ajuda). Rascunho passa a guardar também as respostas (chave `si-aluno-rascunho-v3`, mesma regra de 24 horas e de não renovar ao reabrir). Uma resposta de risco agora "Não" ou "Quero falar com alguém hoje" mostra a tela de apoio imediato antes de continuar.

### Front da coordenação

No caso, uma seção "Respostas do aluno" (aba própria ou bloco no "Relato e investigação"), agrupada pelas 5 dimensões, com as opções marcadas no topo; as respostas que geraram motivo ficam destacadas junto de "Por que esta prioridade?". Casos sem respostas mostram "O aluno não respondeu ao questionário".

## Erros e segurança

- O aluno nunca recebe pesos, alertas, faixas nem a lógica de triagem.
- Validação estrita no servidor: o front só é conveniência. Nada vindo do cliente vira SQL ou HTML.
- Respostas são texto de uma lista fechada; o único texto livre continua sendo o relato.
- A definição é validada na partida e coberta por testes que garantem: ids únicos, toda pergunta alcançável por alguma opção, nenhum ciclo de `mostrar_se`, toda situação com `tipo` válido, toda `abre_de` apontando para pergunta existente, nenhum travessão longo nos textos.

## Entrega em planos

1. **Backend B1:** definição e validador, migração, endpoint do questionário, validação e gravação das respostas, motor de triagem com pesos e alertas (zerados), detalhe da coordenação.
2. **Conteúdo B2:** conversão do rascunho editado pelo usuário para `questionario.json` com revisão do usuário; preenchimento de pesos, alertas e faixas quando o usuário os definir.
3. **Front da coordenação B3:** seção "Respostas do aluno".
4. **Front do aluno B4:** fluxo encadeado, rascunho v3, tela de apoio imediato.

Cada plano termina com testes verdes, verificação em Chrome real (375, 768 e 1280, claro e escuro) e um Setup instalável.

## Testes

- Backend: definição válida e cada violação de integridade; validação do `POST` (cada caso de 400, 409, aceitação sem respostas, respostas de perguntas inalcançáveis, duplicadas, de outra situação); equivalência da triagem com pesos zerados; peso e alerta ligados em fixtures de teste (nunca na definição entregue); detalhe com e sem questionário; versão antiga.
- Front: fluxo encadeado com salto entre situações, voltar e mudar de situação, falha do questionário, rascunho v3, tela de apoio; coordenação com e sem respostas.

## Decisões em aberto (do usuário)

1. Edição do rascunho de perguntas e respostas (`docs/v2b-questionario-bifurcacoes-rascunho.md`).
2. Quais sinais **[ALERTA?]** viram alerta fixo, quais só somam pontos e quais saem; pesos de cada resposta; faixas.
3. Pergunta direta de risco para si mesmo (com revisão de profissional de psicologia do texto) e o que a tela de apoio mostra.
4. Modo testemunha ("vi acontecer com outra pessoa").
5. Contatos de apoio da escola (telefones e serviços) para a tela de apoio imediato.
