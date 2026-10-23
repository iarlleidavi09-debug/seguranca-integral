---
title: "Editar e excluir mensagens: implementacao e armadilhas"
author: Iarlle
date: 2026-10-23
branch: feature/v1
cost: { minutes: 23, tokens: 51986 }
touches:
  - docs/acolhimento-e-conversas.md
  - ".impeccable/design.json"
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/app.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/appearance.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/core-plugins.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/daily-notes.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/graph.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/workspace.json
  - Vault Obsidian - Seguran\303\247a Integral/Anexos/C\303\263digo novo/backend/app/atendimento.py
  - Vault Obsidian - Seguran\303\247a Integral/Anexos/C\303\263digo novo/backend/app/autoria.py
---

## Decided
- Implementado em feature/v1 (b6a3919 a c702509): colunas editada_em/apagada_em em mensagens, tabela mensagens_versoes (criada na migracao _migrar_edicao_mensagens, nao no SCHEMA), rotas PATCH/DELETE/GET versoes. Excluir limpa o texto da tabela principal, entao nenhuma outra consulta vaza.
- Defesa em profundidade: /api/acompanhar devolve texto vazio quando apagada_em existe, e os UPDATEs sao condicionais (AND apagada_em IS NULL) com rowcount.
- Mensagem apagada da coordenacao continua contando como resposta da equipe na fila (atendimento.py e estado_conversa).

## Tried and ruled out
- Testes jsdom nao pegaram o foco perdido apos excluir: o efeito de foco roda antes do pai trocar apagada para true. So o Chrome real mostrou. Corrigido com flag excluiu em Conversa.tsx.

## Watch out
- DELETE e PATCH exigem Content-Type application/json (guarda de ESCRITA); o helper coord() de api.ts ja manda.
- Backend completo leva ~40 min; nunca rodar dois pytest juntos (.pytest_tmp compartilhado). test_cli_contract precisa de cwd=backend e PYTHONUTF8 por causa do acento no caminho.
- Os portais nao tem tema escuro; verificacao escura nao se aplica.
- Setup em dist\ nao foi regenerado com esta mudanca.
