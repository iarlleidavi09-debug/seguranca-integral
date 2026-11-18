"""Rotas do portal da coordenação (porta 4000).

Toda rota exige sessão, exceto login, saúde, o 404 de /api e a SPA. Toda
requisição que altera estado exige `Content-Type: application/json`: com o
cookie SameSite=Strict, isso impede que outro site dispare ações em nome de
quem está logado (formulário HTML não consegue mandar esse tipo).
"""
from __future__ import annotations

import sqlite3
import time
import csv
import io
from datetime import datetime, timedelta, timezone

from flask import (
    Blueprint, Response, current_app, g, jsonify, request, session,
)
from flask.sessions import SecureCookieSessionInterface

from . import auth, casos, implantacao, simulation
from ._comum import registrar_rotas_finais
from .db import connect
from .questionario import QuestionarioInvalido, carregar
from .questionario_v3 import carregar as carregar_v3
from .security import chave_limitador, https_encaminhado
from .realtime import publicar
from .relatorios import gerar_relatorio
from .uploads import AnexoInvalido, caminho_anexo

bp = Blueprint("coord", __name__)


@bp.get('/api/v3/questionario')
def questionario_v3():
    try:
        definition = carregar_v3(current_app.config['SI_CONFIG'].questionario_v3_path)
    except QuestionarioInvalido:
        return _erro('questionario indisponivel', 503)
    response = jsonify(definition.para_aluno())
    response.headers['Cache-Control'] = 'no-store'
    return response

DURACAO_SESSAO = timedelta(hours=12)
NOME_MAX, SENHA_MAX = 100, 256
TEXTO_MAX = 2000
ESCRITA = {"POST", "PUT", "PATCH", "DELETE"}

# rotas que não passam pela portaria (404 de /api e SPA)
LIVRES = {"coord.api_desconhecida", "coord.spa"}
# rotas que dispensam sessão, mas ainda exigem JSON quando alteram estado
SEM_SESSAO = {"coord.login", "coord.saude", "coord.setup_estado", "coord.setup"}
# rotas só do administrador
SO_ADMIN = {"coord.usuarios", "coord.criar_usuario", "coord.desativar", "coord.remover_usuario",
            "coord.implantacao", "coord.limpar_implantacao"}
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
    central = current_app.extensions['eventos']
    if not central.sessao_ativa(session.get('sid')):
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
    multipart_resolution = endpoint == 'coord.registrar_resolucao_v4'
    if multipart_resolution and request.headers.get('X-SI-Coord') != '1':
        return _erro('cabecalho de coordenacao obrigatorio', 403)
    if not multipart_resolution and request.content_length is not None and request.content_length > 1024 * 1024:
        return _erro('pedido grande demais', 413)
    if request.method in ESCRITA and request.mimetype != ('multipart/form-data' if multipart_resolution else 'application/json'):
        return _erro("use application/json", 415)
    if request.method == 'POST' and request.path.startswith('/api/v3/casos/'):
        revisao = _json().get('revisao_estado')
        if type(revisao) is not int or not 0 <= revisao <= casos.ID_MAX:
            return _erro('revisao_estado invalida')
    return None


@bp.errorhandler(casos.RevisaoConflitante)
def conflito_revisao(_erro):
    return jsonify({'erro': 'caso atualizado por outra pessoa; revise e confirme novamente'}), 409


def _revisao():
    return _json()['revisao_estado'] if request.path.startswith('/api/v3/') else None


def _revogar_sessao():
    current_app.extensions['eventos'].revogar_sessao(session.get('sid'))


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
    _revogar_sessao()
    session.clear()
    session.permanent = True
    session["usuario_id"] = novo_id
    session["inicio"] = int(time.time())
    session['sid'] = current_app.extensions['eventos'].iniciar_sessao(session['inicio'] + DURACAO_SESSAO.total_seconds())
    return jsonify({"nome": nome.strip()}), 201


@bp.post("/api/login")
def login():
    limitador = current_app.extensions["limitadores"].get("login")
    if limitador is not None and not limitador.permitir(chave_limitador(request)):
        return _erro("muitas tentativas, tente mais tarde", 429)
    # qualquer tentativa derruba a sessão anterior (evita fixação de sessão)
    _revogar_sessao()
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
    session['sid'] = current_app.extensions['eventos'].iniciar_sessao(session['inicio'] + DURACAO_SESSAO.total_seconds())
    return jsonify({"nome": linha["nome"]})


@bp.post("/api/logout")
def logout():
    _revogar_sessao()
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
    grupo = request.args.get('grupo') or None
    opcao = request.args.get('opcao') or None
    if grupo or opcao:
        try:
            definition = carregar_v3(current_app.config['SI_CONFIG'].questionario_v3_path)
        except QuestionarioInvalido:
            return _erro('questionario indisponivel', 503)
        if grupo and grupo not in {g['id'] for g in definition.dados['grupos']}:
            return _erro('filtro grupo invalido')
        if opcao and opcao not in definition.opcoes:
            return _erro('filtro opcao invalido')
    try:
        status = _filtro("status", (*casos.STATUS, 'abertos'))
        prioridade = _filtro("prioridade", casos.PRIORIDADES)
        tipo = _filtro("tipo", casos.TIPOS)
    except ValueError as erro:
        return _erro(f"filtro {erro} invalido")
    q = request.args.get("q", "").strip()
    if len(q) > casos.BUSCA_MAX:
        return _erro("busca longa demais")
    return jsonify({"casos": casos.listar_fila(
        _db(), status, prioridade, tipo, q, grupo, opcao, usuario_id=g.usuario['id'])})


@bp.get("/api/resumo")
def resumo():
    return jsonify(casos.resumo(_db(), somente_abertos=request.args.get('abertos') == '1'))


@bp.post('/api/casos/<int:caso_id>/conversa/lida')
def conversa_lida(caso_id: int):
    conn = _db()
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    ultimo_id = _json().get('ultimo_id')
    if type(ultimo_id) is not int or not 1 <= ultimo_id <= casos.ID_MAX:
        return _erro('ultimo_id invalido')
    if not casos.registrar_leitura_conversa(conn, caso_id, g.usuario['id'], ultimo_id):
        return _erro('ultimo_id invalido')
    publicar(caso_id)
    return jsonify({'ok': True})


@bp.get('/api/relatorios')
def relatorio():
    hoje = datetime.now(timezone(timedelta(hours=-3))).date()
    try:
        inicio = datetime.strptime(request.args.get('inicio', (hoje - timedelta(days=29)).isoformat()), '%Y-%m-%d').date()
        fim = datetime.strptime(request.args.get('fim', hoje.isoformat()), '%Y-%m-%d').date()
    except ValueError:
        return _erro('periodo invalido; use AAAA-MM-DD')
    if fim < inicio or (fim - inicio).days > 365:
        return _erro('escolha um periodo de ate 366 dias')
    formato = request.args.get('formato', 'json')
    if formato not in ('json', 'csv'):
        return _erro('formato invalido')
    dados = gerar_relatorio(_db(), inicio, fim)
    if formato == 'json':
        return jsonify(dados)
    arquivo = io.StringIO(newline='')
    escritor = csv.writer(arquivo, delimiter=';')
    escritor.writerow(['Data', 'Recebidos', 'Resolvidos'])
    escritor.writerows((d['data'], d['recebidos'], d['resolvidos']) for d in dados['evolucao'])
    return Response('\ufeff' + arquivo.getvalue(), content_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="tetra-guard-{inicio}-{fim}.csv"'})


@bp.get('/api/equipe')
def equipe():
    return jsonify({'usuarios': [dict(u) for u in _db().execute(
        'SELECT id, nome FROM usuarios WHERE ativo=1 ORDER BY nome COLLATE NOCASE')]})


@bp.post('/api/v3/casos/<int:caso_id>/atendimento')
@bp.post('/api/v3/casos/<int:caso_id>/atendimento/concluir')
def salvar_atendimento(caso_id):
    from .atendimento import salvar
    try:
        if not salvar(_db(), caso_id, g.usuario['id'], _revisao(), _json(),
                      concluir=request.path.endswith('/concluir')):
            return _nao_encontrado()
    except ValueError as erro:
        return _erro(str(erro))
    publicar(None)
    return jsonify({'ok': True})


@bp.get("/api/casos/<int:caso_id>")
def detalhe(caso_id: int):
    conn = _db()
    try:
        # lê a cada chamada; definição quebrada não derruba o detalhe
        definicao = carregar(current_app.config["SI_CONFIG"].questionario_path)
    except QuestionarioInvalido:
        definicao = None
    caso = casos.detalhe_caso(conn, caso_id, definicao)
    if caso is None:
        return _nao_encontrado()
    try:
        caso["ultimo_acesso"] = casos.registrar_acesso(conn, caso_id, g.usuario["id"])
    except sqlite3.OperationalError:
        # banco ocupado: o detalhe sai mesmo assim, sem o último acesso
        caso["ultimo_acesso"] = None
    for m in caso["mensagens"]:
        m["pode_alterar"] = casos.pode_alterar_mensagem(
            m, g.usuario["id"], g.usuario["papel"])
    return jsonify(caso)


def _texto_valido(campo: str = "texto"):
    texto = _json().get(campo)
    if not isinstance(texto, str):
        return None
    texto = texto.strip()
    return texto if 1 <= len(texto) <= TEXTO_MAX else None


@bp.post("/api/casos/<int:caso_id>/status")
@bp.post("/api/v3/casos/<int:caso_id>/status")
def mudar_status(caso_id: int):
    conn = _db()
    # existência antes da validação: caso inexistente sempre dá o mesmo 404
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    valor = _json().get("status")
    # resolvido só vem da resolução do caso
    if not isinstance(valor, str) or valor not in ("novo", "em_investigacao"):
        return _erro("status invalido")
    if not casos.mudar_status(conn, caso_id, valor, g.usuario["id"], _revisao()):
        return _nao_encontrado()
    publicar(caso_id)
    return jsonify({"ok": True, "status": valor})


@bp.post("/api/casos/<int:caso_id>/resolucao")
@bp.post("/api/v3/casos/<int:caso_id>/resolucao")
def registrar_resolucao(caso_id: int):
    conn = _db()
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    corpo = _json()
    desfecho = corpo.get("desfecho")
    if not isinstance(desfecho, str) or desfecho not in casos.DESFECHOS:
        return _erro("desfecho invalido")
    providencias = _texto_valido("providencias")
    if providencias is None:
        return _erro("providencias deve ter de 1 a 2000 caracteres")
    resultado = corpo.get("resultado", "")
    if not isinstance(resultado, str) or len(resultado.strip()) > TEXTO_MAX:
        return _erro("resultado deve ter ate 2000 caracteres")
    r = casos.registrar_resolucao(conn, caso_id, desfecho, providencias,
                                  resultado.strip(), g.usuario["id"], _revisao())
    if r == "nao_encontrado":
        return _nao_encontrado()
    if r == "ja_resolvido":
        return _erro("caso ja resolvido", 409)
    publicar(caso_id)
    return jsonify({"ok": True}), 201


@bp.post("/api/casos/<int:caso_id>/revisao-recorrencia")
@bp.post("/api/v3/casos/<int:caso_id>/revisao-recorrencia")
def revisar_recorrencia(caso_id: int):
    conn = _db()
    r = casos.revisar_recorrencia(conn, caso_id, g.usuario["id"], _revisao())
    if r == "nao_encontrado":
        return _nao_encontrado()
    if r == "nao_pendente":
        return _erro("sem recorrencia pendente", 409)
    publicar(caso_id)
    return jsonify({"ok": True}), 201


@bp.post("/api/casos/<int:caso_id>/prioridade")
@bp.post("/api/v3/casos/<int:caso_id>/prioridade")
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
                                  g.usuario["id"], _revisao()):
        return _nao_encontrado()
    publicar(caso_id)
    return jsonify({"ok": True, "prioridade": valor})


@bp.post("/api/casos/<int:caso_id>/mensagens")
def enviar_mensagem(caso_id: int):
    conn = _db()
    if not casos.existe_caso(conn, caso_id):
        return _nao_encontrado()
    texto = _texto_valido()
    if texto is None:
        return _erro("mensagem deve ter de 1 a 2000 caracteres")
    casos.adicionar_mensagem(conn, caso_id, "coordenacao", texto, commit=False,
                           usuario_id=g.usuario["id"])
    # um único commit grava a mensagem e o evento juntos
    casos.registrar_evento(conn, caso_id, "mensagem_coordenacao",
                           g.usuario["id"], "")
    publicar(caso_id)
    return jsonify({"ok": True}), 201


ERRO_SEM_PERMISSAO_MSG = "sem permissao para alterar esta mensagem"


@bp.patch("/api/casos/<int:caso_id>/mensagens/<int:mensagem_id>")
def editar_mensagem(caso_id: int, mensagem_id: int):
    conn = _db()
    # o domínio não valida o tamanho: vale a regra de enviar_mensagem
    texto = _texto_valido()
    if texto is None:
        return _erro("mensagem deve ter de 1 a 2000 caracteres")
    r = casos.alterar_mensagem(conn, caso_id, mensagem_id, g.usuario["id"],
                               g.usuario["papel"], texto)
    if r == "inexistente":
        return _nao_encontrado()
    if r == "proibido":
        return _erro(ERRO_SEM_PERMISSAO_MSG, 403)
    if r == "apagada":
        return _erro("mensagem apagada nao pode ser editada", 409)
    if r == "ok":
        publicar(caso_id)
    return jsonify({"ok": True})


@bp.delete("/api/casos/<int:caso_id>/mensagens/<int:mensagem_id>")
def apagar_mensagem(caso_id: int, mensagem_id: int):
    r = casos.apagar_mensagem(_db(), caso_id, mensagem_id, g.usuario["id"],
                              g.usuario["papel"])
    if r == "inexistente":
        return _nao_encontrado()
    if r == "proibido":
        return _erro(ERRO_SEM_PERMISSAO_MSG, 403)
    if r == "ok":
        publicar(caso_id)
    return jsonify({"ok": True})


@bp.get("/api/casos/<int:caso_id>/mensagens/<int:mensagem_id>/versoes")
def versoes_da_mensagem(caso_id: int, mensagem_id: int):
    versoes = casos.versoes_mensagem(_db(), caso_id, mensagem_id)
    if versoes is None:
        return _nao_encontrado()
    return jsonify({"versoes": versoes})


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
    publicar(None)
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
    publicar(None)
    return jsonify({"criados": criados})


@bp.delete("/api/simulacao")
def remover_simulacao():
    removidos = simulation.remover_simulacao(_db(), current_app.config["SI_CONFIG"])
    publicar(None)
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
    publicar(None)
    return jsonify({"ok": True})


@bp.delete("/api/usuarios/<int:usuario_id>")
def remover_usuario(usuario_id: int):
    resultado = auth.remover_usuario(_db(), usuario_id, atual_id=g.usuario["id"])
    if resultado == "inexistente":
        return _nao_encontrado()
    if resultado != "ok":
        return _erro({
            "propria": "nao e possivel remover a propria conta",
            "primeiro_admin": "nao e possivel remover o primeiro administrador",
            "ultimo_admin": "nao e possivel remover o ultimo administrador ativo",
        }[resultado])
    publicar(None)
    return jsonify({"ok": True})


# --- limpeza da implantação secundária -----------------------------------

FRASE_LIMPEZA = "APAGAR TUDO"


def _acesso_limpeza():
    """None se o pedido pode seguir; senão a resposta de recusa.

    Flag desligada vale 404 até para o primeiro admin. Só o primeiro admin
    (menor id entre os admins, mesmo desativado) passa.
    """
    config = current_app.config["SI_CONFIG"]
    if not config.implantacao_secundaria:
        return _nao_encontrado()
    if g.usuario["id"] != implantacao.primeiro_admin_id(_db()):
        return _erro("sem permissao", 403)
    return None


@bp.get("/api/implantacao", endpoint="implantacao")
def estado_implantacao():
    recusa = _acesso_limpeza()
    if recusa is not None:
        return recusa
    dados = implantacao.resumo(_db(), current_app.config["SI_CONFIG"])
    ultima = dados.pop("ultima_limpeza")
    return jsonify({"secundaria": True, "resumo": dados, "ultima_limpeza": ultima})


@bp.post("/api/implantacao/limpar")
def limpar_implantacao():
    recusa = _acesso_limpeza()
    if recusa is not None:
        return recusa
    dados = _json()
    # tudo é validado antes de qualquer remoção
    if dados.get("confirmacao") != FRASE_LIMPEZA:
        return _erro("confirmacao invalida")
    apagar_backups = dados.get("apagar_backups", True)
    if type(apagar_backups) is not bool:
        return _erro("apagar_backups invalido")
    senha = dados.get("senha")
    conn = _db()
    # a mesma checagem do login: erros contam tentativas e há bloqueio
    if (not isinstance(senha, str) or len(senha) > SENHA_MAX
            or auth.autenticar(conn, g.usuario["nome"], senha,
                               datetime.now(timezone.utc)) != g.usuario["id"]):
        return _erro("senha incorreta", 403)
    resultado = implantacao.limpar(
        conn, current_app.config["SI_CONFIG"], g.usuario["id"], apagar_backups)
    avisos = resultado.pop("avisos")
    publicar(None)
    corpo = {"ok": True, "removidos": resultado}
    if avisos:
        corpo["avisos"] = avisos
    return jsonify(corpo)


from .routes_mapa import registrar_coord
from .autoria import registrar_rotas
from .exportacao import registrar as registrar_exportacao
registrar_exportacao(bp, _db, _nao_encontrado)
registrar_coord(bp)
registrar_rotas(bp)
from .routes_alertas import registrar_alertas
registrar_alertas(bp)
registrar_rotas_finais(bp)
