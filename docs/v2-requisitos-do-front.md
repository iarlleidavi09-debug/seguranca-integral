# v2: o que o front redesenhado pede ao backend

Origem: pasta `D:\Prototipo Segurança Integral front` (README, `MAPA-INTERFACES.md`, `docs/DEFINICOES.md` e as prévias `revisao` e `revisao-aluno`), lida em 15/10/2026. Este documento é um levantamento, não uma spec aprovada. Cada etapa passa por brainstorming e spec própria antes de virar código.

## Ordem combinada

1. **v1** (em fechamento, Task 13): 5 status, 3 gravidades, triagem por regras. Fica como a versão instalável para o primeiro teste.
2. **v2 A** (definida, sem pesos): fluxo de investigação, prioridade, autoria, resolução e pós-resolução.
3. **v2 B** (depende de conteúdo): questionário adaptativo e triagem por pesos.

## v2 A: mudanças no backend

| # | Pedido do front | Hoje na v1 | Mudança necessária |
| --- | --- | --- | --- |
| 1 | Status: Novo, Em investigação, Resolvido | novo, em_analise, aguardando_aluno, encaminhado, resolvido | Reduzir para 3 valores (`novo`, `em_investigacao`, `resolvido`), migrar casos existentes, atualizar API, fila, filtros e rótulos |
| 2 | Prioridade: Crítica, Alta, Média, Baixa | gravidade baixa, media, alta | Quarta faixa `critica`; renomear campo para prioridade; manter `prioridade_original` |
| 3 | Reavaliar prioridade com justificativa, preservando a classificação original e a autoria | muda gravidade sem justificativa | Endpoint exige `justificativa`; evento com autor, valor anterior, novo e motivo; original nunca é sobrescrita |
| 4 | Motivos visíveis e alertas independentes da soma | motivos da triagem já existem | Alertas fixos (ex.: ameaça física em andamento) que elevam a prioridade mesmo com poucos pontos; regra a definir |
| 5 | Último acesso ao caso (quem e quando) | não existe | Gravar `ultimo_acesso_por` e `ultimo_acesso_em` ao abrir o detalhe; mostrar na fila e no caso; "Ainda não acessado" |
| 6 | Autoria separada de ações, mensagens, notas e status | eventos e notas têm autor; mensagem da coordenação só diz "coordenacao" | Guardar `usuario_id` em cada mensagem da coordenação |
| 7 | Responsabilidade compartilhada, sem responsável individual | já é assim | Nada a fazer; só não criar "responsável" |
| 8 | Registro de resolução: desfecho (solucionada ou intervenção realizada), providências, resultado observado, data, autoria automática, anexos opcionais | status resolvido sem registro | Tabela `resolucoes`; endpoint "registrar resolução" (exige providências); anexos opcionais reaproveitam `uploads`; campos individuais ainda não confirmados pelo usuário |
| 9 | Pós-resolução: aluno conversa com a equipe e informa "melhorou" ou "voltou a acontecer" | aluno só responde mensagens | `POST /api/acompanhar/situacao` {codigo, situacao}; guardar histórico das respostas; caso continua resolvido |
| 10 | Alerta de recorrência destacado até a equipe revisar; guardar quem revisou e quando | não existe | Campo de recorrência pendente no caso; `POST /api/casos/<id>/revisao-recorrencia`; fila com filtro e contador de pendências |
| 11 | Visão geral (contagens por status e pendências) | não existe | `GET /api/resumo` com contagens por status, prioridade e pendências |
| 12 | Acompanhamento do aluno em 3 estados e área pós-resolução | aluno vê o status e as mensagens | Resposta de `/api/acompanhar` inclui status novo, resolução resumida (sem notas internas) e flag de pós-resolução |
| 13 | Busca por número ou assunto na fila | só filtros por status e tipo | `GET /api/casos?q=` (texto no resumo e id) |

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
