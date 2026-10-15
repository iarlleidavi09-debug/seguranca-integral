"""Rotas do portal da coordenação (porta 4000).

Toda rota exige sessão, exceto login, saúde, o 404 de /api e a SPA. Toda
requisição que altera estado exige `Content-Type: application/json`: com o
cookie SameSite=Strict, isso impede que outro site dispare ações em nome de
quem está logado (formulário HTML não consegue mandar esse tipo).
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from flask import (
    Blueprint, Response, current_app, g, jsonify, request, session,
)
from flask.sessions import SecureCookieSessionInterface

from . import auth, casos, simulation
from ._comum import registrar_rotas_finais
from .db import connect
from .security import chave_limitador, https_encaminhado
from .uploads import AnexoInvalido, caminho_anexo

bp = Blueprint("coord", __name__)

DURACAO_SESSAO = timedelta(hours=12)
NOME_MAX, SENHA_MAX = 100, 256
TEXTO_MAX = 2000
ESCRITA = {"POST", "PUT", "PATCH", "DELETE"}

# rotas que não passam pela portaria (404 de /api e SPA)
LIVRES = {"coord.api_desconhecida", "coord.spa"}
# rotas que dispensam sessão, mas ainda exigem JSON quando alteram estado
SEM_SESSAO = {"coord.login", "coord.saude", "coord.setup_estado", "coord.setup"}
# rotas só do administrador
SO_ADMIN = {"coord.usuarios", "coord.criar_usuario", "coord.desativar"}
# cabeçalhos que o túnel acrescenta: pedido que os traz não veio da máquina
CABECALHOS_DE_PROXY = ("CF-Connecting-IP", "X-Forwarded-For", "X-Forwarded-Proto",
                       "X-Forwarded-Host", "Forwarded", "X-Real-IP")

# tipo gravado no banco -> (Content-Type, extensão do nome sugerido)
MIME_ANEXO = {
    "png": ("image/png", "png"),
    "jpeg": ("image/jpeg", "jpg"),
    "webp": ("image/webp", "webp"),
    "gif": ("image/gif", "gif"),
}

ERRO_LOGIN = {"erro": "nome ou senha invalidos"}


class SessaoCoordenacao(SecureCookieSessionInterface):
    """Cookie `Secure` só quando o túnel informa que a conexão é https."""

    def get_cookie_secure(self, app) -> bool:
        return https_encaminhado(request)


def _erro(msg: str, status: int = 400):
    return jsonify({"erro": msg}), status


def _nao_encontrado():
    # mesma resposta para qualquer ausência: não revela o que existe
    return _erro("nao encontrado", 404)


def _json() -> dict:
    dados = request.get_json(silent=True)
    return dados if isinstance(dados, dict) else {}


def _db():
    """Uma conexão por requisição, fechada no teardown."""
    if "db" not in g:
        g.db = connect(current_app.config["SI_CONFIG"])
    return g.db


@bp.teardown_request
def _fechar_db(_erro):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def _sessao_valida() -> dict | None:
    """Confere a sessão a cada requisição: prazo absoluto e conta ativa."""
    usuario_id = session.get("usuario_id")
    inicio = session.get("inicio")
    if not isinstance(usuario_id, int) or not isinstance(inicio, int):
        return None
    agora = time.time()
    # 12 h contadas do login, mesmo com uso contínuo; início no futuro é forjado
    if agora - inicio > DURACAO_SESSAO.total_seconds() or inicio > agora + 60:
        return None
    linha = _db().execute(
        "SELECT id, nome, ativo, papel FROM usuarios WHERE id = ?", (usuario_id,)
    ).fetchone()
    if linha is None or not linha["ativo"]:
        return None
    return {"id": linha["id"], "nome": linha["nome"], "papel": linha["papel"]}


@bp.before_request
def portaria():
    endpoint = request.endpoint
    if endpoint is None or endpoint in LIVRES:
        return None
    if endpoint not in SEM_SESSAO:
        usuario = _sessao_valida()
        if usuario is None:
            session.clear()
            return _erro("nao autenticado", 401)
        g.usuario = usuario
        if endpoint in SO_ADMIN and usuario["papel"] != "admin":
            return _erro("apenas administrador", 403)
    if request.method in ESCRITA and request.mimetype != "application/json":
        return _erro("use application/json", 415)
    return None


# --- sessão --------------------------------------------------------------

@bp.get("/api/saude")
def saude():
    return jsonify({"ok": True})


def _da_propria_maquina() -> bool:
    """Pedido direto do loopback, sem passar por túnel ou proxy."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return False
    return not any(c in request.headers for c in CABECALHOS_DE_PROXY)


@bp.get("/api/setup")
def setup_estado():
    pendente = _db().execute("SELECT 1 FROM usuarios LIMIT 1").fetchone() is None
    return jsonify({"pendente": pendente, "local": _da_propria_maquina()})


@bp.post("/api/setup")
def setup():
    """Cria o primeiro administrador. Só da máquina do servidor e só uma vez."""
    limitador = current_app.extensions["limitadores"].get("login")
    if limitador is not None and not limitador.permitir(chave_limitador(request)):
        return _erro("muitas tentativas, tente mais tarde", 429)
    if not _da_propria_maquina():
        return _erro("abra o portal na maquina do servidor", 403)
    dados = _json()
    nome, senha = dados.get("nome"), dados.get("senha")
    if not isinstance(nome, str) or not isinstance(senha, str):
        return _erro("nome e senha obrigatorios")
    if len(nome) > NOME_MAX or len(senha) > SENHA_MAX:
        return _erro("nome ou senha longos demais")
    try:
        novo_id = auth.criar_primeiro_admin(_db(), nome, senha)
    except ValueError as erro:
        return _erro(str(erro))
    if novo_id is None:
        return _erro("ja existe usuario", 409)
    session.clear()
    session.permanent = True
    session["usuario_id"] = novo_id
    session["inicio"] = int(time.time())
    return jsonify({"nome": nome.strip()}), 201


@bp.post("/api/login")
def login():
    limitador = current_app.extensions["limitadores"].get("login")
    if limitador is not None and not limitador.permitir(chave_limitador(request)):
        return _erro("muitas tentativas, tente mais tarde", 429)
    # qualquer tentativa derruba a sessão anterior (evita fixação de sessão)
    session.clear()
    dados = _json()
    nome, senha = dados.get("nome"), dados.get("senha")
    # entrada fora do formato nem chega ao scrypt e não conta para bloqueio
    if (not isinstance(nome, str) or not isinstance(senha, str)
            or len(nome) > NOME_MAX or len(senha) > SENHA_MAX):
        return jsonify(ERRO_LOGIN), 401
    conn = _db()
    usuario_id = auth.autenticar(conn, nome, senha, datetime.now(timezone.utc))
    if usuario_id is None:
        return jsonify(ERRO_LOGIN), 401
    linha = conn.execute(
        "SELECT nome FROM usuarios WHERE id = ?", (usuario_id,)
    ).fetchone()
    session.permanent = True
    session["usuario_id"] = usuario_id
    session["inicio"] = int(time.time())
    return jsonify({"nome": linha["nome"]})


@bp.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/api/eu")
def eu():
    return jsonify(g.usuario)


# --- casos ---------------------------------------------------------------

def _filtro(nome: str, permitidos: tuple[str, ...]):
    """Valor do filtro, None se vazio; levanta ValueError se fora da lista."""
    valor = request.args.get(nome, "")
    if not valor:
        return None
    if valor not in permitidos:
        raise ValueError(nome)
    return valor


@bp.get("/api/casos")
def fila():
    try:
        status = _filtro("status", casos.STATUS)
        prioridade = _filtro("prioridade", casos.PRIORIDADES)
        tipo = _filtro("tipo", casos.TIPOS)
    except ValueError as erro:
        return _erro(f"filtro {erro} invalido")
    q = request.args.get("q", "").strip()
    if len(q) > casos.BUSCA_MAX:
        return _erro("busca longa demais")
    return jsonify({"casos": casos.listar_fila(_db(), status, prioridade, tipo, q)})


@bp.get("/api/resumo")
def resumo():
    return jsonify(casos.resumo(_db()))


@bp.get("/api/casos/<int:caso_id>")
def detalhe(caso_id: int):
    caso = casos.detalhe_caso(_db(), caso_id)
    if caso is None:
        return _nao_encontrado()
    return jsonify(caso)


def _texto_valido(campo: str = "texto"):
    texto = _json().get(campo)
    if not isinstance(texto, str):
        return None
    texto = texto.strip()
    return texto if 1 <= len(texto) <= TEXTO_MAX else None


@bp.post("/api/casos/<int:caso_id>/status")
def mudar_status(caso_id: int):
    conn = _db()
    # existência antes da validação: caso inexistente sempre dá o mesmo 404
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    valor = _json().get("status")
    # resolvido só vem da resolução do caso
    if not isinstance(valor, str) or valor not in ("novo", "em_investigacao"):
        return _erro("status invalido")
    if not casos.mudar_status(conn, caso_id, valor, g.usuario["id"]):
        return _nao_encontrado()
    return jsonify({"ok": True, "status": valor})


@bp.post("/api/casos/<int:caso_id>/prioridade")
def mudar_prioridade(caso_id: int):
    conn = _db()
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    valor = _json().get("prioridade")
    if not isinstance(valor, str) or valor not in casos.PRIORIDADES:
        return _erro("prioridade invalida")
    justificativa = _texto_valido("justificativa")
    if justificativa is None:
        return _erro("justificativa deve ter de 1 a 2000 caracteres")
    if not casos.mudar_prioridade(conn, caso_id, valor, justificativa,
                                  g.usuario["id"]):
        return _nao_encontrado()
    return jsonify({"ok": True, "prioridade": valor})


@bp.post("/api/casos/<int:caso_id>/mensagens")
def enviar_mensagem(caso_id: int):
    conn = _db()
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    texto = _texto_valido()
    if texto is None:
        return _erro("mensagem deve ter de 1 a 2000 caracteres")
    casos.adicionar_mensagem(conn, caso_id, "coordenacao", texto, commit=False)
    # um único commit grava a mensagem e o evento juntos
    casos.registrar_evento(conn, caso_id, "mensagem_coordenacao",
                           g.usuario["id"], "")
    return jsonify({"ok": True}), 201


@bp.post("/api/casos/<int:caso_id>/notas")
def criar_nota(caso_id: int):
    conn = _db()
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    texto = _texto_valido()
    if texto is None:
        return _erro("nota deve ter de 1 a 2000 caracteres")
    casos.adicionar_nota(conn, caso_id, g.usuario["id"], texto, commit=False)
    casos.registrar_evento(conn, caso_id, "nota_interna", g.usuario["id"], "")
    return jsonify({"ok": True}), 201


@bp.get("/api/casos/<int:caso_id>/anexos/<int:anexo_id>")
def anexo(caso_id: int, anexo_id: int):
    """Única rota de anexo: o anexo precisa pertencer ao caso da URL."""
    linha = casos.anexo_do_caso(_db(), caso_id, anexo_id)
    if linha is None or linha["tipo"] not in MIME_ANEXO:
        return _nao_encontrado()
    try:
        caminho = caminho_anexo(current_app.config["SI_CONFIG"], linha["nome_interno"])
        # no máximo 5 MB; ler tudo evita deixar o arquivo aberto
        dados = caminho.read_bytes()
    except (AnexoInvalido, OSError):
        return _nao_encontrado()
    mime, extensao = MIME_ANEXO[linha["tipo"]]
    resposta = Response(dados, mimetype=mime)
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    # nome gerado aqui; o nome enviado pelo aluno nunca é usado
    resposta.headers["Content-Disposition"] = (
        f'inline; filename="anexo-{linha["id"]}.{extensao}"'
    )
    resposta.headers["Cache-Control"] = "private, no-store"
    return resposta


# --- modo de ensaio ------------------------------------------------------
# A portaria já cobre estas rotas (sessão e JSON); não gravam evento algum.

@bp.post("/api/simulacao/carregar")
def carregar_simulacao():
    criados = simulation.carregar_simulacao(_db(), current_app.config["SI_CONFIG"])
    return jsonify({"criados": criados})


@bp.delete("/api/simulacao")
def remover_simulacao():
    removidos = simulation.remover_simulacao(_db(), current_app.config["SI_CONFIG"])
    return jsonify({"removidos": removidos})


# --- usuários ------------------------------------------------------------

@bp.get("/api/usuarios")
def usuarios():
    return jsonify({
        "usuarios": [
            {"id": u["id"], "nome": u["nome"], "ativo": bool(u["ativo"]),
             "papel": u["papel"]}
            for u in auth.listar_usuarios(_db())
        ]
    })


@bp.post("/api/usuarios")
def criar_usuario():
    dados = _json()
    nome, senha = dados.get("nome"), dados.get("senha")
    if not isinstance(nome, str) or not isinstance(senha, str):
        return _erro("nome e senha obrigatorios")
    if len(nome) > NOME_MAX:
        return _erro("nome longo demais")
    if len(senha) > SENHA_MAX:
        return _erro("senha longa demais")
    try:
        novo_id = auth.criar_usuario(_db(), nome, senha)
    except ValueError as erro:
        # mensagens de auth.criar_usuario são seguras para exibir
        return _erro(str(erro))
    return jsonify({"id": novo_id, "nome": nome.strip()}), 201


@bp.post("/api/usuarios/<int:usuario_id>/desativar")
def desativar(usuario_id: int):
    if usuario_id == g.usuario["id"]:
        return _erro("nao e possivel desativar a propria conta")
    conn = _db()
    existe = conn.execute(
        "SELECT 1 FROM usuarios WHERE id = ?", (usuario_id,)
    ).fetchone()
    if existe is None:
        return _nao_encontrado()
    auth.desativar_usuario(conn, usuario_id)
    return jsonify({"ok": True})


registrar_rotas_finais(bp)
