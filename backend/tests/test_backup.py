"""Testes do backup diário e da limpeza de backups antigos."""
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.backup import fazer_backup, limpar_antigos
from app.casos import criar_caso
from app.simulation import carregar_simulacao
from app.uploads import salvar_anexo
from imagens import png

PNG = png()
AGORA = datetime(2026, 10, 14, 3, 0, tzinfo=timezone.utc)


def _contar(caminho):
    copia = sqlite3.connect(caminho)
    try:
        assert copia.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        return copia.execute("SELECT COUNT(*) FROM casos").fetchone()[0]
    finally:
        copia.close()


def test_backup_gera_copia_valida_do_banco(conn, config):
    carregar_simulacao(conn, config)
    salvo = salvar_anexo(config, PNG)
    criar_caso(conn, config, {"tipo": "golpe", "relato": "x", "anonimo": True}, [salvo])

    pasta = fazer_backup(config, AGORA)

    assert pasta == config.backups_dir / "2026-10-14"
    assert _contar(pasta / "seguranca.db") == 19
    assert (pasta / "uploads" / salvo.nome_interno).read_bytes() == PNG
    # nenhuma pasta temporária sobrando
    assert [p.name for p in config.backups_dir.iterdir()] == ["2026-10-14"]


def test_backup_repetido_no_mesmo_dia_sobrescreve_limpo(conn, config):
    fazer_backup(config, AGORA)
    carregar_simulacao(conn, config, quantidade=3)
    pasta = fazer_backup(config, AGORA)
    assert _contar(pasta / "seguranca.db") == 3
    assert [p.name for p in config.backups_dir.iterdir()] == ["2026-10-14"]


def test_backup_usa_data_utc(conn, config):
    local = datetime(2026, 10, 13, 22, 0, tzinfo=timezone(timedelta(hours=-3)))
    assert fazer_backup(config, local).name == "2026-10-14"


def test_limpar_remove_mais_de_7_dias(config):
    base = config.backups_dir
    for dias in (0, 6, 7, 8, 30):
        d = (AGORA - timedelta(days=dias)).strftime("%Y-%m-%d")
        (base / d).mkdir(parents=True)
        (base / d / "seguranca.db").write_bytes(b"x")
    (base / "2026-01-01.zip").write_bytes(b"x")  # arquivo, nunca apagado
    (base / "importante").mkdir()                # nome fora do padrão
    (base / "2020-99-99").mkdir()                # data impossível

    assert limpar_antigos(config, AGORA) == 2
    assert sorted(p.name for p in base.iterdir()) == sorted([
        "2026-10-14", "2026-10-08", "2026-10-07",
        "2026-01-01.zip", "importante", "2020-99-99",
    ])


def test_limpar_sem_pasta_de_backups(config):
    assert limpar_antigos(config, AGORA) == 0


def test_backup_restaura_old_orfao_antes_de_refazer(conn, config):
    carregar_simulacao(conn, config, quantidade=2)
    pasta = fazer_backup(config, AGORA)
    # simula queda entre os dois renames: só existe .old, sem a pasta final
    pasta.rename(config.backups_dir / ".old-2026-10-14")
    assert not pasta.exists()
    # banco vazio de novo; o backup novo substitui o restaurado
    conn.execute("DELETE FROM casos")
    conn.commit()
    fazer_backup(config, AGORA)
    assert _contar(pasta / "seguranca.db") == 0
    assert [p.name for p in config.backups_dir.iterdir()] == ["2026-10-14"]


def test_backup_restaura_old_se_o_rename_final_falha(conn, config, monkeypatch):
    carregar_simulacao(conn, config, quantidade=2)
    pasta = fazer_backup(config, AGORA)
    conn.execute("DELETE FROM casos")
    conn.commit()
    original = Path.rename

    def falha(self, alvo):
        if self.name.startswith(".tmp-"):
            raise OSError("falha simulada")
        return original(self, alvo)

    monkeypatch.setattr(Path, "rename", falha)
    with pytest.raises(OSError):
        fazer_backup(config, AGORA)
    monkeypatch.undo()
    assert _contar(pasta / "seguranca.db") == 2  # backup anterior preservado
    assert [p.name for p in config.backups_dir.iterdir()] == ["2026-10-14"]


def test_limpar_nao_segue_link_para_fora(config, tmp_path_factory):
    fora = tmp_path_factory.mktemp("fora")
    (fora / "dado.txt").write_text("x")
    config.backups_dir.mkdir(parents=True)
    alvo = config.backups_dir / "2020-01-01"
    try:
        os.symlink(fora, alvo, target_is_directory=True)
    except OSError:
        # sem privilégio de link simbólico: usa junção NTFS (não exige admin)
        import subprocess
        r = subprocess.run(["cmd", "/c", "mklink", "/J", str(alvo), str(fora)],
                           capture_output=True)
        if r.returncode != 0:
            pytest.skip("não foi possível criar link ou junção")
    assert limpar_antigos(config, AGORA) == 0
    assert (fora / "dado.txt").exists()


def test_limpar_pula_item_quando_commonpath_falha(config, monkeypatch):
    # outro drive no Windows: commonpath levanta ValueError; o item é pulado
    for nome in ("2020-01-01", "2020-01-02"):
        (config.backups_dir / nome).mkdir(parents=True)

    def sem_caminho_comum(_caminhos):
        raise ValueError("Paths don't have the same drive")

    monkeypatch.setattr(os.path, "commonpath", sem_caminho_comum)
    assert limpar_antigos(config, AGORA) == 0
    assert sorted(p.name for p in config.backups_dir.iterdir()) == [
        "2020-01-01", "2020-01-02"]
