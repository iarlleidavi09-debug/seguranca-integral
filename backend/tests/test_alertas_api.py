"""API de preferências de alerta: papéis e validação."""
from __future__ import annotations

import pytest

from app import create_coord_app, notificacoes
from app.auth import criar_usuario
from app.db import connect

from conftest import SENHA_COORD


@pytest.fixture(autouse=True)
def _limpa():
    yield
    notificacoes.reiniciar_registro()


def _login(app, nome):
    c = app.test_client()
    assert c.post("/api/login", json={"nome": nome, "senha": SENHA_COORD}).status_code == 200
    return c


@pytest.fixture
def duas_contas(config):
    app = create_coord_app(config, limites={"login": (1000, 600)})
    conn = connect(config)
    admin_id = criar_usuario(conn, "chefe", SENHA_COORD, "admin")
    coord_id = criar_usuario(conn, "mara", SENHA_COORD, "coordenador")
    conn.close()
    return _login(app, "chefe"), _login(app, "mara"), admin_id, coord_id


def test_exige_sessao(coord_client):
    assert coord_client.get("/api/alertas").status_code == 401


def test_coordenador_so_ve_as_proprias_preferencias(duas_contas):
    _, mara, _, _ = duas_contas
    corpo = mara.get("/api/alertas").get_json()
    assert "usuarios" not in corpo
    assert corpo["configurado"] is False
    assert corpo["minhas"] == {"critico": False, "recorrencia": False, "resumo": False, "tem_email": False}


def test_admin_ve_lista_e_define_email(duas_contas):
    chefe, mara, _, coord_id = duas_contas
    r = chefe.post(f"/api/alertas/usuarios/{coord_id}/email", json={"email": " mara@escola.example "})
    assert r.status_code == 200 and r.get_json()["email"] == "mara@escola.example"
    usuarios = {u["nome"]: u for u in chefe.get("/api/alertas").get_json()["usuarios"]}
    assert usuarios["mara"]["email"] == "mara@escola.example"
    assert mara.get("/api/alertas").get_json()["minhas"]["tem_email"] is True
    # vazio limpa o endereço
    assert chefe.post(f"/api/alertas/usuarios/{coord_id}/email", json={"email": ""}).status_code == 200
    assert mara.get("/api/alertas").get_json()["minhas"]["tem_email"] is False


def test_coordenador_nao_define_email_de_ninguem(duas_contas):
    _, mara, admin_id, coord_id = duas_contas
    for alvo in (admin_id, coord_id):
        r = mara.post(f"/api/alertas/usuarios/{alvo}/email", json={"email": "x@escola.example"})
        assert r.status_code == 403


@pytest.mark.parametrize("email", ["a@b.example\nBcc: x@y.example", "sem-arroba", "a b@c.example", 5, None])
def test_email_invalido_e_recusado(duas_contas, email):
    chefe, _, _, coord_id = duas_contas
    assert chefe.post(f"/api/alertas/usuarios/{coord_id}/email", json={"email": email}).status_code == 400


def test_email_de_usuario_inexistente(duas_contas):
    chefe, *_ = duas_contas
    assert chefe.post("/api/alertas/usuarios/9999/email", json={"email": "a@b.example"}).status_code == 404


def test_cada_um_salva_as_proprias_preferencias(duas_contas):
    chefe, mara, _, _ = duas_contas
    r = mara.post("/api/alertas/preferencias", json={"critico": True, "recorrencia": False, "resumo": True})
    assert r.status_code == 200 and r.get_json()["critico"] is True
    assert chefe.get("/api/alertas").get_json()["minhas"]["critico"] is False
    lista = {u["nome"]: u for u in chefe.get("/api/alertas").get_json()["usuarios"]}
    assert lista["mara"]["critico"] is True and lista["mara"]["resumo"] is True


@pytest.mark.parametrize("corpo", [{}, {"critico": True}, {"critico": 1, "recorrencia": False, "resumo": False},
                                    {"critico": True, "recorrencia": True, "resumo": True, "extra": 1}])
def test_preferencias_invalidas(duas_contas, corpo):
    _, mara, _, _ = duas_contas
    assert mara.post("/api/alertas/preferencias", json=corpo).status_code == 400


def test_preferencias_exigem_json(duas_contas):
    _, mara, _, _ = duas_contas
    assert mara.post("/api/alertas/preferencias", data="critico=1").status_code == 415


def test_get_nao_vaza_senha_smtp(config, tmp_path):
    from app.config import Config
    c = Config(data_dir=config.data_dir, secret_key="k", alertas={
        "smtp": {"host": "h", "porta": 25, "seguranca": "nenhuma", "usuario": "u",
                 "senha": "SEGREDO-123", "remetente": "a@b.example"},
        "link_painel": "", "resumo_hora": "08:00"})
    app = create_coord_app(c, limites={"login": (1000, 600)})
    conn = connect(c)
    criar_usuario(conn, "chefe", SENHA_COORD, "admin")
    conn.close()
    resposta = _login(app, "chefe").get("/api/alertas")
    assert resposta.get_json()["configurado"] is True
    assert "SEGREDO-123" not in resposta.get_data(as_text=True)
