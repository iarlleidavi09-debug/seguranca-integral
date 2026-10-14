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
