# v2 A: fluxo de investigação e novo front

Data: 15/10/2026. Origem: `docs/v2-requisitos-do-front.md`, `DEFINICOES.md` e `MAPA-INTERFACES.md` da pasta `D:\Prototipo Segurança Integral front`, e a conversa de 15/10/2026. Esta spec substitui o levantamento como base de implementação da v2 A.

## Objetivo

Levar os dois portais reais ao visual aprovado (coordenação acolhedora, aluno jovem e expressivo) com o fluxo novo da coordenação: investigar, atualizar status, acolher e registrar a resolução, com acompanhamento do aluno depois dela. Entra em uso numa escola, em ambiente controlado, como a v1.

## Fora do escopo

- Questionário adaptativo e triagem por pesos (v2 B): falta conteúdo (perguntas do terceiro nível, "Outros", pesos, faixas). O aluno continua escolhendo uma das 7 situações da v1 e escrevendo o relato livre.
- LGPD, responsável individual por caso, acompanhamento periódico automático.
- Mudanças no instalador, além do já feito (sem conta criada na instalação).

## Entrega em três planos

1. **Backend v2 A** (migração, regras, API). Fecha o contrato.
2. **Front da coordenação** sobre a API real.
3. **Front do aluno** sobre a API real.

Cada plano termina com testes verdes e um Setup instalável. O front da branch (`frontend/`) é alterado a partir dos planos 2 e 3, com autorização dada em 15/10/2026 ("front v2 completo"). A pasta `D:\Prototipo Segurança Integral front` serve de referência visual; as prévias `revisao` e `revisao-aluno` são a base, com a API real no lugar dos dados falsos, e os testes e critérios de acessibilidade existentes são preservados.

## Modelo de dados

Migração por mapa fixo no `init_db`, executada uma vez, com backup do `.db` antes (cópia ao lado do banco) e ensaio numa cópia na hora.

| Tabela | Mudança |
| --- | --- |
| `casos` | `status` com 3 valores: `novo`, `em_investigacao`, `resolvido`. Mapa: `novo`→`novo`; `em_analise`, `aguardando_aluno`, `encaminhado`→`em_investigacao`; `resolvido`→`resolvido`. |
| `casos` | `gravidade` vira `prioridade` (`baixa`, `media`, `alta`, `critica`) e ganha `prioridade_original`, preenchida com o valor atual na migração. Nunca é sobrescrita depois. |
| `casos` | `ultimo_acesso_por` (usuário), `ultimo_acesso_em`, `recorrencia_pendente` (0/1). |
| `mensagens` | `usuario_id` (autor da coordenação; nulo para mensagens do aluno e antigas). |
| `resolucoes` | `caso_id`, `desfecho` (`solucionada` ou `intervencao_realizada`), `providencias` (obrigatório), `resultado`, `usuario_id`, `criado_em`; anexos opcionais reaproveitam `anexos`/`uploads` com referência à resolução. |
| `situacoes_aluno` | `caso_id`, `situacao` (`melhorou` ou `voltou`), `criado_em`. Histórico, sem IP. |
| `revisoes_recorrencia` | `caso_id`, `usuario_id`, `criado_em`. |

Sem coluna de responsável. Nenhuma coluna guarda IP.

## Triagem e alertas

Pontos e limiares da v1 continuam e produzem Baixa, Média e Alta (`prioridade` e `prioridade_original`). A **Crítica** vem de alertas fixos, avaliados depois da soma, que sempre elevam o caso a Crítica e acrescentam o motivo legível:

1. tipo `aliciamento` ou `ameaca`, com categoria de risco `violencia` ou `automutilacao`, ocorrendo agora;
2. categoria `automutilacao`, em qualquer tipo, ocorrendo agora;
3. categorias `nudes` e `extorsao` juntas.

As regras ficam em código testado (`triage.py`), fáceis de trocar. Isto é provisório até a v2 B definir pesos. Os motivos aparecem no caso e na fila.

## API (portal da coordenação)

Todas exigem sessão e `Content-Type: application/json` nas escritas, como hoje.

- `GET /api/casos?status=&prioridade=&tipo=&q=`: `q` busca no número e no resumo. Cada item traz último acesso e `recorrencia_pendente`. Ordem: prioridade (crítica primeiro), depois mais antigo primeiro (quem espera há mais tempo aparece antes).
- `GET /api/casos/<id>`: grava o último acesso (usuário e hora) e devolve o valor anterior para exibir. Inclui eventos, mensagens com autor, notas, resolução e histórico de situações.
- `POST /api/casos/<id>/status` com os 3 valores.
- `POST /api/casos/<id>/prioridade` exige `justificativa` (1 a 2000 caracteres); evento com autor, anterior, novo e motivo; `prioridade_original` intacta.
- `POST /api/casos/<id>/resolucao` exige `desfecho` e `providencias`; muda o status para `resolvido`; evento com autor.
- `POST /api/casos/<id>/revisao-recorrencia`: zera `recorrencia_pendente` e registra revisor e hora; só se estiver pendente.
- `GET /api/resumo`: contagens por status e prioridade e número de recorrências pendentes.
- `/api/usuarios` continua só para o admin.

## API (portal do aluno)

- `/api/acompanhar` devolve status (3 valores), mensagens, resolução resumida (desfecho, providências, resultado e data, sem notas internas nem autor) e indicador de pós-resolução.
- `POST /api/acompanhar/situacao` com `{codigo, situacao}`: só para caso `resolvido`; grava no histórico; se `voltou`, liga `recorrencia_pendente` e registra evento.
- O aluno segue conversando pelo canal de mensagens existente, inclusive depois da resolução.

## Front da coordenação

Desktop. Visão geral (contagens e pendências), fila (prioridade, status, motivo, último acesso, recorrência destacada, busca e filtros), detalhe (conversa, notas, histórico com autoria), alteração de prioridade com justificativa, registro de resolução, bloco de pós-resolução e revisão de recorrência. Mantém o menu Usuários só para o admin.

## Front do aluno

Celular e desktop. Início, escolha da situação e desdobramentos aprovados, relato, confirmação, conversa e acompanhamento (3 estados), com a área pós-resolução ("melhorou" ou "voltou a acontecer"). Itens já pedidos entram aqui: aviso de dados móveis no consentimento, rascunho que expira em 24 horas ou usa `sessionStorage`, e opção de girar imagem.

## Erros e segurança

Entradas inválidas respondem 400 com mensagem fixa; caso inexistente, 404 igual para qualquer ausência; sem sessão, 401. Todas as novas escritas validam tipo e tamanho. O aluno nunca recebe notas internas, autoria da coordenação nem prioridade.

## Testes

- Backend (TDD): migração (mapa, idempotência, banco vazio, backup), cada alerta crítico, cada endpoint (sucesso, validação, autorização, 404), autoria, preservação da prioridade original, vazamento zero de campos internos para o aluno.
- Front: testes de componentes existentes preservados e novos por tela; conferência em navegador real nos tamanhos 375, 768 e 1280 e nos temas claro e escuro.
- Fechamento de cada plano: suíte completa e build uma vez.

## Decisões em aberto

- Campos individuais do registro de resolução (providências, resultado, data, anexos) ainda sem confirmação do usuário: seguem os sugeridos até a revisão.
- Lista dos alertas críticos é proposta minha; validar na revisão da spec.
