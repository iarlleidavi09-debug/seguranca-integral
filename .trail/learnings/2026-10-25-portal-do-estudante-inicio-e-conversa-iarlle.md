---
title: "Portal do estudante: Inicio e Conversa, armadilhas"
author: Iarlle
date: 2026-10-25
branch: feature/v1
cost: { minutes: 70, tokens: 623381 }
touches:
  - frontend/src/aluno/Acompanhar.test.tsx
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
- Inicio enxuto (3 acoes, linha de privacidade, details recolhiveis) e Conversa em chat compacto, feitos em feature/v1 (d1168fc a 145dfe1). Identidade neobrutalista preservada, sem cor/fonte/variavel nova.
- `novas` (separador "Novas mensagens") e relativo a um snapshot do lastRead da primeira leitura da sessao (`baseLida`); responder avanca o snapshot. Rolagem so ao abrir e ao enviar.
- A confirmacao "Resposta enviada." ocupa o lugar do contador no rodape do campo fixo; nunca pode aumentar o campo (cobria a mensagem enviada).

## Tried and ruled out
- Reler lastRead do armazenamento a cada leitura: o separador sumia em ~70 ms com o stream ativo. So o Chrome real mostrou.
- Aviso de sucesso como linha nova dentro do campo fixo: +32 px e cobre a mensagem em tela baixa (375x480).

## Watch out
- Testes de contagem de scrollIntoView e de visibilitychange dependem de efeitos passivos: sob carga falham se nao esperarem os efeitos (act + espera) antes de medir ou disparar.
- Botao "Atualizar conversa" so aparece fora do ar ou apos falha de leitura (estado falhaAtualizar); toda copy que manda usa-lo precisa ter o botao visivel.
- No acolhimento anonimo nao ha tela de Confirmacao: o codigo do caso so aparece na Conversa (details "Seu codigo"); abre sozinho se o armazenamento falhar.
- Verificar sempre em Chrome real (375x812, 375x480, 768, 1280); jsdom nao enxerga layout.
