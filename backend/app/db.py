"""Acesso ao SQLite e schema. Datas em ISO 8601 UTC. Nenhuma coluna guarda IP."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

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
    prioridade TEXT NOT NULL,
    pontos INTEGER NOT NULL DEFAULT 0,
    motivos_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'novo',
    simulacao INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL,
    prioridade_original TEXT NOT NULL DEFAULT '',
    ultimo_acesso_por INTEGER REFERENCES usuarios(id),
    ultimo_acesso_em TEXT,
    recorrencia_pendente INTEGER NOT NULL DEFAULT 0,
    respostas_json TEXT
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
    bloqueado_ate TEXT,
    papel TEXT NOT NULL DEFAULT 'coordenador' CHECK (papel IN ('admin', 'coordenador'))
);

CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    autor TEXT NOT NULL CHECK (autor IN ('aluno', 'coordenacao')),
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id)
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

CREATE TABLE IF NOT EXISTS resolucoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    desfecho TEXT NOT NULL,
    providencias TEXT NOT NULL,
    resultado TEXT,
    usuario_id INTEGER REFERENCES usuarios(id),
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS situacoes_aluno (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    situacao TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    resolucao_id INTEGER REFERENCES resolucoes(id)
);

CREATE TABLE IF NOT EXISTS revisoes_recorrencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id),
    criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anexos_caso ON anexos(caso_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_caso ON mensagens(caso_id);
CREATE INDEX IF NOT EXISTS idx_notas_caso ON notas_internas(caso_id);
CREATE INDEX IF NOT EXISTS idx_eventos_caso ON eventos(caso_id);
CREATE INDEX IF NOT EXISTS idx_resolucoes_caso ON resolucoes(caso_id);
CREATE INDEX IF NOT EXISTS idx_situacoes_caso ON situacoes_aluno(caso_id);
CREATE INDEX IF NOT EXISTS idx_revisoes_caso ON revisoes_recorrencia(caso_id);
"""

# Cópia do banco feita antes da migração v2, ao lado do `.db`.
SUFIXO_BACKUP_V2 = ".pre-v2.bak"

# Mapa fixo dos status da v1 para os três da v2.
MAPA_STATUS_V2 = {
    "novo": "novo",
    "em_analise": "em_investigacao",
    "aguardando_aluno": "em_investigacao",
    "encaminhado": "em_investigacao",
    "resolvido": "resolvido",
}


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
    """Cria as tabelas se ainda não existirem e migra bancos antigos (idempotente)."""
    conn = connect(config)
    try:
        # o backup vem antes de qualquer escrita, inclusive do SCHEMA
        _backup_pre_v2(conn, config)
        conn.executescript(SCHEMA)
        _migrar_papel(conn)
        _migrar_situacao_resolucao(conn)
        conn.commit()
        _migrar_v2(conn, config)
        _migrar_respostas(conn)
        conn.commit()
    finally:
        conn.close()


def caminho_backup_v2(config: Config) -> Path:
    """Arquivo da cópia feita antes da migração v2."""
    return Path(str(config.db_path) + SUFIXO_BACKUP_V2)


def _colunas(conn: sqlite3.Connection, tabela: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({tabela})")}


def _precisa_v2(conn: sqlite3.Connection) -> bool:
    return "gravidade" in _colunas(conn, "casos")


def _backup_pre_v2(conn: sqlite3.Connection, config: Config) -> None:
    """Copia o banco da v1 com casos antes de migrar; erro na cópia aborta tudo.

    Grava num temporário e renomeia, para uma cópia interrompida nunca
    ocupar o lugar de um backup bom.
    """
    if not _precisa_v2(conn):
        return
    if conn.execute("SELECT 1 FROM casos LIMIT 1").fetchone() is None:
        return
    destino = caminho_backup_v2(config)
    temporario = destino.with_name(destino.name + ".tmp")
    temporario.unlink(missing_ok=True)
    copia = sqlite3.connect(temporario)
    try:
        try:
            conn.backup(copia)
        finally:
            copia.close()
        os.replace(temporario, destino)
    except BaseException:
        temporario.unlink(missing_ok=True)
        raise


def _migrar_v2(conn: sqlite3.Connection, config: Config) -> None:
    """Leva o esquema da v1 à v2 A numa única transação.

    `gravidade` vira `prioridade` (copiada também em `prioridade_original`),
    os status passam pelo mapa fixo e os eventos antigos trocam o nome do
    campo. Só roda enquanto `casos.gravidade` existir.
    """
    v2 = _precisa_v2(conn)
    falta_autor = "usuario_id" not in _colunas(conn, "mensagens")
    if not v2 and not falta_autor:
        return
    if v2 and conn.execute("SELECT 1 FROM casos LIMIT 1").fetchone() is not None:
        if not caminho_backup_v2(config).is_file():
            raise RuntimeError("backup pre-v2 ausente; migracao abortada")
    if conn.in_transaction:
        conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    try:
        if v2:
            conn.execute("ALTER TABLE casos RENAME COLUMN gravidade TO prioridade")
            conn.execute(
                "ALTER TABLE casos ADD COLUMN prioridade_original TEXT NOT NULL DEFAULT ''"
            )
            conn.execute(
                "ALTER TABLE casos ADD COLUMN ultimo_acesso_por INTEGER REFERENCES usuarios(id)"
            )
            conn.execute("ALTER TABLE casos ADD COLUMN ultimo_acesso_em TEXT")
            conn.execute(
                "ALTER TABLE casos ADD COLUMN recorrencia_pendente INTEGER NOT NULL DEFAULT 0"
            )
            conn.execute("UPDATE casos SET prioridade_original = prioridade")
            for antigo, novo in MAPA_STATUS_V2.items():
                if antigo != novo:
                    conn.execute("UPDATE casos SET status = ? WHERE status = ?", (novo, antigo))
            # só o prefixo muda: 'gravidade:' e 'gravidade ' têm 10 caracteres
            conn.execute(
                "UPDATE eventos SET tipo = 'prioridade', "
                "detalhe = CASE WHEN detalhe LIKE 'gravidade:%' "
                "THEN 'prioridade:' || substr(detalhe, 11) ELSE detalhe END "
                "WHERE tipo = 'gravidade'"
            )
            conn.execute(
                "UPDATE eventos SET detalhe = 'prioridade ' || substr(detalhe, 11) "
                "WHERE tipo = 'criado' AND detalhe LIKE 'gravidade %'"
            )
        if falta_autor:
            conn.execute(
                "ALTER TABLE mensagens ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)"
            )
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def _migrar_situacao_resolucao(conn: sqlite3.Connection) -> None:
    """Bancos da v2 A anteriores não têm `situacoes_aluno.resolucao_id`."""
    if "resolucao_id" not in _colunas(conn, "situacoes_aluno"):
        conn.execute(
            "ALTER TABLE situacoes_aluno ADD COLUMN resolucao_id "
            "INTEGER REFERENCES resolucoes(id)"
        )


def _migrar_respostas(conn: sqlite3.Connection) -> None:
    """Bancos anteriores ao questionário v2 B não têm `casos.respostas_json`."""
    if "respostas_json" not in _colunas(conn, "casos"):
        conn.execute("ALTER TABLE casos ADD COLUMN respostas_json TEXT")


def _migrar_papel(conn: sqlite3.Connection) -> None:
    """Banco da v1 não tem `papel`: acrescenta a coluna e promove um admin.

    Só roda uma vez (quando a coluna falta). O admin é o usuário
    `coordenacao`; se não existir, o de menor id, para ninguém ficar sem
    gerenciar as contas.
    """
    colunas = {r["name"] for r in conn.execute("PRAGMA table_info(usuarios)")}
    if "papel" in colunas:
        return
    conn.execute(
        "ALTER TABLE usuarios ADD COLUMN papel TEXT NOT NULL DEFAULT 'coordenador'"
    )
    alvo = conn.execute(
        "SELECT id FROM usuarios WHERE nome = 'coordenacao' COLLATE NOCASE"
    ).fetchone() or conn.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()
    if alvo is not None:
        conn.execute("UPDATE usuarios SET papel = 'admin' WHERE id = ?", (alvo["id"],))
