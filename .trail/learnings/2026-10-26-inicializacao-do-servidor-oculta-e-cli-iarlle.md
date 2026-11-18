---
title: Inicializacao do servidor oculta e CLI administrativa separada
author: Iarlle
date: 2026-10-26
branch: feature/v1
cost: { minutes: 18, tokens: 957224 }
touches:
  - backend/tests/test_empacotamento.py
  - installer/LEIA-ME-LAN.txt
  - installer/LEIA-ME.txt
  - installer/instalador.iss
  - installer/seguranca.spec
  - ".impeccable/design.json"
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/app.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/appearance.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/core-plugins.json
  - Vault Obsidian - Seguran\303\247a Integral/.obsidian/daily-notes.json
---

## Decided
- O servidor deve iniciar oculto, sem terminal ou item de terminal na barra de tarefas; deve ser visivel apenas como processo no Gerenciador de Tarefas.
- Empacotar SegurancaIntegral.exe com console=False. SegurancaIntegral-cli.exe mantem os comandos administrativos e o diagnostico em terminal, com os mesmos recursos compartilhados em _internal.
- A tarefa e os atalhos de inicializacao continuam apontando para SegurancaIntegral.exe. O instalador inclui a CLI separada, sem criar atalho para ela.

## Tried and ruled out
- Apenas minimizar/esconder um console deixa dependencia do host de terminal; o executavel do servidor deve usar o subsistema Windows GUI.
- Remover o suporte de console de todos os comandos perderia a exibicao de status e das senhas de recuperacao; esses comandos ficam na CLI separada.

## Watch out
- Os exemplos de --status, --criar-admin e --redefinir-senha devem usar SegurancaIntegral-cli.exe.
- O Python da Microsoft Store usado pelo venv nao executa no sandbox desta maquina; testes e build precisaram de execucao fora do isolamento.
