"""Teste leve do script de carga contra um servidor de teste."""
import queue
import subprocess
import sys
import threading
from pathlib import Path

import pytest

from app import server
from app.config import Config
from app.db import connect

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "carga.py"


@pytest.fixture
def subir(tmp_path):
    """Sobe `servir` numa thread; devolve uma função (limites) -> (porta, config)."""
    encerrar = []

    def _subir(limites=None):
        config = Config(data_dir=tmp_path, secret_key="chave-de-teste",
                        student_port=0, coord_port=0, limites=limites or {})
        parar = threading.Event()
        portas: queue.Queue = queue.Queue()
        t = threading.Thread(
            target=server.servir, args=(config, parar),
            kwargs={"ao_iniciar": lambda a, c: portas.put(a)}, daemon=True)
        t.start()
        encerrar.append((parar, t))
        return portas.get(timeout=15), config

    yield _subir
    for parar, t in encerrar:
        parar.set()
        t.join(15)
        assert not t.is_alive()


def _rodar(porta, *extra):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--alvo", f"http://127.0.0.1:{porta}", *extra],
        capture_output=True, text=True, timeout=120)


def _casos(config):
    c = connect(config)
    try:
        return c.execute(
            "SELECT COUNT(*), SUM(anonimo), COUNT(DISTINCT tipo) FROM casos").fetchone()
    finally:
        c.close()


def test_carga_envia_dez_e_sai_zero(subir):
    porta, config = subir({"denuncias": (1000, 600)})
    r = _rodar(porta, "--total", "10", "--concorrencia", "3", "--sem-limite-esperado")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "enviadas: 10 (aceitas 10, limitadas por 429: 0)" in r.stdout
    assert "falhas: 0" in r.stdout
    assert "tempo mediano" in r.stdout and "p95" in r.stdout
    total, anonimos, tipos = _casos(config)
    assert total == 10
    assert 0 < anonimos < total  # mistura de anônimas e identificadas
    assert tipos == 7  # todos os tipos em rodízio
    conn = connect(config)
    try:
        anexos = conn.execute("SELECT COUNT(*) FROM anexos").fetchone()[0]
    finally:
        conn.close()
    assert anexos == 5  # PNG válido em metade


def test_limite_do_servidor_e_429_esperado(subir):
    porta, config = subir()  # limite padrão: 5 por 10 minutos
    r = _rodar(porta, "--total", "8", "--concorrencia", "2")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "aceitas 5, limitadas por 429: 3" in r.stdout
    assert _casos(config)[0] == 5


def test_429_vira_falha_com_sem_limite_esperado(subir):
    porta, _ = subir()
    r = _rodar(porta, "--total", "8", "--concorrencia", "2", "--sem-limite-esperado")
    assert r.returncode == 1
    assert "falhas: 3" in r.stdout and "status 429" in r.stdout


def test_servidor_fora_do_ar_sai_um():
    r = _rodar(1, "--total", "2", "--concorrencia", "1", "--timeout", "2")
    assert r.returncode == 1
    assert "falhas: 2" in r.stdout
