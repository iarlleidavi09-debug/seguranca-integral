# Segurança Integral v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um pacote Windows instalável com dois portais (aluno na porta 3000, coordenação na porta 4000) sobre um mesmo banco, com denúncia, triagem por regras, painel de revisão e acompanhamento do caso.

**Architecture:** Um processo Python (Flask + gevent) sobe dois apps WSGI em `127.0.0.1`, cada um com seu conjunto de rotas, sobre um SQLite compartilhado. Dois sites React compilados são embutidos como arquivos estáticos. A triagem fica atrás de `classificar()` para uma IA futura. PyInstaller gera o `.exe` e Inno Setup gera o instalador.

**Tech Stack:** Python 3.11+, Flask, gevent, SQLite (`sqlite3`), pytest, React + Vite + TypeScript, vitest, PyInstaller, Inno Setup 6.

**Spec:** `docs/superpowers/specs/2026-10-14-seguranca-integral-design.md`

## Global Constraints

- Servidor de destino: Windows, 8 GB de RAM, sem GPU, dividido com o StarDust. Sem Docker, sem Socket.IO, sem serviços extras.
- Ouvintes somente em `127.0.0.1`: portal do aluno porta `3000`, portal da coordenação porta `4000`. O acesso externo é só pelo Cloudflare Tunnel já existente; o instalador não altera `cloudflared` nem o StarDust.
- Dados em `C:\ProgramData\SegurancaIntegral` (banco, anexos, backups, chave). Em testes, sempre um diretório temporário.
- Denúncia anônima não guarda nome, turma nem IP no banco. O log de acesso não registra IP.
- Código de acompanhamento: 8 caracteres no formato `XXXX-XXXX`, alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; guardado só como hash HMAC-SHA256.
- Anexos: no máximo 5 por caso, 5 MB cada, apenas PNG, JPEG, WEBP e GIF validados pelo conteúdo real.
- Gravidades: `baixa`, `media`, `alta`. Status: `novo`, `em_analise`, `aguardando_aluno`, `encaminhado`, `resolvido`.
- Tipos de caso: `cyberbullying`, `ameaca`, `vazamento`, `golpe`, `perfil_falso`, `aliciamento`, `outro`.
- Login da coordenação: senha mínima de 10 caracteres, 5 falhas bloqueiam por 15 minutos, sessão de 12 horas.
- Texto novo de interface sem travessões longos. Interface verificada em navegador real a 375, 768 e 1280 px, nos temas claro e escuro. Aplicar o núcleo das skills `impeccable` e `antislop` nas tarefas de frontend e registrar isso no relatório.
- Comentários de código e commits em português. Cada commit termina com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Relato com acentos, maiúsculas e emoji ("AMEAÇA", "ameaca") deve acionar os mesmos termos de risco. Teste na Task 2.
2. Código digitado em minúsculas, com espaços ou sem hífen deve funcionar; código inexistente e código malformado dão a mesma resposta genérica. Testes nas Tasks 3 e 5.
3. Arquivo chamado `.png` com conteúdo HTML ou executável, e arquivo vazio, são rejeitados sem perder a denúncia. Testes nas Tasks 4 e 5.
4. Vários alunos enviando ao mesmo tempo não geram `database is locked` nem perdem denúncia. Teste na Task 5 e script na Task 13.
5. Coordenação abrindo caso ou anexo inexistente, ou anexo de outro caso, recebe 404 sem vazar dados. Teste na Task 7.

## Estrutura de arquivos

```text
backend/
  app/
    __init__.py            # fábricas create_student_app / create_coord_app
    config.py              # Config, load_config
    db.py                  # connect, init_db, schema
    triage.py              # classificar, carregar_termos
    risk_terms.json        # termos de risco editáveis
    codes.py               # gerar_codigo, normalizar_codigo, hash_codigo
    ratelimit.py           # Limitador
    uploads.py             # detectar_tipo, salvar_anexo, AnexoInvalido
    auth.py                # criar_usuario, autenticar
    casos.py               # camada de dados dos casos (criar, listar, mensagens, notas, eventos)
    security.py            # cabeçalhos, validação de host, helper de IP
    routes_student.py      # blueprint do aluno
    routes_coord.py        # blueprint da coordenação
    simulation.py          # carregar_simulacao, remover_simulacao
    backup.py              # fazer_backup, limpar_antigos
    server.py              # main(): dois servidores gevent, CLI
    static/aluno/, static/coordenacao/   # saída dos builds React
  tests/                   # pytest
  requirements.txt
frontend/
  package.json, vite.aluno.config.ts, vite.coord.config.ts
  src/shared/api.ts, src/shared/tema.css
  src/aluno/…, src/coord/…
installer/
  build.ps1, seguranca.spec, instalador.iss, tarefas.ps1
scripts/carga.py
docs/cenarios-escola.md
```

---

### Task 1: Esqueleto, configuração e banco

Modelo sugerido: sonnet.

**Files:**
- Create: `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/db.py`, `backend/requirements.txt`, `backend/tests/conftest.py`, `backend/tests/test_db.py`, `.gitignore`

**Interfaces:**
- Produces: `Config` (dataclass frozen) com `data_dir: Path`, `host: str = "127.0.0.1"`, `student_port: int = 3000`, `coord_port: int = 4000`, `secret_key: str`, `allowed_hosts: tuple[str, ...] = ()`, e propriedades `db_path`, `uploads_dir`, `backups_dir`, `risk_terms_path`. `load_config(data_dir: Path | None = None) -> Config` (padrão `C:\ProgramData\SegurancaIntegral`; cria a pasta e gera `secret.key` com 32 bytes aleatórios hex na primeira vez; lê `config.json` opcional com `allowed_hosts`). `connect(config: Config) -> sqlite3.Connection` (`row_factory=sqlite3.Row`, `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`). `init_db(config: Config) -> None` (idempotente). Fixture pytest `config(tmp_path)` e `conn(config)`.

- [ ] **Step 1: Escrever `test_db.py`** com `test_init_db_cria_tabelas` (afirma que existem `casos`, `anexos`, `mensagens`, `notas_internas`, `eventos`, `usuarios` em `sqlite_master`), `test_init_db_idempotente` (duas chamadas sem erro) e `test_foreign_keys_ativas` (inserir `anexos` com `caso_id` inexistente levanta `sqlite3.IntegrityError`).
- [ ] **Step 2: Rodar** `cd backend && python -m pytest tests/test_db.py -v`. Esperado: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `config.py` e `db.py` com o schema da seção 6 da spec. Colunas: `casos(id, codigo_hash UNIQUE, tipo, relato, quando, onde, em_andamento, anonimo, nome, turma, gravidade, pontos, motivos_json, status DEFAULT 'novo', simulacao DEFAULT 0, criado_em, atualizado_em)`; `anexos(id, caso_id, nome_interno UNIQUE, tipo, tamanho)`; `mensagens(id, caso_id, autor CHECK IN ('aluno','coordenacao'), texto, criado_em)`; `notas_internas(id, caso_id, usuario_id, texto, criado_em)`; `eventos(id, caso_id, tipo, usuario_id, detalhe, criado_em)`; `usuarios(id, nome UNIQUE, senha_hash, ativo DEFAULT 1, tentativas DEFAULT 0, bloqueado_ate)`. Datas em ISO 8601 UTC. Nenhuma coluna de IP.
- [ ] **Step 4: Rodar** o mesmo comando. Esperado: PASS.
- [ ] **Step 5: Commit** (`.gitignore` ignora `__pycache__`, `.venv`, `node_modules`, `dist`, `build`, `*.db`, `ledger*.md`).

---

### Task 2: Triagem por regras

Modelo sugerido: sonnet.

**Files:**
- Create: `backend/app/triage.py`, `backend/app/risk_terms.json`, `backend/tests/test_triage.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) Triagem(gravidade: str, pontos: int, motivos: tuple[str, ...])`; `carregar_termos(path: Path) -> dict[str, list[str]]` (categorias → termos); `classificar(tipo: str, relato: str, em_andamento: bool, termos: dict[str, list[str]]) -> Triagem`.

Regras (valores fixos): peso base por tipo `aliciamento 4`, `ameaca 4`, `vazamento 3`, `golpe 3`, `perfil_falso 2`, `cyberbullying 2`, `outro 1`; `em_andamento` soma 2; cada categoria de termos de risco com ao menos um acerto soma 3 (conta uma vez por categoria). Limiares: `alta` se pontos ≥ 6, `media` se ≥ 3, senão `baixa`. Texto normalizado (minúsculas, sem acento) e termos comparados por palavra ou expressão inteira. Categorias iniciais em `risk_terms.json`: `violencia` (matar, te pego, vou te bater, faca, arma), `automutilacao` (me matar, sumir, suicidio, me cortar), `nudes` (nude, nudes, foto intima, vazar foto), `extorsao` (pagar ou, vou postar, chantagem, deposita).

- [ ] **Step 1: Escrever testes** em `test_triage.py`: `test_aliciamento_sozinho_e_media` (4 pontos → `media`), `test_aliciamento_em_andamento_e_alta` (6 → `alta`), `test_cyberbullying_sozinho_e_baixa` (2 → `baixa`), `test_cyberbullying_em_andamento_e_media`, `test_ameaca_com_termo_violencia_e_alta` (4+3), `test_acentos_e_maiusculas_acionam_termo` (relato `"Vou te MATAR"` e `"vou te matar"` e `"AMEAÇA de te pegar"` dão o mesmo resultado dos equivalentes sem acento; cobre Review Focus 1), `test_emoji_nao_quebra`, `test_motivos_explicam` (lista contém `"tipo: ameaca"`, `"ocorrendo agora"`, `"termos de risco: violencia"`), `test_categoria_conta_uma_vez` (dois termos da mesma categoria somam 3, não 6), `test_relato_vazio_usa_so_tipo`.
- [ ] **Step 2: Rodar** `python -m pytest tests/test_triage.py -v`. Esperado: FAIL.
- [ ] **Step 3: Implementar** `triage.py` e `risk_terms.json`. Normalização com `unicodedata` (NFKD, remover combinantes).
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 3: Códigos de acompanhamento e limitador

Modelo sugerido: sonnet.

**Files:**
- Create: `backend/app/codes.py`, `backend/app/ratelimit.py`, `backend/tests/test_codes.py`, `backend/tests/test_ratelimit.py`

**Interfaces:**
- Produces: `gerar_codigo() -> str` (formato `XXXX-XXXX`, usa `secrets`); `normalizar_codigo(texto: str) -> str | None` (maiúsculas, remove espaços e hífen, valida 8 caracteres do alfabeto, devolve `XXXX-XXXX` ou `None`); `hash_codigo(codigo_normalizado: str, secret_key: str) -> str` (HMAC-SHA256 em hex); `class Limitador(max_eventos: int, janela_s: int, relogio: Callable[[], float] = time.monotonic)` com `permitir(chave: str) -> bool`.

- [ ] **Step 1: Escrever testes:** `test_codigo_tem_formato_e_alfabeto`; `test_codigos_distintos` (1000 códigos sem repetição); `test_normaliza_minuscula_espacos_sem_hifen` (`" k7m2 9qxd "` e `"k7m29qxd"` → `"K7M2-9QXD"`); `test_normaliza_rejeita_invalido` (caracteres `0`, `O`, `1`, `I`, tamanho errado, vazio → `None`); `test_hash_depende_da_chave`; `test_limitador_bloqueia_apos_max` e `test_limitador_libera_apos_janela` com relógio falso.
- [ ] **Step 2: Rodar** os dois arquivos. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Limitador em memória por chave com deque de instantes; nunca persiste a chave.
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 4: Validação e gravação de anexos

Modelo sugerido: opus (segurança de upload).

**Files:**
- Create: `backend/app/uploads.py`, `backend/tests/test_uploads.py`

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces: `class AnexoInvalido(Exception)` com `motivo: str`; `detectar_tipo(dados: bytes) -> str | None` (`"png"`, `"jpeg"`, `"webp"`, `"gif"` pelos bytes iniciais); `@dataclass(frozen=True) AnexoSalvo(nome_interno: str, tipo: str, tamanho: int)`; `salvar_anexo(config: Config, dados: bytes) -> AnexoSalvo` (grava em `config.uploads_dir` com nome `secrets.token_hex(16)` mais extensão; levanta `AnexoInvalido` para vazio, maior que 5 MB ou tipo desconhecido; em `OSError` ao gravar levanta `AnexoInvalido("armazenamento indisponivel")`); `caminho_anexo(config: Config, nome_interno: str) -> Path` (rejeita nomes com separadores ou fora do padrão `^[0-9a-f]{32}\.(png|jpe?g|webp|gif)$`).

- [ ] **Step 1: Escrever testes:** PNG, JPEG, WEBP e GIF mínimos válidos são aceitos; `test_png_falso_com_html_e_rejeitado` (extensão ignorada, conteúdo `<html>`); `test_executavel_mz_rejeitado`; `test_vazio_rejeitado`; `test_acima_de_5mb_rejeitado`; `test_nome_interno_aleatorio_e_unico`; `test_caminho_anexo_rejeita_traversal` (`"../x"`, `"a/b.png"`, `"..\\x.png"`); `test_disco_indisponivel` (diretório somente leitura ou monkeypatch de `open` levanta `OSError` → `AnexoInvalido`).
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 5: Camada de casos e API do aluno

Modelo sugerido: sonnet.

**Files:**
- Create: `backend/app/casos.py`, `backend/app/routes_student.py`, `backend/app/security.py` (apenas `ip_do_cliente`), `backend/tests/test_student_api.py`
- Modify: `backend/app/__init__.py` (adicionar `create_student_app`)

**Interfaces:**
- Consumes: `connect`/`init_db` (Task 1), `classificar` (Task 2), `gerar_codigo`/`normalizar_codigo`/`hash_codigo`/`Limitador` (Task 3), `salvar_anexo`/`AnexoInvalido` (Task 4).
- Produces em `casos.py`: `criar_caso(conn, config, dados: dict, anexos: list[AnexoSalvo]) -> str` (devolve o código em claro; grava triagem e evento `criado`); `caso_por_codigo(conn, config, codigo: str) -> sqlite3.Row | None`; `listar_mensagens(conn, caso_id: int, apenas_publicas=True) -> list[sqlite3.Row]`; `adicionar_mensagem(conn, caso_id: int, autor: str, texto: str) -> None`; `registrar_evento(conn, caso_id: int, tipo: str, usuario_id: int | None, detalhe: str) -> None`.
- Produces em `security.py`: `ip_do_cliente(request) -> str` (usa `CF-Connecting-IP` somente quando `remote_addr` é loopback; usado só como chave de limitador, nunca gravado).
- Produces API (JSON, porta 3000): `GET /api/saude` → `{"ok": true}`; `POST /api/denuncias` (multipart: `tipo`, `relato`, `quando`, `onde`, `em_andamento`, `anonimo`, `nome`, `turma`, `anexos[]`) → 201 `{"codigo": "XXXX-XXXX"}`; `POST /api/acompanhar` `{codigo}` → 200 `{status, mensagens: [{autor, texto, criado_em}]}`; `POST /api/acompanhar/mensagens` `{codigo, texto}` → 201. Código inválido ou inexistente → 404 `{"erro": "codigo nao encontrado"}` (mesma resposta nos dois casos). Validação: `tipo` na lista global, `relato` de 10 a 5000 caracteres, `nome` obrigatório se não anônimo, no máximo 5 anexos. Limites: 5 denúncias por 10 min e 20 consultas por 10 min por cliente (429).

- [ ] **Step 1: Escrever testes** em `test_student_api.py` com `student_client` (fixture do Flask test client): `test_denuncia_anonima_retorna_codigo`; `test_denuncia_anonima_nao_grava_nome_turma_nem_ip` (inspeciona a linha do banco e todas as colunas de texto); `test_denuncia_identificada_grava_nome_turma`; `test_triagem_gravada_com_motivos`; `test_acompanhar_com_codigo_em_minusculas_sem_hifen` (Review Focus 2); `test_codigo_invalido_e_inexistente_mesma_resposta`; `test_aluno_envia_mensagem_e_ve_resposta_da_coordenacao`; `test_nota_interna_nunca_aparece`; `test_anexo_png_aceito`; `test_anexo_falso_rejeitado_e_denuncia_nao_se_perde` (Review Focus 3: a resposta indica o anexo recusado e o caso é criado sem ele); `test_anexo_vazio_rejeitado`; `test_mais_de_5_anexos_400`; `test_relato_curto_400`; `test_tipo_invalido_400`; `test_limite_de_envios_429`; `test_envios_concorrentes_nao_perdem_denuncia` (20 threads, 20 casos gravados, nenhum erro; Review Focus 4); `test_porta_do_aluno_nao_tem_rotas_da_coordenacao` (`/api/casos` e `/api/login` → 404).
- [ ] **Step 2: Rodar** `python -m pytest tests/test_student_api.py -v`. Esperado: FAIL.
- [ ] **Step 3: Implementar** `casos.py`, `routes_student.py` e `create_student_app(config: Config) -> Flask` (blueprint registrado; serve `static/aluno` na raiz com `index.html`; `MAX_CONTENT_LENGTH` de 30 MB; log de acesso sem IP). Cada requisição abre e fecha a própria conexão SQLite.
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 6: Usuários e autenticação da coordenação

Modelo sugerido: opus (autenticação).

**Files:**
- Create: `backend/app/auth.py`, `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `connect`/`init_db` (Task 1).
- Produces: `criar_usuario(conn, nome: str, senha: str) -> int` (senha < 10 caracteres levanta `ValueError`; nome duplicado levanta `ValueError`; hash com `werkzeug.security.generate_password_hash` método `scrypt`); `autenticar(conn, nome: str, senha: str, agora: datetime) -> int | None` (conta ativa, não bloqueada, senha correta; 5ª falha seguida define `bloqueado_ate = agora + 15 min`; sucesso zera `tentativas`; bloqueado devolve `None` mesmo com senha correta; usuário inexistente gasta o mesmo tempo de verificação com hash falso); `desativar_usuario(conn, usuario_id: int) -> None`; `listar_usuarios(conn) -> list[sqlite3.Row]`; `gerar_senha_inicial() -> str` (16 caracteres aleatórios).

- [ ] **Step 1: Escrever testes:** `test_senha_curta_rejeitada`; `test_autentica_senha_correta`; `test_senha_errada_none`; `test_cinco_falhas_bloqueiam`; `test_bloqueado_rejeita_senha_correta`; `test_bloqueio_expira_apos_15_minutos` (com `agora` injetado); `test_sucesso_zera_tentativas`; `test_usuario_desativado_nao_entra`; `test_usuario_inexistente_none`; `test_hash_nao_guarda_senha_em_claro`.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 7: API da coordenação

Modelo sugerido: opus (autorização).

**Files:**
- Create: `backend/app/routes_coord.py`, `backend/tests/test_coord_api.py`
- Modify: `backend/app/__init__.py` (adicionar `create_coord_app`), `backend/app/casos.py` (consultas de fila e detalhe)

**Interfaces:**
- Consumes: Tasks 1, 4, 5, 6.
- Produces `create_coord_app(config: Config) -> Flask` (sessão assinada com `secret_key`, cookie `HttpOnly`, `SameSite=Strict`, `Secure` quando `X-Forwarded-Proto` é `https`, duração de 12 h; serve `static/coordenacao`). Toda rota abaixo, exceto `/api/login` e `/api/saude`, exige sessão (senão 401). Requisições que alteram estado exigem `Content-Type: application/json` (proteção extra contra CSRF).
- API: `POST /api/login` `{nome, senha}` → 200 `{nome}` ou 401 (mesma mensagem para qualquer falha); `POST /api/logout`; `GET /api/eu`; `GET /api/casos?status=&tipo=` → lista ordenada por gravidade (`alta`, `media`, `baixa`) e depois `criado_em` crescente; `GET /api/casos/<id>` → caso com anexos, motivos, linha do tempo (`eventos`), mensagens e notas; `POST /api/casos/<id>/status` `{status}`; `POST /api/casos/<id>/gravidade` `{gravidade}` (ambos registram evento com autor e valor anterior e novo); `POST /api/casos/<id>/mensagens` `{texto}`; `POST /api/casos/<id>/notas` `{texto}`; `GET /api/casos/<caso_id>/anexos/<anexo_id>` (404 se o anexo não pertence ao caso; serve o arquivo com `Content-Type` do tipo gravado, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`); `GET /api/usuarios`, `POST /api/usuarios` `{nome, senha}`, `POST /api/usuarios/<id>/desativar` (não permite desativar a si mesmo).

- [ ] **Step 1: Escrever testes** com `coord_client` e `coord_logado`: `test_rotas_sem_login_401` (parametrizado em todas as rotas); `test_login_ok_e_falha_mesma_mensagem`; `test_bloqueio_apos_5_falhas_pela_api`; `test_fila_ordenada_por_gravidade_e_antiguidade`; `test_filtros_status_e_tipo`; `test_detalhe_traz_motivos_anexos_e_timeline`; `test_mudar_status_registra_evento_com_autor`; `test_status_invalido_400`; `test_mudar_gravidade_registra_evento`; `test_mensagem_da_coordenacao_visivel_ao_aluno`; `test_nota_interna_so_na_coordenacao`; `test_caso_inexistente_404_sem_vazar` e `test_anexo_inexistente_404` (Review Focus 5); `test_anexo_de_outro_caso_nao_e_servido_pelo_caso_errado` (anexo do caso A pedido pelo caso B → 404); `test_anexo_servido_com_nosniff`; `test_criar_e_desativar_usuario`; `test_nao_desativa_a_si_mesmo`; `test_post_sem_json_415`; `test_porta_da_coordenacao_nao_aceita_denuncia` (`POST /api/denuncias` → 404).
- [ ] **Step 2: Rodar** `python -m pytest tests/test_coord_api.py -v`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Não existe rota de anexo fora de `/api/casos/<caso_id>/anexos/<anexo_id>`.
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 8: Modo de ensaio e backup

Modelo sugerido: sonnet.

**Files:**
- Create: `backend/app/simulation.py`, `backend/app/backup.py`, `backend/tests/test_simulation.py`, `backend/tests/test_backup.py`
- Modify: `backend/app/routes_coord.py` (duas rotas)

**Interfaces:**
- Consumes: `criar_caso`/`registrar_evento` (Task 5), `Config`.
- Produces: `carregar_simulacao(conn, config, quantidade: int = 18) -> int` (insere casos fictícios com `simulacao=1`, mistura de tipos e gravidades obtidas pela triagem real, algumas mensagens; nunca duplica: se já há simulação, devolve 0); `remover_simulacao(conn) -> int` (apaga só `simulacao=1` e seus filhos, devolve a contagem); `fazer_backup(config: Config, agora: datetime) -> Path` (copia o banco com a API de backup do SQLite e os anexos para `backups_dir/AAAA-MM-DD`); `limpar_antigos(config: Config, agora: datetime, manter_dias: int = 7) -> int`. Rotas: `POST /api/simulacao/carregar` → `{criados}`; `DELETE /api/simulacao` → `{removidos}`.

- [ ] **Step 1: Escrever testes:** `test_simulacao_cria_casos_marcados`; `test_simulacao_tem_as_tres_gravidades`; `test_simulacao_nao_duplica`; `test_remover_so_apaga_simulacao` (caso real permanece, com anexos e mensagens); `test_backup_gera_copia_valida_do_banco` (abre a cópia e conta linhas); `test_limpar_remove_mais_de_7_dias`; `test_rotas_de_simulacao_exigem_login`.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 9: Cabeçalhos de segurança, validação de host e servidor de duas portas

Modelo sugerido: opus.

**Files:**
- Create: `backend/app/server.py`, `backend/tests/test_security.py`, `backend/tests/test_server.py`
- Modify: `backend/app/security.py`, `backend/app/__init__.py` (aplicar nas duas fábricas)

**Interfaces:**
- Produces em `security.py`: `aplicar_seguranca(app: Flask, config: Config) -> None` (cabeçalhos `Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security` somente com `X-Forwarded-Proto: https`; `Cache-Control: no-store` em `/api/*`; se `config.allowed_hosts` não vazio, `Host` fora da lista → 400; vazio libera, para testes locais).
- Produces em `server.py`: `main(argv: list[str] | None = None) -> int` com opções `--data-dir`, `--criar-admin` (cria o usuário `coordenacao` com `gerar_senha_inicial()`, imprime a senha uma vez e sai; se o usuário já existe, não troca a senha e sai com código 2) e execução normal. Execução normal: `init_db`, dois `gevent.pywsgi.WSGIServer` (portas de `config`, `log=None`) no mesmo processo, uma greenlet que chama `fazer_backup` e `limpar_antigos` uma vez por dia, encerramento limpo em SIGINT/SIGTERM.

- [ ] **Step 1: Escrever testes:** `test_cabecalhos_presentes_nos_dois_apps`; `test_hsts_somente_com_https_encaminhado`; `test_host_invalido_400_quando_configurado`; `test_api_sem_cache`; em `test_server.py`: `test_criar_admin_imprime_senha_uma_vez_e_nao_sobrescreve` (rodar `main` duas vezes, segunda sai com 2 e não altera o hash); `test_duas_portas_isoladas` (sobe `main` em portas livres numa thread; `GET :aluno/api/casos` → 404, `GET :coord/api/casos` sem login → 401, `POST :coord/api/denuncias` → 404); `test_nao_ha_ip_no_log_de_acesso`.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `python -m pytest tests/test_security.py tests/test_server.py -v`. Esperado: PASS.
- [ ] **Step 5: Commit.**

---

### Task 10: Portal do aluno (React)

Modelo sugerido: sonnet. Aplicar o núcleo de `impeccable` e `antislop`.

**Files:**
- Create: `frontend/package.json`, `frontend/vite.aluno.config.ts`, `frontend/src/shared/api.ts`, `frontend/src/shared/tema.css`, `frontend/src/aluno/main.tsx`, `frontend/src/aluno/App.tsx`, telas `Inicio.tsx`, `Denuncia.tsx` (3 passos), `Confirmacao.tsx`, `Acompanhar.tsx`, testes `frontend/src/aluno/*.test.tsx`
- Saída do build: `backend/app/static/aluno/`

**Interfaces:**
- Consumes: API do aluno (Task 5). `api.ts` expõe `enviarDenuncia(form: FormData): Promise<{codigo: string}>`, `acompanhar(codigo: string): Promise<{status: string; mensagens: Mensagem[]}>`, `enviarMensagem(codigo: string, texto: string): Promise<void>`, erros tipados com `status` HTTP.
- Comportamento fixado: aviso de consentimento na tela inicial; passos Tipo, Relato, Provas e identificação; rascunho salvo em `localStorage` (com `try/catch`) e restaurado se o envio falhar; o código só aparece na Confirmação, com botão copiar e aviso de anotar; campo de acompanhamento aceita código em qualquer formato; mensagens de erro claras para 400, 404 e 429; mobile primeiro, alvos de toque de 44 px, tema claro e escuro por `prefers-color-scheme`, sem rolagem horizontal.

- [ ] **Step 1: Escrever testes vitest:** `Denuncia` bloqueia avançar sem tipo e com relato menor que 10 caracteres; identificação exige nome quando não anônimo; falha de rede mantém o texto e mostra "tente de novo" (rascunho restaurado); `Confirmacao` mostra o código recebido; `Acompanhar` mostra mensagens e trata 404 com texto genérico.
- [ ] **Step 2: Rodar** `cd frontend && npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar** as telas e o build (`npm run build:aluno`).
- [ ] **Step 4: Rodar** testes e build. Esperado: PASS e arquivos em `backend/app/static/aluno/`.
- [ ] **Step 5: Verificar em navegador real** com o servidor de dev (`python -m app.server --data-dir <temp>`): percurso completo a 375, 768 e 1280 px, claro e escuro; registrar capturas no relatório da task.
- [ ] **Step 6: Commit.**

---

### Task 11: Portal da coordenação (React)

Modelo sugerido: sonnet. Aplicar o núcleo de `impeccable` e `antislop`.

**Files:**
- Create: `frontend/vite.coord.config.ts`, `frontend/src/coord/main.tsx`, `App.tsx`, telas `Login.tsx`, `Fila.tsx`, `Caso.tsx`, `Usuarios.tsx`, `Ensaio.tsx`, testes `frontend/src/coord/*.test.tsx`
- Modify: `frontend/src/shared/api.ts` (cliente da coordenação), `frontend/package.json` (script `build:coord`)
- Saída do build: `backend/app/static/coordenacao/`

**Interfaces:**
- Consumes: API da coordenação (Task 7, incluindo `GET /api/casos/<id>/anexos/<anexo_id>`) e rotas de simulação (Task 8).
- Comportamento fixado: sem sessão, mostra só `Login`; `Fila` atualiza por polling a cada 8 segundos e pausa com a aba oculta; casos `alta` destacados no topo; filtros por status e tipo; `Caso` mostra relato, miniaturas dos anexos, motivos da triagem, linha do tempo, abas separadas "Mensagens ao aluno" e "Notas internas", seletor de status e de gravidade; `Ensaio` tem botões "Carregar casos de simulação" e "Remover simulação" com confirmação; casos simulados exibem selo "simulação"; desktop primeiro, funcional a 375 px, claro e escuro.

- [ ] **Step 1: Escrever testes vitest:** `Login` mostra mensagem única para qualquer falha; `Fila` ordena alta antes de média e baixa e aplica filtros; polling é cancelado ao desmontar; `Caso` não mistura nota interna com mensagem ao aluno; mudar status chama a API e atualiza a linha do tempo; selo "simulação" aparece nos casos simulados.
- [ ] **Step 2: Rodar** `npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar** e `npm run build:coord`.
- [ ] **Step 4: Rodar** testes e build. Esperado: PASS e arquivos em `backend/app/static/coordenacao/`.
- [ ] **Step 5: Verificar em navegador real:** login, fila, caso, status, mensagem, nota, ensaio; 375, 768 e 1280 px, claro e escuro; capturas no relatório.
- [ ] **Step 6: Commit.**

---

### Task 12: Empacotamento e instalador

Modelo sugerido: opus.

**Files:**
- Create: `installer/build.ps1`, `installer/seguranca.spec`, `installer/instalador.iss`, `installer/tarefas.ps1`, `installer/LEIA-ME.txt`, `backend/tests/test_empacotamento.py`

**Interfaces:**
- Consumes: `server.main` (Task 9) e os builds estáticos (Tasks 10 e 11).
- Produz: `dist/SegurancaIntegral.exe` (PyInstaller, modo diretório único ou arquivo único, incluindo `static/` e `risk_terms.json`); `dist/SegurancaIntegral-Setup.exe` (Inno Setup, instala em `C:\Program Files\SegurancaIntegral`, cria `C:\ProgramData\SegurancaIntegral` com permissão apenas para Administradores e SYSTEM, executa `SegurancaIntegral.exe --criar-admin` e mostra a senha na página final, registra por `tarefas.ps1` a tarefa agendada de inicialização como SYSTEM e a abre; desinstalar remove o programa e a tarefa mas **preserva** os dados, com pergunta explícita para apagá-los). O `LEIA-ME.txt` traz as duas rotas do túnel a criar (`escola.<dominio>` → `http://127.0.0.1:3000`, `coordenacao.<dominio>` → `http://127.0.0.1:4000`), o aviso de não usar UPnP junto com o túnel e a recomendação de Cloudflare Access na coordenação.
- `build.ps1` roda os builds de frontend, a suíte de testes, o PyInstaller e o Inno Setup, parando no primeiro erro.

- [ ] **Step 1: Escrever** `test_empacotamento.py`: `test_spec_inclui_static_e_termos` (lê o `.spec` e confere os dados incluídos); `test_instalador_nao_toca_cloudflared_nem_stardust` (o `.iss` e `tarefas.ps1` não contêm as palavras `cloudflared` nem `StarDust`; elas aparecem só no LEIA-ME); `test_instalador_preserva_dados_na_desinstalacao`.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** os arquivos de `installer/`.
- [ ] **Step 4: Rodar os testes** e depois `installer\build.ps1`. Esperado: testes PASS e os dois `.exe` gerados.
- [ ] **Step 5: Instalar numa pasta/VM limpa** (não neste PC de desenvolvimento): conferir pastas, tarefa agendada, senha exibida, as duas portas respondendo em `127.0.0.1`, e desinstalar mantendo os dados. Registrar o resultado.
- [ ] **Step 6: Commit.**

---

### Task 13: Carga, cenários da escola e fechamento

Modelo sugerido: sonnet (script e documento); revisão final em opus.

**Files:**
- Create: `scripts/carga.py`, `docs/cenarios-escola.md`

**Interfaces:**
- `scripts/carga.py --alvo http://127.0.0.1:3000 --total 60 --concorrencia 6`: envia denúncias variadas (anônimas e identificadas, com e sem anexo pequeno) e imprime total enviado, falhas, tempo mediano e p95. Falha com código de saída 1 se houver qualquer falha que não seja 429 esperado.
- `docs/cenarios-escola.md`: tabela de cenários com passos, resultado esperado e campo de resultado em branco para a escola: aluno anônimo, aluno identificado, caso urgente, anexo grande e anexo falso, celular com rede ruim, vários alunos ao mesmo tempo, coordenação respondendo, código perdido, bloqueio de login, reinício da máquina.

- [ ] **Step 1: Escrever** `scripts/carga.py` e um teste leve em `backend/tests/test_carga.py` que roda o script contra um servidor de teste com 10 envios e afirma saída 0.
- [ ] **Step 2: Rodar** o teste. Esperado: PASS.
- [ ] **Step 3: Escrever** `docs/cenarios-escola.md`.
- [ ] **Step 4: Fechamento:** rodar a suíte completa do backend (`python -m pytest -v`), a suíte do frontend (`npm test`), `installer\build.ps1`, e `scripts/carga.py` com 60 denúncias contra o app instalado; medir uso de memória do processo durante a carga e registrar (meta: abaixo de 250 MB).
- [ ] **Step 5: Revisão final** do conjunto contra a spec, por um revisor (modelo opus), com foco em isolamento de portas, anonimato, autorização e upload.
- [ ] **Step 6: Commit** e relatório final com todos os rulings tomados, na ordem, e o custo se estiverem errados.
