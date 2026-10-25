"""Limpeza dos dados de teste na implantação secundária.

Apaga casos (e tudo que depende deles), arquivos de `uploads/` e, se pedido,
os backups. Preserva usuários, mapa e arquivos de configuração. O banco vem
primeiro, numa transação; o disco só é tocado depois do commit. O log recebe
apenas contagens, nunca texto de caso.
"""
from __future__ import annotations

import logging
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .config import Config
from .db import caminho_backup_v2
from .uploads import AnexoInvalido, caminho_anexo

log = logging.getLogger(__name__)

# tabelas cujo contador AUTOINCREMENT recomeça do 1 depois da limpeza
_TABELAS_SEQUENCIA = (
    "casos", "anexos", "mensagens", "mensagens_versoes", "notas_internas",
    "eventos", "resolucoes", "autores_resolucao", "situacoes_aluno",
    "revisoes_recorrencia",
)


def primeiro_admin_id(conn: sqlite3.Connection) -> int | None:
    """Menor id entre os admins, mesmo desativado; None se não houver."""
    linha = conn.execute(
        "SELECT MIN(id) FROM usuarios WHERE papel = 'admin'").fetchone()
    return linha[0]


def _arquivos_de_uploads(config: Config) -> list[Path]:
    pasta = config.uploads_dir
    if not pasta.is_dir():
        return []
    return sorted(p for p in pasta.iterdir() if p.is_file())


def _backups(config: Config) -> list[Path]:
    """Subpastas de `backups/` mais o `.pre-v2.bak` ao lado do banco."""
    itens: list[Path] = []
    if config.backups_dir.is_dir():
        itens.extend(sorted(p for p in config.backups_dir.iterdir() if p.is_dir()))
    bak = caminho_backup_v2(config)
    if bak.is_file():
        itens.append(bak)
    return itens


def _contar(conn: sqlite3.Connection, tabela: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0]


def resumo(conn: sqlite3.Connection, config: Config) -> dict:
    """O que a limpeza apagaria agora, mais a última limpeza feita."""
    ultima = conn.execute(
        "SELECT l.criado_em, l.casos, u.nome FROM limpezas_implantacao l "
        "LEFT JOIN usuarios u ON u.id = l.usuario_id "
        "ORDER BY l.id DESC LIMIT 1").fetchone()
    return {
        "casos": _contar(conn, "casos"),
        "mensagens": _contar(conn, "mensagens"),
        "anexos": _contar(conn, "anexos"),
        "arquivos": len(_arquivos_de_uploads(config)),
        "backups": len(_backups(config)),
        "ultima_limpeza": None if ultima is None else
        {"em": ultima[0], "por": ultima[2], "casos": ultima[1]},
    }


def _apagar_do_banco(conn: sqlite3.Connection, usuario_id: int | None,
                     n_backups: int) -> tuple[dict, list[str]]:
    """Transação única: lê contagens e nomes, apaga, zera contadores, registra."""
    if conn.in_transaction:
        conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")  # os filhos saem por ON DELETE CASCADE
    # apagar de verdade: páginas liberadas não guardam o texto antigo
    conn.execute("PRAGMA secure_delete = ON")
    conn.execute("BEGIN IMMEDIATE")
    try:
        contagens = {
            "casos": _contar(conn, "casos"),
            "mensagens": _contar(conn, "mensagens"),
            "anexos": _contar(conn, "anexos"),
        }
        nomes = [r[0] for r in conn.execute("SELECT nome_interno FROM anexos")]
        nomes.extend(r[0] for r in conn.execute(
            "SELECT foto_nome FROM autores_resolucao WHERE foto_nome IS NOT NULL"))
        conn.execute("DELETE FROM casos")
        existentes = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'")}
        if "sqlite_sequence" in existentes:
            alvo = [t for t in _TABELAS_SEQUENCIA if t in existentes]
            conn.execute(
                "DELETE FROM sqlite_sequence WHERE name IN (%s)"
                % ",".join("?" * len(alvo)), alvo)
        conn.execute(
            "INSERT INTO limpezas_implantacao "
            "(usuario_id, criado_em, casos, mensagens, anexos, backups) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (usuario_id, datetime.now(timezone.utc).isoformat(timespec="seconds"),
             contagens["casos"], contagens["mensagens"], contagens["anexos"],
             n_backups))
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return contagens, nomes


def _remover_arquivos(config: Config, nomes: list[str], avisos: list[str]) -> int:
    """Remove os anexos e fotos conhecidos e varre o resto de `uploads/`."""
    alvos: dict[Path, None] = {}
    for nome in nomes:
        try:
            alvos[caminho_anexo(config, nome)] = None
        except AnexoInvalido:
            continue
    for caminho in _arquivos_de_uploads(config):
        alvos.setdefault(caminho.resolve(), None)
    removidos = 0
    for caminho in alvos:
        if not caminho.exists():
            continue
        try:
            caminho.unlink()
            removidos += 1
        except OSError:
            avisos.append(f"nao foi possivel remover o arquivo {caminho.name}")
    return removidos


def _remover_backups(config: Config, avisos: list[str]) -> int:
    removidos = 0
    for item in _backups(config):
        try:
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
            removidos += 1
        except OSError:
            avisos.append(f"nao foi possivel remover o backup {item.name}")
    return removidos


def _compactar(conn: sqlite3.Connection, avisos: list[str]) -> None:
    """Checkpoint e VACUUM, para o texto apagado não sobrar em páginas livres."""
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.execute("VACUUM")  # fora de transação
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.Error:
        avisos.append("nao foi possivel compactar o banco")


def limpar(conn: sqlite3.Connection, config: Config, usuario_id: int | None,
           apagar_backups: bool = True) -> dict:
    """Apaga casos, arquivos e (opcional) backups. Banco primeiro, disco depois."""
    n_backups = len(_backups(config)) if apagar_backups else 0
    contagens, nomes = _apagar_do_banco(conn, usuario_id, n_backups)
    avisos: list[str] = []
    arquivos = _remover_arquivos(config, nomes, avisos)
    backups = _remover_backups(config, avisos) if apagar_backups else 0
    _compactar(conn, avisos)
    log.info("limpeza da implantacao: casos=%d mensagens=%d anexos=%d "
             "arquivos=%d backups=%d avisos=%d", contagens["casos"],
             contagens["mensagens"], contagens["anexos"], arquivos, backups,
             len(avisos))
    return {**contagens, "arquivos": arquivos, "backups": backups, "avisos": avisos}
