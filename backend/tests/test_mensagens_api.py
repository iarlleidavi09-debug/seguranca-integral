"""API de editar, apagar e ver versões das mensagens da coordenação."""
import json

import pytest

from app.auth import criar_usuario
from app.db import connect

from conftest import SENHA_COORD
from test_coord_api import _caso, _consulta
from test_coord_api import coordenador  # noqa: F401  (fixture: usuário "comum")

ORIGINAL = "Texto original sigiloso da coordenacao."


def _outro_cliente(config, coord_app, nome, papel="coordenador"):
    c = connect(config)
    try:
        criar_usuario(c, nome, SENHA_COORD, papel)
    finally:
        c.close()
    cliente = coord_app.test_client()
    assert cliente.post("/api/login", json={"nome": nome, "senha": SENHA_COORD}).status_code == 200
    return cliente


def _enviar(cliente, config, caso_id, texto=ORIGINAL):
    assert cliente.post(f"/api/casos/{caso_id}/mensagens", json={"texto": texto}).status_code == 201
    return _consulta(config, "SELECT MAX(id) FROM mensagens")[0][0]


def _url(caso_id, mensagem_id):
    return f"/api/casos/{caso_id}/mensagens/{mensagem_id}"


@pytest.fixture
def cenario(config, coordenador):
    caso_id, codigo = _caso(config)
    mensagem_id = _enviar(coordenador, config, caso_id)
    return coordenador, caso_id, codigo, mensagem_id


def test_patch_edita_e_aluno_ve_editada_sem_vazar(cenario, student_client):
    cliente, caso_id, codigo, mid = cenario
    r = cliente.patch(_url(caso_id, mid), json={"texto": "Texto novo."})
    assert r.status_code == 200 and r.get_json() == {"ok": True}
    r = student_client.post("/api/acompanhar", json={"codigo": codigo})
    msg = r.get_json()["mensagens"][0]
    assert msg["texto"] == "Texto novo."
    assert msg["editada"] is True and msg["apagada"] is False
    assert set(msg) == {"id", "autor", "texto", "criado_em", "editada", "apagada"}
    corpo = r.get_data(as_text=True)
    assert "editada_em" not in corpo and "versoes" not in corpo and "usuario" not in corpo
    assert ORIGINAL not in corpo


def test_delete_aluno_ve_apagada_e_texto_vazio(cenario, student_client):
    cliente, caso_id, codigo, mid = cenario
    r = cliente.delete(_url(caso_id, mid), json={})
    assert r.status_code == 200 and r.get_json() == {"ok": True}
    r = student_client.post("/api/acompanhar", json={"codigo": codigo})
    msg = r.get_json()["mensagens"][0]
    assert msg["texto"] == "" and msg["apagada"] is True
    assert ORIGINAL not in r.get_data(as_text=True)


def test_texto_apagado_nao_vaza_em_nenhuma_saida(cenario, student_client):
    cliente, caso_id, codigo, mid = cenario
    assert cliente.delete(_url(caso_id, mid), json={}).status_code == 200
    saidas = [
        student_client.post("/api/acompanhar", json={"codigo": codigo}).get_data(as_text=True),
        cliente.get(f"/api/casos/{caso_id}").get_data(as_text=True),
        cliente.get("/api/casos").get_data(as_text=True),
        cliente.get("/api/casos?status=abertos").get_data(as_text=True),
        cliente.get(f"/api/casos/{caso_id}/exportacao").get_data(as_text=True),
    ]
    eventos = cliente.get(f"/api/casos/{caso_id}").get_json()["eventos"]
    saidas.append(json.dumps(eventos))
    for saida in saidas:
        assert ORIGINAL not in saida
    with __import__("contextlib").closing(connect(cliente.application.config["SI_CONFIG"])) as c:
        from app import casos
        assert ORIGINAL not in json.dumps(casos.estado_conversa(c, caso_id, 1), default=str)
    r = cliente.get(_url(caso_id, mid) + "/versoes")
    assert r.status_code == 200
    assert ORIGINAL in r.get_data(as_text=True)


def test_outro_coordenador_recebe_403(config, coord_app, cenario):
    _, caso_id, _, mid = cenario
    outro = _outro_cliente(config, coord_app, "outro")
    erro = {"erro": "sem permissao para alterar esta mensagem"}
    r = outro.patch(_url(caso_id, mid), json={"texto": "invasao"})
    assert r.status_code == 403 and r.get_json() == erro
    r = outro.delete(_url(caso_id, mid), json={})
    assert r.status_code == 403 and r.get_json() == erro
    assert _consulta(config, "SELECT texto FROM mensagens WHERE id=?", (mid,))[0][0] == ORIGINAL


def test_admin_pode(config, coord_app, cenario):
    _, caso_id, _, mid = cenario
    admin = _outro_cliente(config, coord_app, "chefe", "admin")
    assert admin.patch(_url(caso_id, mid), json={"texto": "pelo admin"}).status_code == 200
    assert admin.delete(_url(caso_id, mid), json={}).status_code == 200


def test_url_com_mensagem_de_outro_caso_da_404(config, cenario):
    cliente, caso_id, _, mid = cenario
    outro_caso, _ = _caso(config)
    for r in (
        cliente.patch(_url(outro_caso, mid), json={"texto": "x"}),
        cliente.delete(_url(outro_caso, mid), json={}),
        cliente.get(_url(outro_caso, mid) + "/versoes"),
        cliente.patch(_url(caso_id, 99999), json={"texto": "x"}),
    ):
        assert r.status_code == 404 and r.get_json() == {"erro": "nao encontrado"}


@pytest.mark.parametrize("texto", ["", "   \n ", "a" * 2001, None, 5])
def test_patch_texto_invalido_da_400(cenario, config, texto):
    cliente, caso_id, _, mid = cenario
    r = cliente.patch(_url(caso_id, mid), json={"texto": texto})
    assert r.status_code == 400
    assert r.get_json() == {"erro": "mensagem deve ter de 1 a 2000 caracteres"}
    assert _consulta(config, "SELECT texto FROM mensagens WHERE id=?", (mid,))[0][0] == ORIGINAL


def test_patch_com_2000_caracteres_passa(cenario):
    cliente, caso_id, _, mid = cenario
    assert cliente.patch(_url(caso_id, mid), json={"texto": "a" * 2000}).status_code == 200


def test_patch_em_apagada_da_409(cenario):
    cliente, caso_id, _, mid = cenario
    assert cliente.delete(_url(caso_id, mid), json={}).status_code == 200
    r = cliente.patch(_url(caso_id, mid), json={"texto": "tarde demais"})
    assert r.status_code == 409
    assert r.get_json() == {"erro": "mensagem apagada nao pode ser editada"}


def test_delete_duas_vezes_da_200(cenario, config):
    cliente, caso_id, _, mid = cenario
    assert cliente.delete(_url(caso_id, mid), json={}).status_code == 200
    assert cliente.delete(_url(caso_id, mid), json={}).status_code == 200
    assert _consulta(config, "SELECT COUNT(*) FROM mensagens_versoes WHERE mensagem_id=?", (mid,))[0][0] == 1


def test_versoes_traz_historico(cenario):
    cliente, caso_id, _, mid = cenario
    cliente.patch(_url(caso_id, mid), json={"texto": "segunda"})
    cliente.delete(_url(caso_id, mid), json={})
    versoes = cliente.get(_url(caso_id, mid) + "/versoes").get_json()["versoes"]
    assert [(v["texto"], v["acao"], v["usuario"]) for v in versoes] == [
        (ORIGINAL, "edicao", "comum"), ("segunda", "exclusao", "comum")]
    assert all(set(v) == {"id", "texto", "acao", "usuario", "criado_em"} for v in versoes)


def test_detalhe_traz_pode_alterar_por_usuario(config, coord_app, cenario, coord_logado):
    cliente, caso_id, _, mid = cenario
    outro = _outro_cliente(config, coord_app, "outro")
    # mensagem do aluno nunca é alterável
    c = connect(config)
    try:
        c.execute("INSERT INTO mensagens (caso_id, autor, texto, criado_em) "
                  "VALUES (?, 'aluno', 'duvida', '2026-01-01T00:00:00Z')", (caso_id,))
        c.commit()
    finally:
        c.close()

    def flags(cli):
        msgs = cli.get(f"/api/casos/{caso_id}").get_json()["mensagens"]
        assert all("editada_em" in m and "apagada_em" in m for m in msgs)
        return [m["pode_alterar"] for m in msgs]

    assert flags(cliente) == [True, False]
    assert flags(outro) == [False, False]
    assert flags(coord_logado) == [True, False]


def test_sem_json_content_type_da_415(cenario):
    cliente, caso_id, _, mid = cenario
    r = cliente.patch(_url(caso_id, mid), data="texto=x",
                      content_type="application/x-www-form-urlencoded")
    assert r.status_code == 415


def test_sem_sessao_da_401(coord_client):
    for r in (coord_client.patch("/api/casos/1/mensagens/1", json={"texto": "x"}),
              coord_client.delete("/api/casos/1/mensagens/1"),
              coord_client.get("/api/casos/1/mensagens/1/versoes")):
        assert r.status_code == 401


def test_edicao_e_exclusao_publicam_no_tempo_real(cenario):
    cliente, caso_id, _, mid = cenario
    central = cliente.application.extensions["eventos"]
    aluno = central.assinar(caso_id)
    try:
        assert cliente.patch(_url(caso_id, mid), json={"texto": "novo"}).status_code == 200
        assert aluno.fila.get_nowait() == "atualizar"
        # sem mudança e leitura não publicam
        assert cliente.patch(_url(caso_id, mid), json={"texto": "novo"}).status_code == 200
        assert cliente.get(_url(caso_id, mid) + "/versoes").status_code == 200
        assert aluno.fila.empty()
        assert cliente.delete(_url(caso_id, mid), json={}).status_code == 200
        assert aluno.fila.get_nowait() == "atualizar"
        assert cliente.delete(_url(caso_id, mid), json={}).status_code == 200
        assert aluno.fila.empty()
    finally:
        aluno.fechar()


def test_exportacao_marca_editada_e_apagada(cenario, config):
    cliente, caso_id, _, mid = cenario
    cliente.patch(_url(caso_id, mid), json={"texto": "Revisada."})
    html = cliente.get(f"/api/casos/{caso_id}/exportacao").get_data(as_text=True)
    assert "Mensagem (editada)" in html and "Revisada." in html
    cliente.delete(_url(caso_id, mid), json={})
    html = cliente.get(f"/api/casos/{caso_id}/exportacao").get_data(as_text=True)
    assert "Mensagem apagada" in html and "Revisada." not in html
