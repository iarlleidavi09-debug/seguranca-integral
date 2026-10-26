---
title: "Visual da coordenacao: armadilhas"
author: Iarlle
date: 2026-10-26
branch: feature/v1
cost: { minutes: 86, tokens: 134390 }
touches:
  - ".impeccable/design.json"
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/app.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/appearance.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/core-plugins.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/daily-notes.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/graph.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/workspace.json
  - Vault Obsidian - Seguran\303\247a Integral/Anexos/C\303\263digo novo/backend/app/atendimento.py
  - Vault Obsidian - Seguran\303\247a Integral/Anexos/C\303\263digo novo/backend/app/autoria.py
  - Vault Obsidian - Seguran\303\247a Integral/Anexos/C\303\263digo novo/backend/app/diagnostico.py
---

## Decided
- Visual Fluent preservado; fila em linha compacta clicavel (assunto e o unico botao), pagina do caso com barra de acoes, abas com contadores e painel lateral, menu "⋯" por mensagem, campo fixo no celular, barra lateral em altura total. Selos da fila: no maximo 2 visiveis e "+N" expansivel.
- A ajuda "so a coordenacao ve"/"o aluno le" fica visivel no campo fixo no celular (evita nota interna enviada ao aluno).

## Tried and ruled out
- `style={{fontSize}}` em JSX para rotulos do mapa: a CSP do servidor bloqueia atributo style inline; usar atributo SVG `fontSize` e nao deixar o CSS sobrepor. So a suite completa do portal do aluno (src/shared/csp.test.ts) pegou.
- Mover o rodape (Sair/Pausar) antes da nav no HTML para todos os tamanhos: piora o Tab no desktop; a ordem visual no celular e so CSS `order`.
- "A barra lateral para em 800 px" era artefato de captura full-page de um sticky 100dvh.

## Watch out
- Rodar SEMPRE a suite completa de ambos os portais (aluno inclui csp.test.ts) ao final de tarefas que mexem em JSX.
- Testes de teclado das abas precisam esperar o foco inicial do titulo (waitFor) antes de focar a aba.
- Fila de 16 casos de pior caso ainda tem ~3.250 px no celular; chips e linhas por caso sao o proximo lugar para enxugar.
