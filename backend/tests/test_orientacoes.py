"""Orientação imediata ao aluno: arquivo versionado, validação e rota."""
import json
from pathlib import Path

import pytest

from app import create_student_app
from app.config import Config, load_config
from app.orientacoes import OrientacoesInvalidas, carregar

APP = Path(__file__).parent.parent / "app"


def _bloco(titulo="Titulo", passos=("Passo um.",)):
    return {"titulo": titulo, "passos": list(passos)}


def _gravar(tmp_path, dados):
    arquivo = tmp_path / "orientacoes.json"
    arquivo.write_text(json.dumps(dados), encoding="utf-8")
    return arquivo


def test_arquivo_versionado_cobre_todas_as_situacoes_do_questionario():
    definicao = json.loads((APP / "questionario_v3.json").read_text(encoding="utf-8"))
    ids = {o["id"] for g in definicao["grupos"] for o in g["opcoes"]}
    orientacoes = carregar(APP / "orientacoes.json")
    assert set(orientacoes.situacoes) == ids
    assert orientacoes.geral["passos"]


@pytest.mark.parametrize("dados", [
    [],
    {"geral": _bloco()},
    {"geral": _bloco(), "situacoes": []},
    {"geral": {"titulo": "", "passos": ["a"]}, "situacoes": {}},
    {"geral": _bloco(passos=()), "situacoes": {}},
    {"geral": _bloco(passos=("a", 3)), "situacoes": {}},
    {"geral": _bloco(), "situacoes": {"Id Ruim": _bloco()}},
    {"geral": _bloco(), "situacoes": {"ok": {"titulo": "x"}}},
])
def test_formato_invalido_e_recusado(tmp_path, dados):
    with pytest.raises(OrientacoesInvalidas):
        carregar(_gravar(tmp_path, dados))


def test_json_quebrado_e_recusado(tmp_path):
    arquivo = tmp_path / "orientacoes.json"
    arquivo.write_text("{", encoding="utf-8")
    with pytest.raises(OrientacoesInvalidas):
        carregar(arquivo)


@pytest.fixture
def cliente(config):
    return create_student_app(config, limites={"consultas": (1000, 600)}).test_client()


def test_devolve_so_os_blocos_pedidos(cliente):
    r = cliente.get("/api/orientacoes?situacoes=cyber,golpe")
    assert r.status_code == 200
    dados = r.get_json()
    assert set(dados) == {"geral", "situacoes", "contatos"}
    assert [s["id"] for s in dados["situacoes"]] == ["cyber", "golpe"]
    assert all(s["passos"] and s["titulo"] for s in dados["situacoes"])
    assert dados["geral"]["passos"]
    assert dados["contatos"] == []
    assert r.headers["Cache-Control"] == "no-store"


def test_sem_situacoes_devolve_so_o_geral(cliente):
    for url in ("/api/orientacoes", "/api/orientacoes?situacoes="):
        dados = cliente.get(url).get_json()
        assert dados["situacoes"] == []
        assert dados["geral"]["passos"]


def test_situacao_desconhecida_e_repeticao_sao_ignoradas(cliente):
    dados = cliente.get("/api/orientacoes?situacoes=cyber,nao-existe,cyber,%3Cb%3E").get_json()
    assert [s["id"] for s in dados["situacoes"]] == ["cyber"]


def test_lista_grande_demais_e_recusada(cliente):
    muitas = ",".join(f"s{i}" for i in range(41))
    assert cliente.get(f"/api/orientacoes?situacoes={muitas}").status_code == 400


def test_resposta_nao_traz_dados_da_coordenacao(cliente):
    texto = cliente.get("/api/orientacoes?situacoes=ameaca").get_data(as_text=True).lower()
    for proibido in ("prioridade", "peso", "tipo_legado", "score", "faixa"):
        assert proibido not in texto


def test_contatos_de_apoio_vem_da_configuracao(tmp_path):
    config = Config(data_dir=tmp_path, secret_key="k", contatos_apoio=(
        {"nome": "Psicologia da escola", "contato": "Sala 12"},))
    c = create_student_app(config, limites={"consultas": (1000, 600)}).test_client()
    assert c.get("/api/orientacoes").get_json()["contatos"] == [
        {"nome": "Psicologia da escola", "contato": "Sala 12"}]


def test_config_json_valida_contatos_de_apoio(tmp_path):
    (tmp_path / "config.json").write_text(json.dumps(
        {"contatos_apoio": [{"nome": " Orientação ", "contato": "ramal 4"}]}), encoding="utf-8")
    assert load_config(tmp_path).contatos_apoio == ({"nome": "Orientação", "contato": "ramal 4"},)
    for ruim in ("x", [{"nome": "a"}], [{"nome": "", "contato": "b"}], [1], [{"nome": "a", "contato": "b", "x": 1}]):
        (tmp_path / "config.json").write_text(json.dumps({"contatos_apoio": ruim}), encoding="utf-8")
        with pytest.raises(ValueError):
            load_config(tmp_path)


def test_copia_em_data_dir_substitui_o_arquivo_versionado(tmp_path):
    (tmp_path / "orientacoes.json").write_text(json.dumps(
        {"geral": _bloco("Da escola"), "situacoes": {}}), encoding="utf-8")
    c = create_student_app(Config(data_dir=tmp_path, secret_key="k"),
                           limites={"consultas": (1000, 600)}).test_client()
    assert c.get("/api/orientacoes").get_json()["geral"]["titulo"] == "Da escola"


def test_limite_de_consultas(config):
    c = create_student_app(config, limites={"consultas": (1, 600)}).test_client()
    assert c.get("/api/orientacoes").status_code == 200
    assert c.get("/api/orientacoes").status_code == 429
