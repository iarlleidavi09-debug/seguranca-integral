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


# premissa: cada situação ocupa uma linha de situacoes.ts (re.S só para o miolo)
def _opcoes_do_ts() -> dict[str, list[str]]:
    texto = SITUACOES_TS.read_text(encoding="utf-8")
    saida = {}
    for m in re.finditer(r"id: '(\w+)'.*?opcoes: \[(.*?)\] \}", texto, re.S):
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


def test_aliciamento_abre_q1_e_q6(real):
    l1 = real.dados["situacoes"][5]["opcoes"][0]
    assert l1["perguntas"][:2] == ["q1", "q6"]


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


def _mostrar_se_nao_texto(d):
    d["perguntas"][0]["mostrar_se"] = [["lista"]]


def _opcao_pergunta_nao_texto(d):
    d["situacoes"][0]["opcoes"][0]["perguntas"] = [["x"]]


def _id_nao_texto(d):
    d["perguntas"][0]["id"] = 7


def _autorreferencia(d):
    d["perguntas"][0]["mostrar_se"] = ["q1.a"]


def _peso_nao_inteiro(d):
    d["pesos"] = {"q1.a": 1.5}


def _faixas_ruins(d):
    d["faixas"] = {"alta": "6", "media": 3}


def _travessao(d):
    d["perguntas"][0]["texto"] = "a \u2014 b"


CASOS = [
    (_dup, "q1.a"), (_opcao_inexistente, "fantasma"),
    (_mostrar_se_ruim, "nao.existe"), (_peso_ruim, "nao.existe"),
    (_alerta_ruim, "nao.existe"), (_tipo_sit, "bobagem"),
    (_tipo_perg, "dupla"), (_sem_respostas, "q1"), (_inalcancavel, "q2"),
    (_travessao, "q1"),
    (_mostrar_se_nao_texto, "q1"), (_opcao_pergunta_nao_texto, "o1"),
    (_id_nao_texto, "id"), (_autorreferencia, "q1"),
    (_peso_nao_inteiro, "q1.a"), (_faixas_ruins, "faixas"),
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


# --- validação das respostas do aluno -----------------------------------------

from app.questionario import RespostasInvalidas  # noqa: E402


@pytest.fixture(scope="module")
def real():
    return carregar(REAL)


def _ok():
    return {"situacao": "ameaca", "marcadas": ["a1"],
            "respostas": {"q1": ["q1.agora"], "q3": ["q3.conhecida"]}}


def test_respostas_validas_devolvem_dicionario(real):
    assert real.validar_respostas(json.dumps(_ok()), "ameaca") == _ok()


@pytest.mark.parametrize("bruto", [None, "", "   "])
def test_respostas_vazias_devolvem_none(real, bruto):
    assert real.validar_respostas(bruto, "ameaca") is None


def _mod(**campos):
    d = _ok()
    d.update(campos)
    return json.dumps(d)


@pytest.mark.parametrize("bruto,tipo", [
    ("{nao e json", "ameaca"),
    ("[1, 2]", "ameaca"),
    ('"texto"', "ameaca"),
    (_mod(situacao="nao_existe"), "ameaca"),
    (_mod(), "golpe"),  # tipo do formulário diferente do da situação
    (_mod(marcadas=["c1"]), "ameaca"),  # opção de outra situação
    (_mod(marcadas=["zzz"]), "ameaca"),
    (_mod(respostas={"zzz": ["q1.agora"]}), "ameaca"),
    (_mod(respostas={"q1": ["q3.conhecida"]}), "ameaca"),  # resposta de outra pergunta
    (_mod(respostas={"q1": ["q1.agora", "q1.parou"]}), "ameaca"),  # unica com dois
    (_mod(marcadas=[1]), "ameaca"),
    (_mod(respostas={"q1": [5]}), "ameaca"),
    (_mod(respostas={"q1": "q1.agora"}), "ameaca"),
    (_mod(marcadas=["a1", "a1"]), "ameaca"),  # duplicado
    (_mod(respostas={"q3": ["q3.grupo", "q3.grupo"]}), "ameaca"),
    (_mod(marcadas="a1"), "ameaca"),
    (_mod(respostas=[]), "ameaca"),
    (json.dumps({"marcadas": [], "respostas": {}}), "ameaca"),  # sem situação
    ("x" * 8193, "ameaca"),
])
def test_respostas_invalidas_levantam(real, bruto, tipo):
    with pytest.raises(RespostasInvalidas):
        real.validar_respostas(bruto, tipo)


def _bruto_com_ids(n):
    return json.dumps({"situacao": "ameaca", "marcadas": [f"m{i}" for i in range(n)], "respostas": {}})


def test_respostas_mais_de_150_ids_levantam(real):
    with pytest.raises(RespostasInvalidas, match="ids demais"):
        real.validar_respostas(_bruto_com_ids(151), "ameaca")


def test_respostas_150_ids_passam_do_limite_de_quantidade(real):
    # 150 ids inexistentes falham por outro motivo, nunca por quantidade
    with pytest.raises(RespostasInvalidas) as exc:
        real.validar_respostas(_bruto_com_ids(150), "ameaca")
    assert "ids demais" not in str(exc.value)


def test_respostas_texto_maior_que_8192_bytes_levanta(real):
    # 4500 caracteres com 2 bytes cada passam de 8192 bytes
    bruto = json.dumps({"situacao": "ameaca", "marcadas": [], "respostas": {}, "x": "é" * 4500},
                       ensure_ascii=False)
    assert len(bruto) < 8192 < len(bruto.encode("utf-8"))
    with pytest.raises(RespostasInvalidas):
        real.validar_respostas(bruto, "ameaca")


def test_respostas_normaliza_e_ignora_chaves_extras(real):
    bruto = json.dumps({"situacao": "ameaca", "extra": 1, "marcadas": [],
                        "respostas": {"q3": []}})
    assert real.validar_respostas(bruto, "ameaca") == {
        "situacao": "ameaca", "marcadas": [], "respostas": {"q3": []}}


def test_respostas_aninhamento_profundo_levanta(real):
    bruto = "[" * 3000 + "]" * 3000
    assert len(bruto) < 8192
    with pytest.raises(RespostasInvalidas):
        real.validar_respostas(bruto, "ameaca")


@pytest.mark.parametrize("situacao", [5, None, ["ameaca"]])
def test_respostas_situacao_nao_texto_levanta(real, situacao):
    with pytest.raises(RespostasInvalidas):
        real.validar_respostas(_mod(situacao=situacao), "ameaca")


# --- pontuar e limiares (Task 3) ---

def _com_regras(pesos, alertas, faixas=None) -> Questionario:
    d = _def_valida()
    d["perguntas"][0]["respostas"].append({"id": "q1.c", "texto": "c"})
    d["pesos"], d["alertas"] = pesos, alertas
    if faixas is not None:
        d["faixas"] = faixas
    return Questionario(dados=d)


def _resp(*ids):
    return {"situacao": "s", "marcadas": ["o1"], "respostas": {"q1": list(ids)}}


def test_pontuar_peso_positivo_com_motivo():
    q = _com_regras({"q1.a": 3}, [])
    assert q.pontuar(_resp("q1.a")) == (3, ["resposta: a (+3)"], [])


def test_pontuar_peso_negativo_aparece_com_sinal():
    q = _com_regras({"q1.a": -2}, [])
    assert q.pontuar(_resp("q1.a")) == (-2, ["resposta: a (-2)"], [])


def test_pontuar_soma_na_ordem_e_ignora_peso_zero_e_nao_marcadas():
    q = _com_regras({"q1.a": 3, "q1.b": 0, "q1.c": 1}, [])
    pontos, motivos, _ = q.pontuar(_resp("q1.c", "q1.a", "q1.b"))
    assert pontos == 4
    assert motivos == ["resposta: c (+1)", "resposta: a (+3)"]


def test_pontuar_alerta_dispara_com_todas_presentes():
    q = _com_regras({}, [{"todas": ["q1.a", "q1.c"], "motivo": "alerta: junto"}])
    assert q.pontuar(_resp("q1.a", "q1.c")) == (0, [], ["alerta: junto"])


def test_pontuar_alerta_com_resposta_faltando_nao_dispara():
    q = _com_regras({}, [{"todas": ["q1.a", "q1.c"], "motivo": "alerta: junto"}])
    assert q.pontuar(_resp("q1.a")) == (0, [], [])


@pytest.mark.parametrize("vazio", [None, {}, {"respostas": {}}])
def test_pontuar_sem_respostas_devolve_zero(vazio):
    q = _com_regras({"q1.a": 3}, [{"todas": ["q1.a"], "motivo": "m"}])
    assert q.pontuar(vazio) == (0, [], [])


def test_pontuar_definicao_real_nao_pontua_nada(real):
    resp = {"situacao": "ameaca", "marcadas": ["a1"],
            "respostas": {"q1": ["q1.agora"], "q3": ["q3.conhecida"]}}
    assert real.pontuar(resp) == (0, [], [])


def test_limiares_vem_das_faixas_e_padrao_6_3(real):
    assert _com_regras({}, [], {"alta": 8, "media": 4}).limiares() == (8, 4)
    assert real.limiares() == (6, 3)
    assert Questionario(dados={}).limiares() == (6, 3)


# --- descrever: texto legível para a coordenação -----------------------------
def test_descrever_sem_respostas_e_nulo(real):
    assert real.descrever(None) is None
    assert real.descrever({}) is None


def test_descrever_agrupa_por_dimensao_na_ordem_fixa(real):
    r = {"situacao": "ameaca", "marcadas": ["a1"],
         "respostas": {"q6": ["q6.nao"], "q3": ["q3.conhecida"], "q1": ["q1.agora"]}}
    d = real.descrever(r)
    assert d["situacao"] == {"id": "ameaca", "nome": real.dados["situacoes"][1]["nome"]}
    opcao = next(o for o in real.dados["situacoes"][1]["opcoes"] if o["id"] == "a1")
    assert d["marcadas"] == [opcao["texto"]]
    assert [x["id"] for x in d["dimensoes"]] == ["quando", "alcance", "risco"]
    quando = d["dimensoes"][0]
    assert quando["rotulo"] == real.dados["dimensoes"]["quando"]
    perg = next(p for p in real.dados["perguntas"] if p["id"] == "q1")
    resp = next(x for x in perg["respostas"] if x["id"] == "q1.agora")
    assert quando["itens"] == [{"pergunta": perg["texto"], "respostas": [resp["texto"]]}]
    assert "q1.agora" not in json.dumps(d)


def test_descrever_omite_dimensao_vazia_e_resposta_vazia(real):
    r = {"situacao": "ameaca", "marcadas": [], "respostas": {"q1": []}}
    d = real.descrever(r)
    assert d["dimensoes"] == []
    assert d["marcadas"] == []


def test_descrever_itens_na_ordem_da_definicao(real):
    r = {"situacao": "ameaca", "marcadas": [],
         "respostas": {"c1.prints": ["c1.prints.sim"], "q3": ["q3.grupo"]}}
    alcance = real.descrever(r)["dimensoes"][0]
    ordem = [p["texto"] for p in real.dados["perguntas"] if p["id"] in ("q3", "c1.prints")]
    assert [i["pergunta"] for i in alcance["itens"]] == ordem


def test_descrever_id_desconhecido_vira_o_proprio_id(real):
    r = {"situacao": "sumiu", "marcadas": ["x9"],
         "respostas": {"qfantasma": ["qfantasma.a"], "q1": ["q1.antigo"]}}
    d = real.descrever(r)
    assert d["situacao"] == {"id": "sumiu", "nome": "sumiu"}
    assert d["marcadas"] == ["x9"]
    ids = {i["pergunta"]: i["respostas"] for dim in d["dimensoes"] for i in dim["itens"]}
    assert ids["qfantasma"] == ["qfantasma.a"]
    assert ["q1.antigo"] in ids.values()


def test_descrever_nunca_lanca_com_formato_estranho(real):
    for ruim in ({"situacao": 1, "marcadas": None, "respostas": []},
                 {"respostas": {"q1": "q1.agora"}}, "texto", []):
        real.descrever(ruim)
