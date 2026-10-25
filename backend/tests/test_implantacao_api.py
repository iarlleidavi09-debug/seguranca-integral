"""API da limpeza da implantação secundária. Só usa pastas temporárias."""
import dataclasses
from contextlib import closing

import pytest

from app import create_coord_app
from app.auth import criar_usuario
from app.casos import adicionar_mensagem, criar_caso
from app.db import connect
from app.uploads import salvar_anexo

from imagens import png

SENHA = "senha-forte-123"
FRASE = "APAGAR TUDO"
PNG = png()
RELATO = "Um colega esta me xingando todos os dias no grupo da turma."


@pytest.fixture
def config_sec(config):
    return dataclasses.replace(config, implantacao_secundaria=True)


def _logar(app, nome):
    cliente = app.test_client()
    r = cliente.post("/api/login", json={"nome": nome, "senha": SENHA})
    assert r.status_code == 200
    return cliente


@pytest.fixture
def app_sec(config_sec):
    app = create_coord_app(config_sec, limites={"login": (1000, 600)})
    with closing(connect(config_sec)) as c:
        criar_usuario(c, "admin0", SENHA, "admin")
        criar_usuario(c, "admin1", SENHA, "admin")
        criar_usuario(c, "comum", SENHA)
    return app


@pytest.fixture
def primeiro(app_sec):
    return _logar(app_sec, "admin0")


def _popular(config_sec, backup=True):
    """Um caso com mensagem e anexo, e uma pasta de backup."""
    with closing(connect(config_sec)) as c:
        anexo = salvar_anexo(config_sec, PNG)
        criar_caso(c, config_sec, {"tipo": "cyberbullying", "relato": RELATO,
                                   "anonimo": True}, [anexo])
        caso_id = c.execute("SELECT MAX(id) FROM casos").fetchone()[0]
        adicionar_mensagem(c, caso_id, "aluno", "oi")
        c.commit()
    if backup:
        pasta = config_sec.backups_dir / "copia-1"
        pasta.mkdir(parents=True)
        (pasta / "x.db").write_bytes(b"x")


def _contar(config_sec, sql):
    with closing(connect(config_sec)) as c:
        return c.execute(sql).fetchone()[0]


def _limpar(cliente, **corpo):
    base = {"senha": SENHA, "confirmacao": FRASE}
    base.update(corpo)
    return cliente.post("/api/implantacao/limpar", json=base)


# --- acesso --------------------------------------------------------------

def test_flag_desligada_da_404_ate_para_o_primeiro_admin(config):
    app = create_coord_app(config, limites={"login": (1000, 600)})
    with closing(connect(config)) as c:
        criar_usuario(c, "admin0", SENHA, "admin")
    cliente = _logar(app, "admin0")
    assert cliente.get("/api/implantacao").status_code == 404
    r = _limpar(cliente)
    assert r.status_code == 404
    assert r.get_json() == {"erro": "nao encontrado"}


def test_sem_sessao_401(app_sec):
    cliente = app_sec.test_client()
    assert cliente.get("/api/implantacao").status_code == 401
    assert _limpar(cliente).status_code == 401


def test_sem_json_415(primeiro):
    r = primeiro.post("/api/implantacao/limpar", data="x=1",
                      content_type="application/x-www-form-urlencoded")
    assert r.status_code == 415


def test_coordenador_e_segundo_admin_recebem_403(app_sec, config_sec):
    _popular(config_sec)
    comum = _logar(app_sec, "comum")  # barrado pela portaria (SO_ADMIN)
    assert comum.get("/api/implantacao").status_code == 403
    assert _limpar(comum).status_code == 403
    segundo = _logar(app_sec, "admin1")
    g, p = segundo.get("/api/implantacao"), _limpar(segundo)
    assert g.status_code == p.status_code == 403
    assert g.get_json() == p.get_json() == {"erro": "sem permissao"}
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1


def test_primeiro_admin_desativado_ninguem_limpa(app_sec, config_sec):
    segundo = _logar(app_sec, "admin1")
    primeiro_id = _contar(config_sec, "SELECT id FROM usuarios WHERE nome='admin0'")
    with closing(connect(config_sec)) as c:
        c.execute("UPDATE usuarios SET ativo = 0 WHERE id = ?", (primeiro_id,))
        c.commit()
    _popular(config_sec)
    assert segundo.get("/api/implantacao").status_code == 403
    assert _limpar(segundo).status_code == 403
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1


# --- leitura -------------------------------------------------------------

def test_get_traz_resumo_e_ultima_limpeza(primeiro, config_sec):
    _popular(config_sec)
    r = primeiro.get("/api/implantacao")
    assert r.status_code == 200
    assert r.get_json() == {
        "secundaria": True,
        "resumo": {"casos": 1, "mensagens": 1, "anexos": 1, "arquivos": 1,
                   "backups": 1},
        "ultima_limpeza": None,
    }
    assert _limpar(primeiro).status_code == 200
    ultima = primeiro.get("/api/implantacao").get_json()["ultima_limpeza"]
    assert ultima["por"] == "admin0" and ultima["casos"] == 1 and ultima["em"]


# --- validação -----------------------------------------------------------

@pytest.mark.parametrize("frase", ["apagar tudo", "APAGAR TUDO ", "", None, 1, "x"])
def test_frase_errada_400_e_nada_apagado(primeiro, config_sec, frase):
    _popular(config_sec)
    r = _limpar(primeiro, confirmacao=frase)
    assert r.status_code == 400
    assert r.get_json() == {"erro": "confirmacao invalida"}
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1
    assert _contar(config_sec, "SELECT tentativas FROM usuarios WHERE nome='admin0'") == 0
    assert len(list(config_sec.uploads_dir.iterdir())) == 1


@pytest.mark.parametrize("valor", ["true", 1, 0, None, [], "false"])
def test_apagar_backups_nao_booleano_400(primeiro, config_sec, valor):
    _popular(config_sec)
    r = _limpar(primeiro, apagar_backups=valor)
    assert r.status_code == 400
    assert r.get_json() == {"erro": "apagar_backups invalido"}
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1
    assert (config_sec.backups_dir / "copia-1").exists()


def test_frase_e_validada_antes_de_apagar_backups_e_da_senha(primeiro, config_sec):
    r = _limpar(primeiro, confirmacao="x", apagar_backups="x", senha="errada")
    assert r.get_json() == {"erro": "confirmacao invalida"}
    r = _limpar(primeiro, apagar_backups="x", senha="errada")
    assert r.get_json() == {"erro": "apagar_backups invalido"}


def test_senha_errada_403_incrementa_tentativas(primeiro, config_sec):
    _popular(config_sec)
    r = _limpar(primeiro, senha="errada-errada")
    assert r.status_code == 403
    assert r.get_json() == {"erro": "senha incorreta"}
    assert _contar(config_sec, "SELECT tentativas FROM usuarios WHERE nome='admin0'") == 1
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1


@pytest.mark.parametrize("senha", [None, 1, ["x"], "a" * 300])
def test_senha_de_tipo_ou_tamanho_invalido_403(primeiro, config_sec, senha):
    _popular(config_sec)
    r = _limpar(primeiro, senha=senha)
    assert r.status_code == 403
    assert r.get_json() == {"erro": "senha incorreta"}
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1


def test_bloqueio_por_tentativas_vale_para_limpar(primeiro, config_sec):
    _popular(config_sec)
    for _ in range(5):
        assert _limpar(primeiro, senha="errada-errada").status_code == 403
    r = _limpar(primeiro)  # senha certa, conta bloqueada
    assert r.status_code == 403
    assert r.get_json() == {"erro": "senha incorreta"}
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1


def test_corpo_invalido_nunca_apaga(primeiro, config_sec):
    _popular(config_sec)
    for corpo in ("[]", "null", "texto", "{}", "{\"senha\": \"x\"}"):
        r = primeiro.post("/api/implantacao/limpar", data=corpo,
                          content_type="application/json")
        assert r.status_code in (400, 403)
    r = primeiro.post("/api/implantacao/limpar", data="{quebrado",
                      content_type="application/json")
    assert r.status_code == 400
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 1
    assert len(list(config_sec.uploads_dir.iterdir())) == 1


# --- sucesso -------------------------------------------------------------

def test_sucesso_apaga_e_mantem_usuarios_e_mapa_e_login_funciona(
        app_sec, primeiro, config_sec):
    _popular(config_sec)
    usuarios = _contar(config_sec, "SELECT COUNT(*) FROM usuarios")
    r = _limpar(primeiro)  # apagar_backups ausente = apaga
    assert r.status_code == 200
    corpo = r.get_json()
    assert corpo["ok"] is True
    assert corpo["removidos"] == {"casos": 1, "mensagens": 1, "anexos": 1,
                                  "arquivos": 1, "backups": 1}
    assert not corpo.get("avisos")
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 0
    assert _contar(config_sec, "SELECT COUNT(*) FROM usuarios") == usuarios
    assert list(config_sec.uploads_dir.iterdir()) == []
    assert not (config_sec.backups_dir / "copia-1").exists()
    assert _contar(config_sec, "SELECT tentativas FROM usuarios WHERE nome='admin0'") == 0
    assert primeiro.get("/api/casos").status_code == 200  # sessão segue valendo
    _logar(app_sec, "admin1")  # login depois da limpeza


def test_apagar_backups_falso_mantem_as_copias(primeiro, config_sec):
    _popular(config_sec)
    r = _limpar(primeiro, apagar_backups=False)
    assert r.status_code == 200
    assert r.get_json()["removidos"]["backups"] == 0
    assert (config_sec.backups_dir / "copia-1").exists()
    assert _contar(config_sec, "SELECT COUNT(*) FROM casos") == 0


def test_publica_atualizacao_uma_vez(app_sec, primeiro, config_sec):
    _popular(config_sec)
    central = app_sec.extensions["eventos"]
    equipe = central.assinar()
    try:
        assert _limpar(primeiro, senha="errada-errada").status_code == 403
        assert equipe.fila.empty()
        assert _limpar(primeiro).status_code == 200
        assert equipe.fila.get_nowait() == "atualizar"
        assert equipe.fila.empty()
    finally:
        equipe.fechar()


def test_log_sem_dados_pessoais(primeiro, config_sec, caplog):
    _popular(config_sec)
    with caplog.at_level("INFO"):
        assert _limpar(primeiro).status_code == 200
    texto = " ".join(r.getMessage() for r in caplog.records)
    assert RELATO not in texto and SENHA not in texto and "admin0" not in texto
