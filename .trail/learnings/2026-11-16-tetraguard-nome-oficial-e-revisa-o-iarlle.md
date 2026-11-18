---
title: "TETRAGUARD: nome oficial e revisão textual parcial no Lovable"
author: Iarlle
date: 2026-11-16
branch: feature/v1
touches:
  - docs/tetraguard-textos
  - frontend/src/aluno/Inicio.tsx
  - frontend/src/coord/Geral.tsx
  - frontend/src/aluno/App.tsx
  - frontend/src/coord/App.tsx
---

## Decided
O usuário definiu TETRAGUARD (sem hífen) como nome oficial em 16/11/2026 e pediu textos mais elaborados para a apresentação, explicando problema, objetivo, percurso e limites. Marca visível atualizada localmente; identificadores técnicos e chaves de armazenamento foram preservados. Quatro mensagens editoriais completas ficam em docs/tetraguard-textos/.

## Tried and ruled out
A rodada Lovable umsg_01m7j8gy7dfn191jb1ptt1mf8q aplicou marca e boa parte do portal estudante no commit 21208b9c3d02865bb3735de6aae12f70559ffc0b, mas parou por falta de créditos. Custou 5 créditos segundo o conector. Não declarar que a apresentação ou a revisão da coordenação foram aplicadas: continuam pendentes. A tentativa posterior para priorizar só a apresentação retornou INVALID_ARGUMENT.

## Watch out
O projeto Lovable é daa1c13e-bb1d-40e8-9068-dafaa5bf1098, separado da conta Imagi. A apresentação completa pronta para src/routes/index.tsx fica em output/tetraguard-atualizacao-lovable/, com sintaxe TSX conferida, mas sem aplicação ou integração remota. Os pacotes de código exportados em 07/11 são registros daquela versão e podem ter a marca anterior. Mensagens da instalação local real não devem alegar que os pedidos são simulados; a demo Lovable/Imagi deve explicar que nada é encaminhado à escola.
