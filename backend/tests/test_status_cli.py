"""Monitor e diagnóstico usam somente evidência local, sem inicializar dados."""
import json
import socket
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app import create_coord_app, create_student_app, server
from app.config import Config
from app.db import init_db
from app.realtime import CentralEventos


def test_runtime_shared_and_database_diagnostic_readonly(config):
    from app.diagnostico import EstadoRuntime
    runtime = EstadoRuntime()
    central = CentralEventos()
    aluno = create_student_app(config, central=central, runtime=runtime).test_client()
    coord = create_coord_app(config, central=central, runtime=runtime).test_client()
    assinatura = central.assinar(999)
    runtime.registrar_backup('ok', datetime(2026, 10, 16, tzinfo=timezone.utc))
    for cliente, portal in [(aluno, 'aluno'), (coord, 'coordenacao')]:
        resposta = cliente.get('/api/servidor').json
        assert resposta['portal'] == portal
        assert resposta['eventos'] == {'assinantes': 1}
        assert resposta['backup'] == {'estado': 'ok', 'em': '2026-10-16T00:00:00+00:00'}
    assinatura.fechar()
    config.db_path.unlink()
    assert aluno.get('/api/servidor').json['banco'] == {'ok': False}
    assert not config.db_path.exists()


@pytest.mark.parametrize('header', ['X-Forwarded-Host', 'X-Real-IP', 'Via', 'CF-Ray'])
def test_diagnostic_rejects_other_proxy_headers(student_client, header):
    assert student_client.get('/api/servidor', headers={header: 'x'}).status_code == 403


def test_old_backup_is_pending_until_an_attempt(config):
    from app.diagnostico import EstadoRuntime
    runtime = EstadoRuntime()
    init_db(config)
    agora = datetime.now(timezone.utc)
    server.pasta_do_dia(config, agora).mkdir(parents=True)
    server._backup_uma_vez(config, so_se_faltar=True, runtime=runtime)
    assert runtime.backup == {'estado': 'pendente', 'em': None}
    server._backup_uma_vez(config, runtime=runtime)
    assert runtime.backup['estado'] == 'ok' and runtime.backup['em']


def test_backup_failure_is_observed_without_exception_text(config, monkeypatch):
    from app.diagnostico import EstadoRuntime
    runtime = EstadoRuntime()
    def falhar(*args):
        raise OSError('segredo')
    monkeypatch.setattr(server, 'fazer_backup', falhar)
    server._backup_uma_vez(config, runtime=runtime)
    assert runtime.backup['estado'] == 'erro' and runtime.backup['em']
    assert 'segredo' not in json.dumps(runtime.backup)


def diagnostico(portal):
    return {'produto': 'seguranca-integral', 'versao': '3.1.0', 'portal': portal,
            'uptime_s': 5, 'banco': {'ok': True},
            'backup': {'estado': 'pendente', 'em': None}, 'eventos': {'assinantes': 0}}


@pytest.fixture
def portais(tmp_path):
    servidores = []
    payloads = [diagnostico('aluno'), diagnostico('coordenacao')]
    for indice in range(2):
        def criar_handler(i):
            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    assert self.path == '/api/servidor'
                    if payloads[i] == 'timeout':
                        time.sleep(2)
                        return
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(json.dumps(payloads[i]).encode())
                def log_message(self, *_args):
                    pass
            return Handler
        http = ThreadingHTTPServer(('127.0.0.1', 0), criar_handler(indice))
        threading.Thread(target=http.serve_forever, daemon=True).start()
        servidores.append(http)
    (tmp_path / 'config.json').write_text(json.dumps({
        'student_port': servidores[0].server_port, 'coord_port': servidores[1].server_port,
        'host': '0.0.0.0', 'allowed_hosts': ['192.168.1.50', 'localhost']}))
    yield tmp_path, payloads, servidores
    for http in servidores:
        http.shutdown()
        http.server_close()


def test_status_checks_both_portals_and_ignores_proxy_env(portais, monkeypatch, capsys):
    from app.status_cli import main_status
    pasta, _, _ = portais
    monkeypatch.setenv('HTTP_PROXY', 'http://127.0.0.1:1')
    monkeypatch.setenv('NO_PROXY', '')
    assert main_status(pasta, json=True) == 0
    estado = json.loads(capsys.readouterr().out)
    assert estado['estado'] == 'saudavel'
    assert len(estado['portais']) == 2
    assert 'http://192.168.1.50:' in json.dumps(estado)
    assert sorted(p.name for p in pasta.iterdir()) == ['config.json']


@pytest.mark.parametrize('mudanca', [
    {'produto': 'outro'}, {'versao': '1.0.0'}, {'portal': 'aluno'},
    {'banco': {'ok': False}}, {'backup': {'estado': 'erro', 'em': None}},
    {'backup': {}}, {'eventos': {'assinantes': -1}}, {'uptime_s': None},
])
def test_status_never_marks_wrong_or_unknown_service_healthy(portais, mudanca, capsys):
    from app.status_cli import main_status
    pasta, payloads, _ = portais
    payloads[1].update(mudanca)
    assert main_status(pasta, json=True) == 1
    assert json.loads(capsys.readouterr().out)['estado'] != 'saudavel'


def test_one_portal_offline_is_degraded(portais, capsys):
    from app.status_cli import main_status
    pasta, _, servidores = portais
    servidores[1].shutdown()
    servidores[1].server_close()
    assert main_status(pasta, json=True) == 1
    assert json.loads(capsys.readouterr().out)['estado'] == 'degradado'


def test_watch_ctrl_c_returns_last_status_only_stops_monitor(portais, monkeypatch, capsys):
    from app import status_cli
    pasta, _, _ = portais
    def interromper(segundos):
        assert segundos == 2
        raise KeyboardInterrupt
    monkeypatch.setattr(status_cli.time, 'sleep', interromper)
    assert status_cli.main_status(pasta, watch=True) == 0
    assert status_cli.main_status(pasta, json=True) == 0
    capsys.readouterr()


def test_missing_folder_does_not_claim_health_of_default_ports(tmp_path, monkeypatch):
    from app import status_cli
    def nao_consultar(*_args):
        pytest.fail('sem pasta de dados, nenhum servidor pode ser associado ao monitor')
    monkeypatch.setattr(status_cli, '_consultar', nao_consultar)
    pasta = tmp_path / 'ausente'
    assert status_cli.coletar_estado(pasta)['estado'] == 'offline'
    assert not pasta.exists()


def test_status_uses_default_windows_folder_without_loading_keys(monkeypatch, tmp_path, capsys):
    from app import status_cli
    pasta = tmp_path / 'padrao-ausente'
    monkeypatch.setattr(status_cli, 'DATA_DIR_PADRAO', pasta)
    monkeypatch.setattr(server, 'load_config', lambda *_a: pytest.fail('leu chaves'))
    monkeypatch.setattr(server, 'init_db', lambda *_a: pytest.fail('inicializou banco'))
    assert server.main(['--status', '--json']) == 1
    assert not pasta.exists()
    capsys.readouterr()


def test_status_times_out_but_still_checks_the_other_portal(portais, capsys):
    from app.status_cli import main_status
    pasta, payloads, _ = portais
    payloads[0] = 'timeout'
    inicio = time.monotonic()
    assert main_status(pasta, json=True) == 1
    assert time.monotonic() - inicio < 3
    estado = json.loads(capsys.readouterr().out)
    assert estado['portais'][1]['estado'] == 'saudavel'


def test_absurd_uptime_is_unknown_instead_of_crashing(portais, capsys):
    from app.status_cli import main_status
    pasta, payloads, _ = portais
    payloads[0]['uptime_s'] = 10 ** 1000
    assert main_status(pasta, json=True) == 1
    capsys.readouterr()


def test_empty_database_is_not_a_healthy_application_database(config):
    from app.diagnostico import banco_disponivel
    config.db_path.write_bytes(b'')
    assert banco_disponivel(config.db_path) is False
    assert config.db_path.read_bytes() == b''


@pytest.mark.parametrize('fase', ['headers', 'body'])
def test_total_deadline_stops_dripping_service_and_checks_second_portal(portais, monkeypatch, capsys, fase):
    from app import status_cli
    pasta, _, _ = portais
    fim = threading.Event()
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        def gotejar():
            conn, _ = listener.accept()
            with conn:
                conn.recv(4096)
                if fase == 'headers':
                    inicio, lento = b'HTTP/1.1 200 OK\r\nX-Lento: ', b'abcdefghi'
                else:
                    inicio = b'HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n'
                    lento = b'abcdefghi'
                try:
                    conn.sendall(inicio)
                    for byte in lento:
                        if fim.wait(0.06):
                            break
                        conn.sendall(bytes([byte]))
                except OSError:
                    pass
        thread = threading.Thread(target=gotejar, daemon=True)
        thread.start()
        cfg = json.loads((pasta / 'config.json').read_text())
        cfg['student_port'] = listener.getsockname()[1]
        (pasta / 'config.json').write_text(json.dumps(cfg))
        monkeypatch.setattr(status_cli, 'TIMEOUT', 0.15)
        inicio = time.monotonic()
        try:
            assert status_cli.main_status(pasta, json=True) == 1
            duracao = time.monotonic() - inicio
            estado = json.loads(capsys.readouterr().out)
            assert estado['portais'][1]['estado'] == 'saudavel'
            assert duracao < 0.45, f'{fase} ultrapassou deadline total: {duracao:.3f}s'
        finally:
            fim.set()
            thread.join(2)


def test_non_http_service_is_reported_as_unknown():
    from app.status_cli import _consultar
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        def ssh():
            conn, _ = listener.accept()
            with conn:
                conn.recv(4096)
                conn.sendall(b'SSH-2.0-OpenSSH_9.0\r\n')
        thread = threading.Thread(target=ssh, daemon=True)
        thread.start()
        resultado = _consultar(listener.getsockname()[1], 'aluno')
        thread.join(2)
        assert resultado['estado'] == 'servico_desconhecido'
        assert 'SSH' not in json.dumps(resultado)
