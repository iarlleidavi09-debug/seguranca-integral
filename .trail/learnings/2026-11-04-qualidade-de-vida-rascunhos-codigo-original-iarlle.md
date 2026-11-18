---
title: "Qualidade de vida: rascunhos, codigo original, fila e anexos"
author: Iarlle
date: 2026-11-04
branch: feature/v1
touches:
  - backend/app/casos.py
  - backend/app/codes.py
  - backend/app/db.py
  - backend/app/envios.py
  - backend/app/routes_student.py
  - backend/tests/test_empacotamento.py
  - backend/tests/test_v3.py
  - frontend/README.md
  - frontend/src/aluno/Acompanhar.test.tsx
  - frontend/src/aluno/Acompanhar.tsx
---

## Decided
Implementar qualidade de vida preservando a versao local e a identidade visual existente: rascunhos de conversa/notas por caso apenas na memoria da sessao, favoritos por usuario sem texto de busca, retorno a fila com origem/ordem/rolagem e agenda com revisao concorrente. A pedido do usuario, o codigo original de acompanhamento aparece no detalhe autenticado do caso. Casos novos guardam o original; casos antigos tinham somente HMAC e capturam o original no proximo acesso valido do aluno, sem trocar codigos existentes.

## Tried and ruled out
Nao limpar rascunhos ao desmontar componentes: isso perde texto ao navegar. Nao limpar apenas comparando texto depois de envio: uma resposta atrasada apos logout pode apagar modelo identico escrito por outro usuario; capturar e validar a epoca da sessao. Nao persistir texto de conversa em localStorage. Em Windows, FavoritosFila.tsx e favoritosFila.ts conflitam: usar filtrosFavoritos.ts.

## Watch out
Vitest precisa executar workers fora do sandbox de processos neste ambiente; usar pool threads com poucos workers. Limpar os stores em afterEach dos testes, mantendo a persistencia entre componentes em producao. Playwright contra API ficticia precisa responder presenca com pessoas: [], senao o componente existente desmonta por contrato invalido. Capturas finais usam os builds estaticos para evitar HMR durante verificacao. O POST de anexos leva codigo no corpo multipart, limita o total por caso dentro de BEGIN IMMEDIATE e remove arquivos se a transacao falhar.
