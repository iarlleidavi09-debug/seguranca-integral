from app.ratelimit import Limitador


class Relogio:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_limitador_bloqueia_apos_max():
    r = Relogio()
    lim = Limitador(3, 60, relogio=r)
    assert [lim.permitir("a") for _ in range(3)] == [True, True, True]
    assert lim.permitir("a") is False
    # outra chave não é afetada
    assert lim.permitir("b") is True


def test_limitador_libera_apos_janela():
    r = Relogio()
    lim = Limitador(2, 60, relogio=r)
    assert lim.permitir("a") and lim.permitir("a")
    assert lim.permitir("a") is False
    r.t += 59
    assert lim.permitir("a") is False
    r.t += 2
    assert lim.permitir("a") is True


# --- chave do limitador: HMAC do cliente, IPv6 agrupado por /64 -------------

def _chave(endereco_cf):
    from flask import Flask, request

    from app.security import chave_limitador

    app = Flask(__name__)
    with app.test_request_context(
        headers={"CF-Connecting-IP": endereco_cf},
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    ):
        return chave_limitador(request)


def test_chave_nao_e_o_endereco():
    chave = _chave("203.0.113.7")
    assert "203.0.113.7" not in chave
    assert len(chave) == 64 and int(chave, 16) >= 0
    assert _chave("203.0.113.7") == chave  # estável dentro do processo


def test_ipv4_diferentes_tem_chaves_diferentes():
    assert _chave("203.0.113.7") != _chave("203.0.113.8")


def test_ipv6_no_mesmo_64_compartilha_a_chave():
    a = _chave("2001:db8:1:2:aaaa::1")
    b = _chave("2001:db8:1:2:ffff:eeee:dddd:cccc")
    assert a == b
    assert "2001" not in a


def test_ipv6_em_64_diferentes_tem_chaves_diferentes():
    assert _chave("2001:db8:1:2::1") != _chave("2001:db8:1:3::1")


def test_ipv4_mapeado_em_ipv6_vale_como_o_ipv4():
    assert _chave("::ffff:203.0.113.7") == _chave("203.0.113.7")
    assert _chave("::ffff:203.0.113.7") != _chave("::ffff:203.0.113.8")


def test_sal_e_aleatorio_por_processo():
    from app import security

    assert len(security._SAL) == 32
    assert isinstance(security._SAL, bytes)
