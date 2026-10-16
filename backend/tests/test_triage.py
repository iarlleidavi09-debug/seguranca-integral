"""Testes da triagem por regras."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.triage import Triagem, carregar_termos, classificar

TERMOS_JSON = Path(__file__).resolve().parent.parent / "app" / "risk_terms.json"


@pytest.fixture(scope="module")
def termos():
    return carregar_termos(TERMOS_JSON)


def test_aliciamento_sozinho_e_media(termos):
    r = classificar("aliciamento", "", False, termos)
    assert (r.pontos, r.prioridade) == (4, "media")


def test_aliciamento_em_andamento_e_alta(termos):
    r = classificar("aliciamento", "", True, termos)
    assert (r.pontos, r.prioridade) == (6, "alta")


def test_cyberbullying_sozinho_e_baixa(termos):
    r = classificar("cyberbullying", "", False, termos)
    assert (r.pontos, r.prioridade) == (2, "baixa")


def test_cyberbullying_em_andamento_e_media(termos):
    r = classificar("cyberbullying", "", True, termos)
    assert (r.pontos, r.prioridade) == (4, "media")


def test_ameaca_com_termo_violencia_e_alta(termos):
    r = classificar("ameaca", "ele disse que tem uma arma", False, termos)
    assert (r.pontos, r.prioridade) == (7, "alta")


def test_acentos_e_maiusculas_acionam_termo(termos):
    for a, b in [("Vou te MATAR", "vou te matar"), ("AMEAÇA de te pegar", "ameaca de te pegar")]:
        assert classificar("ameaca", a, False, termos) == classificar("ameaca", b, False, termos)
    assert classificar("ameaca", "Vou te MATAR", False, termos).pontos == 7
    r = classificar("outro", "ELE TEM UMA FACA", False, termos)
    assert r.pontos == 4


def test_emoji_nao_quebra(termos):
    r = classificar("ameaca", "😡😡 vou te matar 🔪!!!", False, termos)
    assert r.pontos == 7


def test_motivos_explicam(termos):
    r = classificar("ameaca", "tem uma arma", True, termos)
    assert isinstance(r, Triagem)
    assert "tipo: ameaca" in r.motivos
    assert "ocorrendo agora" in r.motivos
    assert "termos de risco: violencia" in r.motivos


def test_categoria_conta_uma_vez(termos):
    r = classificar("outro", "uma faca e uma arma", False, termos)
    assert r.pontos == 1 + 3


def test_relato_vazio_usa_so_tipo(termos):
    r = classificar("golpe", "", False, termos)
    assert r.pontos == 3
    assert r.motivos == ("tipo: golpe",)


def test_palavra_inteira_nao_casa_parte(termos):
    # "armadura" contém "arma", mas não é a palavra inteira
    assert classificar("outro", "armadura medieval", False, termos).pontos == 1


def test_carregar_termos_le_json(tmp_path):
    p = tmp_path / "t.json"
    p.write_text('{"x": ["Ameaça"]}', encoding="utf-8")
    assert carregar_termos(p) == {"x": ["Ameaça"]}


def test_acento_no_relato_casa_termo_sem_acento(termos):
    com = classificar("outro", "suicídio", False, termos)
    sem = classificar("outro", "suicidio", False, termos)
    assert com == sem
    assert com.pontos == 1 + 3
    assert "termos de risco: automutilacao" in com.motivos
    r = classificar("outro", "FOTO ÍNTIMA", False, termos)
    assert "termos de risco: nudes" in r.motivos


def test_termo_composto_vou_te_bater(termos):
    r = classificar("outro", "ele disse vou te bater amanha", False, termos)
    assert "termos de risco: violencia" in r.motivos


def test_pesos_vazamento_perfil_falso_e_tipo_desconhecido(termos):
    assert classificar("vazamento", "", False, termos).pontos == 3
    assert classificar("perfil_falso", "", False, termos).pontos == 2
    assert classificar("inexistente", "", False, termos).pontos == 1


@pytest.mark.parametrize("relato", [
    "socorro", "isso e urgente", "por favor me ajuda", "preciso de ajuda agora",
    "AJUDA URGENTE",
])
def test_pedido_de_ajuda_conta_como_urgencia(termos, relato):
    r = classificar("outro", relato, False, termos)
    assert "termos de risco: urgencia" in r.motivos
    assert r.pontos == 1 + 3  # tipo "outro" + uma categoria


def test_deposito_e_deposita_acionam_extorsao(termos):
    for relato in ("ele mandou eu fazer um deposito", "deposita agora", "DEPÓSITO"):
        r = classificar("outro", relato, False, termos)
        assert "termos de risco: extorsao" in r.motivos, relato


A_VIOL = "alerta: ameaca com violencia em andamento"
A_AUTO = "alerta: risco de automutilacao em andamento"
A_NUDE = "alerta: conteudo intimo com extorsao"


def test_ameaca_violencia_em_andamento_e_critica(termos):
    r = classificar("ameaca", "ele disse vou te bater", True, termos)
    assert r.prioridade == "critica"
    assert A_VIOL in r.motivos
    assert r.pontos == 4 + 2 + 3  # alerta não altera a soma


def test_ameaca_violencia_sem_andamento_nao_e_critica(termos):
    r = classificar("ameaca", "ele disse vou te bater", False, termos)
    assert r.prioridade != "critica"
    assert A_VIOL not in r.motivos


def test_aliciamento_faca_em_andamento_critica_sem_andamento_alta(termos):
    assert classificar("aliciamento", "ele tem uma faca", True, termos).prioridade == "critica"
    r = classificar("aliciamento", "ele tem uma faca", False, termos)
    assert r.prioridade == "alta"


def test_tipo_outro_com_violencia_em_andamento_nao_dispara_regra_1(termos):
    r = classificar("outro", "ele tem uma faca", True, termos)
    assert r.prioridade != "critica"


def test_automutilacao_em_andamento_critica_em_qualquer_tipo(termos):
    r = classificar("cyberbullying", "ela falou em suicidio", True, termos)
    assert r.prioridade == "critica"
    assert A_AUTO in r.motivos
    sem = classificar("cyberbullying", "ela falou em suicidio", False, termos)
    assert sem.prioridade in ("alta", "media")


def test_nudes_com_extorsao_critica_sem_andamento(termos):
    r = classificar("outro", "tem meus nudes e disse vou postar", False, termos)
    assert r.prioridade == "critica"
    assert A_NUDE in r.motivos


def test_nudes_sozinho_nao_e_critica(termos):
    assert classificar("outro", "tem meus nudes", False, termos).prioridade != "critica"


def test_outro_sem_termos_e_baixa(termos):
    assert classificar("outro", "", False, termos).prioridade == "baixa"


# --- parâmetros novos (questionário v2 B): extras, alertas e limiares ---

def test_parametros_novos_nos_padroes_nao_mudam_nada(termos):
    base = classificar("aliciamento", "ele ameaca me matar", True, termos)
    igual = classificar("aliciamento", "ele ameaca me matar", True, termos,
                        extra_pontos=0, extra_motivos=(), alertas=(),
                        limiares=(6, 3))
    assert igual == base


def test_extra_pontos_somam_e_sobem_a_faixa(termos):
    r = classificar("outro", "", False, termos)
    assert (r.pontos, r.prioridade) == (1, "baixa")
    r = classificar("outro", "", False, termos, extra_pontos=3)
    assert (r.pontos, r.prioridade) == (4, "media")
    r = classificar("outro", "", False, termos, extra_pontos=5)
    assert (r.pontos, r.prioridade) == (6, "alta")


def test_extra_pontos_negativos_descem_a_faixa(termos):
    r = classificar("aliciamento", "", False, termos, extra_pontos=-2)
    assert (r.pontos, r.prioridade) == (2, "baixa")


def test_extra_motivos_entram_em_motivos(termos):
    r = classificar("outro", "", False, termos, extra_pontos=1,
                    extra_motivos=("resposta: x (+1)",))
    assert "resposta: x (+1)" in r.motivos


def test_alerta_eleva_a_critica_e_entra_nos_motivos(termos):
    r = classificar("outro", "", False, termos, alertas=("x",))
    assert r.prioridade == "critica"
    assert "x" in r.motivos
    assert r.pontos == 1


def test_limiares_mudam_as_faixas(termos):
    assert classificar("aliciamento", "", False, termos).prioridade == "media"
    assert classificar("aliciamento", "", False, termos,
                       limiares=(4, 2)).prioridade == "alta"
    assert classificar("aliciamento", "", False, termos,
                       limiares=(10, 5)).prioridade == "baixa"
