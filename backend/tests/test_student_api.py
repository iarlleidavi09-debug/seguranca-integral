"""Testes da API do aluno (porta 3000)."""
import io
import json
import re
import threading

from app import create_student_app
from app.db import connect

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
RELATO = "Um colega esta me xingando todos os dias no grupo da turma."


def _dados(**extra):
    base = {
        "tipo": "cyberbullying",
        "relato": RELATO,
        "quando": "ontem",
        "onde": "grupo de WhatsApp",
        "em_andamento": "false",
        "anonimo": "true",
    }
    base.update(extra)
    return base


def _enviar(client, anexos=None, headers=None, **extra):
    dados = _dados(**extra)
    if anexos:
        dados["anexos[]"] = anexos
    return client.post(
        "/api/denuncias", data=dados, content_type="multipart/form-data",
        headers=headers,
    )


def _linha_caso(config):
    c = connect(config)
    try:
        return c.execute("SELECT * FROM casos ORDER BY id DESC").fetchone()
    finally:
        c.close()


def _contar(config, tabela):
    c = connect(config)
    try:
        return c.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0]
    finally:
        c.close()


def test_denuncia_anonima_retorna_codigo(student_client):
    r = _enviar(student_client)
    assert r.status_code == 201
    assert re.fullmatch(r"[A-Z0-9]{4}-[A-Z0-9]{4}", r.get_json()["codigo"])


def test_denuncia_anonima_nao_grava_nome_turma_nem_ip(student_client, config):
    r = student_client.post(
        "/api/denuncias",
        data=_dados(nome="Maria Silva", turma="9A"),
        content_type="multipart/form-data",
        headers={"CF-Connecting-IP": "203.0.113.77"},
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert r.status_code == 201
    linha = _linha_caso(config)
    assert linha["nome"] is None and linha["turma"] is None
    c = connect(config)
    try:
        tabelas = [
            t[0] for t in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
        for tabela in tabelas:
            for reg in c.execute(f"SELECT * FROM {tabela}").fetchall():
                for v in tuple(reg):
                    texto = str(v)
                    assert "Maria" not in texto and "9A" not in texto
                    assert "203.0.113.77" not in texto
                    assert "127.0.0.1" not in texto
    finally:
        c.close()


def test_schema_nao_tem_coluna_com_semantica_de_ip(config, student_client):
    c = connect(config)
    try:
        tabelas = [
            r[0] for r in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
        assert tabelas
        for tabela in tabelas:
            for col in c.execute(f"PRAGMA table_info({tabela})").fetchall():
                nome = col["name"].lower()
                assert not re.search(
                    r"(^|_)ip(_|$)|ipv|endereco|address|addr|remote|client|host|origem",
                    nome,
                ), f"{tabela}.{nome}"
    finally:
        c.close()


def test_denuncia_identificada_grava_nome_turma(student_client, config):
    r = _enviar(student_client, anonimo="false", nome="Maria Silva", turma="9A")
    assert r.status_code == 201
    linha = _linha_caso(config)
    assert linha["nome"] == "Maria Silva" and linha["turma"] == "9A"
    assert linha["anonimo"] == 0


def test_identificada_sem_nome_400(student_client):
    assert _enviar(student_client, anonimo="false", nome="  ").status_code == 400


def test_triagem_gravada_com_motivos(student_client, config):
    r = _enviar(
        student_client,
        tipo="ameaca",
        relato="Ele disse que vai me matar na saida da escola hoje.",
        em_andamento="true",
    )
    assert r.status_code == 201
    linha = _linha_caso(config)
    assert linha["gravidade"] == "alta"
    motivos = json.loads(linha["motivos_json"])
    assert "tipo: ameaca" in motivos and "ocorrendo agora" in motivos
    c = connect(config)
    try:
        ev = c.execute(
            "SELECT tipo FROM eventos WHERE caso_id=?", (linha["id"],)
        ).fetchall()
    finally:
        c.close()
    assert [e["tipo"] for e in ev] == ["criado"]


def test_acompanhar_com_codigo_em_minusculas_sem_hifen(student_client):
    codigo = _enviar(student_client).get_json()["codigo"]
    digitado = codigo.replace("-", "").lower()
    r = student_client.post("/api/acompanhar", json={"codigo": f" {digitado} "})
    assert r.status_code == 200
    corpo = r.get_json()
    assert corpo["status"] == "novo" and corpo["mensagens"] == []


def test_codigo_invalido_e_inexistente_mesma_resposta(student_client):
    a = student_client.post("/api/acompanhar", json={"codigo": "lixo"})
    b = student_client.post("/api/acompanhar", json={"codigo": "AAAA-AAAA"})
    c = student_client.post("/api/acompanhar", json={})
    d = student_client.post(
        "/api/acompanhar/mensagens", json={"codigo": "AAAA-AAAA", "texto": "oi"}
    )
    for r in (a, b, c, d):
        assert r.status_code == 404
        assert r.get_data() == a.get_data()
        assert r.get_json() == {"erro": "codigo nao encontrado"}


def test_aluno_envia_mensagem_e_ve_resposta_da_coordenacao(student_client, config):
    from app.casos import adicionar_mensagem

    codigo = _enviar(student_client).get_json()["codigo"]
    r = student_client.post(
        "/api/acompanhar/mensagens",
        json={"codigo": codigo, "texto": "Tem mais um detalhe"},
    )
    assert r.status_code == 201
    linha = _linha_caso(config)
    c = connect(config)
    try:
        adicionar_mensagem(c, linha["id"], "coordenacao", "Obrigado, estamos cuidando.")
    finally:
        c.close()
    msgs = student_client.post(
        "/api/acompanhar", json={"codigo": codigo}
    ).get_json()["mensagens"]
    assert [(m["autor"], m["texto"]) for m in msgs] == [
        ("aluno", "Tem mais um detalhe"),
        ("coordenacao", "Obrigado, estamos cuidando."),
    ]
    assert all(m["criado_em"] for m in msgs)


def test_mensagem_vazia_ou_longa_400(student_client):
    codigo = _enviar(student_client).get_json()["codigo"]
    for texto in ("   ", "x" * 2001, 5):
        r = student_client.post(
            "/api/acompanhar/mensagens", json={"codigo": codigo, "texto": texto}
        )
        assert r.status_code == 400


def test_nota_interna_nunca_aparece(student_client, config):
    codigo = _enviar(student_client).get_json()["codigo"]
    linha = _linha_caso(config)
    c = connect(config)
    try:
        c.execute(
            "INSERT INTO notas_internas (caso_id, usuario_id, texto, criado_em) "
            "VALUES (?, NULL, 'SEGREDO INTERNO', '2026-01-01T00:00:00+00:00')",
            (linha["id"],),
        )
        c.commit()
    finally:
        c.close()
    r = student_client.post("/api/acompanhar", json={"codigo": codigo})
    assert "SEGREDO" not in r.get_data(as_text=True)


def test_anexo_png_aceito(student_client, config):
    r = _enviar(student_client, anexos=(io.BytesIO(PNG), "foto.png"))
    assert r.status_code == 201
    assert r.get_json().get("anexos_recusados", []) == []
    assert _contar(config, "anexos") == 1
    assert len(list(config.uploads_dir.iterdir())) == 1


def test_anexo_falso_rejeitado_e_denuncia_nao_se_perde(student_client, config):
    falso = (io.BytesIO(b"<html><script>alert(1)</script></html>"), "foto.png")
    r = _enviar(student_client, anexos=[falso, (io.BytesIO(PNG), "ok.png")])
    assert r.status_code == 201
    corpo = r.get_json()
    assert corpo["codigo"]
    assert len(corpo["anexos_recusados"]) == 1
    assert corpo["anexos_recusados"][0]["nome"] == "foto.png"
    assert corpo["anexos_recusados"][0]["motivo"]
    assert _linha_caso(config) is not None
    assert _contar(config, "anexos") == 1


def test_anexo_vazio_rejeitado(student_client, config):
    r = _enviar(student_client, anexos=(io.BytesIO(b""), "vazio.png"))
    assert r.status_code == 201
    assert r.get_json()["anexos_recusados"][0]["motivo"] == "arquivo vazio"
    assert _contar(config, "anexos") == 0


def test_anexo_grande_demais_recusado(student_client, config):
    grande = io.BytesIO(PNG + b"\x00" * (5 * 1024 * 1024))
    r = _enviar(student_client, anexos=(grande, "grande.png"))
    assert r.status_code == 201
    assert len(r.get_json()["anexos_recusados"]) == 1
    assert _contar(config, "anexos") == 0


def test_mais_de_5_anexos_400(student_client, config):
    anexos = [(io.BytesIO(PNG), f"{i}.png") for i in range(6)]
    r = _enviar(student_client, anexos=anexos)
    assert r.status_code == 400
    assert _linha_caso(config) is None


def test_relato_curto_400(student_client):
    assert _enviar(student_client, relato="curto").status_code == 400
    assert _enviar(student_client, relato="x" * 5001).status_code == 400


def test_tipo_invalido_400(student_client):
    assert _enviar(student_client, tipo="inventado").status_code == 400


def test_limite_de_envios_429(config):
    app = create_student_app(
        config, limites={"denuncias": (2, 600), "consultas": (3, 600)}
    )
    client = app.test_client()
    assert _enviar(client).status_code == 201
    assert _enviar(client).status_code == 201
    assert _enviar(client).status_code == 429
    for _ in range(3):
        assert client.post("/api/acompanhar", json={"codigo": "x"}).status_code == 404
    assert client.post("/api/acompanhar", json={"codigo": "x"}).status_code == 429


def test_limite_por_cliente_usa_cf_connecting_ip_via_loopback(config):
    app = create_student_app(
        config, limites={"denuncias": (1, 600), "consultas": (3, 600)}
    )
    client = app.test_client()
    a = {"CF-Connecting-IP": "203.0.113.1"}
    b = {"CF-Connecting-IP": "203.0.113.2"}
    assert _enviar(client, headers=a).status_code == 201
    assert _enviar(client, headers=a).status_code == 429
    assert _enviar(client, headers=b).status_code == 201


def test_envios_concorrentes_nao_perdem_denuncia(config, student_client):
    resultados = []

    def enviar():
        try:
            resultados.append(_enviar(student_client).status_code)
        except Exception as erro:  # noqa: BLE001
            resultados.append(repr(erro))

    threads = [threading.Thread(target=enviar) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert resultados == [201] * 20
    assert _contar(config, "casos") == 20


def test_porta_do_aluno_nao_tem_rotas_da_coordenacao(student_client):
    for caminho in ("/api/casos", "/api/login", "/api/qualquer"):
        r = student_client.get(caminho)
        assert r.status_code == 404
        assert r.get_json() == {"erro": "nao encontrado"}
    assert student_client.post("/api/login", json={}).status_code == 404


def test_saude(student_client):
    assert student_client.get("/api/saude").get_json() == {"ok": True}


def test_spa_sem_build_devolve_404_sem_quebrar(student_client):
    assert student_client.get("/").status_code == 404
    assert student_client.get("/alguma/rota").status_code == 404


def test_log_de_acesso_nao_tem_ip_codigo_nem_relato(config, caplog):
    import logging

    app = create_student_app(
        config, limites={"denuncias": (100, 600), "consultas": (100, 600)}
    )
    client = app.test_client()
    caplog.set_level(logging.DEBUG)
    relato = "Relato secreto sobre o colega Fulano da turma."
    r = client.post(
        "/api/denuncias?x=1",
        data=_dados(relato=relato),
        content_type="multipart/form-data",
        headers={"CF-Connecting-IP": "203.0.113.77"},
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    codigo = r.get_json()["codigo"]
    client.post("/api/acompanhar", json={"codigo": codigo},
                environ_overrides={"REMOTE_ADDR": "198.51.100.9"})
    assert any("/api/denuncias" in m for m in caplog.messages)
    for m in caplog.messages:
        for proibido in ("203.0.113.77", "127.0.0.1", "198.51.100.9",
                         codigo, relato, "x=1"):
            assert proibido not in m


def test_cf_connecting_ip_ignorado_se_remoto_nao_e_loopback(student_client):
    from app.security import ip_do_cliente
    from flask import Flask, request

    app = Flask(__name__)
    cab = {"CF-Connecting-IP": "203.0.113.5"}
    with app.test_request_context(
        headers=cab, environ_overrides={"REMOTE_ADDR": "198.51.100.9"}
    ):
        assert ip_do_cliente(request) == "198.51.100.9"
    with app.test_request_context(
        headers=cab, environ_overrides={"REMOTE_ADDR": "127.0.0.1"}
    ):
        assert ip_do_cliente(request) == "203.0.113.5"


def test_413_devolve_json(config):
    app = create_student_app(config)
    app.config["MAX_CONTENT_LENGTH"] = 100
    r = app.test_client().post(
        "/api/denuncias", data=_dados(relato="x" * 500),
        content_type="multipart/form-data",
    )
    assert r.status_code == 413
    assert r.get_json() == {"erro": "envio grande demais"}


def test_405_devolve_json(student_client):
    for caminho in ("/", "/algo/qualquer"):
        r = student_client.post(caminho)
        assert r.status_code == 405
        assert r.get_json() == {"erro": "metodo nao permitido"}


def test_500_devolve_json_sem_detalhes_e_remove_anexos(config, monkeypatch):
    from app import casos

    def quebra(*a, **k):
        raise RuntimeError("detalhe interno")

    monkeypatch.setattr(casos, "criar_caso", quebra)
    app = create_student_app(config)
    r = _enviar(app.test_client(), anexos=(io.BytesIO(PNG), "a.png"))
    assert r.status_code == 500
    assert r.get_json() == {"erro": "erro interno"}
    assert "detalhe" not in r.get_data(as_text=True)
    assert list(config.uploads_dir.iterdir()) == []


def test_mensagem_e_evento_gravados_juntos(student_client, config):
    codigo = _enviar(student_client).get_json()["codigo"]
    student_client.post(
        "/api/acompanhar/mensagens", json={"codigo": codigo, "texto": "oi"}
    )
    c = connect(config)
    try:
        tipos = [e["tipo"] for e in c.execute("SELECT tipo FROM eventos ORDER BY id")]
    finally:
        c.close()
    assert tipos == ["criado", "mensagem_aluno"]
