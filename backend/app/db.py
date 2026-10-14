"""Acesso ao SQLite e schema. Datas em ISO 8601 UTC. Nenhuma coluna guarda IP."""
from __future__ import annotations

import sqlite3

from .config import Config

SCHEMA = """
CREATE TABLE IF NOT EXISTS casos (
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

CREATE TABLE IF NOT EXISTS anexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    nome_interno TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL,
    tamanho INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    tentativas INTEGER NOT NULL DEFAULT 0,
    bloqueado_ate TEXT
);

CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    autor TEXT NOT NULL CHECK (autor IN ('aluno', 'coordenacao')),
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notas_internas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id),
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id),
    detalhe TEXT,
    criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anexos_caso ON anexos(caso_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_caso ON mensagens(caso_id);
CREATE INDEX IF NOT EXISTS idx_notas_caso ON notas_internas(caso_id);
CREATE INDEX IF NOT EXISTS idx_eventos_caso ON eventos(caso_id);
"""


def connect(config: Config) -> sqlite3.Connection:
    """Abre uma conexão com chaves estrangeiras, WAL e espera por bloqueio."""
    config.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db(config: Config) -> None:
    """Cria as tabelas se ainda não existirem (idempotente)."""
    conn = connect(config)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
