# Plano de implementação: acolhimento e conversas

> Execução: superpowers:subagent-driven-development. O usuário delegou decisões e aprovações; não solicitar novas aprovações de escopo.

**Objetivo:** facilitar pedido, retorno e atendimento no canal escolar.
**Arquitetura:** preservar React/Flask/SQLite, ampliar rotas existentes com autorização e recibos idempotentes; leituras por ID de mensagem e usuário da coordenação.
**Spec:** ../specs/2026-10-20-acolhimento-conversas-design.md

## Restrições

Preservar alterações locais preexistentes e operar no checkout atual porque o código-base de trabalho contém alterações ainda não commitadas. Não criar commits que misturem trabalho anterior. Manter funcionamento LAN e visual existente. Usuário delegou decisões de execução. Exportação de apoio, sem alegar compatibilidade oficial ROE.

## Tarefas

- [x] Backend de conversas: criar tabela de leitura por caso/usuário em db.py; mensagens devem expor ID; criar POST /api/casos/<id>/conversa/lida com ultimo_id limitado ao ID realmente exibido; enriquecer GET /api/casos com conversa_estado, mensagens_novas e ultima_mensagem; testes em backend/tests/test_conversas.py. Estados: sem_mensagem, mensagem_nova, aguardando_equipe, aguardando_aluno. Consultar IDs crescentes para evitar colisão de horários e corrida com novas mensagens.
- [x] Portal aluno: modulo acessos.ts para códigos normalizados e ultima_mensagem lida (ID); integrar Inicio, App, Confirmacao e Acompanhar. Novo Acolhimento.tsx recebe primeira mensagem, usa POST /api/acolhimento com JSON {envio_id,texto}; resultado {codigo}. Preservar envio_id em retries do mesmo conteúdo. Sem dados escolares. Testes de armazenamento indisponível, remoção, foco e entrada de acolhimento. Construir ambos os frontends.
- [x] Coordenação UI: adicionar tipos e chamadas em shared/api.ts; filtro de conversa persistido em FiltrosFila, prévia, horário e estado em Fila.tsx; Caso.tsx registra leitura somente na aba conversa e até maior ID exibido. Exportação de apoio por link autenticado GET /api/casos/<id>/exportacao, formato HTML para impressão e cópia; teste de filtro, leitura e link.
- [x] Backend acolhimento/exportação: reutilizar recibos transacionais de envios.py; marcador canal em casos com migração idempotente; primeira mensagem inserida na mesma transação; POST /api/acolhimento sem questionário/dados escolares, validações, rate limit e teste de retry; exportação HTML autenticada com escape de todo conteúdo, dados disponíveis e ausências explícitas, sem códigos/notas internas.
- [x] Integrar e revisar: regressões pertinentes do backend e suítes completas dos dois frontends; builds aluno/coordenação; inspeção visual desktop/mobile quando executável; atualizar documentação e registrar resultados.

## Foco de revisão

Armazenamento bloqueado não impede envio; nenhum caso vazio no acolhimento; retry não duplica mensagem; leitura de colega não apaga alerta próprio; mensagem recebida durante leitura permanece nova; HTML exportado não executa relato; campos de identidade ausentes permanecem ausentes.
