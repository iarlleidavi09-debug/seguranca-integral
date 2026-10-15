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
