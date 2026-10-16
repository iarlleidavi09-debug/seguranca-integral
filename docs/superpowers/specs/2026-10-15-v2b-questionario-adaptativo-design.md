# v2 B: questionário adaptativo (versão de protótipo)

Data: 15/10/2026. Origem: `docs/v2b-questionario-bifurcacoes-rascunho.md` e a conversa de 15/10/2026. Continua a spec da v2 A, já entregue. Esta é a versão enxuta: o sistema é um protótipo para teste numa escola, em ambiente controlado.

## Auditoria da primeira versão (o que mudou)

A primeira versão desta spec tinha peso de produto: questionário versionado com histórico em pasta e resposta 409 de "desatualizado", tabela de respostas por linha, validação de alcance de cada pergunta, teto de peso por pergunta e quatro planos. Para um protótipo isso custa mais do que entrega. Cortado: versionamento e histórico (a definição é um arquivo só; mudar o arquivo muda os rótulos), tabela de respostas (vira uma coluna JSON), validação de alcance (basta validar ids), teto por pergunta e a divisão em quatro planos (agora são dois). Mantido por ser barato e importante: o aluno nunca recebe pesos nem alertas, o questionário nunca bloqueia o pedido de ajuda, e com pesos zerados a triagem fica idêntica à da v2 A.

## Objetivo

Trocar os desdobramentos em texto (bloco "Situações marcadas:" no relato) por perguntas que se ramificam, guardar as respostas no caso, mostrá-las organizadas à coordenação e deixar a triagem pronta para receber pesos e alertas que o usuário definir. O relato livre continua, com no mínimo 10 caracteres próprios.

## Decisões já tomadas

- As 5 situações aprovadas, "Outros" e **Aliciamento** (incluído pelo usuário).
- 5 dimensões: quando e se continua, frequência, quem teve acesso, consequências, risco agora; "Não sei" onde couber; aprofundamento nunca obrigatório.
- Seleção múltipla nas opções de cada situação.

## Fora do escopo

Pesos, faixas e alertas definitivos (conteúdo do usuário; nascem zerados). Pergunta direta de risco para si mesmo e modo testemunha (desligados). Contatos de apoio da escola. Versionamento do questionário, LGPD.

## Desenho

### Definição

Um arquivo `backend/app/questionario.json`, validado na partida (ids únicos, toda referência existe; falha com mensagem clara). Contém: `situacoes` (id, `tipo` do backend, nome, descrição, `opcoes` com id, texto literal e lista de `perguntas` que abre), `perguntas` (id, dimensão, texto, `unica` ou `multipla`, `respostas` com id e texto, `mostrar_se` simples: lista de ids de resposta que a ativam), `pesos` (id de resposta para número, vazio), `alertas` (lista de `{todas: [ids de resposta], motivo}`, vazia) e `faixas` (os limiares atuais).

### Dados

Coluna `casos.respostas_json` (texto, anulável) com `{"situacao": id, "marcadas": [ids], "respostas": {pergunta: [ids]}}`. Migração com `ALTER TABLE ... ADD COLUMN` no `init_db`, idempotente. Casos antigos ficam com nulo.

### API do aluno

- `GET /api/questionario`: a definição **sem** `pesos`, `alertas` e `faixas`; limitador `consultas`.
- `POST /api/denuncias` ganha o campo opcional `respostas` (JSON de até 8 KB). O servidor valida só isto: situação existente e coerente com `tipo`; opções pertencentes à situação; cada pergunta e resposta existe; `unica` com no máximo um valor; no máximo 150 ids. Violação responde 400 com mensagem fixa e não grava nada. Sem o campo, o pedido segue como hoje. O front deixa de gerar o bloco "Situações marcadas:".

### Triagem

`classificar` recebe também as respostas: a soma de pontos da v2 A fica igual, mais a soma dos `pesos` das respostas dadas (zero por padrão); as `faixas` definem baixa, média e alta; cada `alerta` cujas respostas todas foram dadas eleva a crítica e entra em `motivos`; resposta com peso diferente de zero também entra em `motivos`. Sem pesos nem alertas o resultado é idêntico ao da v2 A (teste obrigatório).

### Coordenação

`GET /api/casos/<id>` devolve `questionario`: nulo se o caso não tem respostas, senão `{situacao, marcadas: [texto], dimensoes: [{rotulo, itens: [{pergunta, respostas: [texto]}]}]}`, montado no momento da consulta a partir da definição atual (um id que não existir mais aparece como o próprio id). A tela do caso ganha o bloco "Respostas do aluno"; sem respostas mostra "O aluno não respondeu ao questionário".

### Aluno

O passo "Detalhes" vira perguntas encadeadas, uma por tela, com "Voltar" que mantém as respostas e "Não sei" onde existir; mudar de situação descarta só as respostas da anterior. Se `GET /api/questionario` falhar, o passo é pulado com um aviso e o pedido segue só com situação e relato. O rascunho (24 horas, sem renovar ao reabrir) passa a guardar também as respostas. Resposta de risco agora "Não" ou "Quero falar com alguém hoje" mostra uma tela simples de orientação para falar com a coordenação.

## Segurança

O aluno nunca recebe pesos, alertas nem faixas. A validação é no servidor. Respostas são ids de lista fechada; o único texto livre continua sendo o relato. Nada do cliente vira SQL ou HTML.

## Entrega

1. **Plano 1, backend e conteúdo:** carregador e validador da definição, coluna, endpoint, validação e gravação, motor de triagem com pesos e alertas vazios, detalhe da coordenação, e a conversão do rascunho de bifurcações (editado pelo usuário) para `questionario.json`.
2. **Plano 2, front:** fluxo encadeado do aluno com rascunho e tela de orientação, e o bloco "Respostas do aluno" da coordenação; verificação em Chrome real e Setup.

## Testes

Backend: definição válida e cada erro de integridade; cada caso de 400 do `POST`; aceitação sem respostas; equivalência da triagem com pesos zerados; peso e alerta ligados só em fixtures; detalhe com e sem questionário. Front: fluxo com saltos, voltar, trocar de situação, falha do questionário, rascunho com respostas; bloco da coordenação com e sem respostas.

## Em aberto (do usuário)

Editar o rascunho de perguntas; escolher alertas, pesos e faixas; decidir a pergunta de risco para si mesmo e o modo testemunha; fornecer contatos de apoio.
