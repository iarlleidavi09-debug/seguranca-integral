# v2: o que o front redesenhado pede ao backend

Origem: pasta `D:\Prototipo Segurança Integral front` (README, `MAPA-INTERFACES.md`, `docs/DEFINICOES.md` e as prévias `revisao` e `revisao-aluno`), lida em 15/10/2026. Este documento é um levantamento, não uma spec aprovada. Cada etapa passa por brainstorming e spec própria antes de virar código.

## Ordem combinada

1. **v1** (em fechamento, Task 13): 5 status, 3 gravidades, triagem por regras. Fica como a versão instalável para o primeiro teste.
2. **v2 A** (definida, sem pesos): fluxo de investigação, prioridade, autoria, resolução e pós-resolução.
3. **v2 B** (depende de conteúdo): questionário adaptativo e triagem por pesos.

## v2 A: mudanças no backend

| # | Pedido do front | Hoje na v1 | Mudança necessária |
| --- | --- | --- | --- |
| 1 | Status: Novo, Em investigação, Resolvido | novo, em_analise, aguardando_aluno, encaminhado, resolvido | Reduzir para 3 valores (`novo`, `em_investigacao`, `resolvido`), migrar casos existentes, atualizar API, fila, filtros e rótulos **Entregue no backend.** |
| 2 | Prioridade: Crítica, Alta, Média, Baixa | gravidade baixa, media, alta | Quarta faixa `critica`; renomear campo para prioridade; manter `prioridade_original` **Entregue no backend.** |
| 3 | Reavaliar prioridade com justificativa, preservando a classificação original e a autoria | muda gravidade sem justificativa | Endpoint exige `justificativa`; evento com autor, valor anterior, novo e motivo; original nunca é sobrescrita **Entregue no backend.** |
| 4 | Motivos visíveis e alertas independentes da soma | motivos da triagem já existem | Alertas fixos (ex.: ameaça física em andamento) que elevam a prioridade mesmo com poucos pontos; regra a definir **Entregue no backend.** |
| 5 | Último acesso ao caso (quem e quando) | não existe | Gravar `ultimo_acesso_por` e `ultimo_acesso_em` ao abrir o detalhe; mostrar na fila e no caso; "Ainda não acessado" **Entregue no backend.** |
| 6 | Autoria separada de ações, mensagens, notas e status | eventos e notas têm autor; mensagem da coordenação só diz "coordenacao" | Guardar `usuario_id` em cada mensagem da coordenação **Entregue no backend.** |
| 7 | Responsabilidade compartilhada, sem responsável individual | já é assim | Nada a fazer; só não criar "responsável" **Entregue (nada a fazer).** |
| 8 | Registro de resolução: desfecho (solucionada ou intervenção realizada), providências, resultado observado, data, autoria automática, anexos opcionais | status resolvido sem registro | Tabela `resolucoes`; endpoint "registrar resolução" (exige providências); anexos opcionais reaproveitam `uploads`; campos individuais ainda não confirmados pelo usuário **Entregue no backend, exceto anexos da resolução e dados opcionais (ficam para depois).** |
| 9 | Pós-resolução: aluno conversa com a equipe e informa "melhorou" ou "voltou a acontecer" | aluno só responde mensagens | `POST /api/acompanhar/situacao` {codigo, situacao}; guardar histórico das respostas; caso continua resolvido **Entregue no backend.** |
| 10 | Alerta de recorrência destacado até a equipe revisar; guardar quem revisou e quando | não existe | Campo de recorrência pendente no caso; `POST /api/casos/<id>/revisao-recorrencia`; fila com filtro e contador de pendências **Entregue no backend.** |
| 11 | Visão geral (contagens por status e pendências) | não existe | `GET /api/resumo` com contagens por status, prioridade e pendências **Entregue no backend.** |
| 12 | Acompanhamento do aluno em 3 estados e área pós-resolução | aluno vê o status e as mensagens | Resposta de `/api/acompanhar` inclui status novo, resolução resumida (sem notas internas) e flag de pós-resolução **Entregue no backend.** |
| 13 | Busca por número ou assunto na fila | só filtros por status e tipo | `GET /api/casos?q=` (texto no resumo e id) **Entregue no backend.** |

Migração: o banco da v1 só tem dados de teste; a migração de status e gravidade pode ser simples (mapa fixo), mas precisa de teste e de backup antes.

## v2 B: questionário adaptativo (depende de conteúdo)

Definido pelo usuário: 5 situações (cyberbullying, ameaças, vazamento de conteúdo particular, perfil falso ou página de fofoca, golpe) mais "Outros"; cada uma com 5 opções aprovadas e seleção múltipla; terceiro nível e aprofundamento em 5 dimensões (quando e se continua, frequência, quem teve acesso, consequências, risco agora), com "Não sei" quando fizer sentido.

Ainda indefinido: perguntas e alternativas do terceiro nível e de "Outros", pesos de cada resposta, faixas crítica, alta, média e baixa, sinais de alerta.

Mudanças previstas: modelo de dados do questionário (versionado), `GET /api/questionario` para o aluno, envio de respostas estruturadas em `POST /api/denuncias`, triagem por pesos e alertas com motivos legíveis, exibição das respostas no caso, atualização do simulador de casos.

## Pontos do front a alinhar

- O front novo ainda usa os rótulos e o `api.ts` da v1; as prévias usam dados em memória. O contrato real só pode ser fechado depois da spec da v2 A.
- A pasta do front não é um repositório git; o repasse para a branch deve ser feito por cópia controlada ou por um repositório.
- Falha conhecida no front: teste de foco por teclado das abas do caso (registrada no `MAPA-INTERFACES.md`).

## Itens para o front

- Texto de consentimento do aluno: acrescentar o aviso "Para anonimato total, use dados móveis (4G), não o Wi-Fi da escola; o horário do envio pode ser cruzado com os registros de rede da escola."
- Rascunho da denúncia: hoje fica no `localStorage` sem prazo. Ele deve expirar em 24 horas ou passar para o `sessionStorage`, para não sobrar num aparelho compartilhado.
- O servidor agora remove os metadados das imagens (EXIF, GPS, XMP, comentários). A orientação EXIF também sai, então uma foto de celular pode aparecer deitada na tela da coordenação; se isso incomodar, o front pode girar a imagem no navegador antes do envio (canvas) ou oferecer um botão de girar na visualização.


## Contrato final da API v2 A (backend entregue)

Conferido contra `backend/app/routes_coord.py`, `routes_student.py`, `casos.py` e `triage.py` em 15/10/2026. Se este texto divergir do código, o código vence. Toda rota de escrita da coordenação exige `Content-Type: application/json` (senão 415) e sessão (senão 401). Caso inexistente dá sempre `404 {"erro": "nao encontrado"}`.

Valores fixos: status `novo`, `em_investigacao`, `resolvido`; prioridade `critica`, `alta`, `media`, `baixa`; desfecho `solucionada`, `intervencao_realizada`; situação do aluno `melhorou`, `voltou`.

### Coordenação (porta 4000)

| Método e rota | Corpo | Sucesso | Erros |
| --- | --- | --- | --- |
| GET `/api/casos` | query opcional: `status`, `prioridade`, `tipo`, `q` | 200 `{"casos": [...]}` | 400 `filtro <nome> invalido`; 400 `busca longa demais` (q com mais de 100 caracteres) |
| GET `/api/resumo` | nenhum | 200 `{"status": {novo, em_investigacao, resolvido}, "prioridade": {critica, alta, media, baixa}, "recorrencia_pendente": n}` (todas as chaves, mesmo com zero) | |
| GET `/api/casos/<id>` | nenhum | 200 caso completo (abaixo); grava o acesso | 404 |
| POST `/api/casos/<id>/status` | `{"status": "novo" ou "em_investigacao"}` | 200 `{"ok": true, "status": ...}` | 400 `status invalido` (inclui `resolvido`); 404 |
| POST `/api/casos/<id>/prioridade` | `{"prioridade": ..., "justificativa": "1 a 2000 caracteres"}` | 200 `{"ok": true, "prioridade": ...}` | 400 `prioridade invalida` ou `justificativa deve ter de 1 a 2000 caracteres`; 404 |
| POST `/api/casos/<id>/resolucao` | `{"desfecho": ..., "providencias": "1 a 2000", "resultado": "opcional, até 2000"}` | 201 `{"ok": true}` | 400 `desfecho invalido`, `providencias deve ter de 1 a 2000 caracteres`, `resultado deve ter ate 2000 caracteres`; 409 `caso ja resolvido`; 404 |
| POST `/api/casos/<id>/revisao-recorrencia` | `{}` (o corpo JSON é exigido pela regra de Content-Type; o conteúdo é ignorado) | 201 `{"ok": true}` | 409 `sem recorrencia pendente`; 404 |
| POST `/api/casos/<id>/mensagens` | `{"texto": "1 a 2000"}` | 201 `{"ok": true}` | 400; 404 |
| POST `/api/casos/<id>/notas` | `{"texto": "1 a 2000"}` | 201 `{"ok": true}` | 400; 404 |

Item da fila (`GET /api/casos`), ordenada por prioridade (critica, alta, media, baixa) e depois do mais antigo para o mais novo: `id`, `tipo`, `prioridade`, `pontos`, `status`, `em_andamento`, `anonimo`, `simulacao`, `criado_em`, `atualizado_em`, `recorrencia_pendente` (bool), `motivos` (lista de textos, como no detalhe), `resumo` (primeiros 120 caracteres do relato), `ultimo_acesso_por` (nome ou `null`) e `ultimo_acesso_em` (ISO ou `null`; `null` significa "Ainda não acessado").

Busca `q`: sem diferenciar maiúsculas nem acentos, no texto do relato; se `q` tiver só dígitos, casa também o número do caso. Os filtros se combinam (E).

Detalhe (`GET /api/casos/<id>`):

- Caso: `id`, `tipo`, `relato`, `quando`, `onde`, `em_andamento`, `anonimo`, `nome`, `turma`, `prioridade`, `prioridade_original` (nunca muda), `pontos`, `motivos` (lista de textos), `status`, `simulacao`, `criado_em`, `atualizado_em`, `recorrencia_pendente`. O hash do código nunca sai.
- `ultimo_acesso`: `{"por": nome, "em": ISO}` do acesso anterior a este, ou `null` se ninguém abriu antes. Abrir o caso grava o acesso atual, sem evento e sem mexer em `atualizado_em`.
- `anexos`: `[{id, tipo, tamanho}]` (arquivo em `GET /api/casos/<id>/anexos/<anexo_id>`).
- `mensagens`: `[{autor ("aluno" ou "coordenacao"), texto, criado_em, usuario_id, usuario}]`; `usuario` é o nome de quem da coordenação escreveu e vem `null` nas mensagens do aluno.
- `notas`: `[{id, usuario_id, usuario, texto, criado_em}]` (internas, nunca vão ao aluno).
- `resolucoes`: `[{desfecho, providencias, resultado, usuario, criado_em}]`, em ordem.
- `situacoes`: `[{situacao, criado_em}]` informadas pelo aluno depois da resolução.
- `revisoes_recorrencia`: `[{usuario, criado_em}]`.
- `eventos`: `[{id, tipo, usuario_id, usuario, detalhe, criado_em}]`, em ordem.

Eventos (`tipo` e formato do `detalhe`):

| tipo | autor | detalhe |
| --- | --- | --- |
| `criado` | nenhum (`null`) | `prioridade <valor>` (prioridade inicial da triagem) |
| `status` | coordenação | `status: <anterior> -> <novo>` |
| `prioridade` | coordenação | `<anterior> -> <novo>: <justificativa>` |
| `resolucao` | coordenação | o desfecho (`solucionada` ou `intervencao_realizada`) |
| `recorrencia` | nenhum (aluno) | `voltou a acontecer` |
| `revisao_recorrencia` | coordenação | vazio |
| `mensagem_coordenacao` | coordenação | vazio |
| `mensagem_aluno` | nenhum | vazio |
| `nota_interna` | coordenação | vazio |

Mudar para o mesmo valor (status ou prioridade) não grava evento. Bancos migrados da v1 têm os eventos antigos reescritos: `gravidade` virou `prioridade` (tipo e prefixo do detalhe).

Recorrência: `voltou` liga `recorrencia_pendente`; `melhorou` só entra no histórico e nunca desliga a pendência; só `revisao-recorrencia` desliga. O caso continua `resolvido`. Reabrir um caso resolvido é `POST status` com `novo` ou `em_investigacao`. `recorrencia_pendente` sobrevive à reabertura e `revisao-recorrencia` funciona também com o caso reaberto.

Alertas críticos (`triage.py`): elevam a prioridade a `critica` depois da soma, sem mudar `pontos`, e entram em `motivos`:

| Motivo | Condição |
| --- | --- |
| `alerta: ameaca com violencia em andamento` | tipo `ameaca` ou `aliciamento`, em andamento, e termos de risco de `violencia` ou `automutilacao` |
| `alerta: risco de automutilacao em andamento` | em andamento e termos de `automutilacao` |
| `alerta: conteudo intimo com extorsao` | termos de `nudes` e de `extorsao` no mesmo relato |

Sem alerta, a prioridade vem dos pontos: 6 ou mais `alta`, 3 ou mais `media`, senão `baixa`.

### Aluno (porta 3000)

| Método e rota | Corpo | Sucesso | Erros |
| --- | --- | --- | --- |
| POST `/api/acompanhar` | `{"codigo": ...}` | 200 (abaixo) | 404 `codigo nao encontrado` (malformado e inexistente iguais); 429 |
| POST `/api/acompanhar/situacao` | `{"codigo": ..., "situacao": "melhorou" ou "voltou"}` | 201 `{"ok": true}` | 400 `situacao invalida`; 409 `caso ainda nao resolvido`; 404; 429 |
| POST `/api/acompanhar/mensagens` | `{"codigo": ..., "texto": "1 a 2000"}` | 201 `{"ok": true}` | 400; 404; 429 |

Resposta de `/api/acompanhar`: `status` (um dos três), `mensagens` `[{autor, texto, criado_em}]` (sem autoria individual da equipe), `resolucao` (`null` quando `status` não é `resolvido`; senão a mais recente: `{desfecho, providencias, resultado, criado_em}`), `pos_resolucao` (bool, verdadeiro quando `status` é `resolvido`) e `ultima_situacao` (`null`, `melhorou` ou `voltou`; só vale para o ciclo atual: depois de reabrir e resolver de novo volta a `null` até o aluno responder). `providencias` e `resultado` são visíveis ao aluno: a interface deve rotulá-los assim. Prioridade, notas, autor da resolução e motivos nunca saem para o aluno.

### Rulings

- Anexos da resolução ficam para depois (o registro aceita só texto por enquanto).
- `POST /status` não aceita `resolvido`: o caso só é resolvido por `POST /resolucao`, que exige providências.
- A revisão de recorrência exige corpo JSON (`{}`), por causa da regra de Content-Type das rotas de escrita.
- Migração: ao subir um banco da v1 com casos, o servidor copia `seguranca.db` para `seguranca.db.pre-v2.bak` antes de migrar e aborta se a cópia falhar ou sumir. Mapa: `novo` fica `novo`; `em_analise`, `aguardando_aluno` e `encaminhado` viram `em_investigacao`; `resolvido` fica. `gravidade` vira `prioridade` e é copiada em `prioridade_original`. O ensaio numa cópia (6 casos, 14 eventos) conferiu contagens iguais, integridade ok e segunda execução sem mudanças.

### O que falta para o front

O front ainda usa rótulos e `api.ts` da v1: a adaptação das telas (status em 3 valores, quarta faixa crítica, justificativa de prioridade, fila com busca e último acesso, registro de resolução, área pós-resolução do aluno, alerta de recorrência) é o trabalho dos planos 2 e 3. Anexos da resolução e dados opcionais seguem pendentes.

## Contrato do questionário (v2 B)

### GET `/api/questionario` (aluno, porta 3000)

- 200 com `{"situacoes", "dimensoes", "perguntas"}` e cabeçalho `Cache-Control: no-store`. Nunca traz `pesos`, `alertas` nem `faixas`.
- `situacoes`: `[{id, tipo, nome, descricao, opcoes: [{id, texto, perguntas: [ids]}]}]` (a ordem é a da tela). `tipo` é o mesmo de `POST /api/denuncias`.
- `perguntas`: `[{id, dimensao, texto, tipo, respostas: [{id, texto}], mostrar_se?}]`. `tipo` é `unica` ou `multipla`. Uma pergunta aparece quando alguma opção marcada a cita em `perguntas`, ou quando alguma resposta de `mostrar_se` já foi dada.
- `dimensoes`: id para rótulo (`quando`, `frequencia`, `alcance`, `consequencias`, `risco`).
- 503 `{"erro": "questionario indisponivel"}` se a definição estiver quebrada; 429 pelo limitador de consultas. A definição é lida a cada chamada.

### Campo `respostas` do `POST /api/denuncias`

- Campo de formulário (multipart) com texto JSON: `{"situacao": "<id>", "marcadas": ["<id da opção>"], "respostas": {"<id da pergunta>": ["<id da resposta>"]}}`. Ausente ou vazio significa "sem respostas".
- Limites: até 8192 bytes; até 150 ids no total (`marcadas` mais todas as respostas); só texto nos ids; sem ids repetidos; pergunta `unica` aceita no máximo um id.
- Conferências: a situação existe e o `tipo` do pedido é o dela; cada opção pertence à situação; cada pergunta existe e cada resposta pertence a ela. O servidor não confere se a pergunta estava visível (`mostrar_se`).
- Qualquer falha responde 400 `{"erro": "respostas invalidas"}`, sem criar o caso e sem deixar anexo no disco (inclui JSON malformado e aninhamento profundo).
- Exceção: se a definição do servidor estiver quebrada, as respostas são descartadas e o caso é criado normalmente (201). O pedido de ajuda nunca é bloqueado pelo questionário.
- Quando `respostas` é enviado, o front do aluno deixa de gerar o bloco "Situações marcadas:" no relato: o relato vai só com o texto do aluno.
- Lembrete para o front: quando a resposta de `q6` ("Você está seguro agora?") for `q6.nao` ("Não") ou `q6.hoje` ("Quero falar com alguém hoje"), mostrar a tela de orientação (apoio imediato) depois do envio.

### Triagem

`pesos` e `alertas` chegam vazios (`{}` e `[]`) e `faixas` no padrão (`alta` 6, `media` 3) em `questionario.json`: as respostas ainda não alteram prioridade, pontos nem motivos. Os pesos serão ajustados depois, sem mudar o contrato.

### Detalhe da coordenação: chave `questionario`

`GET /api/casos/<id>` ganhou a chave `questionario`, única chave nova. É `null` quando o caso não tem respostas (casos antigos, pedido sem `respostas`, valor gravado corrompido ou definição quebrada no servidor); senão:

```
{"situacao": {"id", "nome"},
 "marcadas": ["texto da opção"],
 "dimensoes": [{"id", "rotulo", "itens": [{"pergunta": "texto", "respostas": ["texto"]}]}]}
```

As dimensões vêm na ordem `quando`, `frequencia`, `alcance`, `consequencias`, `risco`, sem as vazias; os itens seguem a ordem das perguntas da definição. Id que não existe mais na definição aparece como o próprio id (perguntas removidas ficam em `alcance`). A resposta da coordenação não inclui `pesos`, `alertas` nem `faixas`. O `respostas_json` bruto não sai.
