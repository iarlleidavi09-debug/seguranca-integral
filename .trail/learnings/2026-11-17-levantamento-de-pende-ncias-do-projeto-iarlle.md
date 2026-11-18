---
title: Levantamento de pendências do projeto em 17/11/2026
author: Iarlle
date: 2026-11-17
branch: feature/v1
cost: { minutes: 3, tokens: 61959 }
touches:
  - DESIGN.md
  - PRODUCT.md
  - backend/app/casos.py
  - backend/app/codes.py
  - backend/app/db.py
  - backend/app/envios.py
  - backend/app/routes_student.py
  - backend/app/status_cli.py
  - backend/tests/test_empacotamento.py
  - backend/tests/test_student_api.py
---

## Decided
Levantamento sem alterações: os planos locais de 3/11 e 16/11 estão todos marcados como feitos. Pendências reais: rodada Lovable da apresentação TETRAGUARD (parou por falta de créditos), 142 arquivos sem commit (último commit 5/11), suítes do aluno e backend sem rerrodar após as mudanças recentes, Setup 3.1.0 (25/10) anterior à interface nova, e docs de LAN (PRODUCT.md, operacao-lan.md) desatualizados frente ao sistema hospedado.

## Tried and ruled out
Procurar pendência nos planos não adianta: todos os checkboxes estão marcados. O estado real está em .trail/learnings, git status e na memória do projeto.

## Watch out
Não commitar nem dar push sem pedido. Decidir antes se o vault do Obsidian, anti-slop/, .impeccable/ e os .tmp-navegacao-*.log entram no repositório ou são limpos.
