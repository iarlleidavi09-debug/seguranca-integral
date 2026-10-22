# Organização do atendimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Organizar casos não abertos, pendentes e resolvidos com responsável e próxima ação.

**Architecture:** Migração aditiva SQLite; módulo atendimento para projeção e transação; rotas autenticadas existentes. React reutiliza fila, polling, tokens e guarda de ações do detalhe.

**Tech Stack:** Flask, SQLite, React, TypeScript, pytest, Vitest.

**Spec:** docs/superpowers/specs/2026-10-17-organizacao-atendimento-design.md

## Global Constraints
- Sem serviços externos; informações do atendimento somente na coordenação.
- Não sobrescrever trabalho existente; manter códigos e dados.
- Datas de prazo em America/Sao_Paulo; gravação usa revisão otimista.

## Review Focus
- Conta desativada exige reatribuição, mantendo nome histórico.
- Resolvido com mensagem ou ação vencida permanece na atenção.
- Edição em outra sessão responde 409 sem perder rascunho.
- Migração repetida preserva dados e backup.
- Falha de consulta não descarta rascunho nem oferece responsáveis incorretos.

### Task 1: Persistência e API
- [x] Testar atribuição, validação, conflitos, datas, privacidade e motivos de atenção; observar falhas.
- [x] Implementar atendimento.py, migração em db.py, projeção em casos.py e rotas em routes_coord.py.
- [x] Executar testes focados e regressão backend.

### Task 2: Coordenação
- [x] Testar formulário de atendimento e recortes da fila; observar falhas.
- [x] Implementar Atendimento.tsx, tipos/cliente em api.ts, integração no detalhe, filtros e contagens em Fila.tsx.
- [x] Verificar formulário, erros, conflito, teclado e telas estreitas; executar Vitest e build.

### Task 3: Entrega
- [x] Revisar alterações, documentar semântica e resultados reais da verificação.

Execução autorizada pelo pedido do usuário; implementação na árvore atual para preservar as funcionalidades ainda não commitadas. Sem commits automáticos agrupando trabalho anterior.
