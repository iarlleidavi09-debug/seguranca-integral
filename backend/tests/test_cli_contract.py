"""Contratos de operação sem efeitos colaterais, preparados antes da CLI."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]


def execute_status(path, *args):
    # cwd fixo: sem ele o módulo `app` só é achado quando o pytest roda de dentro de backend/;
    # UTF-8 forçado: o caminho do projeto tem acento e a saída em pipe seria cp1252
    return subprocess.run(
        [sys.executable, '-m', 'app.server', '--data-dir', str(path), *args],
        capture_output=True, text=True, encoding='utf-8', timeout=60,
        cwd=BACKEND, env={**os.environ, 'PYTHONUTF8': '1'},
    )


def test_offline_status_does_not_initialize_missing_data_directory(tmp_path):
    path = tmp_path / 'nao-existe'
    result = execute_status(path, '--status', '--json')
    assert result.returncode == 1, result.stderr
    assert isinstance(json.loads(result.stdout), dict)
    assert not path.exists()


def test_status_invalid_config_does_not_create_keys_or_database(tmp_path):
    (tmp_path / 'config.json').write_text('{quebrado', encoding='utf-8')
    result = execute_status(tmp_path, '--status', '--json')
    assert result.returncode == 4, result.stderr
    assert sorted(p.name for p in tmp_path.iterdir()) == ['config.json']


@pytest.mark.parametrize('args', [
    ('--watch',), ('--json',), ('--status', '--watch', '--json'),
    ('--status', '--criar-admin'), ('--status', '--redefinir-senha'),
])
def test_invalid_monitor_options_exit_before_creating_data(tmp_path, args):
    path = tmp_path / 'nao-existe'
    result = execute_status(path, *args)
    assert result.returncode == 2
    assert not path.exists()


def test_local_diagnostic_is_an_allowlist_without_case_or_account_data(student_client):
    result = student_client.get('/api/servidor', environ_overrides={'REMOTE_ADDR': '127.0.0.1'})
    assert result.status_code == 200
    assert set(result.json) == {'produto', 'versao', 'portal', 'uptime_s', 'banco', 'backup', 'eventos'}
    assert result.json['produto'] == 'seguranca-integral'
    assert result.json['portal'] == 'aluno'
    assert result.json['versao'] == '3.1.0'
    assert result.json['banco']['ok'] is True
    assert result.json['backup']['estado'] == 'pendente'


@pytest.mark.parametrize('portal', ['student_client', 'coord_client'])
def test_diagnostic_rejects_lan_clients(request, portal):
    client = request.getfixturevalue(portal)
    response = client.get('/api/servidor', environ_overrides={'REMOTE_ADDR': '192.168.1.42'})
    assert response.status_code == 403


@pytest.mark.parametrize('header', ['X-Forwarded-For', 'X-Forwarded-Proto', 'CF-Connecting-IP', 'Forwarded'])
def test_diagnostic_rejects_proxy_headers_on_loopback(student_client, header):
    response = student_client.get('/api/servidor', headers={header: 'valor'},
                                  environ_overrides={'REMOTE_ADDR': '127.0.0.1'})
    assert response.status_code == 403
