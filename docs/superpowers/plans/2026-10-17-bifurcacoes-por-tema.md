# Bifurcações por tema — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Expandir o questionário das 29 opções com bifurcações próprias e corrigir perguntas fora de contexto, começando por cyberbullying.

**Architecture:** Catálogo declarativo mantém IDs existentes e acrescenta perguntas específicas. Python e TypeScript aplicam escopo por opção e condições OR/AND equivalentes; o portal indica o assunto da pergunta e preserva relato livre/snapshots.

**Tech Stack:** JSON, Python/Flask, React/TypeScript, pytest/Vitest/Chrome. Sem nova dependência.

**Spec:** `docs/superpowers/specs/2026-10-17-bifurcacoes-por-tema-design.md`.

## Global Constraints

- Preservar alterações anteriores do mapa e os dados/códigos existentes; sem commits automáticos ou instalação.
- Respostas do questionário são opcionais. Peso zero para novas informações descritivas; preservar regras existentes pertinentes.
- Contrato `para_opcoes` limita assuntos; `mostrar_se_todas` é AND, `mostrar_se` é OR; backend e frontend devem concordar.
- Até200 perguntas/256KiB de definição; respostas65536bytes/400IDs.
- Não escrever em diretórios temporários fora de `.superpowers/sdd/2026-10-17-bifurcacoes/`.

## Review Focus

- Cyberbullying não pode abrir investigação de conta invadida sem motivo; testar cada tipo de conteúdo.
- Um gatilho compartilhado não pode abrir um tema desmarcado; testar escopo com seleção múltipla.
- Trocar resposta deve apagar toda a cadeia oculta; testar três níveis e rascunho.
- Perguntas de risco existentes não podem ganhar alerta pela seleção isolada de um tema; testar triagem e equivalência.
- Dados históricos e questionários personalizados antigos continuam válidos; testar definição sem novos campos e snapshot.

### Tarefa1 — Conteúdo específico

**Arquivos:** `backend/app/questionario_v3.json`; novo `backend/tests/test_bifurcacoes_conteudo.py`; matriz em documentação.

- [x] Testes vermelhos da cobertura das29 opções, raiz própria e descendente; cenários negativos de conta/perfil/adulteração.
- [x] Expandir cada tema, priorizando cyberbullying, mantendo gerais e compartilhadas apenas quando pertinentes.
- [x] Validar referências, tamanho, acessibilidade da linguagem e caminhos com não sei/prefiro não responder.

### Tarefa2 — Motor e validação

**Arquivos:** `backend/app/questionario_v3.py`, `frontend/src/aluno/fluxoV3.ts`, testes próprios novos.

- [x] Testar vermelho escopo por opção, AND+OR, payload oculto e ciclos/referências inválidas.
- [x] Implementar o mesmo alcance em Python/TypeScript, exportar condições públicas sem regras privadas, ajustar limites.
- [x] Confirmar paridade, transição de três níveis e compatibilidade sem campos novos.

### Tarefa3 — Portal e rascunho

**Arquivos:** `frontend/src/shared/api.ts`, `aluno/Pedido.tsx`, `rascunhoV3.ts`, fixture pública e testes relacionados.

- [x] Testar validação das condições recebidas, preservação do rascunho ampliado e contexto do assunto.
- [x] Acrescentar tipos/validação; indicar assunto da pergunta; manter pular para o relato e identificação existentes.
- [x] Ajustar testes que exprimiam percursos genéricos incorretos, preservando testes de segurança e histórico.

### Tarefa4 — Verificação e documentação

- [x] Rodar testes de conteúdo/motor/triagem/API e suítes frontend, corrigir regressões justificadas.
- [x] Ensaiar cyberbullying no navegador, alternância de ramos e envio sem perguntas obrigatórias.
- [x] Rodar TypeScript, contraste e dois builds; revisão independente dos percursos/privacidade e registrar evidências.

## Execução

Usuário pediu a expansão e apontou cyberbullying como exemplo; seguir a implementação no checkout atual preservando o mapa. Conteúdo e motor têm arquivos distintos e podem ser trabalhados em paralelo conforme skill de despacho de agentes; integração do portal e validação ficam com o agente principal.

