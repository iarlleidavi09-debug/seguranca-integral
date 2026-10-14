"""Servidor de duas portas, criação do admin e logs sem IP."""
import http.client
import json
import logging
import queue
import socket
import threading
import time
from datetime import datetime, timezone

import pytest
from werkzeug.security import check_password_hash

from app import server
from app.config import Config
from app.db import connect

ADMIN = "coordenacao"


def _hash_admin(pasta):
    conn = connect(Config(data_dir=pasta, secret_key="x"))
    try:
        linha = conn.execute(
            "SELECT senha_hash FROM usuarios WHERE nome = ?", (ADMIN,)
        ).fetchone()
    finally:
        conn.close()
    return linha["senha_hash"] if linha else None


def test_criar_admin_imprime_senha_uma_vez_e_nao_sobrescreve(tmp_path, capsys):
    assert server.main(["--data-dir", str(tmp_path), "--criar-admin"]) == 0
    saida = capsys.readouterr().out
    linhas = [l for l in saida.splitlines() if "Senha inicial:" in l]
    assert len(linhas) == 1
    senha = linhas[0].split("Senha inicial:")[1].strip()
    assert len(senha) == 16
    assert saida.count(senha) == 1
    hash_antes = _hash_admin(tmp_path)
    assert check_password_hash(hash_antes, senha)

    assert server.main(["--data-dir", str(tmp_path), "--criar-admin"]) == 2
    saida2 = capsys.readouterr()
    assert senha not in saida2.out + saida2.err
    assert "Senha inicial:" not in saida2.out + saida2.err
    assert "ja existe" in saida2.out + saida2.err
    assert _hash_admin(tmp_path) == hash_antes


def test_execucao_normal_inicializa_banco_e_chama_servir(tmp_path, monkeypatch):
    chamadas = []
    monkeypatch.setattr(server, "servir",
                        lambda config, parar=None, **k: chamadas.append(config))
    assert server.main(["--data-dir", str(tmp_path)]) == 0
    assert len(chamadas) == 1
    assert chamadas[0].data_dir == tmp_path
    assert (chamadas[0].student_port, chamadas[0].coord_port) == (3000, 4000)
    assert chamadas[0].host == "127.0.0.1"
    assert (tmp_path / "seguranca.db").exists()


@pytest.fixture
def servidor(tmp_path):
    """Sobe `servir` numa thread, com portas livres escolhidas pelo sistema."""
    config = Config(data_dir=tmp_path, secret_key="chave-de-teste",
                    student_port=0, coord_port=0)
    parar = threading.Event()
    portas: queue.Queue = queue.Queue()
    erros = []

    def rodar():
        try:
            server.servir(config, parar, ao_iniciar=lambda a, c: portas.put((a, c)))
        except BaseException as erro:  # pragma: no cover - aparece no assert
            erros.append(erro)
            portas.put(None)

    t = threading.Thread(target=rodar, daemon=True)
    t.start()
    par = portas.get(timeout=15)
    assert par is not None, erros
    yield {"aluno": par[0], "coord": par[1], "config": config}
    parar.set()
    t.join(15)
    assert not t.is_alive(), "servir nao encerrou"
    assert not erros, erros


def _pedir(porta, metodo, caminho, corpo=None, cabecalhos=None):
    conn = http.client.HTTPConnection("127.0.0.1", porta, timeout=10)
    try:
        dados = json.dumps(corpo).encode() if corpo is not None else None
        h = {"Content-Type": "application/json"} if dados else {}
        h.update(cabecalhos or {})
        conn.request(metodo, caminho, body=dados, headers=h)
        r = conn.getresponse()
        return r.status, dict(r.getheaders()), r.read()
    finally:
        conn.close()


def test_duas_portas_isoladas(servidor):
    aluno, coord = servidor["aluno"], servidor["coord"]
    assert aluno != coord
    assert _pedir(aluno, "GET", "/api/casos")[0] == 404
    assert _pedir(coord, "GET", "/api/casos")[0] == 401
    assert _pedir(coord, "POST", "/api/denuncias", {"tipo": "outro"})[0] == 404
    login = {"nome": "x", "senha": "y"}
    assert _pedir(coord, "POST", "/api/login", login)[0] == 401
    assert _pedir(aluno, "POST", "/api/login", login)[0] == 404
    status, cab, _ = _pedir(aluno, "GET", "/api/saude")
    assert status == 200
    assert cab["X-Content-Type-Options"] == "nosniff"


def test_backup_na_partida(servidor):
    pasta = servidor["config"].backups_dir / datetime.now(timezone.utc).date().isoformat()
    limite = time.monotonic() + 15
    while not (pasta / "seguranca.db").exists():
        assert time.monotonic() < limite, "backup da partida nao foi feito"
        time.sleep(0.1)


def test_falha_no_backup_nao_derruba_o_servidor(tmp_path, monkeypatch, caplog):
    def quebrado(*a, **k):
        raise OSError("disco cheio")

    monkeypatch.setattr(server, "fazer_backup", quebrado)
    config = Config(data_dir=tmp_path, secret_key="k", student_port=0, coord_port=0)
    parar = threading.Event()
    portas: queue.Queue = queue.Queue()
    with caplog.at_level(logging.INFO):
        t = threading.Thread(
            target=server.servir,
            args=(config, parar),
            kwargs={"ao_iniciar": lambda a, c: portas.put((a, c))},
            daemon=True,
        )
        t.start()
        aluno, _ = portas.get(timeout=15)
        limite = time.monotonic() + 15
        while "backup" not in caplog.text.lower():
            assert time.monotonic() < limite
            time.sleep(0.1)
        assert _pedir(aluno, "GET", "/api/saude")[0] == 200
        parar.set()
        t.join(15)
    assert not t.is_alive()
    assert "disco cheio" in caplog.text


def _sem_ip(texto: str) -> None:
    assert "127.0.0.1" not in texto
    assert "::1" not in texto


def test_nao_ha_ip_no_log_de_acesso(servidor, caplog, capfd):
    with caplog.at_level(logging.DEBUG):
        assert _pedir(servidor["aluno"], "GET", "/api/saude")[0] == 200
        assert _pedir(servidor["coord"], "GET", "/api/saude")[0] == 200
        time.sleep(0.2)
    capturado = capfd.readouterr()
    _sem_ip(caplog.text + capturado.out + capturado.err)
    # o log de acesso registra a requisição, só sem o endereço
    assert "GET /api/saude 200" in caplog.text


def test_requisicao_malformada_nao_registra_ip(servidor, caplog, capfd):
    with caplog.at_level(logging.DEBUG):
        for porta in (servidor["aluno"], servidor["coord"]):
            with socket.create_connection(("127.0.0.1", porta), timeout=10) as s:
                s.sendall(b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: abc\r\n\r\n")
                resposta = s.recv(1024)
            assert resposta.startswith(b"HTTP/1.1 400")
        time.sleep(0.2)
    capturado = capfd.readouterr()
    texto = caplog.text + capturado.out + capturado.err
    _sem_ip(texto)
    # o erro foi registrado (então o filtro agiu), só sem o endereço
    assert "Invalid" in texto or "invalid" in texto


@pytest.mark.parametrize("bruto", [
    "(from ('10.1.2.3', 5555)) Invalid HTTP method",
    "<socket laddr=('127.0.0.1', 3000), raddr=('192.168.0.7', 51234)>: erro",
    "Invalid request (from ('::1', 5555, 0, 0)): x",
    "cliente [2001:db8::8a2e:370:7334]:443 e fe80::1%eth0",
    "ipv4 mapeado ::ffff:10.0.0.9",
])
def test_filtro_remove_enderecos(bruto, caplog):
    with caplog.at_level(logging.DEBUG):
        log = server._LogSemEndereco(logging.getLogger("seguranca.servidor"))
        log.write(bruto + "\n")
        log.flush()
    for ip in ("10.1.2.3", "127.0.0.1", "192.168.0.7", "::1", "2001:db8",
               "fe80::1", "10.0.0.9", "ffff"):
        assert ip not in caplog.text
    assert caplog.text.strip()
