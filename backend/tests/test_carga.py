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


def test_padrao_do_servidor_aceita_todos_os_envios(subir):
    porta, config = subir()  # padrão: envio de denúncias sem limite
    r = _rodar(porta, "--total", "12", "--concorrencia", "3")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "enviadas: 12 (aceitas 12, limitadas por 429: 0)" in r.stdout
    assert _casos(config)[0] == 12


def test_limite_religado_e_429_esperado(subir):
    porta, config = subir({"denuncias": (5, 600)})
    r = _rodar(porta, "--total", "8", "--concorrencia", "2", "--limite-esperado")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "aceitas 5, limitadas por 429: 3" in r.stdout
    assert _casos(config)[0] == 5


@pytest.mark.parametrize("extra", [(), ("--sem-limite-esperado",)])
def test_429_e_falha_no_modo_padrao(subir, extra):
    porta, _ = subir({"denuncias": (5, 600)})
    r = _rodar(porta, "--total", "8", "--concorrencia", "2", *extra)
    assert r.returncode == 1
    assert "falhas: 3" in r.stdout and "status 429" in r.stdout


def test_flags_de_limite_sao_exclusivas():
    r = _rodar(1, "--limite-esperado", "--sem-limite-esperado")
    assert r.returncode == 2


def test_servidor_fora_do_ar_sai_um():
    r = _rodar(1, "--total", "2", "--concorrencia", "1", "--timeout", "2")
    assert r.returncode == 1
    assert "falhas: 2" in r.stdout
