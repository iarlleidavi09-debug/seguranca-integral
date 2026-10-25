---
title: "Limpeza da implantacao secundaria: armadilhas"
author: Iarlle
date: 2026-10-25
branch: feature/v1
cost: { minutes: 56, tokens: 172675 }
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
- Chave `implantacao_secundaria` no config.json (bool estrito) liga a funcionalidade; so o primeiro admin (menor id de admin); senha via auth.autenticar (mesmo contador do login) e frase APAGAR TUDO. Apaga casos e filhos, uploads e (padrao) backups/ e todo seguranca.db.pre-*.bak; preserva usuarios, mapa, config e chaves.
- Banco primeiro (BEGIN IMMEDIATE), disco so depois do commit; depois checkpoint e VACUUM, com secure_delete na conexao. Teste procura marcador unico nos bytes de .db, -wal e -shm.

## Tried and ruled out
- Tratar so o `.pre-v2.bak`: ha outras copias completas do banco (pre-v3, pre-v4, pre-mapa-l, pre-atendimento) com texto de casos.
- `resolve()` nas entradas de uploads/: um symlink faria apagar o alvo fora da pasta; remover o proprio link.

## Watch out
- Cinco senhas erradas no cartao tambem bloqueiam o login do admin (mesmo contador).
- Teste de symlink real e pulado no Windows (WinError 1314); ha simulacao por monkeypatch.
- Mensagem de sucesso com a caixa de copias desmarcada precisa manter a contagem de copias do cartao (bug ja corrigido).
