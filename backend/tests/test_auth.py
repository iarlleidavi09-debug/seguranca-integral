import threading
from datetime import datetime, timedelta, timezone

import pytest

from app import auth
from app.auth import (
    autenticar,
    criar_usuario,
    desativar_usuario,
    gerar_senha_inicial,
    listar_usuarios,
)
from app.db import connect

SENHA = "senha-forte-123"
T0 = datetime(2026, 10, 14, 12, 0, 0, tzinfo=timezone.utc)


def _linha(conn, usuario_id):
    return conn.execute(
        "SELECT * FROM usuarios WHERE id = ?", (usuario_id,)
    ).fetchone()


def _falhar(conn, nome, vezes, agora=T0):
    for _ in range(vezes):
        assert autenticar(conn, nome, "senha-errada-xx", agora) is None


def test_senha_curta_rejeitada(conn):
    with pytest.raises(ValueError):
        criar_usuario(conn, "ana", "123456789")  # 9 caracteres
    assert conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 0
    # exatamente 10 é aceito
    assert criar_usuario(conn, "ana", "1234567890") > 0


def test_nome_duplicado_rejeitado(conn):
    criar_usuario(conn, "ana", SENHA)
    with pytest.raises(ValueError):
        criar_usuario(conn, "ana", SENHA)


def test_nome_duplicado_ignora_maiusculas_e_espacos(conn):
    criar_usuario(conn, "Ana", SENHA)
    with pytest.raises(ValueError):
        criar_usuario(conn, "  ANA ", SENHA)
    with pytest.raises(ValueError):
        criar_usuario(conn, "aNa", SENHA)


def test_nome_vazio_ou_so_espacos_rejeitado(conn):
    for nome in ("", "   ", "\t\n"):
        with pytest.raises(ValueError):
            criar_usuario(conn, nome, SENHA)


def test_nome_guardado_sem_espacos_nas_pontas(conn):
    uid = criar_usuario(conn, "  Beatriz  ", SENHA)
    assert _linha(conn, uid)["nome"] == "Beatriz"


def test_autentica_senha_correta(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    assert autenticar(conn, "ana", SENHA, T0) == uid


def test_autentica_nome_sem_diferenciar_maiusculas(conn):
    uid = criar_usuario(conn, "Ana", SENHA)
    assert autenticar(conn, " ANA ", SENHA, T0) == uid


def test_senha_errada_none(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    assert autenticar(conn, "ana", "senha-errada-xx", T0) is None
    assert _linha(conn, uid)["tentativas"] == 1


def test_cinco_falhas_bloqueiam(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    _falhar(conn, "ana", 4)
    assert _linha(conn, uid)["bloqueado_ate"] is None
    _falhar(conn, "ana", 1)
    linha = _linha(conn, uid)
    assert linha["tentativas"] == 5
    bloqueado = datetime.fromisoformat(linha["bloqueado_ate"])
    assert bloqueado == T0 + timedelta(minutes=15)
    assert bloqueado.tzinfo is not None


def test_bloqueado_rejeita_senha_correta(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    _falhar(conn, "ana", 5)
    assert autenticar(conn, "ana", SENHA, T0 + timedelta(minutes=1)) is None
    # tentativa durante o bloqueio não conta nem estende o bloqueio
    _falhar(conn, "ana", 3, T0 + timedelta(minutes=2))
    linha = _linha(conn, uid)
    assert linha["tentativas"] == 5
    assert datetime.fromisoformat(linha["bloqueado_ate"]) == T0 + timedelta(minutes=15)


def test_bloqueio_expira_apos_15_minutos(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    _falhar(conn, "ana", 5)
    quase = T0 + timedelta(minutes=14, seconds=59)
    assert autenticar(conn, "ana", SENHA, quase) is None
    depois = T0 + timedelta(minutes=15)
    assert autenticar(conn, "ana", SENHA, depois) == uid
    linha = _linha(conn, uid)
    assert linha["tentativas"] == 0
    assert linha["bloqueado_ate"] is None


def test_apos_expirar_ganha_cinco_novas_tentativas(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    _falhar(conn, "ana", 5)
    depois = T0 + timedelta(minutes=16)
    _falhar(conn, "ana", 1, depois)
    linha = _linha(conn, uid)
    assert linha["tentativas"] == 1
    assert autenticar(conn, "ana", SENHA, depois) == uid


def test_sucesso_zera_tentativas(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    _falhar(conn, "ana", 3)
    assert autenticar(conn, "ana", SENHA, T0) == uid
    assert _linha(conn, uid)["tentativas"] == 0


def test_sucesso_apos_quatro_falhas_zera(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    _falhar(conn, "ana", 4)
    assert autenticar(conn, "ana", SENHA, T0) == uid
    linha = _linha(conn, uid)
    assert linha["tentativas"] == 0
    assert linha["bloqueado_ate"] is None
    # depois de zerar, mais 4 falhas ainda não bloqueiam
    _falhar(conn, "ana", 4)
    assert autenticar(conn, "ana", SENHA, T0) == uid


def test_usuario_desativado_nao_entra(conn, monkeypatch):
    uid = criar_usuario(conn, "ana", SENHA)
    desativar_usuario(conn, uid)
    assert _linha(conn, uid)["ativo"] == 0
    verificados = []
    original = auth.check_password_hash

    def espia(h, s):
        verificados.append(h)
        return original(h, s)

    monkeypatch.setattr(auth, "check_password_hash", espia)
    assert autenticar(conn, "ana", SENHA, T0) is None
    # gasta uma verificação, mas com o hash falso, nunca com o real
    assert verificados == [auth._HASH_FALSO]


def test_usuario_inexistente_none(conn, monkeypatch):
    criar_usuario(conn, "ana", SENHA)
    verificados = []
    original = auth.check_password_hash

    def espia(h, s):
        verificados.append(h)
        return original(h, s)

    monkeypatch.setattr(auth, "check_password_hash", espia)
    assert autenticar(conn, "ninguem", SENHA, T0) is None
    assert verificados == [auth._HASH_FALSO]


def test_hash_nao_guarda_senha_em_claro(conn):
    uid = criar_usuario(conn, "ana", SENHA)
    h = _linha(conn, uid)["senha_hash"]
    assert SENHA not in h
    assert h.startswith("scrypt:")


def test_agora_sem_fuso_rejeitado(conn):
    criar_usuario(conn, "ana", SENHA)
    with pytest.raises(ValueError):
        autenticar(conn, "ana", SENHA, datetime(2026, 10, 14, 12, 0, 0))


def test_listar_usuarios_sem_hash(conn):
    criar_usuario(conn, "ana", SENHA)
    criar_usuario(conn, "bia", SENHA)
    linhas = listar_usuarios(conn)
    assert [l["nome"] for l in linhas] == ["ana", "bia"]
    for l in linhas:
        assert "senha_hash" not in l.keys()
        assert "tentativas" not in l.keys()
        assert l["ativo"] == 1


def test_gerar_senha_inicial():
    vistas = set()
    for _ in range(50):
        s = gerar_senha_inicial()
        assert len(s) == 16
        assert any(c.isalpha() for c in s)
        assert any(c.isdigit() for c in s)
        assert not set(s) & set("0O1lI")
        vistas.add(s)
    assert len(vistas) == 50


def test_senha_inicial_e_aceita_por_criar_usuario(conn):
    s = gerar_senha_inicial()
    uid = criar_usuario(conn, "ana", s)
    assert autenticar(conn, "ana", s, T0) == uid


def test_concorrencia_nao_passa_de_cinco_falhas(config, conn):
    uid = criar_usuario(conn, "ana", SENHA)
    n = 12
    barreira = threading.Barrier(n)
    resultados = []
    erros = []

    def tentar():
        c = connect(config)
        try:
            barreira.wait()
            resultados.append(autenticar(c, "ana", "senha-errada-xx", T0))
        except Exception as e:  # pragma: no cover - aparece no assert
            erros.append(e)
        finally:
            c.close()

    threads = [threading.Thread(target=tentar) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert erros == []
    assert resultados == [None] * n
    linha = _linha(conn, uid)
    # contador não ultrapassa 5 e o bloqueio vale
    assert linha["tentativas"] == 5
    assert datetime.fromisoformat(linha["bloqueado_ate"]) == T0 + timedelta(minutes=15)
    assert autenticar(conn, "ana", SENHA, T0 + timedelta(minutes=1)) is None
