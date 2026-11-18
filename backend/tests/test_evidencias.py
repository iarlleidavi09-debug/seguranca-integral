import hashlib
import re
import shutil
import sqlite3

import pytest

from app.auth import criar_usuario
from app.casos import criar_caso
from app.db import connect, init_db
from app.uploads import salvar_anexo
from conftest import SENHA_COORD
from imagens import gif, jpeg, png, webp_simples

RELATO = "Texto sigiloso do relato que nao pode ir ao dossie."


def _caso(config, anexos=()):
    c = connect(config)
    try:
        salvos = [salvar_anexo(config, d) for d in anexos]
        criar_caso(c, config, {"tipo": "cyberbullying", "relato": RELATO, "anonimo": True}, salvos)
        return c.execute("SELECT MAX(id) FROM casos").fetchone()[0]
    finally:
        c.close()


@pytest.mark.parametrize("dados", [png(), jpeg(), gif(), webp_simples()])
def test_hash_confere_com_arquivo_gravado(config, dados):
    salvo = salvar_anexo(config, dados)
    gravado = (config.uploads_dir / salvo.nome_interno).read_bytes()
    assert salvo.sha256 == hashlib.sha256(gravado).hexdigest()
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT.*", salvo.recebido_em)


def test_hash_e_do_conteudo_limpo(config):
    sujo = jpeg(extra=None) if False else jpeg()
    salvo = salvar_anexo(config, sujo)
    assert salvo.sha256 == hashlib.sha256(
        (config.uploads_dir / salvo.nome_interno).read_bytes()).hexdigest()


def test_caso_grava_hash_e_data(config, conn):
    cid = _caso(config, [png()])
    c = connect(config)
    a = c.execute("SELECT sha256, recebido_em FROM anexos WHERE caso_id=?", (cid,)).fetchone()
    c.close()
    assert len(a["sha256"]) == 64 and a["recebido_em"]


def test_migracao_legado_sem_hash_com_backup_e_idempotente(config):
    # banco antigo: tabela anexos sem as colunas novas
    init_db(config)
    cid = _caso(config, [png()])
    c = connect(config)
    c.execute("DROP TRIGGER acessos_anexo_sem_update")
    c.execute("DROP TABLE acessos_anexo")
    c.execute("ALTER TABLE anexos DROP COLUMN sha256")
    c.execute("ALTER TABLE anexos DROP COLUMN recebido_em")
    c.commit()
    c.close()
    init_db(config)
    assert (config.db_path.parent / (config.db_path.name + ".pre-evidencias.bak")).is_file()
    c = connect(config)
    a = c.execute("SELECT sha256, recebido_em FROM anexos WHERE caso_id=?", (cid,)).fetchone()
    assert a["sha256"] is None and a["recebido_em"] is None
    c.close()
    init_db(config)  # segunda vez não falha


def test_registro_de_acesso_e_imutavel_no_banco(config, conn):
    cid = _caso(config, [png()])
    uid = criar_usuario(conn, "u", SENHA_COORD, "coordenador")
    from app import evidencias
    evidencias.registrar_acesso(conn, cid, 1, uid, "visualizar")
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("UPDATE acessos_anexo SET acao='exportar'")
    # exclusão do caso continua apagando em cascata
    conn.execute("DELETE FROM casos WHERE id=?", (cid,))
    assert conn.execute("SELECT COUNT(*) FROM acessos_anexo").fetchone()[0] == 0


def test_visualizar_anexo_registra_acesso(config, coord_logado):
    cid = _caso(config, [png()])
    assert coord_logado.get(f"/api/casos/{cid}/anexos/1").status_code == 200
    c = connect(config)
    linhas = c.execute("SELECT acao, usuario_id, caso_id FROM acessos_anexo").fetchall()
    c.close()
    assert [(l["acao"], l["caso_id"]) for l in linhas] == [("visualizar", cid)]


@pytest.mark.parametrize("metodo", ["put", "patch", "delete", "post"])
def test_sem_rota_para_editar_acessos(config, coord_logado, metodo):
    cid = _caso(config, [png()])
    for caminho in (f"/api/casos/{cid}/acessos", f"/api/casos/{cid}/acessos/1",
                    f"/api/casos/{cid}/anexos/1", f"/api/casos/{cid}/integridade"):
        r = getattr(coord_logado, metodo)(caminho, json={})
        assert r.status_code in (404, 405)
    c = connect(config)
    c.execute("SELECT 1")
    c.close()


def test_integridade_detecta_divergencia_e_legado(config, coord_logado):
    cid = _caso(config, [png(), png()])
    c = connect(config)
    nomes = [l["nome_interno"] for l in c.execute("SELECT nome_interno FROM anexos ORDER BY id")]
    c.execute("UPDATE anexos SET sha256=NULL, recebido_em=NULL WHERE id=2")
    c.commit()
    c.close()
    (config.uploads_dir / nomes[0]).write_bytes(b"adulterado")
    r = coord_logado.get(f"/api/casos/{cid}/integridade").get_json()
    assert [a["estado"] for a in r["anexos"]] == ["divergente", "sem_registro"]
    assert r["anexos"][1]["recebido_em"] is None


def _cliente_coordenador(coord_app, config, cid, responsavel):
    c = connect(config)
    uid = criar_usuario(c, "outro", SENHA_COORD, "coordenador")
    if responsavel:
        c.execute("UPDATE casos SET responsavel_id=? WHERE id=?", (uid, cid))
        c.commit()
    c.close()
    cli = coord_app.test_client()
    assert cli.post("/api/login", json={"nome": "outro", "senha": SENHA_COORD}).status_code == 200
    return cli


def test_dossie_admin_pdf_sem_relato_e_com_acessos(config, coord_logado):
    cid = _caso(config, [png()])
    coord_logado.get(f"/api/casos/{cid}/anexos/1")
    r = coord_logado.get(f"/api/casos/{cid}/dossie")
    assert r.status_code == 200 and r.mimetype == "application/pdf"
    assert r.data.startswith(b"%PDF-1.4") and r.data.rstrip().endswith(b"%%EOF")
    texto = r.data.decode("latin-1")
    assert "REGISTRO DE INTEGRIDADE" in texto and "constitui prova legal" in texto
    assert "Texto sigiloso" not in texto
    assert hashlib.sha256(
        (config.uploads_dir / _nome(config, 1)).read_bytes()).hexdigest() in texto
    assert "visualizou o anexo 1" in texto and "exportou o anexo 1" in texto
    assert r.headers["Cache-Control"] == "private, no-store"


def _nome(config, aid):
    c = connect(config)
    n = c.execute("SELECT nome_interno FROM anexos WHERE id=?", (aid,)).fetchone()[0]
    c.close()
    return n


def test_dossie_sinaliza_divergencia(config, coord_logado):
    cid = _caso(config, [png()])
    (config.uploads_dir / _nome(config, 1)).write_bytes(b"x")
    assert "DIVERGENTE" in coord_logado.get(f"/api/casos/{cid}/dossie").data.decode("latin-1")


def test_dossie_permissao(config, coord_app, coord_logado):
    cid = _caso(config)
    cli = _cliente_coordenador(coord_app, config, cid, responsavel=False)
    assert cli.get(f"/api/casos/{cid}/dossie").status_code == 403
    assert cli.get(f"/api/casos/{cid}/integridade").get_json()["pode_exportar"] is False
    c = connect(config)
    uid = c.execute("SELECT id FROM usuarios WHERE nome='outro'").fetchone()[0]
    c.execute("UPDATE casos SET responsavel_id=? WHERE id=?", (uid, cid))
    c.commit()
    c.close()
    assert cli.get(f"/api/casos/{cid}/dossie").status_code == 200
    assert coord_logado.get("/api/casos/999/dossie").status_code == 404


def test_dossie_sem_login_401(config, coord_client):
    cid = _caso(config)
    assert coord_client.get(f"/api/casos/{cid}/dossie").status_code == 401
    assert coord_client.get(f"/api/casos/{cid}/integridade").status_code == 401


def test_pdf_neutraliza_caracteres_de_controle():
    from app.evidencias import gerar_pdf
    pdf = gerar_pdf(["nome\r\n) Tj ET (injetado\x00"])
    assert b"\r\n) Tj" not in pdf and b"\\) Tj" in pdf


def test_pdf_escapa_parenteses_e_acentos():
    from app.evidencias import gerar_pdf
    pdf = gerar_pdf(["a (b) \\ ção"] * 200)
    assert pdf.count(b"/Type /Page ") >= 2 and b"\\(b\\)" in pdf and b"\\\\" in pdf
