# Limpeza da implantação secundária — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O primeiro admin apaga todos os dados de uso (casos, conversas, anexos, cópias de segurança) de uma instalação marcada como secundária, preservando usuários e mapa.

**Architecture:** Flag `implantacao_secundaria` no `config.json` (campo de `Config`), módulo puro `backend/app/implantacao.py` (contagem e limpeza), duas rotas na coordenação protegidas por flag, primeiro admin, senha e frase, e um cartão "Zona de risco" na tela Usuários.

**Tech Stack:** Flask + SQLite (pytest da raiz: `backend/.venv/Scripts/python.exe -m pytest backend/tests/<arquivo> -q -p no:cacheprovider`; nunca dois pytest ao mesmo tempo), React 19 + Vitest (`cd frontend; npx vitest run --config vite.coord.config.ts --maxWorkers=1 <arquivos>`).

**Spec:** `docs/superpowers/specs/2026-10-25-limpeza-implantacao-secundaria-design.md`

## Global Constraints

- Português do Brasil em código, comentários, testes, mensagens e commits; sem travessões longos em texto novo.
- A funcionalidade só existe com `"implantacao_secundaria": true` no `config.json`; sem isso as duas rotas respondem 404 (`_nao_encontrado()`).
- Apenas o primeiro admin (menor `id` com `papel = 'admin'`); outros recebem 403. Frase exata `APAGAR TUDO`; senha conferida com `auth.autenticar` (mesmo contador de tentativas do login).
- Apaga: `DELETE FROM casos` (filhos por `ON DELETE CASCADE`) e os `sqlite_sequence` correspondentes, arquivos de `uploads/` e, por padrão (`apagar_backups` ausente = `true`), as subpastas de `backups/` e o `seguranca.db.pre-v2.bak`. Preserva `usuarios`, `ambientes`, `mapa_estado`, `limpezas_implantacao`, `config.json`, `secret.key`, `sessao.key`, `risk_terms.json` e `questionario*.json`.
- Banco primeiro (transação `BEGIN IMMEDIATE`), disco só depois do commit; depois `PRAGMA wal_checkpoint(TRUNCATE)` e `VACUUM`.
- Nunca tocar `C:\ProgramData\SegurancaIntegral` nem banco real: só fixtures e pastas temporárias. Nunca usar subagente opus. Sem push neste plano (o push final é do fechamento do visual).
- Commits só com os arquivos da task. Nunca adicionar pastas não rastreadas (`.impeccable`, `anti-slop`, `docs/mapa-codigo`, `output`, Vault, capturas).

## Review Focus

1. Ordem banco antes de disco: qualquer falha no banco não pode apagar arquivos (Task 1).
2. Dados residuais no SQLite: o texto de um caso apagado não pode sobrar nos bytes do `.db` nem do `-wal` (Task 1).
3. Autorização: flag desligada dá 404 até para o primeiro admin; segundo admin 403; senha errada incrementa tentativas e bloqueio vale também para limpar (Task 2).
4. Primeiro admin desativado ou inexistente: ninguém limpa (Task 2).
5. Interface: o botão só habilita com frase exata e senha; a senha nunca fica no estado depois de erro ou sucesso (Task 3).

---

### Task 1: Configuração, migração e módulo `implantacao`

**Files:**
- Modify: `backend/app/config.py` (campo `implantacao_secundaria: bool = False` em `Config`; validação em `_ler_config_json`, devolvida no dicionário)
- Modify: `backend/app/db.py` (migração aditiva da tabela `limpezas_implantacao`, chamada junto das demais `_migrar_*` em `init_db`)
- Create: `backend/app/implantacao.py`
- Test: `backend/tests/test_implantacao.py` (novo), `backend/tests/test_config.py` (casos da chave)

**Interfaces:**
- Produces: `Config.implantacao_secundaria: bool`. Em `implantacao.py`:
  - `resumo(conn: sqlite3.Connection, config: Config) -> dict` com chaves `casos`, `mensagens`, `anexos`, `arquivos` (arquivos regulares em `uploads/`), `backups` (subpastas de `backups/` mais o `.pre-v2.bak` se existir), e `ultima_limpeza: dict | None` (`{"em", "por", "casos"}`).
  - `limpar(conn: sqlite3.Connection, config: Config, usuario_id: int, apagar_backups: bool = True) -> dict` devolve `{"casos": n, "mensagens": n, "anexos": n, "arquivos": n, "backups": n, "avisos": list[str]}`.
  - `primeiro_admin_id(conn: sqlite3.Connection) -> int | None` (menor `id` com `papel = 'admin'`, mesmo se inativo).
  - Tabela `limpezas_implantacao (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER REFERENCES usuarios(id), criado_em TEXT NOT NULL, casos INTEGER NOT NULL, mensagens INTEGER NOT NULL, anexos INTEGER NOT NULL, backups INTEGER NOT NULL)`.

- [ ] **Step 1: Write the failing tests**
  - `test_config.py`: `implantacao_secundaria` aceita `true`/`false`; padrão `False`; rejeita `"true"`, `1`, `null` com `ValueError("config.json: implantacao_secundaria precisa ser true ou false")`.
  - `test_implantacao.py` (fixtures `config` e `conn`; criar casos via `casos.criar_caso`/helpers de `test_coord_api.py::_caso`, mensagens com `adicionar_mensagem`, anexos com `uploads.salvar_anexo`, foto de autor gravada em `uploads/` e ligada a `autores_resolucao.foto_nome`):
    - `test_primeiro_admin_id_e_o_menor_id_de_admin`, `test_sem_admin_devolve_none`, `test_admin_desativado_ainda_e_o_primeiro`.
    - `test_resumo_conta_casos_mensagens_anexos_arquivos_e_backups`; `test_ultima_limpeza_nula_antes_e_preenchida_depois`.
    - `test_limpar_apaga_filhos_e_preserva_usuarios_e_mapa` (usuários e `ambientes`/`mapa_estado` idênticos antes e depois; tabelas filhas vazias).
    - `test_ids_recomecam_do_um` (novo caso após limpar tem `id` 1).
    - `test_arquivos_do_disco_sao_removidos_e_pasta_uploads_permanece` (anexos, fotos e arquivo solto).
    - `test_backups_apagados_por_padrao_e_preservados_com_false` (subpastas e `seguranca.db.pre-v2.bak`).
    - `test_arquivos_de_configuracao_permanecem` (`config.json`, `secret.key`, `sessao.key`, `risk_terms.json`).
    - `test_texto_unico_nao_sobra_nos_bytes_do_banco` (relato e mensagem com marca única; depois da limpeza a marca não aparece em `seguranca.db` nem em `seguranca.db-wal`).
    - `test_falha_no_banco_nao_apaga_arquivos` (força erro na transação, por exemplo trigger ou monkeypatch do `DELETE`; os arquivos de `uploads/` continuam).
    - `test_falha_ao_remover_arquivo_gera_aviso_e_nao_desfaz` (monkeypatch de `Path.unlink` para um arquivo).
    - `test_limpar_sem_nada_devolve_zeros` e `test_registra_limpeza_com_contagens_sem_texto`.
    - `test_migracao_cria_tabela_em_banco_antigo` (idempotente).

- [ ] **Step 2: Run** `pytest backend/tests/test_implantacao.py backend/tests/test_config.py` — Expected: FAIL.

- [ ] **Step 3: Implement** conforme as Interfaces e a spec: ler nomes de `anexos.nome_interno` e `autores_resolucao.foto_nome` e as contagens antes de apagar; um `BEGIN IMMEDIATE` com `DELETE FROM casos`, `DELETE FROM sqlite_sequence WHERE name IN ('casos','anexos','mensagens','mensagens_versoes','notas_internas','eventos','resolucoes','autores_resolucao','situacoes_aluno','revisoes_recorrencia')` (apenas as que existirem) e o `INSERT` em `limpezas_implantacao`, commit; só depois remove os arquivos (usar `caminho_anexo` para nomes conhecidos e varrer o restante da pasta), apaga backups se pedido, `PRAGMA wal_checkpoint(TRUNCATE)` e `VACUUM` (fora de transação). Erro de remoção de arquivo entra em `avisos` e o log recebe só contagens.

- [ ] **Step 4: Run** `pytest backend/tests/test_implantacao.py backend/tests/test_config.py backend/tests/test_db.py backend/tests/test_simulation.py backend/tests/test_backup.py` — Expected: PASS.

- [ ] **Step 5: Commit** `git add backend/app/config.py backend/app/db.py backend/app/implantacao.py backend/tests/test_implantacao.py backend/tests/test_config.py && git commit -m "Implantacao secundaria: configuracao, migracao e limpeza dos dados"`

### Task 2: Rotas da coordenação

**Files:**
- Modify: `backend/app/routes_coord.py` (duas rotas; `SO_ADMIN` recebe os endpoints)
- Test: `backend/tests/test_implantacao_api.py` (novo; reutilizar fixtures `coord_app`, `coord_client`, `coord_logado` e `coordenador` de `test_coord_api.py`/`conftest.py`; para ligar a flag criar `Config` com `implantacao_secundaria=True` via `dataclasses.replace` ou `config.json` na pasta temporária)

**Interfaces:**
- Consumes: `implantacao.resumo`, `implantacao.limpar`, `implantacao.primeiro_admin_id`, `auth.autenticar(conn, nome, senha, agora)`, `publicar`.
- Produces (HTTP): `GET /api/implantacao` → 200 `{"secundaria": true, "resumo": {casos, mensagens, anexos, arquivos, backups}, "ultima_limpeza": {...} | null}`; `POST /api/implantacao/limpar` com `{"senha": str, "confirmacao": "APAGAR TUDO", "apagar_backups": bool?}` → 200 `{"ok": true, "removidos": {...}, "avisos": [...]?}`; erros 404, 403 (`{"erro": "sem permissao"}`), 400 (`{"erro": "confirmacao invalida"}` e `{"erro": "apagar_backups invalido"}`), 403 (`{"erro": "senha incorreta"}`), 401, 415.

- [ ] **Step 1: Write the failing tests**
  - `test_flag_desligada_da_404_ate_para_o_primeiro_admin` (GET e POST); `test_sem_sessao_401`; `test_sem_json_415`.
  - `test_coordenador_e_segundo_admin_recebem_403`; `test_primeiro_admin_desativado_ninguem_limpa`.
  - `test_get_traz_resumo_e_ultima_limpeza`.
  - `test_frase_errada_400_e_nada_apagado`; `test_apagar_backups_nao_booleano_400`.
  - `test_senha_errada_403_incrementa_tentativas`; `test_bloqueio_por_tentativas_vale_para_limpar` (cinco falhas e a senha certa também dá 403).
  - `test_sucesso_apaga_e_mantem_usuarios_e_mapa_e_login_funciona` (inclui `apagar_backups` ausente = apaga as cópias; `false` mantém).
  - `test_publica_atualizacao_uma_vez` (padrão de `test_realtime.py`).
  - `test_corpo_invalido_nunca_apaga`.

- [ ] **Step 2: Run** `pytest backend/tests/test_implantacao_api.py` — Expected: FAIL (404 nas rotas).

- [ ] **Step 3: Implement** as rotas (`@bp.get("/api/implantacao")`, `@bp.post("/api/implantacao/limpar")`, nomes de endpoint `coord.implantacao` e `coord.limpar_implantacao` em `SO_ADMIN`); ordem de validação: flag, primeiro admin, frase, tipo de `apagar_backups`, senha; chamar `publicar(None)` depois do sucesso e registrar uma linha de log sem dados.

- [ ] **Step 4: Run** `pytest backend/tests/test_implantacao_api.py backend/tests/test_implantacao.py backend/tests/test_coord_api.py backend/tests/test_auth.py backend/tests/test_realtime.py` (em segundo plano se passar de 2 minutos) — Expected: PASS.

- [ ] **Step 5: Commit** `git add backend/app/routes_coord.py backend/tests/test_implantacao_api.py && git commit -m "API da limpeza da implantacao secundaria"`

### Task 3: Interface (cartão Zona de risco)

**Files:**
- Modify: `frontend/src/shared/api.ts` (tipos `ResumoImplantacao`, `Removidos`, funções `obterImplantacao(): Promise<ResumoImplantacao | null>` que devolve `null` em 404 e 403, e `limparImplantacao(senha: string, confirmacao: string, apagarBackups: boolean)`; `coord()` já aceita POST)
- Create: `frontend/src/coord/LimparImplantacao.tsx` (`export default function LimparImplantacao({ aoLimpar }: { aoLimpar: () => void })`)
- Modify: `frontend/src/coord/Usuarios.tsx` (renderiza o cartão no fim), `frontend/src/coord/coord.css` (classes `.zona-risco`, `.zona-risco-painel`, compostas só com tokens existentes, tom de perigo com `--perigo-base` e `--perigo-suave`), `frontend/src/coord/App.tsx` (passa `aoLimpar` para atualizar o resumo e limpar rascunhos)
- Test: `frontend/src/coord/LimparImplantacao.test.tsx` (novo), `frontend/src/coord/testes/servidor.ts` (mock das rotas se necessário), `Usuarios` já coberto em teste existente se houver

**Interfaces:**
- Consumes: `GET /api/implantacao` e `POST /api/implantacao/limpar` da Task 2; `limparRascunhosAtendimento()` de `rascunhosAtendimento.ts`.

- [ ] **Step 1: Write the failing tests**
  - Cartão ausente em 404 e 403 (nada renderizado) e presente em 200, com o título "Implantação secundária: apagar todos os dados", a contagem "12 casos, 48 mensagens, 5 anexos, 3 cópias de segurança" e "Última limpeza: ..." quando houver.
  - Botão "Apagar todos os dados…" abre o painel: foco no campo Senha; "Apagar tudo" desabilitado até frase exata `APAGAR TUDO` e senha preenchida; caixa "Apagar também as cópias de segurança" marcada; Esc e "Cancelar" fecham e devolvem o foco ao botão de abertura; nenhum `window.confirm`.
  - Envio chama `limparImplantacao(senha, 'APAGAR TUDO', true)` (e `false` se a caixa for desmarcada); durante a chamada botões desabilitados e "Apagando…" (`role="status"`); duplo clique chama uma vez.
  - Erro 403 mostra "A senha está incorreta." (`role="alert"`), 400 mostra "Confirme digitando exatamente APAGAR TUDO."; a senha é limpa depois de qualquer erro ou sucesso e o painel permanece aberto no erro.
  - Sucesso: "Dados apagados: N casos, N mensagens, N anexos, N cópias de segurança." (`role="status"`), contagens zeram, `limparRascunhosAtendimento` e `aoLimpar` são chamados, painel fecha, foco no título do cartão.

- [ ] **Step 2: Run** `npx vitest run --config vite.coord.config.ts --maxWorkers=1 src/coord/LimparImplantacao.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** o componente e as ligações; texto novo em português sem travessões longos.

- [ ] **Step 4: Run** o arquivo novo e `src/coord/App.test.tsx`, `src/coord/portal.test.tsx` (sem outras suítes), depois `npm run build:coord` — Expected: PASS.

- [ ] **Step 5: Commit** `git add frontend/src && git commit -m "Coordenacao: cartao Zona de risco para limpar a implantacao secundaria"` (só os arquivos da task).

### Task 4: Fechamento

**Files:**
- Modify: `docs/operacao-lan.md`, `installer/LEIA-ME-LAN.txt`, `installer/LEIA-ME.txt` (como ligar `implantacao_secundaria`, aviso destacado de que é só para instalações de teste, o que a limpeza apaga e preserva), `docs/acolhimento-e-conversas.md` ou guia da coordenação (seção curta)
- Create: `docs/verificacao-limpeza-implantacao.md`; nota do dia no Vault (`Diário/2026-10-25.md`, com links nos hubs)

- [ ] **Step 1:** Documentar. `grep` pelo `LEIA-ME` atual para seguir o estilo; português sem travessões longos.
- [ ] **Step 2: Suítes completas, uma por vez, em segundo plano:** backend (`pytest backend/tests -q -p no:cacheprovider` da raiz), depois `npx vitest run --config vite.coord.config.ts --maxWorkers=1`, `npx vitest run --config vite.aluno.config.ts --maxWorkers=1`, `npm run build:coord`, `npm run build:aluno`. Expected: tudo verde (o backend leva cerca de 40 minutos).
- [ ] **Step 3: Chrome real** (Playwright, `channel: 'chrome'`) com backend em banco temporário (portas 3100/4100, nunca `C:\ProgramData`): sem a flag a tela Usuários não mostra o cartão; com a flag e logado como primeiro admin o cartão aparece em 375 e 1280, o fluxo completo apaga casos, mensagens, anexos e backups e mantém usuários e mapa; os arquivos de `uploads/` e de `backups/` sumiram; outro admin e coordenador não veem o cartão; sem rolagem horizontal. Ler as capturas.
- [ ] **Step 4:** Registrar o resultado em `docs/verificacao-limpeza-implantacao.md`, atualizar o Vault, salvar o aprendizado com `trail note`, commit dos arquivos da task.
