"""Testes da API da coordenação (porta 4000)."""
import inspect
import sqlite3
import time

import pytest

from app import create_coord_app
from app.auth import criar_usuario
from app.casos import criar_caso
from app.db import connect
from app.uploads import salvar_anexo

from conftest import SENHA_COORD
from imagens import gif, png

PNG = png()
GIF = gif()
RELATO = "Um colega esta me xingando todos os dias no grupo da turma."
ERRO_LOGIN = {"erro": "nome ou senha invalidos"}
ERRO_404 = {"erro": "nao encontrado"}


def _caso(config, tipo="cyberbullying", prioridade=None, criado_em=None,
          status=None, anexos=(), relato=RELATO):
    """Cria um caso direto na camada de dados; devolve (id, codigo)."""
    c = connect(config)
    try:
        salvos = [salvar_anexo(config, dados) for dados in anexos]
        codigo = criar_caso(
            c, config, {"tipo": tipo, "relato": relato, "anonimo": True}, salvos
        )
        caso_id = c.execute("SELECT MAX(id) FROM casos").fetchone()[0]
        for campo, valor in (("prioridade", prioridade), ("criado_em", criado_em),
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
    ("get", "/api/resumo"),
    ("get", "/api/casos/1"),
    ("post", "/api/casos/1/status"),
    ("post", "/api/casos/1/prioridade"),
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

def test_fila_ordenada_por_prioridade_e_antiguidade(coord_logado, config):
    b_velho, _ = _caso(config, prioridade="baixa", criado_em="2026-01-01T08:00:00+00:00")
    a_novo, _ = _caso(config, prioridade="alta", criado_em="2026-01-03T08:00:00+00:00")
    m_velho, _ = _caso(config, prioridade="media", criado_em="2026-01-01T09:00:00+00:00")
    a_velho, _ = _caso(config, prioridade="alta", criado_em="2026-01-02T08:00:00+00:00")
    c_novo, _ = _caso(config, prioridade="critica", criado_em="2026-01-09T08:00:00+00:00")
    r = coord_logado.get("/api/casos")
    assert r.status_code == 200
    casos = r.get_json()["casos"]
    assert [c["id"] for c in casos] == [c_novo, a_velho, a_novo, m_velho, b_velho]
    assert all("codigo_hash" not in c for c in casos)
    assert all("prioridade" in c and "gravidade" not in c for c in casos)


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



# --- busca, filtro de prioridade, resumo e recorrencia ---------------------

def _ids(cli, qs):
    return [c["id"] for c in cli.get(f"/api/casos{qs}").get_json()["casos"]]


def test_filtro_por_prioridade(coord_logado, config):
    a, _ = _caso(config, prioridade="alta")
    b, _ = _caso(config, prioridade="baixa")
    assert _ids(coord_logado, "?prioridade=alta") == [a]
    assert _ids(coord_logado, "?prioridade=baixa") == [b]
    assert sorted(_ids(coord_logado, "?prioridade=")) == sorted([a, b])
    assert coord_logado.get("/api/casos?prioridade=xyz").status_code == 400


def test_busca_por_numero_e_por_texto(coord_logado, config):
    ids = [_caso(config, relato=f"Relato comum numero {i}")[0] for i in range(12)]
    alvo = _caso(config, relato="Fotos Intimas foram publicadas, não sei o que fazer")[0]
    assert ids[-1] in _ids(coord_logado, f"?q={ids[-1]}")
    assert 12 in _ids(coord_logado, "?q=12")
    assert _ids(coord_logado, "?q=fotos%20INTIMAS") == [alvo]
    assert _ids(coord_logado, "?q=naoexiste") == []
    assert len(_ids(coord_logado, "?q=")) == 13
    assert len(_ids(coord_logado, "")) == 13


def test_busca_trata_curingas_como_texto(coord_logado, config):
    com, _ = _caso(config, relato="Pediram 100% do dinheiro")
    sub, _ = _caso(config, relato="Mandaram a_b no grupo")
    barra, _ = _caso(config, relato="Caminho C:\\pasta secreta")
    _caso(config, relato="Relato sem nada especial")
    assert _ids(coord_logado, "?q=100%25") == [com]
    assert _ids(coord_logado, "?q=%25") == [com]  # so o caso que tem % literal
    assert _ids(coord_logado, "?q=a_b") == [sub]
    assert _ids(coord_logado, "?q=a_") == [sub]
    assert _ids(coord_logado, "?q=_") == [sub]
    assert _ids(coord_logado, "?q=C:%5Cpasta") == [barra]
    assert _ids(coord_logado, "?q=%27%20OR%201%3D1%20--") == []
    assert coord_logado.get("/api/casos?q=%27").status_code == 200


def test_busca_so_digitos_enorme_nao_estoura(coord_logado, config):
    caso_id, _ = _caso(config, relato="Relato qualquer")
    assert coord_logado.get("/api/casos?q=" + "9" * 30).get_json() == {"casos": []}
    assert _ids(coord_logado, "?q=" + "9" * 19) == []
    achado, _ = _caso(config, relato="Protocolo 99999999999999999999 anotado")
    assert _ids(coord_logado, "?q=99999999999999999999") == [achado]
    assert _ids(coord_logado, f"?q={caso_id}") == [caso_id]


def test_busca_ignora_maiusculas_e_acentos(coord_logado, config):
    alvo, _ = _caso(config, relato="FOTOS ÍNTIMAS foram publicadas")
    _caso(config, relato="Relato sem relação")
    for q in ("intimas", "ÍNTIMAS", "íntimas", "Intimas"):
        assert _ids(coord_logado, f"?q={q}") == [alvo], q
    agua, _ = _caso(config, relato="Jogaram ÁGUA em mim")
    assert _ids(coord_logado, "?q=água") == [agua]


def test_busca_longa_demais_400(coord_logado):
    assert coord_logado.get("/api/casos?q=" + "a" * 100).status_code == 200
    r = coord_logado.get("/api/casos?q=" + "a" * 101)
    assert r.status_code == 400
    assert r.get_json() == {"erro": "busca longa demais"}


def test_recorrencia_nao_muda_a_ordem(coord_logado, config):
    alta, _ = _caso(config, prioridade="alta", criado_em="2026-01-01T08:00:00+00:00")
    crit, _ = _caso(config, prioridade="critica", criado_em="2026-01-09T08:00:00+00:00")
    c = connect(config)
    c.execute("UPDATE casos SET recorrencia_pendente = 1 WHERE id = ?", (alta,))
    c.commit()
    c.close()
    casos = coord_logado.get("/api/casos").get_json()["casos"]
    assert [x["id"] for x in casos] == [crit, alta]
    assert casos[0]["recorrencia_pendente"] is False
    assert casos[1]["recorrencia_pendente"] is True


def test_item_traz_quem_acessou_por_ultimo(coord_logado, config):
    caso_id, _ = _caso(config)
    sem, = coord_logado.get("/api/casos").get_json()["casos"]
    assert sem["ultimo_acesso_por"] is None and sem["ultimo_acesso_em"] is None
    c = connect(config)
    c.execute("UPDATE casos SET ultimo_acesso_por = ?, ultimo_acesso_em = ? WHERE id = ?",
              (_id_usuario(config), "2026-02-01T10:00:00+00:00", caso_id))
    c.commit()
    c.close()
    item, = coord_logado.get("/api/casos").get_json()["casos"]
    assert item["ultimo_acesso_por"] == "coord"
    assert item["ultimo_acesso_em"] == "2026-02-01T10:00:00+00:00"
    assert {"id", "tipo", "prioridade", "pontos", "status", "em_andamento", "anonimo",
            "simulacao", "resumo", "criado_em", "atualizado_em"} <= set(item)


def test_resumo_conta_tudo(coord_logado, config):
    _caso(config, prioridade="critica")
    _caso(config, prioridade="alta", status="em_investigacao")
    b, _ = _caso(config, prioridade="alta", status="resolvido")
    _caso(config, prioridade="baixa")
    c = connect(config)
    c.execute("UPDATE casos SET recorrencia_pendente = 1 WHERE id = ?", (b,))
    c.commit()
    c.close()
    r = coord_logado.get("/api/resumo")
    assert r.status_code == 200
    assert r.get_json() == {
        "status": {"novo": 2, "em_investigacao": 1, "resolvido": 1},
        "prioridade": {"critica": 1, "alta": 2, "media": 0, "baixa": 1},
        "recorrencia_pendente": 1,
    }


def test_resumo_com_banco_vazio_devolve_zeros(coord_logado):
    assert coord_logado.get("/api/resumo").get_json() == {
        "status": {"novo": 0, "em_investigacao": 0, "resolvido": 0},
        "prioridade": {"critica": 0, "alta": 0, "media": 0, "baixa": 0},
        "recorrencia_pendente": 0,
    }


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


def test_detalhe_traz_prioridade_e_recorrencia(coord_logado, config):
    caso_id, _ = _caso(config)
    d = coord_logado.get(f"/api/casos/{caso_id}").get_json()
    assert d["prioridade"] and d["prioridade_original"]
    assert d["recorrencia_pendente"] is False


def test_ultimo_acesso_e_o_anterior_e_a_fila_mostra_o_ultimo(
        coord_logado, coord_app, config):
    caso_id, _ = _caso(config)
    antes = _consulta(config, "SELECT atualizado_em FROM casos WHERE id = ?",
                      (caso_id,))[0][0]
    eventos = _consulta(config, "SELECT COUNT(*) FROM eventos")[0][0]
    d1 = coord_logado.get(f"/api/casos/{caso_id}").get_json()
    assert d1["ultimo_acesso"] is None
    gravado = _consulta(config, "SELECT ultimo_acesso_por, ultimo_acesso_em, "
                        "atualizado_em FROM casos WHERE id = ?", (caso_id,))[0]
    assert gravado[0] == _id_usuario(config) and gravado[1]
    assert gravado[2] == antes  # não mexe em atualizado_em
    assert _consulta(config, "SELECT COUNT(*) FROM eventos")[0][0] == eventos
    _criar_usuario(config, "outra")
    outro = coord_app.test_client()
    assert outro.post("/api/login", json={"nome": "outra",
                                          "senha": SENHA_COORD}).status_code == 200
    d2 = outro.get(f"/api/casos/{caso_id}").get_json()
    assert d2["ultimo_acesso"] == {"por": "coord", "em": gravado[1]}
    item, = coord_logado.get("/api/casos").get_json()["casos"]
    assert item["ultimo_acesso_por"] == "outra"
    d3 = coord_logado.get(f"/api/casos/{caso_id}").get_json()
    assert d3["ultimo_acesso"]["por"] == "outra"


def test_detalhe_inexistente_404_sem_gravar_acesso(coord_logado, config):
    _caso(config)
    assert coord_logado.get("/api/casos/999").status_code == 404
    assert _consulta(config, "SELECT ultimo_acesso_por FROM casos")[0][0] is None


def test_mensagem_da_coordenacao_grava_autor_e_aluno_fica_sem(
        coord_logado, student_client, config):
    caso_id, codigo = _caso(config)
    student_client.post("/api/acompanhar/mensagens",
                        json={"codigo": codigo, "texto": "ola"})
    coord_logado.post(f"/api/casos/{caso_id}/mensagens", json={"texto": "Estamos vendo"})
    assert _consulta(config, "SELECT usuario_id FROM mensagens WHERE autor = 'coordenacao'"
                     )[0][0] == _id_usuario(config)
    msgs = coord_logado.get(f"/api/casos/{caso_id}").get_json()["mensagens"]
    aluno, coord = msgs
    assert aluno["usuario"] is None and aluno["usuario_id"] is None
    assert coord["usuario"] == "coord" and coord["usuario_id"] == _id_usuario(config)


# --- mudanças de status e prioridade -------------------------------------

def test_mudar_status_registra_evento_com_autor(coord_logado, config):
    caso_id, _ = _caso(config)
    r = coord_logado.post(f"/api/casos/{caso_id}/status", json={"status": "em_investigacao"})
    assert r.status_code == 200
    linha = _consulta(config, "SELECT status FROM casos WHERE id = ?", (caso_id,))[0]
    assert linha["status"] == "em_investigacao"
    ev = _consulta(config, "SELECT * FROM eventos WHERE tipo = 'status'")
    assert len(ev) == 1
    assert ev[0]["usuario_id"] == _id_usuario(config)
    assert ev[0]["detalhe"] == "status: novo -> em_investigacao"
    # mesmo valor não gera evento novo
    coord_logado.post(f"/api/casos/{caso_id}/status", json={"status": "em_investigacao"})
    assert len(_consulta(config, "SELECT * FROM eventos WHERE tipo = 'status'")) == 1


def test_status_invalido_400(coord_logado, config):
    caso_id, _ = _caso(config)
    # resolvido só vem da resolução; valores da v1 não existem mais
    for valor in ("apagado", "", None, 3, "NOVO", "resolvido", "em_analise",
                  "encaminhado", "aguardando_aluno"):
        r = coord_logado.post(f"/api/casos/{caso_id}/status", json={"status": valor})
        assert r.status_code == 400, valor
    assert _consulta(config, "SELECT status FROM casos")[0][0] == "novo"


def test_reabrir_caso_resolvido(coord_logado, config):
    caso_id, _ = _caso(config, status="resolvido")
    r = coord_logado.post(f"/api/casos/{caso_id}/status", json={"status": "em_investigacao"})
    assert r.status_code == 200
    assert _consulta(config, "SELECT status FROM casos")[0][0] == "em_investigacao"
    ev = _consulta(config, "SELECT detalhe FROM eventos WHERE tipo = 'status'")
    assert ev[0]["detalhe"] == "status: resolvido -> em_investigacao"


def test_filtro_status_aceita_os_tres_valores(coord_logado, config):
    caso_id, _ = _caso(config, status="em_investigacao")
    for valor in ("novo", "em_investigacao", "resolvido"):
        assert coord_logado.get(f"/api/casos?status={valor}").status_code == 200
    ids = [c["id"] for c in coord_logado.get("/api/casos?status=em_investigacao").get_json()["casos"]]
    assert ids == [caso_id]
    assert coord_logado.get("/api/casos?status=em_analise").status_code == 400


def _prio(coord, caso_id, **corpo):
    return coord.post(f"/api/casos/{caso_id}/prioridade", json=corpo)


def test_mudar_prioridade_com_justificativa(coord_logado, config):
    caso_id, _ = _caso(config, prioridade="media")
    original = _consulta(config, "SELECT prioridade_original FROM casos")[0][0]
    r = _prio(coord_logado, caso_id, prioridade="critica", justificativa="  Ameaca real  ")
    assert r.status_code == 200
    linha = _consulta(config, "SELECT prioridade, prioridade_original FROM casos")[0]
    assert linha["prioridade"] == "critica"
    assert linha["prioridade_original"] == original
    ev = _consulta(config, "SELECT * FROM eventos WHERE tipo = 'prioridade'")
    assert len(ev) == 1
    assert ev[0]["usuario_id"] == _id_usuario(config)
    assert ev[0]["detalhe"] == "media -> critica: Ameaca real"
    # mesmo valor não grava evento
    r = _prio(coord_logado, caso_id, prioridade="critica", justificativa="de novo")
    assert r.status_code == 200
    assert len(_consulta(config, "SELECT * FROM eventos WHERE tipo = 'prioridade'")) == 1


def test_voltar_a_prioridade_original_gera_evento(coord_logado, config):
    caso_id, _ = _caso(config, prioridade="media")
    _prio(coord_logado, caso_id, prioridade="alta", justificativa="subiu")
    r = _prio(coord_logado, caso_id, prioridade="media", justificativa="voltou")
    assert r.status_code == 200
    ev = _consulta(config, "SELECT detalhe FROM eventos WHERE tipo = 'prioridade' ORDER BY id")
    assert [e["detalhe"] for e in ev] == ["media -> alta: subiu", "alta -> media: voltou"]


def test_prioridade_invalida_400_sem_gravar(coord_logado, config):
    caso_id, _ = _caso(config, prioridade="media")
    casos_ruins = [
        {"prioridade": "alta"},
        {"prioridade": "alta", "justificativa": "   "},
        {"prioridade": "alta", "justificativa": 5},
        {"prioridade": "alta", "justificativa": "x" * 2001},
        {"prioridade": "urgente", "justificativa": "ok"},
        {"prioridade": None, "justificativa": "ok"},
        {"prioridade": 3, "justificativa": "ok"},
        {"justificativa": "ok"},
    ]
    for corpo in casos_ruins:
        assert _prio(coord_logado, caso_id, **corpo).status_code == 400, corpo
    assert _consulta(config, "SELECT prioridade FROM casos")[0][0] == "media"
    assert _consulta(config, "SELECT * FROM eventos WHERE tipo = 'prioridade'") == []
    ok = _prio(coord_logado, caso_id, prioridade="alta", justificativa="x" * 2000)
    assert ok.status_code == 200


def test_rota_gravidade_nao_existe_mais(coord_logado):
    r = coord_logado.post("/api/casos/1/gravidade", json={"gravidade": "alta"})
    assert r.status_code == 404


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
        ("post", "/api/casos/999/prioridade",
         {"prioridade": "alta", "justificativa": "x"}),
        ("post", "/api/casos/999/prioridade", {"prioridade": "xx"}),
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


def test_foto_enviada_pelo_aluno_chega_sem_exif(coord_logado, config):
    import io

    from app import create_student_app
    from imagens import jpeg, segmento_jpeg

    sujo = jpeg([segmento_jpeg(0xE1, b"Exif\x00\x00GPSLatitude-23.55"),
                 segmento_jpeg(0xFE, b"SECRET-CAMERA")])
    aluno = create_student_app(config, limites={}).test_client()
    r = aluno.post("/api/denuncias", data={
        "tipo": "outro", "relato": RELATO, "anonimo": "true",
        "anexos": (io.BytesIO(sujo), "foto.jpg"),
    }, content_type="multipart/form-data")
    assert r.status_code == 201
    caso_id, anexo_id = _consulta(config, "SELECT caso_id, id FROM anexos")[0]
    r = coord_logado.get(f"/api/casos/{caso_id}/anexos/{anexo_id}")
    assert r.status_code == 200
    servido = r.get_data()
    assert b"GPSLatitude" not in servido and b"SECRET-CAMERA" not in servido
    assert servido == jpeg()


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
    assert {"id": novo_id, "nome": "Ana", "ativo": True, "papel": "coordenador"} in lista
    assert all(set(u) == {"id", "nome", "ativo", "papel"} for u in lista)

    for corpo in ({"nome": "Bia", "senha": "curta"}, {"nome": "ana", "senha": "outra-senha-forte"},
                  {"nome": "", "senha": "outra-senha-forte"}, {"nome": "Cid", "senha": "x" * 300},
                  {"nome": "n" * 101, "senha": "outra-senha-forte"}, {"nome": 3, "senha": None}):
        r = coord_logado.post("/api/usuarios", json=corpo)
        assert r.status_code == 400
        assert "hash" not in r.get_data(as_text=True)

    r = coord_logado.post(f"/api/usuarios/{novo_id}/desativar", json={})
    assert r.status_code == 200
    lista = coord_logado.get("/api/usuarios").get_json()["usuarios"]
    assert {"id": novo_id, "nome": "Ana", "ativo": False, "papel": "coordenador"} in lista
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


def test_spa_da_coordenacao_sem_build_404(coord_client, tmp_path):
    # pasta vazia: o build.ps1 gera app/static antes de rodar os testes
    coord_client.application.config["SI_STATIC"] = tmp_path / "sem-build"
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


def test_detalhe_usa_so_colunas_conhecidas_do_caso(coord_logado, config):
    caso_id, _ = _caso(config)
    d = coord_logado.get(f"/api/casos/{caso_id}").get_json()
    assert set(d) == {
        "id", "tipo", "relato", "quando", "onde", "em_andamento", "anonimo",
        "nome", "turma", "prioridade", "prioridade_original", "pontos",
        "motivos", "status", "recorrencia_pendente", "ultimo_acesso",
        "simulacao", "criado_em", "atualizado_em",
        "anexos", "eventos", "mensagens", "notas",
    }
    assert not any("hash" in chave for chave in d)


def test_detalhe_nao_le_colunas_sensiveis(config):
    # a consulta nomeia as colunas: o hash nem chega a ser lido
    from app import casos as modulo
    assert "SELECT *" not in inspect.getsource(modulo.detalhe_caso)
    assert "codigo_hash" not in modulo.COLUNAS_DETALHE


# --- rotas protegidas sem sessão: métodos incomuns e barra final -----------

CAMINHOS_PROTEGIDOS = [
    "/api/casos",
    "/api/resumo",
    "/api/casos/1",
    "/api/casos/1/status",
    "/api/casos/1/prioridade",
    "/api/casos/1/mensagens",
    "/api/casos/1/notas",
    "/api/casos/1/anexos/1",
    "/api/simulacao",
    "/api/simulacao/carregar",
    "/api/usuarios",
    "/api/usuarios/1/desativar",
    "/api/eu",
]
METODOS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]


def _contagens(config):
    c = connect(config)
    try:
        return {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                for t in ("casos", "mensagens", "eventos", "usuarios", "notas_internas",
                          "anexos")}
    finally:
        c.close()


@pytest.mark.parametrize("barra", ["", "/"])
@pytest.mark.parametrize("metodo", METODOS)
@pytest.mark.parametrize("caminho", CAMINHOS_PROTEGIDOS)
def test_sem_sessao_nenhum_metodo_devolve_dado_nem_altera(
        coord_client, config, caminho, metodo, barra):
    caso_id, _ = _caso(config)  # algo para vazar ou apagar
    antes = _contagens(config)
    r = coord_client.open(caminho + barra, method=metodo, json={"texto": "x", "status": "novo"})
    corpo = r.get_data(as_text=True)
    # 401 (sem sessão), 404/405 (rota inexistente ou método não aceito); nunca 2xx
    assert r.status_code in (401, 404, 405), (metodo, caminho + barra, r.status_code)
    assert RELATO not in corpo and "codigo_hash" not in corpo
    assert _contagens(config) == antes
    assert caso_id  # o caso continua lá


def test_options_com_sessao_nao_abre_brecha(coord_client, config):
    # OPTIONS passa pela portaria como qualquer método: sem sessão, 401
    assert coord_client.options("/api/casos").status_code == 401
    assert coord_client.head("/api/casos").status_code == 401


def test_options_em_api_desconhecida_e_404_nos_dois_portais(coord_client, student_client):
    for cliente in (coord_client, student_client):
        for caminho in ("/api/nao-existe", "/api/nao-existe/", "/api/"):
            r = cliente.options(caminho)
            assert r.status_code == 404, (caminho, r.status_code)
            assert r.get_json() == {"erro": "nao encontrado"}


def test_apagar_sessao_key_derruba_as_sessoes_e_preserva_os_codigos(tmp_path):
    from app.config import load_config

    from app.db import init_db

    cfg = load_config(tmp_path)
    init_db(cfg)
    conn = connect(cfg)
    try:
        criar_usuario(conn, "coord", SENHA_COORD)
    finally:
        conn.close()
    cliente = create_coord_app(cfg, limites={}).test_client()
    assert cliente.post("/api/login", json={"nome": "coord", "senha": SENHA_COORD}
                        ).status_code == 200
    assert cliente.get("/api/eu").status_code == 200
    cookie = cliente.get_cookie("si_coord_sessao").value

    # mesmo par de chaves: o cookie continua valendo depois de "reiniciar"
    outro = create_coord_app(load_config(tmp_path), limites={}).test_client()
    outro.set_cookie("si_coord_sessao", cookie)
    assert outro.get("/api/eu").status_code == 200

    (tmp_path / "sessao.key").unlink()
    novo_cfg = load_config(tmp_path)
    assert novo_cfg.secret_key == cfg.secret_key  # códigos dos alunos intactos
    assert novo_cfg.sessao_key != cfg.sessao_key
    novo = create_coord_app(novo_cfg, limites={}).test_client()
    novo.set_cookie("si_coord_sessao", cookie)
    assert novo.get("/api/eu").status_code == 401


def test_chave_da_sessao_nao_depende_da_secret_key(config):
    from dataclasses import replace

    a = create_coord_app(config, limites={})
    b = create_coord_app(replace(config, secret_key="outra"), limites={})
    assert a.secret_key == b.secret_key


def test_log_de_acesso_nao_tem_id_de_caso(coord_logado, config, caplog):
    import logging

    caso_id, _ = _caso(config)
    caplog.set_level(logging.INFO, logger="seguranca.acesso")
    numero = 900000 + caso_id  # número único, fácil de achar no texto
    coord_logado.get(f"/api/casos/{caso_id}")
    coord_logado.get(f"/api/casos/{numero}")
    coord_logado.get(f"/api/desconhecida/{numero}/x")
    coord_logado.get(f"/painel/{numero}")
    acessos = [r.getMessage() for r in caplog.records if r.name == "seguranca.acesso"]
    assert "GET /api/casos/<int:caso_id> 200" in acessos
    assert "GET /api/casos/<int:caso_id> 404" in acessos
    assert "GET /api/desconhecida/:id/x 404" in acessos
    assert any(a.startswith("GET /painel/:id ") for a in acessos)
    for a in acessos:
        assert str(numero) not in a
        assert f"/{caso_id} " not in a and f"/{caso_id}/" not in a


# --- primeiro acesso e papéis --------------------------------------------

LAN = {"REMOTE_ADDR": "192.168.0.20"}


def test_setup_pendente_sem_usuarios(coord_client):
    assert coord_client.get("/api/setup").get_json() == {"pendente": True, "local": True}


def test_setup_nao_pendente_com_usuario(coord_logado):
    assert coord_logado.get("/api/setup").get_json()["pendente"] is False


def test_setup_na_lan_informa_que_nao_e_local(coord_client):
    r = coord_client.get("/api/setup", environ_overrides=LAN)
    assert r.get_json() == {"pendente": True, "local": False}


def test_setup_cria_admin_e_abre_sessao(coord_client, config):
    r = coord_client.post("/api/setup", json={"nome": "Diretora", "senha": SENHA_COORD})
    assert r.status_code == 201
    assert r.get_json() == {"nome": "Diretora"}
    assert _consulta(config, "SELECT papel FROM usuarios")[0][0] == "admin"
    eu = coord_client.get("/api/eu").get_json()
    assert eu["nome"] == "Diretora" and eu["papel"] == "admin"
    assert coord_client.get("/api/setup").get_json()["pendente"] is False


def test_setup_recusado_fora_da_maquina(coord_client, config):
    r = coord_client.post("/api/setup", json={"nome": "x", "senha": SENHA_COORD},
                          environ_overrides=LAN)
    assert r.status_code == 403
    assert _consulta(config, "SELECT COUNT(*) FROM usuarios")[0][0] == 0


@pytest.mark.parametrize("cabecalho", ["CF-Connecting-IP", "X-Forwarded-For", "X-Forwarded-Proto",
                                       "Forwarded", "X-Real-IP"])
def test_setup_recusado_atras_do_tunel(coord_client, config, cabecalho):
    # o túnel conecta por loopback, mas manda estes cabeçalhos
    r = coord_client.post("/api/setup", json={"nome": "x", "senha": SENHA_COORD},
                          headers={cabecalho: "203.0.113.9"})
    assert r.status_code == 403
    assert coord_client.get("/api/setup", headers={cabecalho: "1"}).get_json()["local"] is False
    assert _consulta(config, "SELECT COUNT(*) FROM usuarios")[0][0] == 0


def test_setup_duas_vezes_da_409(coord_client, config):
    corpo = {"nome": "Diretora", "senha": SENHA_COORD}
    assert coord_client.post("/api/setup", json=corpo).status_code == 201
    r = coord_client.post("/api/setup", json={"nome": "Outra", "senha": SENHA_COORD})
    assert r.status_code == 409
    assert _consulta(config, "SELECT COUNT(*) FROM usuarios")[0][0] == 1


@pytest.mark.parametrize("corpo", [{}, {"nome": "x"}, {"nome": "x", "senha": "curta"},
                                   {"nome": 1, "senha": SENHA_COORD}, {"nome": "", "senha": SENHA_COORD},
                                   {"nome": "n" * 101, "senha": SENHA_COORD}])
def test_setup_validacao(coord_client, config, corpo):
    assert coord_client.post("/api/setup", json=corpo).status_code == 400
    assert _consulta(config, "SELECT COUNT(*) FROM usuarios")[0][0] == 0


def test_setup_exige_json(coord_client):
    r = coord_client.post("/api/setup", data="nome=x", content_type="application/x-www-form-urlencoded")
    assert r.status_code == 415


@pytest.fixture
def coordenador(config, coord_app):
    """Cliente logado como coordenador (sem papel de admin)."""
    c = connect(config)
    try:
        criar_usuario(c, "admin0", SENHA_COORD, "admin")
        criar_usuario(c, "comum", SENHA_COORD)
    finally:
        c.close()
    cliente = coord_app.test_client()
    assert cliente.post("/api/login", json={"nome": "comum", "senha": SENHA_COORD}).status_code == 200
    return cliente


def test_eu_informa_papel(coordenador):
    assert coordenador.get("/api/eu").get_json()["papel"] == "coordenador"


@pytest.mark.parametrize("metodo,caminho", [("get", "/api/usuarios"), ("post", "/api/usuarios"),
                                            ("post", "/api/usuarios/1/desativar")])
def test_gestao_de_contas_so_admin(coordenador, metodo, caminho):
    kwargs = {"json": {"nome": "x", "senha": SENHA_COORD}} if metodo == "post" else {}
    r = getattr(coordenador, metodo)(caminho, **kwargs)
    assert r.status_code == 403
    assert r.get_json() == {"erro": "apenas administrador"}


def test_coordenador_ainda_usa_a_fila(coordenador):
    assert coordenador.get("/api/casos").status_code == 200


def test_admin_cria_conta_de_coordenador(coord_logado, config):
    r = coord_logado.post("/api/usuarios", json={"nome": "Nova", "senha": SENHA_COORD})
    assert r.status_code == 201
    assert _consulta(config, "SELECT papel FROM usuarios WHERE nome = 'Nova'")[0][0] == "coordenador"
    lista = coord_logado.get("/api/usuarios").get_json()["usuarios"]
    assert {u["nome"]: u["papel"] for u in lista} == {"coord": "admin", "Nova": "coordenador"}
