"""Conferências estáticas dos arquivos de empacotamento em installer/.

O executável e o instalador não são gerados aqui (isso é o build.ps1); estes
testes travam as decisões que um erro de digitação desfaria em silêncio.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
INSTALLER = RAIZ / "installer"
SPEC = INSTALLER / "seguranca.spec"
ISS = INSTALLER / "instalador.iss"
TAREFAS = INSTALLER / "tarefas.ps1"
BUILD = INSTALLER / "build.ps1"
LEIA_ME = INSTALLER / "LEIA-ME.txt"
ENTRADA = RAIZ / "backend" / "entrada.py"


def _ler(caminho: Path) -> str:
    return caminho.read_text(encoding="utf-8-sig")


def _secao_iss(nome: str) -> str:
    """Texto de uma seção [Nome] do .iss, até a próxima seção."""
    texto = _ler(ISS)
    achado = re.search(rf"^\[{re.escape(nome)}\]\s*$(.*?)(?=^\[\w+\]\s*$|\Z)",
                       texto, re.M | re.S)
    return achado.group(1) if achado else ""


# --- PyInstaller -------------------------------------------------------------

def test_spec_inclui_static_e_termos():
    spec = _ler(SPEC)
    # destino "app/...": no executável o app procura em Path(__file__).parent
    assert "(os.path.join(APP, 'static'), 'app/static')" in spec
    assert "(os.path.join(APP, 'risk_terms.json'), 'app')" in spec
    assert "datas=dados" in spec
    assert "entrada.py" in spec
    assert "name='SegurancaIntegral'" in spec or 'name="SegurancaIntegral"' in spec
    assert re.search(r"console\s*=\s*True", spec)
    # build sem os portais compilados precisa falhar, não gerar exe vazio
    assert "index.html" in spec and "raise SystemExit" in spec


def test_entrada_chama_main_e_repassa_o_codigo():
    texto = _ler(ENTRADA)
    assert "from app.server import main" in texto
    assert "sys.exit(main())" in texto


# --- não mexer no túnel nem no outro projeto --------------------------------

@pytest.mark.parametrize("arquivo", [ISS, TAREFAS, BUILD, SPEC, ENTRADA],
                         ids=lambda p: p.name)
def test_instalador_nao_toca_cloudflared_nem_stardust(arquivo):
    texto = _ler(arquivo).lower()
    assert "cloudflared" not in texto
    assert "stardust" not in texto
    assert "5000" not in texto  # porta do outro projeto


def test_so_o_leia_me_fala_do_tunel():
    texto = _ler(LEIA_ME)
    assert "cloudflared" in texto
    assert "StarDust" in texto


# --- desinstalação ------------------------------------------------------------

def test_instalador_preserva_dados_na_desinstalacao():
    texto = _ler(ISS)
    # nada da pasta de dados nas listas automáticas de remoção
    for secao in ("UninstallDelete", "InstallDelete", "Dirs"):
        corpo = _secao_iss(secao).lower()
        assert "commonappdata" not in corpo and "programdata" not in corpo
    # pergunta explícita, com "Não" como padrão, e silencioso preserva
    assert "usPostUninstall" in texto
    assert re.search(r"MsgBox\([^;]*MB_YESNO or MB_DEFBUTTON2", texto)
    assert "UninstallSilent" in texto
    assert re.search(r"=\s*IDYES\s+then.{0,80}DelTree\(PastaDados", texto, re.S)
    assert texto.count("DelTree") == 1
    # a tarefa sai junto com o programa
    assert "usUninstall" in texto and "/Delete" in texto


def test_iss_nao_sobrescreve_config_nem_chave():
    texto = _ler(ISS)
    assert re.search(r"Result\s*:=\s*PastaDados\s*\+\s*'\\config\.json'", texto)
    assert re.search(r"if\s+not\s+FileExists\(ArquivoConfig\)\s+then", texto)
    assert "secret.key" not in _secao_iss("Files")
    assert "config.json" not in _secao_iss("Files")


def test_iss_aplica_acl_so_admin_e_system():
    texto = _ler(ISS)
    assert "icacls" in texto
    assert "/inheritance:r" in texto
    # SIDs, não nomes: no Windows em português o grupo é "Administradores"
    assert "*S-1-5-18:(OI)(CI)F" in texto
    assert "*S-1-5-32-544:(OI)(CI)F" in texto
    # ACL antes de criar a chave e o banco, e a tarefa só depois do admin
    corpo = re.search(r"procedure ConfigurarDados;\s*begin(.*?)end;", texto, re.S)
    assert corpo, "falta a procedure ConfigurarDados"
    passos = [p.strip() for p in corpo.group(1).split(";") if p.strip()]
    assert passos == ["ProtegerPasta", "GravarConfig", "CriarAdmin", "RegistrarTarefa"]
    assert "AfterInstall: ConfigurarDados" in texto


def test_iss_trata_saidas_3_e_4_do_criar_admin():
    texto = _ler(ISS)
    assert "--criar-admin" in texto
    assert re.search(r"Codigo\s*=\s*3", texto)
    assert re.search(r"Codigo\s*=\s*4", texto)
    assert "senha não alterada" in texto
    assert "RaiseException" in texto


def test_iss_basico():
    texto = _ler(ISS)
    assert "{autopf}\\SegurancaIntegral" in texto
    assert "PrivilegesRequired=admin" in texto
    assert "ArchitecturesInstallIn64BitMode=x64compatible" in texto
    assert "Portuguese.isl" in texto  # BrazilianPortuguese.isl
    assert "allowed_hosts" in texto
    assert "127.0.0.1" in texto and "localhost" in texto
    assert "tarefas.ps1" in texto and "-ExecutionPolicy Bypass" in texto


# --- build ------------------------------------------------------------------

def test_build_para_no_primeiro_erro():
    texto = _ler(BUILD)
    assert "$ErrorActionPreference = 'Stop'" in texto
    # Stop não pega código de saída de programa nativo no PowerShell 5.1
    assert "$LASTEXITCODE" in texto
    for trecho in ("npm.cmd", "'ci'", "build:aluno", "build:coord", "pytest",
                   "PyInstaller", "SemTestes", "ISCC.exe"):
        assert trecho in texto, trecho


@pytest.mark.parametrize("arquivo", [TAREFAS, BUILD], ids=lambda p: p.name)
def test_scripts_powershell_sao_ascii(arquivo):
    # o PowerShell 5.1 lê UTF-8 sem BOM como ANSI e quebra acentos
    arquivo.read_bytes().decode("ascii")


def test_gitignore_cobre_saidas_do_build():
    linhas = _ler(RAIZ / ".gitignore").splitlines()
    assert "dist/" in linhas and "build/" in linhas


# --- tarefa agendada (simulação, sem registrar nada) ---------------------------

def _powershell(*args: str) -> subprocess.CompletedProcess:
    exe = shutil.which("powershell.exe") or shutil.which("powershell")
    if sys.platform != "win32" or exe is None:
        pytest.skip("precisa do Windows PowerShell")
    return subprocess.run(
        [exe, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(TAREFAS), *args],
        capture_output=True, timeout=120,
    )


def _texto(proc: subprocess.CompletedProcess) -> str:
    # o console usa a página de código OEM; só ASCII importa aqui
    return (proc.stdout + proc.stderr).decode("utf-8", errors="replace")


def test_tarefas_simulacao_registrar():
    proc = _powershell("-Exe", r"C:\Teste\SI\SegurancaIntegral.exe",
                       "-DataDir", r"C:\Teste\Dados", "-Simular")
    saida = _texto(proc)
    assert proc.returncode == 0, saida
    assert "SIMULACAO" in saida
    assert "Tarefa: SegurancaIntegral" in saida
    assert r"C:\Teste\SI\SegurancaIntegral.exe" in saida
    assert r'--data-dir "C:\Teste\Dados"' in saida
    assert r"Pasta de trabalho: C:\Teste\SI" in saida
    assert "S-1-5-18" in saida
    assert "Gatilho: AtStartup" in saida
    assert "RestartCount: 3" in saida
    assert "RestartInterval: PT1M" in saida
    assert "ExecutionTimeLimit: PT0S" in saida
    assert "Iniciar agora: nao" in saida


def test_tarefas_simulacao_remover():
    proc = _powershell("-Remover", "-Simular")
    saida = _texto(proc)
    assert proc.returncode == 0, saida
    assert "SIMULACAO" in saida
    assert "Remover tarefa: SegurancaIntegral" in saida


def test_tarefas_exige_exe_ao_registrar():
    proc = _powershell("-DataDir", r"C:\Teste\Dados", "-Simular")
    assert proc.returncode != 0


# --- LEIA-ME ---------------------------------------------------------------

def test_leia_me():
    bruto = LEIA_ME.read_bytes()
    assert bruto.startswith(b"\xef\xbb\xbf")  # BOM: o Inno mostra acentos certos
    texto = _ler(LEIA_ME)
    assert "http://127.0.0.1:3000" in texto
    assert "http://127.0.0.1:4000" in texto
    assert "UPnP" in texto
    assert "Cloudflare Access" in texto
    assert "--redefinir-senha" in texto
    assert "backups" in texto
    assert "\u2014" not in texto and "\u2013" not in texto  # sem travessões
