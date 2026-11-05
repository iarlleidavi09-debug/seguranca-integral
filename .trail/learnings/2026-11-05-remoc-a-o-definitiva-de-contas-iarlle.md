---
title: Remoção definitiva de contas pelo administrador
author: Iarlle
date: 2026-11-05
branch: feature/v1
cost: { minutes: 13, tokens: 107834 }
touches:
  - backend/app/auth.py
  - backend/app/casos.py
  - backend/app/codes.py
  - backend/app/db.py
  - backend/app/envios.py
  - backend/app/routes_coord.py
  - backend/app/routes_student.py
  - backend/tests/test_empacotamento.py
  - backend/tests/test_student_api.py
  - backend/tests/test_v3.py
---

## Decided
- DELETE /api/usuarios/<id> (so admin, em SO_ADMIN) chama auth.remover_usuario: anula toda coluna que referencia usuarios (descobertas por PRAGMA foreign_key_list, ignora as ON DELETE CASCADE) e apaga a conta numa transacao. Historico dos casos fica sem autor.
- Bloqueios: propria conta, primeiro admin (implantacao depende dele) e ultimo admin ativo.
- UI: botao Remover com confirmacao em Usuarios.tsx, separado do fluxo Desativar.

## Tried and ruled out
- DELETE direto na tabela: falha, pois as FKs estao ligadas (PRAGMA foreign_keys=ON) e a maioria nao tem cascade.

## Watch out
- Escrita na API exige JSON (415 sem isso): DELETE precisa enviar json={} nos testes e no cliente.
- Frontend: rodar vitest com --config vite.coord.config.ts; sem isso o fetch nao e mock e tudo falha.
- test_detalhe_usa_so_colunas_conhecidas_do_caso falha por codigo_acompanhamento, vem do trabalho antigo sem commit em casos.py, nao desta mudanca.
