"""Cabeçalhos de segurança, validação de Host e erros JSON nos dois portais."""
import sqlite3

import pytest

from app import create_coord_app, create_student_app
from app.config import Config

CSP = "default-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'"


@pytest.fixture
def clientes(config):
    aluno = create_student_app(config).test_client()
    coord = create_coord_app(config).test_client()
    return {"aluno": aluno, "coord": coord}


@pytest.mark.parametrize("portal", ["aluno", "coord"])
def test_cabecalhos_presentes_nos_dois_apps(clientes, portal):
    r = clientes[portal].get("/api/saude")
    assert r.status_code == 200
    assert r.headers["Content-Security-Policy"] == CSP
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    assert "Strict-Transport-Security" not in r.headers


@pytest.mark.parametrize("portal,metodo,caminho,status", [
    ("aluno", "get", "/api/casos", 404),
    ("aluno", "get", "/qualquer/rota", 404),  # SPA sem build
    ("aluno", "post", "/api/acompanhar", 404),  # código ausente
    ("coord", "get", "/api/casos", 401),
    ("coord", "post", "/api/denuncias", 404),
    ("coord", "post", "/api/login", 415),  # corpo que não é JSON
])
def test_nosniff_em_toda_resposta(clientes, portal, metodo, caminho, status, tmp_path):
    # "sem build" de verdade: o build.ps1 gera app/static antes dos testes
    clientes[portal].application.config["SI_STATIC"] = tmp_path / "sem-build"
    r = getattr(clientes[portal], metodo)(caminho)
    assert r.status_code == status
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Content-Security-Policy"] == CSP


@pytest.mark.parametrize("portal", ["aluno", "coord"])
def test_hsts_somente_com_https_encaminhado(clientes, portal):
    c = clientes[portal]
    assert "Strict-Transport-Security" not in c.get("/api/saude").headers
    r = c.get("/api/saude", headers={"X-Forwarded-Proto": "http"})
    assert "Strict-Transport-Security" not in r.headers
    r = c.get("/api/saude", headers={"X-Forwarded-Proto": "https"})
    assert r.headers["Strict-Transport-Security"] == "max-age=31536000"
    # proxy encadeado: vale o primeiro valor
    r = c.get("/api/saude", headers={"X-Forwarded-Proto": "HTTPS, http"})
    assert r.headers["Strict-Transport-Security"] == "max-age=31536000"


@pytest.mark.parametrize("fabrica", [create_student_app, create_coord_app])
def test_host_invalido_400_quando_configurado(tmp_path, fabrica):
    config = Config(data_dir=tmp_path, secret_key="k",
                    allowed_hosts=("denuncia.escola.br",))
    c = fabrica(config).test_client()
    r = c.get("/api/saude", headers={"Host": "atacante.example"})
    assert r.status_code == 400
    assert r.is_json and r.get_json() == {"erro": "host invalido"}
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    # sem diferenciar maiúsculas e ignorando a porta
    for host in ("denuncia.escola.br", "Denuncia.Escola.BR:443"):
        assert c.get("/api/saude", headers={"Host": host}).status_code == 200
    # subdomínio ou sufixo parecido não passam
    for host in ("x.denuncia.escola.br", "denuncia.escola.br.atacante.example", ""):
        assert c.get("/api/saude", headers={"Host": host}).status_code == 400


def test_lista_de_hosts_vazia_libera(clientes):
    r = clientes["aluno"].get("/api/saude", headers={"Host": "qualquer.example"})
    assert r.status_code == 200


def test_allowed_hosts_vem_do_config_json(tmp_path):
    from app.config import load_config

    (tmp_path / "config.json").write_text(
        '{"allowed_hosts": ["denuncia.escola.br"]}', encoding="utf-8"
    )
    c = create_student_app(load_config(tmp_path)).test_client()
    assert c.get("/api/saude", headers={"Host": "outro.example"}).status_code == 400
    assert c.get("/api/saude", headers={"Host": "denuncia.escola.br"}).status_code == 200


@pytest.mark.parametrize("portal", ["aluno", "coord"])
def test_api_sem_cache(clientes, portal):
    c = clientes[portal]
    assert c.get("/api/saude").headers["Cache-Control"] == "no-store"
    assert c.get("/api/inexistente").headers["Cache-Control"] == "no-store"


def test_anexo_mantem_cache_control_e_disposition(coord_logado, config):
    from app import casos
    from app.db import connect
    from app.uploads import salvar_anexo

    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
           b"\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")
    anexo = salvar_anexo(config, png)
    conn = connect(config)
    try:
        casos.criar_caso(conn, config, {"tipo": "outro", "relato": "relato de teste"},
                         [anexo])
        caso_id, anexo_id = conn.execute(
            "SELECT caso_id, id FROM anexos").fetchone()
    finally:
        conn.close()
    r = coord_logado.get(f"/api/casos/{caso_id}/anexos/{anexo_id}")
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "private, no-store"
    assert r.headers["Content-Disposition"].startswith("inline; filename=")
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_nosniff_em_405_413_e_500(clientes, monkeypatch):
    from app import casos

    r = clientes["aluno"].post("/qualquer/rota")  # SPA só aceita GET
    assert r.status_code == 405
    assert r.headers["X-Content-Type-Options"] == "nosniff"

    grande = b"x" * (1024 * 1024 + 1)  # acima do limite da coordenação
    r = clientes["coord"].post("/api/login", data=grande,
                               content_type="application/json")
    assert r.status_code == 413
    assert r.headers["X-Content-Type-Options"] == "nosniff"

    def quebrado(*a, **k):
        raise RuntimeError("falha inesperada")

    monkeypatch.setattr(casos, "caso_por_codigo", quebrado)
    r = clientes["aluno"].post("/api/acompanhar", json={"codigo": "ABCD-EFGH"})
    assert r.status_code == 500
    assert r.get_json() == {"erro": "erro interno"}
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Content-Security-Policy"] == CSP


def test_banco_ocupado_vira_503_no_aluno(clientes, monkeypatch):
    from app import casos

    def travado(*a, **k):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(casos, "caso_por_codigo", travado)
    r = clientes["aluno"].post("/api/acompanhar", json={"codigo": "ABCD-EFGH"})
    assert r.status_code == 503
    assert r.get_json() == {"erro": "servidor ocupado"}
    assert r.headers["X-Content-Type-Options"] == "nosniff"
