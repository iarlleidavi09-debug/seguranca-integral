# Mapa escolar — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Integrar o mapa desenhável aprovado e os dados de turma/autor ao atendimento escolar.

**Architecture:** SQLite mantém ambientes hierárquicos, revisão da planta e dados históricos dos casos. Flask expõe catálogo público mínimo e operações autenticadas; React renderiza o editor SVG e os formulários. Contratos independentes permitem implementar servidor, mapa e formulários em arquivos distintos.

**Tech Stack:** Python/Flask/SQLite, React 19/TypeScript, pytest/Vitest/Playwright. Sem nova dependência de produção.

**Spec:** `docs/superpowers/specs/2026-10-17-mapa-escolar-design.md`.

## Global Constraints

- Operação LAN sem serviço externo; preservar dados, códigos e contratos v2/v3.
- Ano e sala obrigatórios são de quem relata, inclusive sem nome.
- Nomes/fotos dos autores e justificativa interna acessíveis apenas à coordenação.
- Planta de 1200 × 800 unidades por nível, até 500 ambientes e seis níveis.
- Resoluções e planta usam revisão para evitar sobrescrita concorrente.
- Não instalar programa, mudar firewall, publicar ou fazer commit da base preexistente.

## Review Focus

- Relato anônimo com turma não pode ser confundido com identificação nominal; testar permanência dos campos e aviso.
- Autor desconhecido e casos legados não podem virar turma inferida; testar contadores separados.
- Dois autores da mesma turma não podem duplicar caso no mapa; testar agregação e última resolução.
- Mudança da planta durante edição não pode apagar desenho; testar conflito 409 e revisão.
- Foto inválida, falha transacional ou acesso sem sessão não podem deixar arquivo público ou órfão; testar limites e isolamento.

### Tarefa 1 — Persistência, catálogo e mapa autenticado

**Arquivos:** criar `backend/app/mapa.py`, `backend/app/routes_mapa.py`, `backend/tests/test_mapa.py`; modificar `db.py`, `__init__.py`.
**Interfaces:** contratos `Ambiente`, `/api/mapa`, `/api/locais`, `/api/mapa/resumo` da spec.

- [x] Escrever testes de planta vazia, salvar/recarregar, hierarquia/ciclo/geometria inválida, autenticação e revisão 409; observar falha antes da implementação.
- [x] Implementar migração com backup, validação e gravação transacional; publicação somente depois do commit.
- [x] Testar agregados com casos sem local, antigos, simulação, múltiplos autores e última resolução.
- [x] Executar `python -m pytest tests/test_mapa.py -q`; resultado esperado: todos passam.

### Tarefa 2 — Relato e finalização no servidor

**Arquivos:** `routes_v3.py`, `envios.py`, `casos.py`, `routes_coord.py`, módulo isolado para autoria, novos testes backend.
**Interfaces:** multipart v4 descrito na spec; detalhe autenticado com novos campos opcionais; foto autenticada.

- [x] Testes vermelhos: turma obrigatória no v4, anonimato sem nome mantendo turma, local inválido e deduplicação sensível aos campos novos.
- [x] Implementar envio v4 preservando rotas anteriores e retrato do nome do local.
- [x] Testes vermelhos: autores obrigatórios, desconhecido com justificativa, foto inválida/autorização, conflito sem arquivos órfãos, nenhum dado interno no acompanhamento.
- [x] Implementar resolução v4/foto com transação e limpeza em falha.
- [x] Rodar testes novos e regressões de envio, coordenação, backup e concorrência.

### Tarefa 3 — Editor e consulta da coordenação

**Arquivos:** criar `frontend/src/coord/mapa/*`, `frontend/src/shared/mapa.ts`; modificar `coord/App.tsx`, `Navegacao.tsx`, `coord.css`.
**Interfaces:** `Mapa` como nova tela autenticada; cliente isolado importa os contratos da spec.

- [x] Testes vermelhos: planta vazia, desenho, nome, mover/redimensionar, navegar em ala/andar, desfazer, cancelar e salvar.
- [x] Implementar editor e navegação hierárquica com zoom, busca, alternativa acessível de criação por formulário e limites.
- [x] Testes de filtros e conflito preservando rascunho; implementar resumo e atualização sem apagar edição.
- [x] Executar Vitest da coordenação e TypeScript; verificar interface desktop/móvel em navegador.

### Tarefa 4 — Formulários e detalhe

**Arquivos:** `aluno/Pedido.tsx`, `rascunhoV3.ts`, `fluxoV3.ts`, `coord/RegistrarResolucao.tsx`, `Caso.tsx`, `shared/api.ts`, testes relacionados.
**Interfaces:** campos do envio v4 e `DadosResolucao` com autores/fotos; compatibilidade dos dados antigos.

- [x] Testes vermelhos: ano/sala permanecem sem nome e são exigidos; local pode ficar desconhecido; campos aparecem na revisão e no FormData.
- [x] Integrar catálogo sem bloquear pedido quando indisponível e persistir rascunho sem fotos/códigos.
- [x] Testes vermelhos: finalização com vários autores, foto opcional e desconhecido com justificativa; implementar formulário interno separado dos textos visíveis ao aluno.
- [x] Exibir dados internos no detalhe autenticado e turma/local do relator; manter texto em erro/409.
- [x] Executar testes dos formulários e cliente HTTP.

### Tarefa 5 — Integração e entrega

- [x] Rodar suítes frontend/backend, TypeScript, contraste e dois builds; registrar limitações reais.
- [x] Validar desenho vazio, hierarquia, reload e filtros, envio sem nome e finalização em navegador com dados fictícios.
- [x] Revisão independente de privacidade, migração e concorrência; corrigir achados e repetir testes afetados.
- [x] Atualizar documentação de operação e arquivo de verificação. Não gerar afirmação de instalação validada.

### Complemento — Alas em L

**Motivo:** usuário informou durante a implementação que existem alas em L; incorporar à mesma entrega.

- [x] Teste vermelho de geometria L/rotação/espessura; adicionar campos opcionais ao tipo e à persistência, com migração aditiva/default retangular.
- [x] Implementar polígono de seis vértices e controles de formato, rotação e espessura, preservando seleção/mover/redimensionar/filhos.
- [x] Testar salvar/recarregar L, limites inválidos e compatibilidade dos ambientes antigos.
- [x] Verificar forma em L no navegador e repetir builds/testes afetados. A suíte backend em andamento cobre a base anterior; registrar também a verificação dirigida do complemento.

## Registro de execução

- 17/10/2026: plano criado. Execução autorizada na mesma mensagem do usuário; não repetir pedido de aprovação. Preservar base v3 ainda sem commit. Divisão por arquivos para trabalho paralelo conforme skill `dispatching-parallel-agents`.
- 17/10/2026: incluído o suporte a alas em L conforme complemento do usuário, sem reiniciar tarefas anteriores.

