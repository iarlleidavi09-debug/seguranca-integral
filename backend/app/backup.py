"""Backup diário do banco e dos anexos, e limpeza dos backups antigos."""
from __future__ import annotations

import os
import re
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import Config

_PADRAO_DATA = re.compile(r"\d{4}-\d{2}-\d{2}")


def _data_utc(agora: datetime):
    if agora.tzinfo is not None:
        agora = agora.astimezone(timezone.utc)
    return agora.date()


def fazer_backup(config: Config, agora: datetime) -> Path:
    """Copia banco (API de backup do SQLite) e anexos para backups/AAAA-MM-DD.

    Escreve numa pasta temporária e só então troca pelo nome final, para
    nunca deixar um backup pela metade.
    """
    nome = _data_utc(agora).isoformat()
    base = config.backups_dir
    base.mkdir(parents=True, exist_ok=True)
    final = base / nome
    temp = base / f".tmp-{nome}"
    antigo = base / f".old-{nome}"
    # execução anterior morreu entre os dois renames: devolve o backup do dia
    if antigo.exists() and not final.exists():
        antigo.rename(final)
    for sobra in (temp, antigo):
        if sobra.exists():
            shutil.rmtree(sobra)
    temp.mkdir()
    try:
        origem = sqlite3.connect(config.db_path)
        destino = sqlite3.connect(temp / "seguranca.db")
        try:
            origem.backup(destino)  # instantâneo consistente com o app rodando
        finally:
            destino.close()
            origem.close()
        if config.uploads_dir.exists():
            shutil.copytree(config.uploads_dir, temp / "uploads")
        if final.exists():
            final.rename(antigo)
        temp.rename(final)
    except BaseException:
        shutil.rmtree(temp, ignore_errors=True)
        if antigo.exists() and not final.exists():
            antigo.rename(final)  # devolve o backup anterior do dia
        raise
    shutil.rmtree(antigo, ignore_errors=True)
    return final


def limpar_antigos(config: Config, agora: datetime, manter_dias: int = 7) -> int:
    """Remove pastas AAAA-MM-DD mais antigas que `manter_dias`; devolve quantas."""
    base = config.backups_dir
    if not base.is_dir():
        return 0
    limite = _data_utc(agora) - timedelta(days=manter_dias)
    raiz = os.path.realpath(base)
    removidas = 0
    for item in base.iterdir():
        if (item.is_symlink() or not item.is_dir()
                or not _PADRAO_DATA.fullmatch(item.name)):
            continue
        # junção NTFS ou link que aponte para fora de backups_dir nunca é apagado
        if os.path.commonpath([raiz, os.path.realpath(item)]) != raiz:
            continue
        try:
            data = datetime.strptime(item.name, "%Y-%m-%d").date()
        except ValueError:
            continue
        if data < limite:
            shutil.rmtree(item)
            removidas += 1
    return removidas
