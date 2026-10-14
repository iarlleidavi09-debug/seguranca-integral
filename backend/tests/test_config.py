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
