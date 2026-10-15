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

    # 3, e não 2: 2 é o código do argparse para erro de uso
    assert server.main(["--data-dir", str(tmp_path), "--criar-admin"]) == 3
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
        try:
            aluno, _ = portas.get(timeout=15)
            limite = time.monotonic() + 15
            while "backup" not in caplog.text.lower():
                assert time.monotonic() < limite
                time.sleep(0.1)
            assert _pedir(aluno, "GET", "/api/saude")[0] == 200
        finally:
            # mesmo com asserção falhando, a thread do servidor encerra
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


def _filtrar(bruto: str) -> str:
    """Passa `bruto` pelo filtro e devolve só as mensagens emitidas."""
    registros = []

    class Coletor(logging.Handler):
        def emit(self, registro):
            registros.append(registro.getMessage())

    logger = logging.getLogger("teste.filtro")
    logger.propagate = False
    coletor = Coletor()
    logger.addHandler(coletor)
    try:
        f = server._LogSemEndereco(logger)
        f.write(bruto)
        f.flush()
    finally:
        logger.removeHandler(coletor)
    return "\n".join(registros)


def _componentes(endereco: str) -> list[str]:
    import re
    return [p for p in re.split(r"[.:\[\]%]", endereco) if p]


def _sem_componentes(saida: str, endereco: str) -> None:
    import re
    for parte in _componentes(endereco):
        # parte isolada (nem colada em outro dígito hex): octeto ou hexteto
        padrao = rf"(?<![0-9A-Fa-f]){re.escape(parte)}(?![0-9A-Fa-f])"
        assert not re.search(padrao, saida), (parte, saida)


@pytest.mark.parametrize("endereco,bruto", [
    ("203.0.113.45", "conexao de 203.0.113.45 recusada"),
    ("203.0.113.45", "(from ('203.0.113.45', 5555)) Invalid HTTP method"),
    ("203.0.113.45", "cliente 203.0.113.45:5555 caiu"),
    ("192.168.0.7",
     "<socket laddr=('127.0.0.1', 3000), raddr=('192.168.0.7', 5555)>: erro"),
    ("::1", "cliente [::1]:5555 caiu"),
    ("::1", "Invalid request (from ('::1', 5555, 0, 0)): x"),
    ("::ffff:203.0.113.45", "mapeado ::ffff:203.0.113.45 porta 5555"),
    ("64:ff9b::203.0.113.5", "prefixo nat 64:ff9b::203.0.113.5 porta 5555"),
    ("203.0.113.45", "addr_203.0.113.45 x"),
    # octetos fora do formato canônico: nenhum dígito pode sobrar
    ("203.0.113.0045", "cliente 203.0.113.0045 caiu"),
    ("203.0.113.4555", "cliente 203.0.113.4555 caiu"),
    ("0203.0.113.45", "cliente 0203.0.113.45 caiu"),
    ("203.0.0113.45", "cliente 203.0.0113.45 caiu"),
    ("203.0.113.45", "ip=203.0.113.45999999 x"),
    ("2001:db8::1", "cliente 2001:db8::1 caiu"),
    ("[2001:db8::8a2e:370:7334]", "cliente [2001:db8::8a2e:370:7334]:443"),
    ("fe80::7%eth9", "zona fe80::7%eth9 x"),
    ("198.51.100.23", '  File "x.py", line 5, in f: OSError((\'198.51.100.23\', 5555))'),
])
def test_filtro_nao_deixa_sobrar_parte_do_endereco(endereco, bruto):
    saida = _filtrar(bruto + "\n")
    assert saida.strip()  # a linha não some sem rastro
    _sem_componentes(saida, endereco)
    # nenhum dígito colado ao marcador: sobra de octeto não canônico
    import re
    assert not re.search(r"\]\d|\d\[endereco", saida), saida


def test_traceback_com_endereco_no_meio():
    bruto = (
        "Traceback (most recent call last):\n"
        '  File "C:\\Python.3.13_3.13.3824.5\\Lib\\socket.py", line 12, in f\n'
        "    raise OSError(('203.0.113.45', 5555))\n"
        "OSError: ('::ffff:198.51.100.7', 5555)\n"
    )
    saida = _filtrar(bruto)
    for endereco in ("203.0.113.45", "::ffff:198.51.100.7"):
        _sem_componentes(saida, endereco)
    # versão em caminho de arquivo não é confundida com endereço
    assert "Python.3.13_3.13.3824.5" in saida


def test_residuo_descarta_a_linha_inteira(monkeypatch):
    # se a troca falhar, a rede de segurança descarta a linha
    monkeypatch.setattr(server, "_IPV4", __import__("re").compile(r"(?!x)x"))
    monkeypatch.setattr(server, "_IPV6", __import__("re").compile(r"(?!x)x"))
    saida = _filtrar("cliente 203.0.113.45 e 2001:db8::1\n")
    assert saida == server.LINHA_DESCARTADA


def test_residuo_pega_digito_colado_no_marcador(monkeypatch):
    import re
    # troca incompleta: sobra "5" depois do marcador, ou "0" antes dele
    monkeypatch.setattr(server, "_IPV6", re.compile(r"(?!x)x"))
    monkeypatch.setattr(server, "_IPV4", re.compile(r"203\.0\.113\.004"))
    assert _filtrar("cliente 203.0.113.0045 caiu\n") == server.LINHA_DESCARTADA
    monkeypatch.setattr(server, "_IPV4", re.compile(r"203\.0\.113\.45"))
    assert _filtrar("cliente 0203.0.113.45 caiu\n") == server.LINHA_DESCARTADA


def test_stderr_passa_pelo_filtro_durante_servir(tmp_path, monkeypatch, capfd, caplog):
    import sys

    original = sys.stderr

    def falso_servir(config, parar=None, **k):
        # como o traceback.print_exc() do gevent em pywsgi
        print("Traceback: OSError(('203.0.113.45', 5555))", file=sys.stderr)
        sys.stderr.flush()

    monkeypatch.setattr(server, "servir", falso_servir)
    with caplog.at_level(logging.INFO):
        assert server.main(["--data-dir", str(tmp_path)]) == 0
    assert sys.stderr is original
    capturado = capfd.readouterr()
    texto = caplog.text + capturado.out + capturado.err
    _sem_componentes(texto, "203.0.113.45")
    assert "Traceback: OSError" in caplog.text


def test_pasta_de_dados_invalida_sai_4(tmp_path, capsys):
    arquivo = tmp_path / "nao-e-pasta"
    arquivo.write_text("x", encoding="utf-8")
    assert server.main(["--data-dir", str(arquivo)]) == 4
    erro = capsys.readouterr().err
    assert "pasta de dados" in erro
    assert "Traceback" not in erro


def test_porta_ocupada_sai_4(tmp_path, monkeypatch, capsys):
    import dataclasses

    ocupante = socket.socket()
    ocupante.bind(("127.0.0.1", 0))
    ocupante.listen()
    porta = ocupante.getsockname()[1]
    carregar = server.load_config
    monkeypatch.setattr(
        server, "load_config",
        lambda d=None: dataclasses.replace(carregar(d), student_port=porta, coord_port=0),
    )
    try:
        assert server.main(["--data-dir", str(tmp_path)]) == 4
    finally:
        ocupante.close()
    erro = capsys.readouterr().err
    assert "iniciar o servidor" in erro
    assert "Traceback" not in erro
    _sem_componentes(erro, "127.0.0.1")


# --- redefinir a senha do admin -------------------------------------------

def _senha_da_saida(saida: str, rotulo: str) -> str:
    linhas = [l for l in saida.splitlines() if rotulo in l]
    assert len(linhas) == 1
    return linhas[0].split(rotulo)[1].strip()


def test_redefinir_senha_sem_admin_sai_5(tmp_path, capsys):
    assert server.main(["--data-dir", str(tmp_path), "--redefinir-senha"]) == 5
    saida = capsys.readouterr()
    assert "nao existe" in saida.err
    assert "Nova senha" not in saida.out


def test_redefinir_senha_troca_desbloqueia_e_reativa(tmp_path, capsys):
    assert server.main(["--data-dir", str(tmp_path), "--criar-admin"]) == 0
    antiga = _senha_da_saida(capsys.readouterr().out, "Senha inicial:")
    conn = connect(Config(data_dir=tmp_path, secret_key="x"))
    try:
        conn.execute("UPDATE usuarios SET ativo = 0, tentativas = 5, "
                     "bloqueado_ate = '2999-01-01T00:00:00+00:00' WHERE nome = ?",
                     (ADMIN,))
        conn.commit()
    finally:
        conn.close()

    assert server.main(["--data-dir", str(tmp_path), "--redefinir-senha"]) == 0
    saida = capsys.readouterr().out
    nova = _senha_da_saida(saida, "Nova senha:")
    assert len(nova) == 16 and nova != antiga
    assert saida.count(nova) == 1

    from app.auth import autenticar
    conn = connect(Config(data_dir=tmp_path, secret_key="x"))
    try:
        agora = datetime.now(timezone.utc)
        assert autenticar(conn, ADMIN, antiga, agora) is None
        assert autenticar(conn, ADMIN, nova, agora) is not None
    finally:
        conn.close()


def test_criar_admin_e_redefinir_senha_sao_exclusivos(tmp_path):
    with pytest.raises(SystemExit) as saida:
        server.main(["--data-dir", str(tmp_path), "--criar-admin", "--redefinir-senha"])
    assert saida.value.code == 2


def _subir_e_parar(config):
    parar = threading.Event()
    prontas: queue.Queue = queue.Queue()
    t = threading.Thread(
        target=server.servir, args=(config, parar),
        kwargs={"ao_iniciar": lambda a, c: prontas.put(True)}, daemon=True)
    t.start()
    assert prontas.get(timeout=15)
    parar.set()
    t.join(15)
    assert not t.is_alive()


def test_aviso_na_partida_sem_allowed_hosts(tmp_path, caplog):
    config = Config(data_dir=tmp_path, secret_key="x", student_port=0, coord_port=0)
    with caplog.at_level(logging.INFO, logger="seguranca.servidor"):
        _subir_e_parar(config)
    avisos = [r for r in caplog.records
              if r.levelno == logging.WARNING and "allowed_hosts" in r.getMessage()]
    assert len(avisos) == 1
    assert "127.0.0.1" not in avisos[0].getMessage()


def test_sem_aviso_com_allowed_hosts(tmp_path, caplog):
    config = Config(data_dir=tmp_path, secret_key="x", student_port=0, coord_port=0,
                    allowed_hosts=("escola.exemplo.com.br",))
    with caplog.at_level(logging.INFO, logger="seguranca.servidor"):
        _subir_e_parar(config)
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
