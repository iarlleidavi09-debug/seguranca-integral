---
title: Coordenação com ações recolhidas e rascunhos preservados
author: Iarlle
date: 2026-11-17
branch: feature/v1
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

Coordenação usa três destinos principais visíveis e grupos nativos details/summary para Organização e Ferramentas. Fila, gestão do caso, exportação e ajustes do mapa recolhem controles secundários sem desmontar formulários. Manter permissões, indicadores e rascunhos; resolução em edição mantém Gerenciar caso aberto. Resultados de busca do mapa pertencem ao mesmo grupo do campo. Não alterar o neobrutalismo do aluno.

## Tried and ruled out

Não usar queryByRole nulo para afirmar que um controle em details está recolhido: jsdom pode encontrá-lo mesmo invisível. Usar toBeVisible e propriedade open. Não desmontar formulários para satisfazer esses testes. Em Playwright, label Zoom inclui opções; localizar o combobox dentro do grupo. A opção exact do Playwright não pertence a ByRoleOptions da Testing Library.

## Watch out

Suíte da coordenação passou com 365 testes, pool threads, maxWorkers 1 e no-isolate. Build aprovado e 416 verificações de contraste sem falhas. Navegador verificou cinco telas em três larguras e dois temas, 30 layouts, sem erros. Demo real 5291 usa banco temporário; não confundir com publicação hospedada. Evidências em docs/verificacao-coordenacao-acoes-recolhidas-2026-11-16.md.
