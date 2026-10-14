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
