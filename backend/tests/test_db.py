import sqlite3

import pytest

from app.db import connect, init_db


def test_init_db_cria_tabelas(config):
    init_db(config)
    c = connect(config)
    nomes = {r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    c.close()
    assert {"casos", "anexos", "mensagens", "notas_internas", "eventos", "usuarios"} <= nomes


def test_init_db_idempotente(config):
    init_db(config)
    init_db(config)


def test_foreign_keys_ativas(conn):
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO anexos (caso_id, nome_interno, tipo, tamanho) VALUES (999, 'x.png', 'image/png', 1)"
        )


def test_usuarios_tem_papel_padrao_coordenador(conn):
    conn.execute("INSERT INTO usuarios (nome, senha_hash) VALUES ('a', 'x')")
    assert conn.execute("SELECT papel FROM usuarios").fetchone()["papel"] == "coordenador"


def _banco_antigo(config, nomes):
    """Banco da v1: tabela usuarios sem a coluna `papel`."""
    c = sqlite3.connect(config.db_path)
    c.execute(
        "CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE, "
        "senha_hash TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, "
        "tentativas INTEGER NOT NULL DEFAULT 0, bloqueado_ate TEXT)"
    )
    for n in nomes:
        c.execute("INSERT INTO usuarios (nome, senha_hash) VALUES (?, 'x')", (n,))
    c.commit()
    c.close()


def _papeis(config):
    c = connect(config)
    try:
        return {r["nome"]: r["papel"] for r in c.execute("SELECT nome, papel FROM usuarios")}
    finally:
        c.close()


def test_migracao_promove_coordenacao_a_admin(config):
    _banco_antigo(config, ["ana", "coordenacao"])
    init_db(config)
    assert _papeis(config) == {"ana": "coordenador", "coordenacao": "admin"}
    init_db(config)  # idempotente
    assert _papeis(config) == {"ana": "coordenador", "coordenacao": "admin"}


def test_migracao_sem_coordenacao_promove_o_primeiro(config):
    _banco_antigo(config, ["ana", "bia"])
    init_db(config)
    assert _papeis(config) == {"ana": "admin", "bia": "coordenador"}


def test_migracao_nao_cria_admin_em_banco_vazio(config):
    _banco_antigo(config, [])
    init_db(config)
    assert _papeis(config) == {}


# --- migração v2 -------------------------------------------------------------

ESQUEMA_V1 = """
CREATE TABLE casos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_hash TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL,
    relato TEXT NOT NULL,
    quando TEXT,
    onde TEXT,
    em_andamento INTEGER NOT NULL DEFAULT 0,
    anonimo INTEGER NOT NULL DEFAULT 1,
    nome TEXT,
    turma TEXT,
    gravidade TEXT NOT NULL,
    pontos INTEGER NOT NULL DEFAULT 0,
    motivos_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'novo',
    simulacao INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
);
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    tentativas INTEGER NOT NULL DEFAULT 0,
    bloqueado_ate TEXT,
    papel TEXT NOT NULL DEFAULT 'coordenador' CHECK (papel IN ('admin', 'coordenador'))
);
CREATE TABLE mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    autor TEXT NOT NULL CHECK (autor IN ('aluno', 'coordenacao')),
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL
);
CREATE TABLE eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id),
    detalhe TEXT,
    criado_em TEXT NOT NULL
);
"""

CASOS_V1 = [
    ("novo", "alta"),
    ("em_analise", "media"),
    ("aguardando_aluno", "baixa"),
    ("encaminhado", "alta"),
    ("resolvido", "media"),
]

AGORA = "2026-10-01T12:00:00+00:00"


def _banco_v1(config, casos):
    """Banco da v1: `casos.gravidade`, status antigos e `mensagens` sem `usuario_id`.

    Cada caso ganha o evento `criado` e um evento `gravidade`, como a v1 gravava.
    """
    config.data_dir.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(config.db_path)
    c.executescript(ESQUEMA_V1)
    c.execute("INSERT INTO usuarios (nome, senha_hash, papel) VALUES ('coord', 'x', 'admin')")
    for i, (status, gravidade) in enumerate(casos):
        cur = c.execute(
            "INSERT INTO casos (codigo_hash, tipo, relato, gravidade, status, criado_em, "
            "atualizado_em) VALUES (?, 'bullying', 'relato', ?, ?, ?, ?)",
            (f"hash{i}", gravidade, status, AGORA, AGORA),
        )
        caso_id = cur.lastrowid
        c.execute(
            "INSERT INTO eventos (caso_id, tipo, detalhe, criado_em) VALUES (?, 'criado', ?, ?)",
            (caso_id, f"gravidade {gravidade}", AGORA),
        )
        c.execute(
            "INSERT INTO eventos (caso_id, tipo, usuario_id, detalhe, criado_em) "
            "VALUES (?, 'gravidade', 1, ?, ?)",
            (caso_id, f"gravidade: baixa -> {gravidade}", AGORA),
        )
        c.execute(
            "INSERT INTO mensagens (caso_id, autor, texto, criado_em) VALUES (?, 'aluno', 'oi', ?)",
            (caso_id, AGORA),
        )
    c.commit()
    c.close()


def _colunas(c, tabela):
    return {r[1] for r in c.execute(f"PRAGMA table_info({tabela})")}


def _backup_v2(config):
    from app.db import SUFIXO_BACKUP_V2

    return config.db_path.with_name(config.db_path.name + SUFIXO_BACKUP_V2)


def test_sufixo_do_backup_v2():
    from app.db import SUFIXO_BACKUP_V2

    assert SUFIXO_BACKUP_V2 == ".pre-v2.bak"


def test_migracao_v2_mapeia_status_e_prioridade(config):
    _banco_v1(config, CASOS_V1)
    init_db(config)
    c = connect(config)
    try:
        linhas = c.execute(
            "SELECT status, prioridade, prioridade_original, recorrencia_pendente, "
            "ultimo_acesso_por, ultimo_acesso_em FROM casos ORDER BY id"
        ).fetchall()
        assert "gravidade" not in _colunas(c, "casos")
        assert c.execute("SELECT COUNT(*) FROM mensagens").fetchone()[0] == len(CASOS_V1)
        assert c.execute("SELECT COUNT(*) FROM eventos").fetchone()[0] == 2 * len(CASOS_V1)
    finally:
        c.close()
    assert [r["status"] for r in linhas] == [
        "novo", "em_investigacao", "em_investigacao", "em_investigacao", "resolvido",
    ]
    assert [r["prioridade"] for r in linhas] == [g for _, g in CASOS_V1]
    assert [r["prioridade_original"] for r in linhas] == [g for _, g in CASOS_V1]
    assert all(r["recorrencia_pendente"] == 0 for r in linhas)
    assert all(r["ultimo_acesso_por"] is None and r["ultimo_acesso_em"] is None for r in linhas)


def test_migracao_v2_cria_backup_antes(config):
    _banco_v1(config, CASOS_V1)
    init_db(config)
    caminho = _backup_v2(config)
    assert caminho.is_file()
    c = sqlite3.connect(caminho)
    try:
        assert "gravidade" in _colunas(c, "casos")
        assert "prioridade" not in _colunas(c, "casos")
        status = [r[0] for r in c.execute("SELECT status FROM casos ORDER BY id")]
    finally:
        c.close()
    assert status == [s for s, _ in CASOS_V1]


def test_migracao_v2_idempotente(config):
    _banco_v1(config, CASOS_V1)
    init_db(config)
    caminho = _backup_v2(config)
    mtime = caminho.stat().st_mtime_ns

    def _dump():
        c = connect(config)
        try:
            return {
                t: [tuple(r) for r in c.execute(f"SELECT * FROM {t} ORDER BY id")]
                for t in ("casos", "eventos", "mensagens")
            }
        finally:
            c.close()

    antes = _dump()
    init_db(config)
    assert _dump() == antes
    assert caminho.stat().st_mtime_ns == mtime


def test_migracao_v2_banco_vazio_nao_cria_backup(config, tmp_path):
    init_db(config)
    assert not _backup_v2(config).exists()

    from app.config import Config

    outro = Config(data_dir=tmp_path / "v1vazio", secret_key="chave-de-teste")
    _banco_v1(outro, [])
    init_db(outro)
    assert not _backup_v2(outro).exists()
    c = connect(outro)
    try:
        assert "prioridade" in _colunas(c, "casos")
        assert "gravidade" not in _colunas(c, "casos")
    finally:
        c.close()


def test_migracao_v2_reescreve_eventos_antigos(config):
    _banco_v1(config, [("novo", "alta")])
    init_db(config)
    c = connect(config)
    try:
        eventos = [tuple(r) for r in c.execute("SELECT tipo, detalhe FROM eventos ORDER BY id")]
    finally:
        c.close()
    assert eventos == [("criado", "prioridade alta"), ("prioridade", "prioridade: baixa -> alta")]


def test_novas_tabelas_existem_em_banco_novo(config):
    init_db(config)
    c = connect(config)
    try:
        nomes = {r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"resolucoes", "situacoes_aluno", "revisoes_recorrencia"} <= nomes
        assert {"prioridade", "prioridade_original", "ultimo_acesso_por", "ultimo_acesso_em",
                "recorrencia_pendente"} <= _colunas(c, "casos")
        assert "gravidade" not in _colunas(c, "casos")
        assert "usuario_id" in _colunas(c, "mensagens")
        assert _colunas(c, "resolucoes") == {
            "id", "caso_id", "desfecho", "providencias", "resultado", "usuario_id", "criado_em",
            "autoria", "justificativa_autoria",
        }
        assert _colunas(c, "situacoes_aluno") == {"id", "caso_id", "situacao", "criado_em", "resolucao_id"}
        assert _colunas(c, "revisoes_recorrencia") == {"id", "caso_id", "usuario_id", "criado_em"}
        for t in ("resolucoes", "situacoes_aluno", "revisoes_recorrencia"):
            fks = [tuple(r) for r in c.execute(f"PRAGMA foreign_key_list({t})")]
            caso_fk = [f for f in fks if f[2] == "casos"]
            assert caso_fk and caso_fk[0][6] == "CASCADE"
    finally:
        c.close()


def test_migracao_v2_falha_no_backup_aborta(config):
    _banco_v1(config, CASOS_V1)
    _backup_v2(config).mkdir()  # destino ocupado por uma pasta: a cópia não pode ser gravada
    with pytest.raises(OSError):
        init_db(config)
    c = sqlite3.connect(config.db_path)
    try:
        assert "gravidade" in _colunas(c, "casos")
        status = [r[0] for r in c.execute("SELECT status FROM casos ORDER BY id")]
    finally:
        c.close()
    assert status == [s for s, _ in CASOS_V1]


def test_migracao_v2_com_banco_v1_sem_papel(config):
    _banco_v1(config, CASOS_V1)
    c = sqlite3.connect(config.db_path)
    c.execute("ALTER TABLE usuarios DROP COLUMN papel")
    c.commit()
    c.close()
    init_db(config)
    assert _papeis(config) == {"coord": "admin"}
    assert _backup_v2(config).is_file()
    c = connect(config)
    try:
        assert "prioridade" in _colunas(c, "casos")
        assert c.execute("SELECT COUNT(*) FROM casos").fetchone()[0] == len(CASOS_V1)
    finally:
        c.close()


def test_migracao_v2_cria_tabelas_novas_em_banco_v1(config):
    _banco_v1(config, CASOS_V1)
    init_db(config)
    c = connect(config)
    try:
        nomes = {r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"resolucoes", "situacoes_aluno", "revisoes_recorrencia"} <= nomes
        assert "usuario_id" in _colunas(c, "mensagens")
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []
        assert c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        c.close()


def test_migracao_v2_falha_ao_renomear_nao_deixa_tmp(config, monkeypatch):
    _banco_v1(config, CASOS_V1)
    import app.db as modulo

    def falha(*args, **kwargs):
        raise OSError("falha forcada")

    monkeypatch.setattr(modulo.os, "replace", falha)
    with pytest.raises(OSError):
        init_db(config)
    tmp = _backup_v2(config).with_name(_backup_v2(config).name + ".tmp")
    assert not tmp.exists()


def test_situacoes_aluno_ganha_resolucao_id_em_banco_existente(config):
    init_db(config)
    c = sqlite3.connect(config.db_path)
    c.execute("ALTER TABLE situacoes_aluno DROP COLUMN resolucao_id")
    c.commit()
    c.close()
    init_db(config)
    init_db(config)
    c = connect(config)
    try:
        assert "resolucao_id" in _colunas(c, "situacoes_aluno")
    finally:
        c.close()


# --- coluna respostas_json (v2 B) --------------------------------------------

def test_banco_novo_tem_respostas_json(config):
    init_db(config)
    c = connect(config)
    try:
        assert "respostas_json" in {r[1] for r in c.execute("PRAGMA table_info(casos)")}
    finally:
        c.close()


def test_migracao_acrescenta_respostas_json_sem_perder_linhas(config):
    c = sqlite3.connect(config.db_path)
    c.executescript(
        "CREATE TABLE casos (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_hash TEXT NOT NULL UNIQUE, "
        "tipo TEXT NOT NULL, relato TEXT NOT NULL, quando TEXT, onde TEXT, "
        "em_andamento INTEGER NOT NULL DEFAULT 0, anonimo INTEGER NOT NULL DEFAULT 1, "
        "nome TEXT, turma TEXT, prioridade TEXT NOT NULL, pontos INTEGER NOT NULL DEFAULT 0, "
        "motivos_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'novo', "
        "simulacao INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, "
        "prioridade_original TEXT NOT NULL DEFAULT '', ultimo_acesso_por INTEGER, "
        "ultimo_acesso_em TEXT, recorrencia_pendente INTEGER NOT NULL DEFAULT 0);"
        "INSERT INTO casos (codigo_hash, tipo, relato, prioridade, criado_em, atualizado_em) "
        "VALUES ('h', 'outro', 'relato antigo', 'baixa', 'x', 'x');"
    )
    c.commit()
    c.close()
    init_db(config)
    init_db(config)  # idempotente
    c = connect(config)
    try:
        assert "respostas_json" in {r[1] for r in c.execute("PRAGMA table_info(casos)")}
        linhas = c.execute("SELECT relato, respostas_json FROM casos").fetchall()
        assert [tuple(r) for r in linhas] == [("relato antigo", None)]
    finally:
        c.close()
