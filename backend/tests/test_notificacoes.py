"""Alertas por e-mail: mensagem fixa, fila em segundo plano e privacidade."""
from __future__ import annotations

import json
import socket
import time
from datetime import datetime, timedelta, timezone

import pytest

from app import notificacoes
from app.auth import criar_usuario
from app.casos import criar_caso
from app.config import Config, email_valido, load_config
from app.db import connect, init_db

from smtp_falso import SmtpFalso

RELATO_CRITICO = "Vou machucar o Joao Silva com uma faca amanha na saida, ninguem vai me impedir."
LOCAL = "Banheiro do bloco C"
CORPO_CRITICO = "Novo caso crítico no TETRAGUARD. Abra o painel para ver."


@pytest.fixture(autouse=True)
def _sem_espera(monkeypatch):
    monkeypatch.setattr(notificacoes, "ESPERAS", (0, 0, 0))
    yield
    notificacoes.reiniciar_registro()


@pytest.fixture
def smtp():
    s = SmtpFalso()
    yield s
    s.parar()


def _alertas(porta, **extra):
    return {"smtp": {"host": "127.0.0.1", "porta": porta, "seguranca": "nenhuma",
                     "usuario": "", "senha": "", "remetente": "alertas@escola.example"},
            "link_painel": "https://painel.escola.example/", "resumo_hora": None, **extra}


@pytest.fixture
def cfg(tmp_path, smtp):
    c = Config(data_dir=tmp_path, secret_key="chave-de-teste", alertas=_alertas(smtp.porta))
    init_db(c)
    return c


def _usuario(config, nome, email="", **prefs):
    conn = connect(config)
    try:
        uid = criar_usuario(conn, nome, "senha-forte-123", "coordenador")
        if email:
            notificacoes.definir_email(conn, uid, email)
        notificacoes.salvar_preferencias(
            conn, uid, {"critico": False, "recorrencia": False, "resumo": False, **prefs})
        return uid
    finally:
        conn.close()


def _caso(config, relato=RELATO_CRITICO, simulacao=False, **kw):
    conn = connect(config)
    try:
        dados = {"tipo": "ameaca", "relato": relato, "anonimo": False, "nome": "Maria Souza",
                 "turma": "9B", "onde": LOCAL, "em_andamento": True}
        return criar_caso(conn, config, dados, [], simulacao=simulacao, **kw)
    finally:
        conn.close()


def _prioridade(config):
    conn = connect(config)
    try:
        return conn.execute("SELECT prioridade FROM casos ORDER BY id DESC").fetchone()[0]
    finally:
        conn.close()


def _envios(config):
    conn = connect(config)
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM envios_alerta ORDER BY id")]
    finally:
        conn.close()


# --- configuração -------------------------------------------------------------

def test_config_sem_alertas_fica_desligada(tmp_path):
    assert load_config(tmp_path).alertas == {}


def test_config_smtp_incompleto_fica_desligado(tmp_path):
    (tmp_path / "config.json").write_text(json.dumps({"alertas": {"smtp": {"host": "x"}}}))
    assert load_config(tmp_path).alertas == {}


def test_config_valida_e_nao_imprime_senha(tmp_path, monkeypatch):
    monkeypatch.delenv("SI_SMTP_SENHA", raising=False)
    (tmp_path / "config.json").write_text(json.dumps({"alertas": {
        "smtp": {"host": "smtp.escola.example", "remetente": "a@escola.example",
                 "usuario": "u", "senha": "SEGREDO-123"},
        "link_painel": "https://painel.escola.example", "resumo_hora": "07:30"}}))
    c = load_config(tmp_path)
    assert c.alertas["smtp"]["porta"] == 587 and c.alertas["resumo_hora"] == "07:30"
    assert "SEGREDO-123" not in repr(c)


def test_config_senha_do_ambiente_vale_mais(tmp_path, monkeypatch):
    monkeypatch.setenv("SI_SMTP_SENHA", "DO-AMBIENTE")
    (tmp_path / "config.json").write_text(json.dumps({"alertas": {
        "smtp": {"host": "h.example", "remetente": "a@escola.example", "senha": "arquivo"}}}))
    assert load_config(tmp_path).alertas["smtp"]["senha"] == "DO-AMBIENTE"


@pytest.mark.parametrize("alertas", [
    {"smtp": {"host": "h", "remetente": "sem-arroba"}},
    {"smtp": {"host": "h", "remetente": "a@b.example", "seguranca": "xyz"}},
    {"smtp": {"host": "h", "remetente": "a@b.example", "porta": 0}},
    {"smtp": {"host": "h", "remetente": "a@b.example"}, "link_painel": "javascript:alert(1)"},
    {"smtp": {"host": "h", "remetente": "a@b.example"}, "resumo_hora": "25:00"},
])
def test_config_invalida_levanta_sem_citar_segredos(tmp_path, alertas):
    alertas["smtp"]["senha"] = "SEGREDO-123"
    (tmp_path / "config.json").write_text(json.dumps({"alertas": alertas}))
    with pytest.raises(ValueError) as erro:
        load_config(tmp_path)
    assert "SEGREDO-123" not in str(erro.value)


@pytest.mark.parametrize("valor", [
    "a@b.example\nBcc: x@y.example", "a@b.example\r\n", "a b@c.example", "a@b", "a,b@c.example",
    "<a@b.example>", "", None, "a@b.example,c@d.example", "a@@b.example"])
def test_email_invalido(valor):
    assert not email_valido(valor)


def test_email_valido():
    assert email_valido("maria.souza+alerta@escola.example")


# --- envio ----------------------------------------------------------------------

def test_caso_critico_envia_mensagem_fixa_sem_dados(cfg, smtp):
    _usuario(cfg, "ana", "ana@escola.example", critico=True)
    codigo = _caso(cfg)
    assert _prioridade(cfg) == "critica"
    notificacoes.obter(cfg).esperar()
    assert len(smtp.mensagens) == 1
    m = smtp.mensagens[0]
    assert m["para"] == ["ana@escola.example"]
    bruto = m["bruto"]
    assert CORPO_CRITICO in bruto or "Novo caso cr" in bruto
    assert "https://painel.escola.example/" in bruto
    for proibido in (codigo, "faca", "Joao", "Maria", "9B", LOCAL, "critica", "ameaca"):
        assert proibido.lower() not in bruto.lower(), proibido


def test_corpo_exato_do_critico():
    assunto, corpo = notificacoes.montar_mensagem("critico", "https://x.example/")
    assert corpo == CORPO_CRITICO + "\nhttps://x.example/"
    assert notificacoes.montar_mensagem("critico")[1] == CORPO_CRITICO


def test_nao_critico_e_simulacao_nao_enviam(cfg, smtp):
    _usuario(cfg, "ana", "ana@escola.example", critico=True)
    _caso(cfg, relato="Um colega me chamou de apelido feio hoje.")
    _caso(cfg, simulacao=True)
    despachante = notificacoes.obter(cfg)
    despachante.enfileirar("nada")  # gatilho desconhecido é ignorado
    despachante.esperar()
    assert smtp.mensagens == []


def test_so_recebe_quem_optou_tem_email_e_esta_ativo(cfg, smtp):
    _usuario(cfg, "ana", "ana@escola.example", critico=True)
    _usuario(cfg, "bia", "bia@escola.example")  # não optou
    _usuario(cfg, "caio", "", critico=True)  # sem endereço
    dina = _usuario(cfg, "dina", "dina@escola.example", critico=True)
    conn = connect(cfg)
    conn.execute("UPDATE usuarios SET ativo = 0 WHERE id = ?", (dina,))
    conn.commit()
    conn.close()
    _caso(cfg)
    notificacoes.obter(cfg).esperar()
    assert [m["para"] for m in smtp.mensagens] == [["ana@escola.example"]]


def test_tentativas_limitadas_e_registro_sem_conteudo(cfg, smtp):
    smtp.recusar_primeiras = 2
    _usuario(cfg, "ana", "ana@escola.example", critico=True)
    _caso(cfg)
    notificacoes.obter(cfg).esperar()
    linhas = _envios(cfg)
    assert len(smtp.mensagens) == 1
    assert [(l["gatilho"], l["estado"], l["tentativas"]) for l in linhas] == [("critico", "enviado", 3)]
    assert set(linhas[0]) == {"id", "usuario_id", "gatilho", "canal", "estado", "tentativas", "criado_em"}


def test_falha_total_registra_falhou_e_nao_quebra_o_caso(tmp_path):
    with socket.socket() as s:  # porta fechada
        s.bind(("127.0.0.1", 0))
        porta = s.getsockname()[1]
    c = Config(data_dir=tmp_path, secret_key="k", alertas=_alertas(porta))
    init_db(c)
    _usuario(c, "ana", "ana@escola.example", critico=True)
    codigo = _caso(c)
    assert codigo
    notificacoes.obter(c).esperar()
    assert [(l["estado"], l["tentativas"]) for l in _envios(c)] == [("falhou", 3)]


def test_smtp_travado_nao_atrasa_a_criacao_do_caso(tmp_path):
    with socket.socket() as mudo:  # aceita a conexão (backlog) e nunca responde
        mudo.bind(("127.0.0.1", 0))
        mudo.listen(5)
        c = Config(data_dir=tmp_path, secret_key="k", alertas=_alertas(mudo.getsockname()[1]))
        init_db(c)
        _usuario(c, "ana", "ana@escola.example", critico=True)
        inicio = time.monotonic()
        _caso(c)
        assert time.monotonic() - inicio < 2


def test_sem_smtp_nada_acontece(tmp_path):
    c = Config(data_dir=tmp_path, secret_key="k")
    init_db(c)
    assert notificacoes.obter(c) is None
    notificacoes.avisar(c, "critico")
    _caso(c)  # não levanta


def test_recorrencia_avisa_pela_rota_do_aluno(cfg, smtp):
    from app import create_student_app
    _usuario(cfg, "ana", "ana@escola.example", recorrencia=True)
    codigo = _caso(cfg, relato="Um colega me chamou de apelido feio hoje.")
    conn = connect(cfg)
    conn.execute("UPDATE casos SET status = 'resolvido'")
    conn.commit()
    conn.close()
    cliente = create_student_app(cfg, limites={"consultas": (1000, 600)}).test_client()
    r = cliente.post("/api/acompanhar/situacao", json={"codigo": codigo, "situacao": "voltou"})
    assert r.status_code == 201
    notificacoes.obter(cfg).esperar()
    assert len(smtp.mensagens) == 1
    bruto = smtp.mensagens[0]["bruto"]
    assert "aguarda revis" in bruto and codigo not in bruto


# --- resumo diário --------------------------------------------------------------

def _config_resumo(tmp_path, smtp, hora="08:00"):
    c = Config(data_dir=tmp_path, secret_key="k", alertas=_alertas(smtp.porta, resumo_hora=hora))
    init_db(c)
    return c


def _antigo():
    return (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat(timespec="seconds")


def test_resumo_diario_sai_uma_vez_por_dia(tmp_path, smtp):
    c = _config_resumo(tmp_path, smtp)
    _usuario(c, "ana", "ana@escola.example", resumo=True)
    _caso(c, relato="Um colega me chamou de apelido feio hoje.", criado_em=_antigo())
    d = notificacoes.obter(c)
    hoje = datetime.now().replace(second=0, microsecond=0)
    cedo = hoje.replace(hour=7, minute=59)
    assert d.tick(cedo) is False  # antes da hora
    tarde = hoje.replace(hour=8, minute=1)
    assert d.tick(tarde) is True
    d.esperar()
    assert d.tick(tarde) is False
    assert len(smtp.mensagens) == 1
    assert "primeira resposta" in smtp.mensagens[0]["bruto"]
    assert [l["gatilho"] for l in _envios(c)] == ["resumo"]


def test_resumo_nao_sai_sem_caso_parado_ou_desligado(tmp_path, smtp):
    c = _config_resumo(tmp_path, smtp)
    _usuario(c, "ana", "ana@escola.example", resumo=True)
    _caso(c, relato="Um colega me chamou de apelido feio hoje.")  # recente
    tarde = datetime.now().replace(hour=23, minute=0)
    assert notificacoes.obter(c).tick(tarde) is False
    d2 = _config_resumo(tmp_path / "outra", smtp, hora=None)
    assert notificacoes.obter(d2).tick(tarde) is False
