"""Acesso ao SQLite e schema. Datas em ISO 8601 UTC. Nenhuma coluna guarda IP."""
from __future__ import annotations

import os
import sqlite3
from contextlib import closing
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
    revisao_estado INTEGER NOT NULL DEFAULT 0,
    triagem_snapshot_json TEXT,
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

CREATE TABLE IF NOT EXISTS leituras_conversa (
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ultimo_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (caso_id, usuario_id)
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

CREATE TABLE IF NOT EXISTS envios (
    recibo_hmac TEXT PRIMARY KEY,
    contador INTEGER NOT NULL,
    conteudo_hash TEXT NOT NULL,
    caso_id INTEGER NOT NULL UNIQUE REFERENCES casos(id) ON DELETE CASCADE,
    confirmacao_json TEXT NOT NULL
);
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
        if _colunas(conn, 'casos') and not {'responsavel_id', 'proxima_acao', 'prazo_acao'} <= _colunas(conn, 'casos'):
            _backup_atomico(conn, Path(str(config.db_path) + '.pre-atendimento.bak'))
        _backup_pre_mapa_l(conn, config)
        _backup_pre_v4(conn, config)
        _backup_pre_v3(conn, config)
        _backup_pre_v2(conn, config)
        conn.executescript(SCHEMA)
        _migrar_papel(conn)
        _migrar_situacao_resolucao(conn)
        conn.commit()
        _migrar_v2(conn, config)
        _migrar_respostas(conn)
        _migrar_edicao_mensagens(conn)
        _migrar_v3(conn)
        conn.commit()
        _migrar_v4(conn)
        _migrar_atendimento(conn)
    finally:
        conn.close()


def _migrar_atendimento(conn: sqlite3.Connection) -> None:
    conn.execute('BEGIN IMMEDIATE')
    with conn:
        columns = _colunas(conn, 'casos')
        for name, kind in (('responsavel_id', 'INTEGER REFERENCES usuarios(id)'),
                           ('proxima_acao', 'TEXT'), ('prazo_acao', 'TEXT'),
                           ('canal', "TEXT NOT NULL DEFAULT 'relato'")):
            if name not in columns:
                conn.execute(f'ALTER TABLE casos ADD COLUMN {name} {kind}')


def _backup_pre_mapa_l(conn: sqlite3.Connection, config: Config) -> None:
    columns = _colunas(conn,'ambientes')
    if columns and 'geometria_json' not in columns:
        _backup_atomico(conn, Path(str(config.db_path)+'.pre-mapa-l.bak'))


def _backup_atomico(conn: sqlite3.Connection, destino: Path) -> None:
    if destino.exists():
        if not destino.is_file():
            raise OSError('destino do backup ocupado por uma pasta')
        return
    temporary = destino.with_name(destino.name + '.tmp')
    try:
        with closing(sqlite3.connect(temporary)) as copy:
            conn.backup(copy)
        os.replace(temporary, destino)
    finally:
        temporary.unlink(missing_ok=True)


def _backup_pre_v4(conn: sqlite3.Connection, config: Config) -> None:
    columns = _colunas(conn, 'casos')
    completo = ({'ano_relator','sala_relator','local_id','local_nome','local_outro'} <= columns
                and {'autoria','justificativa_autoria'} <= _colunas(conn,'resolucoes')
                and 'geometria_json' in _colunas(conn,'ambientes')
                and all(_colunas(conn,t) for t in ('autores_resolucao','ambientes','mapa_estado')))
    if not columns or completo:
        return
    _backup_atomico(conn, Path(str(config.db_path) + '.pre-v4.bak'))


def _migrar_v4(conn: sqlite3.Connection) -> None:
    conn.execute('BEGIN IMMEDIATE')
    try:
        for column in ('ano_relator', 'sala_relator', 'local_id', 'local_nome', 'local_outro'):
            if column not in _colunas(conn, 'casos'):
                conn.execute(f'ALTER TABLE casos ADD COLUMN {column} TEXT')
        for column in ('autoria', 'justificativa_autoria'):
            if column not in _colunas(conn, 'resolucoes'):
                conn.execute(f'ALTER TABLE resolucoes ADD COLUMN {column} TEXT')
        conn.execute('CREATE TABLE IF NOT EXISTS mapa_estado (id INTEGER PRIMARY KEY CHECK(id=1), revisao INTEGER NOT NULL)')
        conn.execute('INSERT OR IGNORE INTO mapa_estado VALUES (1,0)')
        conn.execute('''CREATE TABLE IF NOT EXISTS ambientes (
            id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, pai_id TEXT,
            x REAL NOT NULL, y REAL NOT NULL, largura REAL NOT NULL, altura REAL NOT NULL,
            geometria_json TEXT)''')
        if 'geometria_json' not in _colunas(conn,'ambientes'):
            conn.execute('ALTER TABLE ambientes ADD COLUMN geometria_json TEXT')
        conn.execute('''CREATE TABLE IF NOT EXISTS autores_resolucao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resolucao_id INTEGER NOT NULL REFERENCES resolucoes(id) ON DELETE CASCADE,
            nome TEXT NOT NULL, ano TEXT NOT NULL, sala TEXT NOT NULL,
            foto_nome TEXT, foto_tipo TEXT)''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_autores_resolucao ON autores_resolucao(resolucao_id)')
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def _backup_pre_v3(conn: sqlite3.Connection, config: Config) -> None:
    colunas = _colunas(conn, "casos")
    if not colunas or {"revisao_estado", "triagem_snapshot_json"} <= colunas:
        return
    destino = Path(str(config.db_path) + ".pre-v3.bak")
    if destino.exists():
        return
    temporario = destino.with_name(destino.name + ".tmp")
    try:
        with closing(sqlite3.connect(temporario)) as copia:
            conn.backup(copia)
        os.replace(temporario, destino)
    finally:
        temporario.unlink(missing_ok=True)


def _migrar_v3(conn: sqlite3.Connection) -> None:
    colunas = _colunas(conn, "casos")
    if {"revisao_estado", "triagem_snapshot_json"} <= colunas:
        return
    conn.execute("BEGIN IMMEDIATE")
    try:
        if "revisao_estado" not in colunas:
            conn.execute("ALTER TABLE casos ADD COLUMN revisao_estado INTEGER NOT NULL DEFAULT 0")
        if "triagem_snapshot_json" not in colunas:
            conn.execute("ALTER TABLE casos ADD COLUMN triagem_snapshot_json TEXT")
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


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


def _migrar_edicao_mensagens(conn: sqlite3.Connection) -> None:
    """Edição e exclusão de mensagens: colunas novas e histórico de versões."""
    colunas = _colunas(conn, "mensagens")
    if "editada_em" not in colunas:
        conn.execute("ALTER TABLE mensagens ADD COLUMN editada_em TEXT")
    if "apagada_em" not in colunas:
        conn.execute("ALTER TABLE mensagens ADD COLUMN apagada_em TEXT")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mensagens_versoes ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "mensagem_id INTEGER NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE, "
        "caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE, "
        "texto TEXT NOT NULL, "
        "acao TEXT NOT NULL CHECK (acao IN ('edicao','exclusao')), "
        "usuario_id INTEGER REFERENCES usuarios(id), "
        "criado_em TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mensagens_versoes_mensagem "
        "ON mensagens_versoes(mensagem_id)"
    )


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
