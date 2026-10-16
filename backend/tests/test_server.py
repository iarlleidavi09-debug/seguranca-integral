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

    sessao_antes = (tmp_path / "sessao.key").read_text(encoding="utf-8")
    secret_antes = (tmp_path / "secret.key").read_text(encoding="utf-8")
    assert server.main(["--data-dir", str(tmp_path), "--redefinir-senha"]) == 0
    saida = capsys.readouterr().out
    nova = _senha_da_saida(saida, "Nova senha:")
    assert len(nova) == 16 and nova != antiga
    assert saida.count(nova) == 1
    # sessões abertas morrem: sessao.key trocada; códigos dos alunos intactos
    sessao_depois = (tmp_path / "sessao.key").read_text(encoding="utf-8")
    assert sessao_depois != sessao_antes and len(sessao_depois) == 64
    assert (tmp_path / "secret.key").read_text(encoding="utf-8") == secret_antes
    assert "sessao.key" in saida and "reinicie" in saida.lower()

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


def test_backup_da_partida_so_se_o_de_hoje_nao_existe(tmp_path, monkeypatch):
    feitos, limpezas = [], []
    monkeypatch.setattr(server, "fazer_backup", lambda c, a: feitos.append(a))
    monkeypatch.setattr(server, "limpar_antigos", lambda c, a: limpezas.append(a))
    config = Config(data_dir=tmp_path, secret_key="k")
    agora = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)

    server._backup_e_limpeza(config, agora, so_se_faltar=True)
    assert len(feitos) == 1  # não havia backup de hoje
    (config.backups_dir / "2026-10-14").mkdir(parents=True)
    server._backup_e_limpeza(config, agora, so_se_faltar=True)
    assert len(feitos) == 1  # já existe: a partida não refaz
    assert len(limpezas) == 2  # a limpeza dos antigos roda sempre
    server._backup_e_limpeza(config, agora)
    assert len(feitos) == 2  # a rotina de 24 h refaz sempre


# --- log em arquivo com rotação ---------------------------------------------

def _tirar_handlers(handlers):
    raiz = logging.getLogger()
    for h in handlers:
        raiz.removeHandler(h)
        h.close()


def test_log_em_arquivo_sem_endereco_nem_id_de_caso(tmp_path):
    import logging.handlers

    config = Config(data_dir=tmp_path, secret_key="chave-de-teste",
                    student_port=0, coord_port=0)
    handlers = server._configurar_log(config)
    try:
        arquivos = [h for h in handlers
                    if isinstance(h, logging.handlers.RotatingFileHandler)]
        assert len(arquivos) == 1
        assert arquivos[0].maxBytes == 1_000_000 and arquivos[0].backupCount == 5
        parar = threading.Event()
        portas: queue.Queue = queue.Queue()
        t = threading.Thread(target=server.servir, args=(config, parar),
                             kwargs={"ao_iniciar": lambda a, c: portas.put((a, c))},
                             daemon=True)
        t.start()
        try:
            aluno, coord = portas.get(timeout=15)
            cab = {"CF-Connecting-IP": "203.0.113.77",
                   "X-Forwarded-For": "198.51.100.23, 2001:db8::7"}
            assert _pedir(aluno, "GET", "/api/saude", cabecalhos=cab)[0] == 200
            assert _pedir(coord, "GET", "/api/casos/777123", cabecalhos=cab)[0] == 401
            # requisição malformada: o gevent registra o endereço do cliente
            with socket.create_connection(("127.0.0.1", aluno), timeout=10) as s:
                s.sendall(b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: abc\r\n\r\n")
                s.recv(1024)
            time.sleep(0.3)
        finally:
            parar.set()
            t.join(15)
    finally:
        _tirar_handlers(handlers)
    texto = (tmp_path / "logs" / "servidor.log").read_text(encoding="utf-8")
    assert "GET /api/saude 200" in texto
    assert "GET /api/casos/<int:caso_id> 401" in texto
    assert "Invalid" in texto or "invalid" in texto or "[endereco]" in texto
    for proibido in ("127.0.0.1", "203.0.113.77", "198.51.100.23", "2001:db8",
                     "777123"):
        assert proibido not in texto


def test_log_em_arquivo_indisponivel_nao_impede_a_partida(tmp_path, monkeypatch, capsys):
    (tmp_path / "logs").write_text("ocupa o lugar da pasta", encoding="utf-8")
    chamadas = []
    monkeypatch.setattr(server, "servir",
                        lambda config, parar=None, **k: chamadas.append(config))
    antes = list(logging.getLogger().handlers)
    assert server.main(["--data-dir", str(tmp_path)]) == 0
    assert len(chamadas) == 1
    assert "log em arquivo" in capsys.readouterr().err
    assert logging.getLogger().handlers == antes


def test_main_cria_o_log_e_devolve_os_handlers(tmp_path, monkeypatch):
    antes = list(logging.getLogger().handlers)

    def servir_falso(config, parar=None, **k):
        logging.getLogger("seguranca.teste").warning("linha de teste 10.1.2.3")

    monkeypatch.setattr(server, "servir", servir_falso)
    assert server.main(["--data-dir", str(tmp_path)]) == 0
    assert logging.getLogger().handlers == antes  # nada vaza para outros testes
    texto = (tmp_path / "logs" / "servidor.log").read_text(encoding="utf-8")
    assert "linha de teste [endereco]" in texto
    assert "10.1.2.3" not in texto


def test_traceback_no_arquivo_passa_pelo_filtro(tmp_path):
    config = Config(data_dir=tmp_path, secret_key="k")
    handlers = server._configurar_log(config)
    try:
        try:
            raise OSError("conexao de 192.0.2.44 caiu")
        except OSError:
            logging.getLogger("seguranca.teste").exception("falhou")
    finally:
        _tirar_handlers(handlers)
    texto = (tmp_path / "logs" / "servidor.log").read_text(encoding="utf-8")
    assert "falhou" in texto and "OSError" in texto
    assert "192.0.2.44" not in texto


# --- questionário inválido ------------------------------------------------------

def test_questionario_invalido_nao_bloqueia_recuperacao_de_conta(tmp_path, capsys):
    (tmp_path / "questionario.json").write_text("{ quebrado", encoding="utf-8")
    assert server.main(["--data-dir", str(tmp_path), "--criar-admin"]) == 0
    assert server.main(["--data-dir", str(tmp_path), "--redefinir-senha"]) == 0


def test_questionario_invalido_na_partida_sai_4_sem_traceback(tmp_path, monkeypatch, capsys):
    (tmp_path / "questionario.json").write_text("{ quebrado", encoding="utf-8")
    monkeypatch.setattr(server, "servir", lambda *a, **k: pytest.fail("nao deve subir"))
    capsys.readouterr()
    assert server.main(["--data-dir", str(tmp_path)]) == 4
    err = capsys.readouterr().err
    assert "Questionario invalido" in err and "JSON" in err
    assert "Traceback" not in err
