---
title: Editar e excluir mensagens da coordenação (decisões)
author: Iarlle
date: 2026-10-22
branch: feature/v1
cost: { minutes: 15, tokens: 177706 }
touches:
  - backend/app/__init__.py
  - backend/app/backup.py
  - backend/app/casos.py
  - backend/app/config.py
  - backend/app/db.py
  - backend/app/routes_coord.py
  - backend/app/routes_student.py
  - backend/app/server.py
  - backend/app/simulation.py
  - backend/tests/test_backup.py
---

## Decided
- Exclusão de mensagem da coordenação deixa a marca "Mensagem apagada" para aluno e equipe; o texto original fica só em tabela de auditoria visível à coordenação.
- Só quem escreveu a mensagem e o admin podem editar ou excluir, sem limite de tempo. Mensagens do aluno nunca são editáveis.
- Aluno vê "(editada)" ou "Mensagem apagada"; nunca o texto antigo nem quem editou. Cada ação vira evento no histórico do caso.
- Preservar o visual das duas abas (aluno e coordenação): só layout e componentes mudam.
- Antes de codar, é preciso spec escrita e aprovada (brainstorming, caminho arquitetural).

## Tried and ruled out
- Apagar sem rastro e esconder só do aluno foram oferecidos e recusados.
- Limite de 15 minutos para editar foi oferecido e recusado.

## Watch out
- O checkout tem ~61 arquivos modificados e dezenas novos não commitados (trabalho do Codex); o git avisa conversão LF para CRLF. Padronizar fim de linha e commitar em partes antes de começar o novo.
- Backend completo é lento (a validação de 3 arquivos levou 16 min); vitest com maxWorkers=1. O aviso "concluído" de comando em segundo plano com `( ... ) &` é do wrapper, não da suíte.
- A leitura da conversa usa `leituras_conversa.ultimo_id`: manter a mensagem apagada como linha (marca) para não quebrar contagem de novas.
