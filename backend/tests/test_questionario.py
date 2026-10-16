"""Testes da definição do questionário v2 B e do validador."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.config import load_config
from app.questionario import Questionario, QuestionarioInvalido, carregar

RAIZ = Path(__file__).resolve().parents[2]
REAL = RAIZ / "backend" / "app" / "questionario.json"
SITUACOES_TS = RAIZ / "frontend" / "src" / "aluno" / "situacoes.ts"
SPEC = RAIZ / "installer" / "seguranca.spec"

ORDEM = ["cyberbullying", "ameaca", "vazamento", "perfil_falso", "golpe",
         "aliciamento", "outro"]


def _def_valida() -> dict:
    return {
        "dimensoes": {"quando": "Quando", "frequencia": "Frequência",
                      "alcance": "Alcance", "consequencias": "Consequências",
                      "risco": "Risco"},
        "situacoes": [{"id": "s", "tipo": "outro", "nome": "S", "descricao": "d",
                       "opcoes": [{"id": "o1", "texto": "t", "perguntas": ["q1"]}]}],
        "perguntas": [{"id": "q1", "dimensao": "quando", "texto": "?",
                       "tipo": "unica",
                       "respostas": [{"id": "q1.a", "texto": "a"},
                                     {"id": "q1.b", "texto": "b"}]}],
        "pesos": {}, "alertas": [], "faixas": {"alta": 6, "media": 3},
    }


def _gravar(tmp_path, dados) -> Path:
    arq = tmp_path / "q.json"
    arq.write_text(dados if isinstance(dados, str) else json.dumps(dados),
                   encoding="utf-8")
    return arq


def test_definicao_minima_valida(tmp_path):
    assert isinstance(carregar(_gravar(tmp_path, _def_valida())), Questionario)


@pytest.fixture(scope="module")
def real() -> Questionario:
    return carregar(REAL)


def test_real_carrega_e_vazio_de_pesos(real):
    assert real.dados["pesos"] == {}
    assert real.dados["alertas"] == []
    assert real.dados["faixas"] == {"alta": 6, "media": 3}


def test_para_aluno_so_tres_chaves(real):
    saida = real.para_aluno()
    assert set(saida) == {"situacoes", "dimensoes", "perguntas"}
    texto = json.dumps(saida, ensure_ascii=False)
    for proibida in ("pesos", "alertas", "faixas"):
        assert proibida not in texto


def test_sete_situacoes_na_ordem(real):
    assert [s["tipo"] for s in real.dados["situacoes"]] == ORDEM


def _opcoes_do_ts() -> dict[str, list[str]]:
    texto = SITUACOES_TS.read_text(encoding="utf-8")
    saida = {}
    for m in re.finditer(r"id: '(\w+)'.*?opcoes: \[(.*?)\] \}", texto):
        saida[m.group(1)] = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(2))
    return saida


def test_textos_iguais_aos_do_frontend(real):
    ts = _opcoes_do_ts()
    for s in real.dados["situacoes"][:5]:
        assert len(s["opcoes"]) == 5
        assert [o["texto"] for o in s["opcoes"]] == ts[s["id"]], s["id"]


def test_nomes_e_descricoes_iguais_ao_frontend(real):
    texto = SITUACOES_TS.read_text(encoding="utf-8")
    for s in real.dados["situacoes"]:
        assert f"nome: '{s['nome']}'" in texto
        assert f"descricao: '{s['descricao']}'" in texto


def test_ids_de_opcao_estaveis(real):
    ids = [[o["id"] for o in s["opcoes"]] for s in real.dados["situacoes"]]
    assert ids == [[f"{p}{i}" for i in range(1, 6)] for p in "cavpg"] + [["l1"], ["o1"]]


def test_toda_pergunta_alcancavel(real):
    abertas = {p for s in real.dados["situacoes"] for o in s["opcoes"]
               for p in o["perguntas"]}
    for p in real.dados["perguntas"]:
        assert p["id"] in abertas or p.get("mostrar_se"), p["id"]


def test_ids_de_resposta_unicos(real):
    ids = [r["id"] for p in real.dados["perguntas"] for r in p["respostas"]]
    assert len(ids) == len(set(ids))


def test_cinco_dimensoes(real):
    assert set(real.dados["dimensoes"]) == {
        "quando", "frequencia", "alcance", "consequencias", "risco"}


def test_sem_travessao_longo(real):
    texto = json.dumps(real.dados, ensure_ascii=False)
    assert "\u2014" not in texto and "\u2013" not in texto


def test_spec_inclui_o_json():
    assert "questionario.json" in SPEC.read_text(encoding="utf-8-sig")


def test_config_usa_copia_no_data_dir(tmp_path):
    (tmp_path / "questionario.json").write_text("{}", encoding="utf-8")
    assert load_config(tmp_path).questionario_path == tmp_path / "questionario.json"


def test_config_cai_no_embutido(tmp_path):
    assert load_config(tmp_path).questionario_path == REAL


# --- definições inválidas ------------------------------------------------------

def _dup(d):
    d["perguntas"][0]["respostas"][1]["id"] = "q1.a"


def _opcao_inexistente(d):
    d["situacoes"][0]["opcoes"][0]["perguntas"] = ["fantasma"]


def _mostrar_se_ruim(d):
    d["perguntas"][0]["mostrar_se"] = ["nao.existe"]


def _peso_ruim(d):
    d["pesos"] = {"nao.existe": 1}


def _alerta_ruim(d):
    d["alertas"] = [{"todas": ["q1.a", "nao.existe"], "motivo": "m"}]


def _tipo_sit(d):
    d["situacoes"][0]["tipo"] = "bobagem"


def _tipo_perg(d):
    d["perguntas"][0]["tipo"] = "dupla"


def _sem_respostas(d):
    d["perguntas"][0]["respostas"] = []


def _inalcancavel(d):
    d["perguntas"].append({"id": "q2", "dimensao": "quando", "texto": "?",
                           "tipo": "unica",
                           "respostas": [{"id": "q2.a", "texto": "a"}]})


def _travessao(d):
    d["perguntas"][0]["texto"] = "a \u2014 b"


CASOS = [
    (_dup, "q1.a"), (_opcao_inexistente, "fantasma"),
    (_mostrar_se_ruim, "nao.existe"), (_peso_ruim, "nao.existe"),
    (_alerta_ruim, "nao.existe"), (_tipo_sit, "bobagem"),
    (_tipo_perg, "dupla"), (_sem_respostas, "q1"), (_inalcancavel, "q2"),
    (_travessao, "q1"),
]


@pytest.mark.parametrize("mutar,citado", CASOS, ids=[c[0].__name__ for c in CASOS])
def test_definicao_invalida(tmp_path, mutar, citado):
    d = _def_valida()
    mutar(d)
    with pytest.raises(QuestionarioInvalido) as erro:
        carregar(_gravar(tmp_path, d))
    assert citado in str(erro.value)


def test_json_invalido(tmp_path):
    with pytest.raises(QuestionarioInvalido, match="JSON"):
        carregar(_gravar(tmp_path, "{ nao e json"))


def test_arquivo_ausente(tmp_path):
    with pytest.raises(QuestionarioInvalido, match="ausente"):
        carregar(tmp_path / "nada.json")
