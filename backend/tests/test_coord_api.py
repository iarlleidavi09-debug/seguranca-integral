"""Testes da API da coordenação (porta 4000)."""
import sqlite3
import time

import pytest

from app import create_coord_app
from app.auth import criar_usuario
from app.casos import criar_caso
from app.db import connect
from app.uploads import salvar_anexo

from conftest import SENHA_COORD

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
GIF = b"GIF89a" + b"\x00" * 32
RELATO = "Um colega esta me xingando todos os dias no grupo da turma."
ERRO_LOGIN = {"erro": "nome ou senha invalidos"}
ERRO_404 = {"erro": "nao encontrado"}


def _caso(config, tipo="cyberbullying", gravidade=None, criado_em=None,
          status=None, anexos=(), relato=RELATO):
    """Cria um caso direto na camada de dados; devolve (id, codigo)."""
    c = connect(config)
    try:
        salvos = [salvar_anexo(config, dados) for dados in anexos]
        codigo = criar_caso(
            c, config, {"tipo": tipo, "relato": relato, "anonimo": True}, salvos
        )
        caso_id = c.execute("SELECT MAX(id) FROM casos").fetchone()[0]
        for campo, valor in (("gravidade", gravidade), ("criado_em", criado_em),
                             ("status", status)):
            if valor is not None:
                c.execute(f"UPDATE casos SET {campo} = ? WHERE id = ?",
                          (valor, caso_id))
        c.commit()
        return caso_id, codigo
    finally:
        c.close()


def _consulta(config, sql, params=()):
    c = connect(config)
    try:
        return c.execute(sql, params).fetchall()
    finally:
        c.close()


def _id_usuario(config, nome="coord"):
    return _consulta(config, "SELECT id FROM usuarios WHERE nome = ?", (nome,))[0][0]


def _criar_usuario(config, nome, senha=SENHA_COORD):
    c = connect(config)
    try:
        return criar_usuario(c, nome, senha)
    finally:
        c.close()


ROTAS_PROTEGIDAS = [
    ("post", "/api/logout"),
    ("get", "/api/eu"),
    ("get", "/api/casos"),
    ("get", "/api/casos/1"),
    ("post", "/api/casos/1/status"),
    ("post", "/api/casos/1/gravidade"),
    ("post", "/api/casos/1/mensagens"),
    ("post", "/api/casos/1/notas"),
    ("get", "/api/casos/1/anexos/1"),
    ("get", "/api/usuarios"),
    ("post", "/api/usuarios"),
    ("post", "/api/usuarios/1/desativar"),
]


# --- autenticação --------------------------------------------------------

@pytest.mark.parametrize("metodo,caminho", ROTAS_PROTEGIDAS)
def test_rotas_sem_login_401(coord_client, config, metodo, caminho):
    _caso(config, anexos=[PNG])
    kwargs = {"json": {}} if metodo == "post" else {}
    r = getattr(coord_client, metodo)(caminho, **kwargs)
    assert r.status_code == 401
    assert r.get_json() == {"erro": "nao autenticado"}


def test_saude_sem_login(coord_client):
    assert coord_client.get("/api/saude").get_json() == {"ok": True}


def test_login_ok_e_falha_mesma_mensagem(coord_client, config):
    _criar_usuario(config, "coord")
    _criar_usuario(config, "inativo")
    from app.auth import desativar_usuario
    c = connect(config)
    try:
        desativar_usuario(c, _id_usuario(config, "inativo"))
    finally:
        c.close()

    ok = coord_client.post("/api/login", json={"nome": "coord", "senha": SENHA_COORD})
    assert ok.status_code == 200
    assert ok.get_json() == {"nome": "coord"}
    assert coord_client.get("/api/eu").get_json()["nome"] == "coord"

    falhas = [
        {"nome": "coord", "senha": "senha-errada-123"},
        {"nome": "ninguem", "senha": SENHA_COORD},
        {"nome": "inativo", "senha": SENHA_COORD},
        {"nome": "coord", "senha": 12345},
        {},
    ]
    corpos = set()
    for corpo in falhas:
        r = coord_client.post("/api/login", json=corpo)
        assert r.status_code == 401
        corpos.add(r.get_data())
    assert len(corpos) == 1
    assert coord_client.post("/api/login", json={}).get_json() == ERRO_LOGIN


def test_login_falho_derruba_sessao_anterior(coord_logado):
    r = coord_logado.post("/api/login", json={"nome": "coord", "senha": "errada-errada"})
    assert r.status_code == 401
    assert coord_logado.get("/api/eu").status_code == 401


def test_login_com_senha_de_300_caracteres_401(coord_client, config):
    _criar_usuario(config, "coord")
    r = coord_client.post("/api/login", json={"nome": "coord", "senha": "x" * 300})
    assert r.status_code == 401
    assert r.get_json() == ERRO_LOGIN
    r = coord_client.post("/api/login", json={"nome": "n" * 101, "senha": SENHA_COORD})
    assert r.status_code == 401
    assert r.get_json() == ERRO_LOGIN
    # tentativa grande demais nem chega à autenticação: não conta para bloqueio
    assert _consulta(config, "SELECT tentativas FROM usuarios")[0][0] == 0


def test_bloqueio_apos_5_falhas_pela_api(coord_client, config):
    _criar_usuario(config, "coord")
    for _ in range(5):
        r = coord_client.post("/api/login", json={"nome": "coord", "senha": "errada-errada"})
        assert r.status_code == 401
    r = coord_client.post("/api/login", json={"nome": "coord", "senha": SENHA_COORD})
    assert r.status_code == 401
    assert r.get_json() == ERRO_LOGIN
    assert coord_client.get("/api/eu").status_code == 401


def test_limite_de_login_429(config):
    app = create_coord_app(config, limites={"login": (3, 600)})
    client = app.test_client()
    for _ in range(3):
        assert client.post("/api/login", json={"nome": "a", "senha": "b"}).status_code == 401
    r = client.post("/api/login", json={"nome": "a", "senha": "b"})
    assert r.status_code == 429
    assert "erro" in r.get_json()


def test_logout_encerra_sessao(coord_logado):
    assert coord_logado.post("/api/logout", json={}).status_code == 200
    assert coord_logado.get("/api/eu").status_code == 401


def test_cookie_de_sessao_com_flags(coord_client, config):
    _criar_usuario(config, "coord")
    corpo = {"nome": "coord", "senha": SENHA_COORD}
    r = coord_client.post("/api/login", json=corpo)
    cookie = r.headers["Set-Cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=Strict" in cookie
    assert "Secure" not in cookie
    assert "Expires=" in cookie
    r = coord_client.post("/api/login", json=corpo,
                          headers={"X-Forwarded-Proto": "https"})
    assert "Secure" in r.headers["Set-Cookie"]


def test_sessao_expira_apos_12_horas_mesmo_com_uso(coord_logado):
    with coord_logado.session_transaction() as sessao:
        sessao["inicio"] = int(time.time()) - 12 * 3600 - 5
    assert coord_logado.get("/api/eu").status_code == 401
    # a sessão foi limpa: mesmo voltando o relógio, não entra mais
    assert coord_logado.get("/api/eu").status_code == 401


def test_sessao_de_usuario_desativado_perde_acesso(coord_app, coord_logado, config):
    _criar_usuario(config, "outra")
    outro = coord_app.test_client()
    assert outro.post("/api/login", json={"nome": "outra", "senha": SENHA_COORD}).status_code == 200
    assert outro.get("/api/casos").status_code == 200

    id_outra = _id_usuario(config, "outra")
    r = coord_logado.post(f"/api/usuarios/{id_outra}/desativar", json={})
    assert r.status_code == 200
    r = outro.get("/api/casos")
    assert r.status_code == 401
    assert outro.get("/api/eu").status_code == 401


def test_post_sem_json_415(coord_logado, coord_client, config):
    caso_id, _ = _caso(config)
    r = coord_logado.post(f"/api/casos/{caso_id}/status", data="status=resolvido",
                          content_type="application/x-www-form-urlencoded")
    assert r.status_code == 415
    assert r.get_json() == {"erro": "use application/json"}
    r = coord_logado.post("/api/logout")
    assert r.status_code == 415
    assert _consulta(config, "SELECT status FROM casos")[0][0] == "novo"
    # login também exige JSON
    r = coord_client.post("/api/login", data={"nome": "coord", "senha": SENHA_COORD})
    assert r.status_code == 415


def test_json_que_nao_e_objeto_nao_quebra(coord_logado, config):
    caso_id, _ = _caso(config)
    r = coord_logado.post(f"/api/casos/{caso_id}/status", json=["resolvido"])
    assert r.status_code == 400
    r = coord_logado.post("/api/login", data="{quebrado", content_type="application/json")
    assert r.status_code == 401


def test_banco_ocupado_vira_503(coord_client, config, monkeypatch):
    from app import auth

    def travado(*a, **k):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(auth, "autenticar", travado)
    r = coord_client.post("/api/login", json={"nome": "a", "senha": "b"})
    assert r.status_code == 503
    assert r.get_json() == {"erro": "servidor ocupado"}


def test_outro_erro_operacional_vira_500_generico(coord_client, monkeypatch):
    from app import auth

    def quebra(*a, **k):
        raise sqlite3.OperationalError("no such table: segredo")

    monkeypatch.setattr(auth, "autenticar", quebra)
    r = coord_client.post("/api/login", json={"nome": "a", "senha": "b"})
    assert r.status_code == 500
    assert r.get_json() == {"erro": "erro interno"}


# --- fila e detalhe ------------------------------------------------------

def test_fila_ordenada_por_gravidade_e_antiguidade(coord_logado, config):
    b_velho, _ = _caso(config, gravidade="baixa", criado_em="2026-01-01T08:00:00+00:00")
    a_novo, _ = _caso(config, gravidade="alta", criado_em="2026-01-03T08:00:00+00:00")
    m_velho, _ = _caso(config, gravidade="media", criado_em="2026-01-01T09:00:00+00:00")
    a_velho, _ = _caso(config, gravidade="alta", criado_em="2026-01-02T08:00:00+00:00")
    r = coord_logado.get("/api/casos")
    assert r.status_code == 200
    casos = r.get_json()["casos"]
    assert [c["id"] for c in casos] == [a_velho, a_novo, m_velho, b_velho]
    assert all("codigo_hash" not in c for c in casos)


def test_filtros_status_e_tipo(coord_logado, config):
    um, _ = _caso(config, tipo="golpe", status="resolvido")
    dois, _ = _caso(config, tipo="golpe")
    tres, _ = _caso(config, tipo="ameaca")
    ids = lambda q: [c["id"] for c in coord_logado.get(f"/api/casos{q}").get_json()["casos"]]  # noqa: E731
    assert sorted(ids("?tipo=golpe")) == sorted([um, dois])
    assert ids("?status=resolvido") == [um]
    assert ids("?status=novo&tipo=golpe") == [dois]
    assert sorted(ids("?status=&tipo=")) == sorted([um, dois, tres])
    assert coord_logado.get("/api/casos?status=apagado").status_code == 400
    assert coord_logado.get("/api/casos?tipo=xpto").status_code == 400


def test_detalhe_traz_motivos_anexos_e_timeline(coord_logado, config):
    caso_id, _ = _caso(config, tipo="ameaca",
                       relato="Disseram que vao me bater na saida da escola amanha.",
                       anexos=[PNG, GIF])
    coord_logado.post(f"/api/casos/{caso_id}/notas", json={"texto": "Ligar para a familia"})
    coord_logado.post(f"/api/casos/{caso_id}/mensagens", json={"texto": "Estamos vendo"})
    r = coord_logado.get(f"/api/casos/{caso_id}")
    assert r.status_code == 200
    d = r.get_json()
    assert "codigo_hash" not in d and "codigo_hash" not in r.get_data(as_text=True)
    assert "motivos_json" not in d
    assert d["id"] == caso_id and d["tipo"] == "ameaca"
    assert d["relato"].startswith("Disseram")
    assert isinstance(d["motivos"], list) and d["motivos"]
    assert d["anonimo"] is True
    assert [a["tipo"] for a in d["anexos"]] == ["png", "gif"]
    assert set(d["anexos"][0]) == {"id", "tipo", "tamanho"}
    tipos = [e["tipo"] for e in d["eventos"]]
    assert tipos[0] == "criado"
    assert "nota_interna" in tipos and "mensagem_coordenacao" in tipos
    assert d["mensagens"][0]["autor"] == "coordenacao"
    assert d["notas"][0]["texto"] == "Ligar para a familia"
    assert d["notas"][0]["usuario"] == "coord"


# --- mudanças de status e gravidade --------------------------------------

def test_mudar_status_registra_evento_com_autor(coord_logado, config):
    caso_id, _ = _caso(config)
    r = coord_logado.post(f"/api/casos/{caso_id}/status", json={"status": "em_analise"})
    assert r.status_code == 200
    linha = _consulta(config, "SELECT status FROM casos WHERE id = ?", (caso_id,))[0]
    assert linha["status"] == "em_analise"
    ev = _consulta(config, "SELECT * FROM eventos WHERE tipo = 'status'")
    assert len(ev) == 1
    assert ev[0]["usuario_id"] == _id_usuario(config)
    assert ev[0]["detalhe"] == "status: novo -> em_analise"
    # mesmo valor não gera evento novo
    coord_logado.post(f"/api/casos/{caso_id}/status", json={"status": "em_analise"})
    assert len(_consulta(config, "SELECT * FROM eventos WHERE tipo = 'status'")) == 1


def test_status_invalido_400(coord_logado, config):
    caso_id, _ = _caso(config)
    for valor in ("apagado", "", None, 3, "NOVO"):
        r = coord_logado.post(f"/api/casos/{caso_id}/status", json={"status": valor})
        assert r.status_code == 400
    assert _consulta(config, "SELECT status FROM casos")[0][0] == "novo"


def test_mudar_gravidade_registra_evento(coord_logado, config):
    caso_id, _ = _caso(config, gravidade="baixa")
    r = coord_logado.post(f"/api/casos/{caso_id}/gravidade", json={"gravidade": "alta"})
    assert r.status_code == 200
    assert _consulta(config, "SELECT gravidade FROM casos")[0][0] == "alta"
    ev = _consulta(config, "SELECT * FROM eventos WHERE tipo = 'gravidade'")
    assert ev[0]["detalhe"] == "gravidade: baixa -> alta"
    assert ev[0]["usuario_id"] == _id_usuario(config)
    r = coord_logado.post(f"/api/casos/{caso_id}/gravidade", json={"gravidade": "urgente"})
    assert r.status_code == 400


# --- mensagens e notas ---------------------------------------------------

def test_mensagem_da_coordenacao_visivel_ao_aluno(coord_logado, student_client, config):
    caso_id, codigo = _caso(config)
    r = coord_logado.post(f"/api/casos/{caso_id}/mensagens",
                          json={"texto": "  Recebemos, vamos conversar.  "})
    assert r.status_code == 201
    msgs = student_client.post("/api/acompanhar", json={"codigo": codigo}).get_json()["mensagens"]
    assert [(m["autor"], m["texto"]) for m in msgs] == [
        ("coordenacao", "Recebemos, vamos conversar.")
    ]
    ev = _consulta(config, "SELECT usuario_id FROM eventos WHERE tipo = 'mensagem_coordenacao'")
    assert ev[0][0] == _id_usuario(config)
    for texto in ("   ", "x" * 2001, 7):
        r = coord_logado.post(f"/api/casos/{caso_id}/mensagens", json={"texto": texto})
        assert r.status_code == 400


def test_nota_interna_so_na_coordenacao(coord_logado, student_client, config):
    caso_id, codigo = _caso(config)
    r = coord_logado.post(f"/api/casos/{caso_id}/notas", json={"texto": "SEGREDO INTERNO"})
    assert r.status_code == 201
    aluno = student_client.post("/api/acompanhar", json={"codigo": codigo})
    assert "SEGREDO" not in aluno.get_data(as_text=True)
    d = coord_logado.get(f"/api/casos/{caso_id}").get_json()
    assert [n["texto"] for n in d["notas"]] == ["SEGREDO INTERNO"]
    assert coord_logado.post(f"/api/casos/{caso_id}/notas", json={"texto": ""}).status_code == 400


# --- 404 sem vazar (Review Focus 5) --------------------------------------

def test_caso_inexistente_404_sem_vazar(coord_logado, config):
    _caso(config)
    corpos = set()
    for metodo, caminho, corpo in (
        ("get", "/api/casos/999", None),
        ("post", "/api/casos/999/status", {"status": "resolvido"}),
        ("post", "/api/casos/999/status", {"status": "invalido"}),
        ("post", "/api/casos/999/gravidade", {"gravidade": "alta"}),
        ("post", "/api/casos/999/mensagens", {"texto": "oi"}),
        ("post", "/api/casos/999/notas", {"texto": ""}),
        ("get", "/api/casos/999/anexos/1", None),
    ):
        kwargs = {"json": corpo} if corpo is not None else {}
        r = getattr(coord_logado, metodo)(caminho, **kwargs)
        assert r.status_code == 404, caminho
        corpos.add(r.get_data())
    assert corpos == {b'{"erro":"nao encontrado"}\n'}
    assert _consulta(config, "SELECT COUNT(*) FROM eventos")[0][0] == 1


def test_anexo_inexistente_404(coord_logado, config):
    caso_id, _ = _caso(config, anexos=[PNG])
    anexo_id = _consulta(config, "SELECT id FROM anexos")[0][0]
    r1 = coord_logado.get(f"/api/casos/{caso_id}/anexos/{anexo_id + 50}")
    # arquivo apagado do disco também dá 404 igual
    nome = _consulta(config, "SELECT nome_interno FROM anexos")[0][0]
    (config.uploads_dir / nome).unlink()
    r2 = coord_logado.get(f"/api/casos/{caso_id}/anexos/{anexo_id}")
    # nome interno adulterado no banco também
    c = connect(config)
    c.execute("UPDATE anexos SET nome_interno = '../seguranca.db'")
    c.commit()
    c.close()
    r3 = coord_logado.get(f"/api/casos/{caso_id}/anexos/{anexo_id}")
    for r in (r1, r2, r3):
        assert r.status_code == 404
        assert r.get_json() == ERRO_404
    assert r1.get_data() == r2.get_data() == r3.get_data()


def test_anexo_de_outro_caso_nao_e_servido_pelo_caso_errado(coord_logado, config):
    caso_a, _ = _caso(config, anexos=[PNG])
    caso_b, _ = _caso(config, anexos=[GIF])
    anexo_a = _consulta(config, "SELECT id FROM anexos WHERE caso_id = ?", (caso_a,))[0][0]
    r = coord_logado.get(f"/api/casos/{caso_b}/anexos/{anexo_a}")
    assert r.status_code == 404
    assert r.get_json() == ERRO_404
    assert PNG not in r.get_data()
    assert coord_logado.get(f"/api/casos/{caso_a}/anexos/{anexo_a}").status_code == 200


def test_anexo_servido_com_nosniff(coord_logado, config):
    caso_id, _ = _caso(config, anexos=[PNG, GIF])
    ids = [x[0] for x in _consulta(config, "SELECT id FROM anexos ORDER BY id")]
    r = coord_logado.get(f"/api/casos/{caso_id}/anexos/{ids[0]}")
    assert r.status_code == 200
    assert r.get_data() == PNG
    assert r.headers["Content-Type"] == "image/png"
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Content-Disposition"] == f'inline; filename="anexo-{ids[0]}.png"'
    assert r.headers["Cache-Control"] == "private, no-store"
    r = coord_logado.get(f"/api/casos/{caso_id}/anexos/{ids[1]}")
    assert r.headers["Content-Type"] == "image/gif"
    assert r.headers["Content-Disposition"] == f'inline; filename="anexo-{ids[1]}.gif"'


# --- usuários ------------------------------------------------------------

def test_criar_e_desativar_usuario(coord_logado, coord_app, config):
    r = coord_logado.post("/api/usuarios", json={"nome": "Ana", "senha": "outra-senha-forte"})
    assert r.status_code == 201
    novo_id = r.get_json()["id"]
    lista = coord_logado.get("/api/usuarios").get_json()["usuarios"]
    assert {"id": novo_id, "nome": "Ana", "ativo": True} in lista
    assert all(set(u) == {"id", "nome", "ativo"} for u in lista)

    for corpo in ({"nome": "Bia", "senha": "curta"}, {"nome": "ana", "senha": "outra-senha-forte"},
                  {"nome": "", "senha": "outra-senha-forte"}, {"nome": "Cid", "senha": "x" * 300},
                  {"nome": "n" * 101, "senha": "outra-senha-forte"}, {"nome": 3, "senha": None}):
        r = coord_logado.post("/api/usuarios", json=corpo)
        assert r.status_code == 400
        assert "hash" not in r.get_data(as_text=True)

    r = coord_logado.post(f"/api/usuarios/{novo_id}/desativar", json={})
    assert r.status_code == 200
    lista = coord_logado.get("/api/usuarios").get_json()["usuarios"]
    assert {"id": novo_id, "nome": "Ana", "ativo": False} in lista
    ana = coord_app.test_client()
    r = ana.post("/api/login", json={"nome": "Ana", "senha": "outra-senha-forte"})
    assert r.status_code == 401
    assert coord_logado.post("/api/usuarios/9999/desativar", json={}).status_code == 404


def test_nao_desativa_a_si_mesmo(coord_logado, config):
    meu_id = _id_usuario(config)
    r = coord_logado.post(f"/api/usuarios/{meu_id}/desativar", json={})
    assert r.status_code == 400
    assert _consulta(config, "SELECT ativo FROM usuarios WHERE id = ?", (meu_id,))[0][0] == 1
    assert coord_logado.get("/api/eu").status_code == 200


# --- isolamento da porta -------------------------------------------------

def test_porta_da_coordenacao_nao_aceita_denuncia(coord_client, coord_logado):
    for client in (coord_client, coord_logado):
        r = client.post("/api/denuncias", data={"tipo": "golpe", "relato": RELATO},
                        content_type="multipart/form-data")
        assert r.status_code == 404
        assert r.get_json() == ERRO_404
    assert coord_logado.post("/api/acompanhar", json={"codigo": "ABCD-EFGH"}).status_code == 404
    assert coord_logado.get("/api/qualquer").status_code == 404


def test_spa_da_coordenacao_sem_build_404(coord_client):
    assert coord_client.get("/").status_code == 404
    assert coord_client.get("/casos/1").status_code == 404


def test_log_de_acesso_da_coordenacao_sem_ip_nem_corpo(coord_client, config, caplog):
    import logging

    _criar_usuario(config, "coord")
    caplog.set_level(logging.DEBUG)
    coord_client.post("/api/login?x=1", json={"nome": "coord", "senha": SENHA_COORD},
                      headers={"CF-Connecting-IP": "203.0.113.77"},
                      environ_overrides={"REMOTE_ADDR": "127.0.0.1"})
    assert any("/api/login" in m for m in caplog.messages)
    for m in caplog.messages:
        for proibido in ("203.0.113.77", "127.0.0.1", SENHA_COORD, "x=1"):
            assert proibido not in m
