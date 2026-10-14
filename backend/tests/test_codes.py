import re

from app.codes import ALFABETO, gerar_codigo, hash_codigo, normalizar_codigo


def test_codigo_tem_formato_e_alfabeto():
    for _ in range(200):
        codigo = gerar_codigo()
        assert re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", codigo)
        assert all(c in ALFABETO for c in codigo.replace("-", ""))


def test_codigos_distintos():
    assert len({gerar_codigo() for _ in range(1000)}) == 1000


def test_normaliza_minuscula_espacos_sem_hifen():
    assert normalizar_codigo(" k7m2 9qxd ") == "K7M2-9QXD"
    assert normalizar_codigo("k7m29qxd") == "K7M2-9QXD"
    assert normalizar_codigo("k7m2-9qxd") == "K7M2-9QXD"


def test_normaliza_rejeita_invalido():
    for texto in ["K7M0-9QXD", "K7MO-9QXD", "K7M1-9QXD", "K7MI-9QXD",
                  "K7M2-9QX", "K7M2-9QXDA", "", "   ", "----"]:
        assert normalizar_codigo(texto) is None


def test_hash_depende_da_chave():
    a = hash_codigo("K7M2-9QXD", "chave-a")
    assert a == hash_codigo("K7M2-9QXD", "chave-a")
    assert a != hash_codigo("K7M2-9QXD", "chave-b")
    assert a != hash_codigo("K7M2-9QXE", "chave-a")
    assert re.fullmatch(r"[0-9a-f]{64}", a)
