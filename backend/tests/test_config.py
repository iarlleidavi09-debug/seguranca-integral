"""Testes do caminho dos termos de risco."""
from __future__ import annotations

from pathlib import Path

from app.config import load_config


def test_risk_terms_usa_copia_no_data_dir(tmp_path):
    (tmp_path / "risk_terms.json").write_text("{}", encoding="utf-8")
    cfg = load_config(tmp_path)
    assert cfg.risk_terms_path == tmp_path / "risk_terms.json"


def test_risk_terms_cai_no_arquivo_embutido(tmp_path):
    cfg = load_config(tmp_path)
    esperado = Path(__file__).resolve().parent.parent / "app" / "risk_terms.json"
    assert cfg.risk_terms_path == esperado


# --- config.json: portas e hosts -----------------------------------------

import json

import pytest

from app import server


def _escrever(pasta, dados, bom=False):
    texto = json.dumps(dados)
    (pasta / "config.json").write_text(texto, encoding="utf-8-sig" if bom else "utf-8")


def test_portas_padrao_sem_config_json(tmp_path):
    cfg = load_config(tmp_path)
    assert (cfg.student_port, cfg.coord_port) == (3000, 4000)
    assert cfg.allowed_hosts == ()


def test_config_json_define_portas_e_hosts(tmp_path):
    _escrever(tmp_path, {"student_port": 13000, "coord_port": 14000,
                         "allowed_hosts": ["escola.exemplo.com.br", "127.0.0.1"]})
    cfg = load_config(tmp_path)
    assert (cfg.student_port, cfg.coord_port) == (13000, 14000)
    assert cfg.allowed_hosts == ("escola.exemplo.com.br", "127.0.0.1")


def test_config_json_com_bom_e_aceito(tmp_path):
    # o PowerShell 5.1 grava UTF-8 com BOM
    _escrever(tmp_path, {"coord_port": 14001}, bom=True)
    assert load_config(tmp_path).coord_port == 14001


@pytest.mark.parametrize("dados", [
    {"student_port": 80},
    {"student_port": 70000},
    {"coord_port": "4000"},
    {"coord_port": True},
    {"coord_port": 4000.0},
    {"student_port": 5000, "coord_port": 5000},
    {"student_port": 4000},  # colide com a porta padrão da coordenação
    {"allowed_hosts": "escola.exemplo.com.br"},
    {"allowed_hosts": ["ok.com", 3]},
    ["nao", "e", "objeto"],
])
def test_config_json_invalido_levanta_valueerror(tmp_path, dados):
    _escrever(tmp_path, dados)
    with pytest.raises(ValueError):
        load_config(tmp_path)


def test_config_json_malformado_levanta_valueerror(tmp_path):
    (tmp_path / "config.json").write_text("{nao e json", encoding="utf-8")
    with pytest.raises(ValueError):
        load_config(tmp_path)


def test_main_sai_4_com_porta_invalida(tmp_path, capsys):
    _escrever(tmp_path, {"student_port": 22})
    assert server.main(["--data-dir", str(tmp_path), "--criar-admin"]) == 4
    erro = capsys.readouterr().err
    assert "student_port" in erro
    assert "Traceback" not in erro


# --- config.json: limites de taxa (somente para ensaio) ------------------

def test_limites_padrao_vazios(tmp_path):
    assert load_config(tmp_path).limites == {}


def test_config_json_define_limites(tmp_path):
    _escrever(tmp_path, {"limites": {"denuncias": [500, 60], "login": [100, 30]}})
    cfg = load_config(tmp_path)
    assert cfg.limites == {"denuncias": (500, 60), "login": (100, 30)}


@pytest.mark.parametrize("limites", [
    [5, 600],                          # não é objeto
    {"desconhecido": [5, 600]},        # nome fora da lista
    {"denuncias": 5},                  # não é par
    {"denuncias": [5]},
    {"denuncias": [5, 600, 1]},
    {"denuncias": [0, 600]},           # máximo precisa ser positivo
    {"denuncias": [5, 0]},
    {"denuncias": [-1, 600]},
    {"denuncias": [5.0, 600]},
    {"denuncias": ["5", 600]},
    {"denuncias": [True, 600]},
    {"denuncias": [10 ** 9, 600]},     # teto contra erro de digitação
    {"consultas": [5, 10 ** 9]},
])
def test_limites_invalidos_levantam_valueerror(tmp_path, limites):
    _escrever(tmp_path, {"limites": limites})
    with pytest.raises(ValueError, match="limites"):
        load_config(tmp_path)


def test_apps_usam_limites_do_config(tmp_path):
    from app import create_coord_app, create_student_app

    _escrever(tmp_path, {"limites": {"denuncias": [2, 60], "login": [1, 60]}})
    cfg = load_config(tmp_path)
    aluno = create_student_app(cfg).extensions["limitadores"]
    assert (aluno["denuncias"].max_eventos, aluno["denuncias"].janela_s) == (2, 60)
    assert aluno["consultas"].max_eventos == 600  # padrão mantido
    assert "login" not in aluno
    coord = create_coord_app(cfg).extensions["limitadores"]
    assert (coord["login"].max_eventos, coord["login"].janela_s) == (1, 60)
    assert "denuncias" not in coord


def test_null_desliga_um_limite(tmp_path):
    from app import create_coord_app, create_student_app

    _escrever(tmp_path, {"limites": {"consultas": None, "login": None}})
    cfg = load_config(tmp_path)
    assert cfg.limites == {"consultas": None, "login": None}
    assert create_student_app(cfg).extensions["limitadores"].get("consultas") is None
    assert create_coord_app(cfg).extensions["limitadores"].get("login") is None


@pytest.mark.parametrize("limites", [
    {"denuncias": [None, 600]}, {"denuncias": [5, None]}, {"denuncias": "null"},
])
def test_null_so_vale_no_lugar_do_par(tmp_path, limites):
    _escrever(tmp_path, {"limites": limites})
    with pytest.raises(ValueError, match="limites"):
        load_config(tmp_path)


def test_parametro_limites_tem_prioridade_sobre_o_config(tmp_path):
    from app import create_student_app

    _escrever(tmp_path, {"limites": {"denuncias": [2, 60]}})
    app = create_student_app(load_config(tmp_path), limites={"denuncias": (9, 30)})
    assert app.extensions["limitadores"]["denuncias"].max_eventos == 9
