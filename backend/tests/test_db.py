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
