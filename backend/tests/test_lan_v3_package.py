import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def test_default_build_is_lan_and_never_installs_dependencies_or_runs_setup():
    build = (RAIZ / 'installer/build.ps1').read_text(encoding='utf-8-sig')
    assert '[switch]$Lan = $true' in build
    assert "Invoke-Passo -Titulo 'npm ci'" not in build
    assert "@('/DLAN=1', $Iss)" in build
    assert '-File lan.ps1' not in build and '-File tarefas.ps1' not in build
    assert '-Programa $Setup' not in build
    iss = (RAIZ / 'installer/instalador.iss').read_text(encoding='utf-8-sig')
    assert '#define LAN 1' in iss


def test_all_v3_versions_and_json_resources_are_packaged():
    for name in ['package.json', 'package-lock.json']:
        dados = json.loads((RAIZ / 'frontend' / name).read_text())
        assert dados['version'] == '3.1.0'
    iss = (RAIZ / 'installer/instalador.iss').read_text(encoding='utf-8-sig')
    assert '#define AppVersao "3.1.0"' in iss
    spec = (RAIZ / 'installer/seguranca.spec').read_text()
    for name in ['questionario.json', 'questionario_v3.json', 'risk_terms.json']:
        assert name in spec
    assert "version=os.path.join(SPECPATH, 'versao.txt')" in spec
    versao = (RAIZ / 'installer/versao.txt').read_text()
    assert 'filevers=(3, 1, 0, 0)' in versao
    assert '3.1.0' in (RAIZ / 'PRODUCT.md').read_text(encoding='utf-8')
