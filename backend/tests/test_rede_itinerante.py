"""Executa o script LAN com adaptadores simulados, sem alterar a rede real."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
PS = shutil.which('powershell.exe')
pytestmark = pytest.mark.skipif(not PS, reason='PowerShell Windows necessário')


def executar(tmp_path, ip, exigir=True):
    script = RAIZ / 'installer' / 'lan.ps1'
    harness = tmp_path / 'teste.ps1'
    harness.write_text('''
param($Script, $Pasta, $Ip, $Exigir)
$ErrorActionPreference = 'Stop'
function Get-NetAdapter { [pscustomobject]@{Status='Up';ifIndex=1;InterfaceDescription='Wi-Fi'} }
function Get-NetIPAddress { if ($Ip) { [pscustomobject]@{IPAddress=$Ip;InterfaceIndex=1} } }
function Get-NetConnectionProfile { [pscustomobject]@{Name='Escola';NetworkCategory='Public'} }
& $Script -DataDir $Pasta -SaidaEnderecos (Join-Path $Pasta 'enderecos.txt') -SemFirewall -ExigirRede:($Exigir -eq 'sim')
''', encoding='utf-8-sig')
    return subprocess.run([PS, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(harness),
                           '-Script', str(script), '-Pasta', str(tmp_path), '-Ip', ip,
                           '-Exigir', 'sim' if exigir else 'nao'],
                          capture_output=True, timeout=30)


def test_troca_ip_remove_so_host_gerenciado_e_preserva_configuracao(tmp_path):
    arquivo = tmp_path / 'config.json'
    arquivo.write_text(json.dumps({
        'student_port': 3300, 'coord_port': 4400, 'limites': {'login': [10, 60]},
        'allowed_hosts': ['escola.exemplo.com', '192.168.1.20'],
        'lan_managed_hosts': ['192.168.1.20'],
    }))
    resultado = executar(tmp_path, '192.168.50.30')
    assert resultado.returncode == 0, resultado.stderr
    dados = json.loads(arquivo.read_text(encoding='utf-8-sig'))
    assert '192.168.50.30' in dados['allowed_hosts']
    assert '192.168.1.20' not in dados['allowed_hosts']
    assert 'escola.exemplo.com' in dados['allowed_hosts']
    assert dados['student_port'] == 3300 and dados['coord_port'] == 4400
    assert dados['limites'] == {'login': [10, 60]}
    assert dados['host'] == '0.0.0.0'
    assert json.loads((tmp_path / 'config.json.bak').read_text())['student_port'] == 3300
    texto = (tmp_path / 'enderecos.txt').read_text(encoding='utf-8-sig')
    assert 'http://192.168.50.30:3300' in texto
    assert '192.168.1.20' not in texto
    assert 'Pública' in texto and 'Atualizar rede' in texto


@pytest.mark.parametrize('ip', ['', '169.254.1.2', '127.0.0.1'])
def test_sem_ip_utilizavel_nao_altera_configuracao(tmp_path, ip):
    arquivo = tmp_path / 'config.json'
    original = '{"allowed_hosts":["escola.exemplo.com"]}'
    arquivo.write_text(original)
    resultado = executar(tmp_path, ip)
    assert resultado.returncode != 0
    assert arquivo.read_text() == original
    assert not (tmp_path / 'enderecos.txt').exists()


def test_instalador_entrega_atualizador_e_atalho():
    iss = (RAIZ / 'installer/instalador.iss').read_text(encoding='utf-8-sig')
    assert 'Source: "atualizar-rede.ps1"' in iss
    assert 'Atualizar rede' in iss
    assert '-AbrirCoordenacao' in iss


def test_instalacao_offline_continua_permitindo_acesso_local(tmp_path):
    resultado = executar(tmp_path, '', exigir=False)
    assert resultado.returncode == 0, resultado.stderr
    dados = json.loads((tmp_path / 'config.json').read_text())
    assert '127.0.0.1' in dados['allowed_hosts']


def test_ip_adicionado_manualmente_nao_vira_host_gerenciado(tmp_path):
    arquivo = tmp_path / 'config.json'
    arquivo.write_text('{"allowed_hosts":["192.168.50.30"]}')
    assert executar(tmp_path, '192.168.50.30').returncode == 0
    assert executar(tmp_path, '192.168.70.40').returncode == 0
    assert '192.168.50.30' in json.loads(arquivo.read_text())['allowed_hosts']


@pytest.mark.parametrize('saudavel', [True, False])
def test_reinicio_verifica_os_dois_portais_sem_confundir_http_com_saude(tmp_path, saudavel):
    script = RAIZ / 'installer/atualizar-rede.ps1'
    assert script.exists()
    (tmp_path / 'lan.ps1').write_text("Add-Content (Join-Path $Pasta 'ordem.txt') 'config'\n")
    (tmp_path / 'config.json').write_text('{"student_port":3300,"coord_port":4400}')
    harness = tmp_path / 'reinicio.ps1'
    harness.write_text('''
param($Script, $Pasta, $Saudavel)
$ErrorActionPreference = 'Stop'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Script, [ref]$null, [ref]$null)
$funcao = $ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Atualizar-Rede'}, $true)
Invoke-Expression $funcao.Extent.Text
function Get-ScheduledTask { [pscustomobject]@{State='Ready'} }
function Stop-ScheduledTask { Add-Content (Join-Path $Pasta 'ordem.txt') 'stop' }
function Start-ScheduledTask { Add-Content (Join-Path $Pasta 'ordem.txt') 'start' }
function Start-Sleep {}
function Invoke-RestMethod {
 param($Uri, $TimeoutSec)
 Add-Content (Join-Path $Pasta 'ordem.txt') $Uri
 [pscustomobject]@{produto='seguranca-integral';versao='3.1.0';portal=$(if($Uri -match ':3300/'){'aluno'}else{'coordenacao'});banco=@{ok=($Saudavel -eq 'sim')}}
}
try { Atualizar-Rede -PastaPrograma $Pasta -DataDir $Pasta -SaidaEnderecos (Join-Path $Pasta 'enderecos.txt'); exit 0 }
catch { exit 1 }
''', encoding='utf-8-sig')
    result = subprocess.run([PS, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(harness),
                             '-Script', str(script), '-Pasta', str(tmp_path),
                             '-Saudavel', 'sim' if saudavel else 'nao'], capture_output=True, timeout=30)
    assert result.returncode == (0 if saudavel else 1), result.stderr
    ordem = (tmp_path / 'ordem.txt').read_text(encoding='utf-8-sig').splitlines()
    assert ordem[:3] == ['config', 'stop', 'start']
    if saudavel:
        assert 'http://127.0.0.1:3300/api/servidor' in ordem
        assert 'http://127.0.0.1:4400/api/servidor' in ordem
