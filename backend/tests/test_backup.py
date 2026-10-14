"""Testes do backup diário e da limpeza de backups antigos."""
import sqlite3
from datetime import datetime, timedelta, timezone

from app.backup import fazer_backup, limpar_antigos
from app.casos import criar_caso
from app.simulation import carregar_simulacao
from app.uploads import salvar_anexo

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
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
