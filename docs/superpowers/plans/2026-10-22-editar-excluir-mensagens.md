# Editar e excluir mensagens da coordenação — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coordenação edita e exclui mensagens que enviou ao aluno; o aluno vê "(editada)" ou "Mensagem apagada"; o texto anterior fica guardado só para a coordenação.

**Architecture:** Migração aditiva em `mensagens` (duas colunas) mais a tabela `mensagens_versoes`. Regras de domínio em `casos.py`, três rotas novas em `routes_coord.py`, flags novas nas saídas do aluno e da coordenação. O front reaproveita `Conversa.tsx` (coordenação) e `Acompanhar.tsx` (aluno) com as classes e tokens existentes. Ao excluir, o texto sai de `mensagens`, então nenhuma consulta existente vaza o conteúdo.

**Tech Stack:** Flask + SQLite (pytest, executar de `D:\Prototipo segurança integral` com `backend/.venv/Scripts/python.exe -m pytest backend/tests/<arquivo> -q -p no:cacheprovider`), React 19 + Vitest (`cd frontend; npx vitest run --config vite.coord.config.ts --maxWorkers=1 <arquivo>`; aluno usa `vite.aluno.config.ts`).

**Spec:** `docs/superpowers/specs/2026-10-22-editar-excluir-mensagens-design.md`

## Global Constraints

- Português do Brasil em código novo, comentários, mensagens de erro e commits; texto novo sem travessões longos.
- Só `autor='coordenacao'` é alterável. Permissão: `mensagens.usuario_id == usuário logado` ou `papel == 'admin'`; `usuario_id` nulo só o admin.
- Texto de edição: 1 a 2000 caracteres (mesmo `_texto_valido` do envio). O `id` da mensagem nunca muda.
- Excluir: copia o texto atual para `mensagens_versoes`, grava `texto=''` e `apagada_em`. Editar: grava o texto anterior em `mensagens_versoes` e atualiza `editada_em`.
- Eventos `mensagem_editada` e `mensagem_apagada`, detalhe `mensagem <id>`, nunca o texto, na mesma transação da alteração; depois `publicar(caso_id)`.
- Aluno recebe só `editada: bool` e `apagada: bool` por mensagem. Nunca `editada_em`, versões, autor da alteração nem o texto apagado.
- Sem cor, fonte ou token novo: reutilizar classes de `coord.css` e `aluno.css`. Sem `window.confirm`.
- Testes de backend e de front novos antes do código (TDD). Suíte completa e builds só na Task 5.
- Não usar subagentes opus. Não fazer push. Banco real nunca é tocado; migração ensaiada em cópia temporária.

## Review Focus

1. Texto apagado vazando por outra saída (`estado_conversa.ultima_mensagem`, lista da fila, exportação HTML, `/api/acompanhar`): teste varre todas as respostas procurando o texto apagado (Task 2).
2. `mensagem_id` de outro caso na URL deve dar 404, nunca alterar a mensagem alheia (Task 2).
3. Mensagem legada com `usuario_id` nulo: coordenador comum recebe 403; admin consegue (Task 1).
4. Duplo clique em Excluir ou Salvar: segunda chamada é inofensiva (idempotente no backend; botões desabilitados no front) (Tasks 1 e 3).
5. Edição com texto só de espaços ou acima de 2000 caracteres: 400 e o texto digitado no front não se perde (Tasks 2 e 3).

---

### Task 1: Dados e regras de domínio

**Files:**
- Modify: `backend/app/db.py` (esquema `mensagens`, nova tabela, migração aditiva chamada junto das demais `_migrar_*`)
- Modify: `backend/app/casos.py` (`listar_mensagens`, `estado_conversa`, `detalhe_caso` bloco de mensagens, novas funções)
- Test: `backend/tests/test_mensagens_edicao.py` (novo)

**Interfaces:**
- Produces (em `casos.py`):
  - `alterar_mensagem(conn, caso_id: int, mensagem_id: int, usuario_id: int, papel: str, texto: str) -> str` devolve `'ok' | 'sem_mudanca' | 'inexistente' | 'proibido' | 'apagada'`.
  - `apagar_mensagem(conn, caso_id: int, mensagem_id: int, usuario_id: int, papel: str) -> str` devolve `'ok' | 'ja_apagada' | 'inexistente' | 'proibido'`.
  - `versoes_mensagem(conn, caso_id: int, mensagem_id: int) -> list[dict] | None` (`None` se a mensagem não existe no caso); cada item `{id, texto, acao, usuario, criado_em}`, mais antigo primeiro.
  - `pode_alterar_mensagem(mensagem: sqlite3.Row | dict, usuario_id: int, papel: str) -> bool`.
  - `listar_mensagens` e o bloco `mensagens` de `detalhe_caso` passam a incluir `editada_em` e `apagada_em`; `estado_conversa()['ultima_mensagem']` passa a incluir `apagada_em`.
- Consumes: `registrar_evento(conn, caso_id, tipo, usuario_id, detalhe, commit=False)` e `_agora()` já existentes.

- [ ] **Step 1: Write the failing tests** em `test_mensagens_edicao.py` (fixtures `config`, `conn` de `conftest.py`; criar caso e mensagem via `casos.adicionar_mensagem(..., autor='coordenacao', usuario_id=...)`):
  - `test_migracao_adiciona_colunas_em_banco_antigo`: cria banco com `mensagens` sem as colunas (copiar o esquema antigo num arquivo temporário), roda `init_db`, afirma que `editada_em`, `apagada_em` e a tabela `mensagens_versoes` existem e que as mensagens antigas continuam.
  - `test_autor_edita_e_versao_guarda_texto_anterior`: resultado `'ok'`, `texto` novo, `editada_em` preenchido, uma versão com `acao='edicao'` e o texto antigo, um evento `mensagem_editada` sem o texto no `detalhe`.
  - `test_edicao_igual_nao_cria_versao_nem_evento` → `'sem_mudanca'`.
  - `test_outro_coordenador_nao_edita` → `'proibido'`; `test_admin_edita_mensagem_alheia` → `'ok'`.
  - `test_mensagem_legada_sem_usuario_id_so_admin` → coordenador `'proibido'`, admin `'ok'`.
  - `test_mensagem_do_aluno_nunca_e_alteravel` → `'proibido'` até para admin.
  - `test_apagar_limpa_texto_guarda_versao_e_e_idempotente`: `'ok'`, `texto == ''`, `apagada_em` preenchido, versão `acao='exclusao'` com o texto original, evento `mensagem_apagada`; segunda chamada `'ja_apagada'` sem nova versão.
  - `test_editar_apagada_devolve_apagada`.
  - `test_mensagem_de_outro_caso_e_inexistente` para editar, apagar e versões.
  - `test_ultimo_id_e_contagem_de_novas_nao_mudam`: `estado_conversa` antes e depois de editar/apagar uma mensagem do aluno-visível mantém `mensagens_novas` e o `id`.
  - `test_ultima_mensagem_apagada_nao_expoe_texto`.

- [ ] **Step 2: Run** `pytest backend/tests/test_mensagens_edicao.py` — Expected: FAIL (funções e colunas inexistentes).

- [ ] **Step 3: Implement** em `db.py`: `CREATE TABLE IF NOT EXISTS mensagens_versoes (id INTEGER PRIMARY KEY AUTOINCREMENT, mensagem_id INTEGER NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE, caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE, texto TEXT NOT NULL, acao TEXT NOT NULL CHECK (acao IN ('edicao','exclusao')), usuario_id INTEGER REFERENCES usuarios(id), criado_em TEXT NOT NULL)` com índice por `mensagem_id`; `_migrar_edicao_mensagens(conn)` no padrão de `_migrar_respostas`, chamada onde as outras migrações aditivas são chamadas. Em `casos.py`: implementar as funções da seção Interfaces numa única transação (versão + `UPDATE mensagens` + evento com `commit=False`, depois um `conn.commit()`; `UPDATE casos SET atualizado_em` não deve ser alterado). Ajustar as três consultas de leitura para trazer `editada_em` e `apagada_em`.

- [ ] **Step 4: Run** `pytest backend/tests/test_mensagens_edicao.py backend/tests/test_db.py backend/tests/test_conversas.py` — Expected: PASS.

- [ ] **Step 5: Commit** `git add backend/app/db.py backend/app/casos.py backend/tests/test_mensagens_edicao.py && git commit -m "Mensagens: colunas, versoes e regras de editar e apagar"`

### Task 2: Rotas e saídas (coordenação, aluno, exportação)

**Files:**
- Modify: `backend/app/routes_coord.py` (3 rotas novas junto de `enviar_mensagem`; `detalhe` adiciona `pode_alterar`)
- Modify: `backend/app/routes_student.py` (`acompanhar`: flags)
- Modify: `backend/app/exportacao.py` (mensagem apagada/editada)
- Test: `backend/tests/test_mensagens_api.py` (novo; reutilizar `_caso`/`_consulta` de `test_coord_api.py` e as fixtures `coord_logado`, `coordenador`, `student_client`)

**Interfaces:**
- Consumes: as funções de domínio da Task 1.
- Produces (HTTP):
  - `PATCH /api/casos/<int:caso_id>/mensagens/<int:mensagem_id>` corpo `{texto}` → 200 `{ok:true}`; 400 `{"erro":"mensagem deve ter de 1 a 2000 caracteres"}`; 403 `{"erro":"sem permissao para alterar esta mensagem"}`; 404 padrão `_nao_encontrado()`; 409 `{"erro":"mensagem apagada nao pode ser editada"}`.
  - `DELETE` mesma URL → 200 `{ok:true}`; 403; 404.
  - `GET .../mensagens/<id>/versoes` → 200 `{"versoes":[{id,texto,acao,usuario,criado_em}]}`; 404.
  - Detalhe do caso: cada mensagem ganha `editada_em`, `apagada_em`, `pode_alterar: bool` (calculado com `casos.pode_alterar_mensagem(m, g.usuario['id'], g.usuario['papel'])`).
  - `/api/acompanhar`: cada mensagem `{id, autor, texto, criado_em, editada, apagada}`; `texto == ''` quando apagada.

- [ ] **Step 1: Write the failing tests**:
  - `test_patch_edita_e_aluno_ve_editada_sem_vazar`: após editar, `/api/acompanhar` traz o texto novo, `editada: True`, e nenhuma chave `editada_em`, `versoes`, `usuario`.
  - `test_delete_aluno_ve_apagada_e_texto_vazio`; a resposta inteira (`get_data`) não contém o texto original.
  - `test_texto_apagado_nao_vaza_em_nenhuma_saida`: após excluir, varre `/api/acompanhar`, detalhe do caso, lista de casos da fila, `estado_conversa`, exportação do caso e eventos: o texto original não aparece em nenhuma; só em `GET versoes`.
  - `test_outro_coordenador_recebe_403` e `test_admin_pode`.
  - `test_url_com_mensagem_de_outro_caso_da_404` (PATCH, DELETE, GET versoes).
  - `test_patch_texto_vazio_so_espacos_e_acima_de_2000_da_400`.
  - `test_patch_em_apagada_da_409`; `test_delete_duas_vezes_da_200`.
  - `test_detalhe_traz_pode_alterar_por_usuario` (true para o autor, false para outro coordenador, true para admin; false para mensagem do aluno).
  - `test_sem_json_content_type_da_415` e `test_sem_sessao_da_401` (guardas existentes cobrem as rotas novas).
  - `test_edicao_e_exclusao_publicam_no_tempo_real`: o assinante do caso é notificado (padrão de `test_realtime.py`).

- [ ] **Step 2: Run** `pytest backend/tests/test_mensagens_api.py` — Expected: FAIL (404 nas rotas).

- [ ] **Step 3: Implement** as rotas mapeando `'inexistente'→404`, `'proibido'→403`, `'apagada'→409`, `'sem_mudanca'|'ok'|'ja_apagada'→200`; `publicar(caso_id)` só quando houve mudança. Em `exportacao.py`: apagada vira o texto "Mensagem apagada"; editada acrescenta " (editada)" ao rótulo "Mensagem".

- [ ] **Step 4: Run** `pytest backend/tests/test_mensagens_api.py backend/tests/test_mensagens_edicao.py backend/tests/test_coord_api.py backend/tests/test_student_api.py backend/tests/test_acolhimento_exportacao.py backend/tests/test_realtime.py` — Expected: PASS. (Executar a partir da raiz do repositório; arquivos grandes: rodar em segundo plano.)

- [ ] **Step 5: Commit** `git add backend/app backend/tests && git commit -m "API de editar, apagar e ver versoes de mensagens"`

### Task 3: Front da coordenação

**Files:**
- Modify: `frontend/src/shared/api.ts` (tipos `Mensagem` e `MensagemCoord`; helper `coord` aceita `'PATCH'`; novas funções)
- Modify: `frontend/src/coord/Conversa.tsx`, `frontend/src/coord/Caso.tsx` (passa os itens e as ações), `frontend/src/coord/rotulos.tsx` (`descricaoEvento`), `frontend/src/coord/coord.css` (só classes novas compostas com tokens existentes)
- Modify: `frontend/src/coord/testes/servidor.ts` (mock das rotas novas)
- Test: `frontend/src/coord/Conversa.test.tsx` (novo), `frontend/src/coord/Caso.test.tsx`, `frontend/src/coord/rotulos` (teste existente ou novo)

**Interfaces:**
- Produces (`api.ts`): `Mensagem` ganha `editada?: boolean; apagada?: boolean`; `MensagemCoord` ganha `editada_em: string | null; apagada_em: string | null; pode_alterar: boolean`; `editarMensagemAoAluno(casoId: number, mensagemId: number, texto: string): Promise<{ok: boolean}>`; `excluirMensagemAoAluno(casoId: number, mensagemId: number): Promise<{ok: boolean}>`; `versoesDaMensagem(casoId: number, mensagemId: number): Promise<VersaoMensagem[]>` com `VersaoMensagem = {id: number; texto: string; acao: 'edicao'|'exclusao'; usuario: string | null; criado_em: string}`.
- Produces (`Conversa.tsx`): `Item` ganha `id?: number; editada?: boolean; apagada?: boolean; podeAlterar?: boolean`; props opcionais novas `aoEditar?: (id: number, texto: string) => Promise<void>`, `aoExcluir?: (id: number) => Promise<void>`, `aoVerVersoes?: (id: number) => Promise<VersaoMensagem[]>`. Sem essas props o componente se comporta como hoje (notas internas continuam sem editar).

- [ ] **Step 1: Write the failing tests** (Testing Library, padrão de `Caso.test.tsx`):
  - `Conversa`: botões Editar/Excluir só em itens com `podeAlterar`; Editar abre `textarea` com o texto atual e foco; Salvar chama `aoEditar` com o texto novo; Cancelar e Esc restauram sem chamar; Excluir mostra a confirmação inline "Excluir esta mensagem? O aluno verá 'Mensagem apagada'." e só chama `aoExcluir` ao confirmar; botões ficam desabilitados durante a chamada (duplo clique chama uma vez); erro rejeitado aparece em `role="alert"` e o texto digitado permanece; texto vazio ou acima de 2000 não chama a API; item `apagada` mostra "Mensagem apagada" e não mostra o texto; item `editada` mostra "editada" e "Ver versões", que lista as versões retornadas.
  - `Caso`: integração com o mock do servidor — editar atualiza a conversa; excluir mostra "Mensagem apagada"; evento do histórico lê "Mensagem editada por X" / "Mensagem apagada por X".

- [ ] **Step 2: Run** `npx vitest run --config vite.coord.config.ts --maxWorkers=1 src/coord/Conversa.test.tsx src/coord/Caso.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** conforme as Interfaces. Edição e confirmação ficam no estado local de cada item; foco volta ao botão de origem ao fechar; `Caso.tsx` usa `agir()` já existente para chamar a API, recarregar o detalhe e exibir o aviso ("Mensagem editada." / "Mensagem excluída."). `descricaoEvento` ganha `'mensagem_editada'` e `'mensagem_apagada'`.

- [ ] **Step 4: Run** os mesmos testes mais `Fila.test.tsx` e `App.test.tsx` — Expected: PASS; depois `npm run build:coord` sem erro de `tsc`.

- [ ] **Step 5: Commit** `git add frontend/src && git commit -m "Coordenacao: editar, excluir e ver versoes de mensagens"`

### Task 4: Front do aluno

**Files:**
- Modify: `frontend/src/aluno/Acompanhar.tsx`, `frontend/src/aluno/aluno.css` (classes novas só com tokens existentes)
- Test: `frontend/src/aluno/Acompanhar.test.tsx`

**Interfaces:**
- Consumes: `Mensagem.editada?: boolean` e `Mensagem.apagada?: boolean` da Task 3 (`shared/api.ts`).

- [ ] **Step 1: Write the failing tests**: mensagem `editada` mostra "(editada)" ao lado do horário e o texto novo; mensagem `apagada` mostra "Mensagem apagada" no lugar do texto, sem horário de apagamento e sem `<p>` com texto; o `role="log"` continua; atualização por tempo real troca o texto antigo pelo novo; mensagem apagada nunca conta como "nova".

- [ ] **Step 2: Run** `npx vitest run --config vite.aluno.config.ts --maxWorkers=1 src/aluno/Acompanhar.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** em `Acompanhar.tsx` no bloco que mapeia `caso.mensagens`; estilo discreto para a marca, reutilizando `texto-pequeno` e a cor de texto secundário existente.

- [ ] **Step 4: Run** `Acompanhar.test.tsx`, `TempoReal.test.tsx` e `npm run build:aluno` — Expected: PASS.

- [ ] **Step 5: Commit** `git add frontend/src && git commit -m "Aluno: marcas de mensagem editada e apagada"`

### Task 5: Fechamento

**Files:**
- Create: `docs/verificacao-editar-excluir-mensagens.md`
- Modify: `docs/acolhimento-e-conversas.md` (seção curta), vault Obsidian se o servidor MCP estiver disponível (senão registrar a pendência no relatório)

- [ ] **Step 1: Suítes completas** em segundo plano e uma por vez (nunca duas ao mesmo tempo): backend `pytest backend/tests -q -p no:cacheprovider` da raiz; front `npx vitest run --config vite.aluno.config.ts --maxWorkers=1` e `--config vite.coord.config.ts`; `npm run build:aluno` e `npm run build:coord`. Expected: tudo verde.
- [ ] **Step 2: Ensaio da migração** numa cópia temporária de um banco antigo (o de `C:\ProgramData` nunca é aberto): apagar a cópia depois.
- [ ] **Step 3: Navegador real** (Chrome, backend real em banco temporário): editar e excluir pela coordenação; conferir no aluno "(editada)" e "Mensagem apagada"; 375, 768 e 1280; claro e escuro; sem rolagem horizontal; foco e teclado (Esc).
- [ ] **Step 4: Documentar** o resultado em `docs/verificacao-editar-excluir-mensagens.md`; salvar learning com `trail note`; commit.
