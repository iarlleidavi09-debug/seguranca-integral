"""Remoção definitiva de contas pelo administrador (DELETE /api/usuarios/<id>)."""
import pytest

from app.auth import criar_usuario, desativar_usuario, remover_usuario
from app.casos import criar_caso
from app.db import connect

from conftest import SENHA_COORD

RELATO = "Um colega esta me xingando todos os dias no grupo da turma."


def _consulta(config, sql, params=()):
    c = connect(config)
    try:
        return c.execute(sql, params).fetchall()
    finally:
        c.close()


def _novo(config, nome, papel="coordenador"):
    c = connect(config)
    try:
        return criar_usuario(c, nome, SENHA_COORD, papel)
    finally:
        c.close()


def _id(config, nome):
    return _consulta(config, "SELECT id FROM usuarios WHERE nome = ?", (nome,))[0][0]


def _caso_com_historico(config, usuario_id):
    """Cria um caso com mensagem, nota, evento e leitura ligados ao usuário."""
    c = connect(config)
    try:
        criar_caso(c, config, {"tipo": "cyberbullying", "relato": RELATO, "anonimo": True}, [])
        caso_id = c.execute("SELECT MAX(id) FROM casos").fetchone()[0]
        c.execute("INSERT INTO mensagens (caso_id, autor, texto, criado_em, usuario_id) "
                  "VALUES (?, 'coordenacao', 'oi', '2026-01-01T00:00:00+00:00', ?)",
                  (caso_id, usuario_id))
        c.execute("INSERT INTO notas_internas (caso_id, usuario_id, texto, criado_em) "
                  "VALUES (?, ?, 'n', '2026-01-01T00:00:00+00:00')", (caso_id, usuario_id))
        c.execute("INSERT INTO eventos (caso_id, tipo, usuario_id, criado_em) "
                  "VALUES (?, 'x', ?, '2026-01-01T00:00:00+00:00')", (caso_id, usuario_id))
        c.execute("INSERT INTO leituras_conversa (caso_id, usuario_id, ultimo_id) VALUES (?, ?, 1)",
                  (caso_id, usuario_id))
        c.execute("UPDATE casos SET ultimo_acesso_por = ?, responsavel_id = ? WHERE id = ?",
                  (usuario_id, usuario_id, caso_id))
        c.commit()
        return caso_id
    finally:
        c.close()


def test_remove_conta_e_preserva_historico(coord_logado, config):
    alvo = _novo(config, "Ana")
    caso_id = _caso_com_historico(config, alvo)

    r = coord_logado.delete(f"/api/usuarios/{alvo}", json={})

    assert r.status_code == 200 and r.get_json() == {"ok": True}
    assert _consulta(config, "SELECT 1 FROM usuarios WHERE id = ?", (alvo,)) == []
    assert _consulta(config, "SELECT usuario_id FROM mensagens WHERE caso_id = ?", (caso_id,))[0][0] is None
    assert _consulta(config, "SELECT usuario_id FROM notas_internas WHERE caso_id = ?", (caso_id,))[0][0] is None
    assert _consulta(config, "SELECT usuario_id FROM eventos WHERE caso_id = ? AND tipo = 'x'", (caso_id,))[0][0] is None
    assert _consulta(config, "SELECT COUNT(*) FROM leituras_conversa WHERE caso_id = ?", (caso_id,))[0][0] == 0
    caso = _consulta(config, "SELECT ultimo_acesso_por, responsavel_id FROM casos WHERE id = ?", (caso_id,))[0]
    assert tuple(caso) == (None, None)
    lista = coord_logado.get("/api/usuarios").get_json()["usuarios"]
    assert all(u["id"] != alvo for u in lista)


def test_conta_ativa_removida_perde_a_sessao(coord_logado, coord_app, config):
    alvo = _novo(config, "Bia")
    outro = coord_app.test_client()
    assert outro.post("/api/login", json={"nome": "Bia", "senha": SENHA_COORD}).status_code == 200
    assert coord_logado.delete(f"/api/usuarios/{alvo}", json={}).status_code == 200
    assert outro.get("/api/eu").status_code == 401
    assert outro.post("/api/login", json={"nome": "Bia", "senha": SENHA_COORD}).status_code == 401


def test_nome_pode_ser_reusado_depois_da_remocao(coord_logado, config):
    alvo = _novo(config, "Cid")
    assert coord_logado.delete(f"/api/usuarios/{alvo}", json={}).status_code == 200
    r = coord_logado.post("/api/usuarios", json={"nome": "Cid", "senha": SENHA_COORD})
    assert r.status_code == 201


def test_remove_conta_ja_desativada(coord_logado, config):
    alvo = _novo(config, "Dani")
    c = connect(config)
    try:
        desativar_usuario(c, alvo)
    finally:
        c.close()
    assert coord_logado.delete(f"/api/usuarios/{alvo}", json={}).status_code == 200
    assert _consulta(config, "SELECT 1 FROM usuarios WHERE id = ?", (alvo,)) == []


def test_inexistente_da_404(coord_logado):
    assert coord_logado.delete("/api/usuarios/9999", json={}).status_code == 404


def test_nao_remove_a_propria_conta(coord_logado, config):
    meu = _id(config, "coord")
    r = coord_logado.delete(f"/api/usuarios/{meu}", json={})
    assert r.status_code == 400
    assert _consulta(config, "SELECT 1 FROM usuarios WHERE id = ?", (meu,))


def test_nao_remove_o_primeiro_administrador(coord_logado, config):
    outro_admin = _novo(config, "Admin2", "admin")
    c = coord_logado.application.test_client()
    assert c.post("/api/login", json={"nome": "Admin2", "senha": SENHA_COORD}).status_code == 200
    primeiro = _id(config, "coord")
    r = c.delete(f"/api/usuarios/{primeiro}", json={})
    assert r.status_code == 400
    assert _consulta(config, "SELECT 1 FROM usuarios WHERE id = ?", (primeiro,))
    assert outro_admin


def test_nao_remove_o_ultimo_administrador_ativo(coord_logado, config):
    # o primeiro admin está desativado; Admin2 é o único ativo e Admin3 tenta removê-lo
    # (Admin3 também é admin ativo, então primeiro cria-se o cenário com 2 ativos e um alvo)
    a2 = _novo(config, "Admin2", "admin")
    c = connect(config)
    try:
        assert remover_usuario(c, a2, atual_id=_id(config, "coord")) == "ok"
        # sobra só 'coord' ativo; nenhum outro admin ativo pode ser alvo,
        # então testa a regra direto na camada de dados
        a3 = criar_usuario(c, "Admin3", SENHA_COORD, "admin")
        desativar_usuario(c, _id(config, "coord"))
        assert remover_usuario(c, a3, atual_id=_id(config, "coord")) == "ultimo_admin"
    finally:
        c.close()


def test_remover_exige_json_e_so_admin(coord_logado, config):
    from app.auth import criar_usuario as _cu

    c = connect(config)
    try:
        _cu(c, "comum", SENHA_COORD)
    finally:
        c.close()
    cliente = coord_logado.application.test_client()
    assert cliente.post("/api/login", json={"nome": "comum", "senha": SENHA_COORD}).status_code == 200
    alvo = _id(config, "comum")
    r = cliente.delete(f"/api/usuarios/{alvo}", json={})
    assert r.status_code == 403
    assert r.get_json() == {"erro": "apenas administrador"}


def test_sem_login_da_401(coord_client):
    assert coord_client.delete("/api/usuarios/1", json={}).status_code == 401
