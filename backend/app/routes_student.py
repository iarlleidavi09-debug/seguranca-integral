"""Rotas do portal do aluno (porta 3000)."""
from __future__ import annotations

import unicodedata
from contextlib import closing

from flask import Blueprint, current_app, jsonify, request

from . import casos
from ._comum import registrar_rotas_finais
from .db import connect
from .questionario import QuestionarioInvalido, RespostasInvalidas, carregar
from .security import chave_limitador
from .realtime import publicar
from .uploads import MAX_BYTES, MAX_POR_CASO, AnexoInvalido, salvar_anexo

bp = Blueprint("aluno", __name__)

ERRO_CODIGO = ({"erro": "codigo nao encontrado"}, 404)
RELATO_MIN, RELATO_MAX = 10, 5000
TEXTO_MAX = 2000
CAMPO_MAX = 200
VERDADEIROS = {"true", "1", "on", "sim", "yes"}


def _erro(msg: str, status: int = 400):
    return jsonify({"erro": msg}), status


def _bool(valor, padrao: bool) -> bool:
    if valor is None or valor == "":
        return padrao
    return str(valor).strip().lower() in VERDADEIROS


def _nome_seguro(nome: str | None) -> str:
    """Nome original do arquivo reduzido a texto simples para a resposta."""
    limpo = "".join(
        c for c in (nome or "") if unicodedata.category(c)[0] != "C"
    ).strip()
    return limpo[:100] or "arquivo"


def _limpo(valor, maximo: int = CAMPO_MAX) -> str | None:
    if not isinstance(valor, str):
        return None
    valor = valor.strip()
    return valor[:maximo] or None


def _limite_estourado(nome: str) -> bool:
    limitador = current_app.extensions["limitadores"].get(nome)
    if limitador is None:  # limite desligado (padrão das denúncias)
        return False
    return not limitador.permitir(chave_limitador(request))


@bp.get("/api/saude")
def saude():
    return jsonify({"ok": True})


@bp.get("/api/questionario")
def questionario():
    if _limite_estourado("consultas"):
        return _erro("muitas consultas, tente mais tarde", 429)
    config = current_app.config["SI_CONFIG"]
    try:
        # lê a cada chamada: ajustar a cópia em data_dir vale sem reiniciar
        definicao = carregar(config.questionario_path)
    except QuestionarioInvalido:
        return _erro("questionario indisponivel", 503)
    resposta = jsonify(definicao.para_aluno())
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


@bp.post("/api/denuncias")
def criar_denuncia():
    if _limite_estourado("denuncias"):
        return _erro("muitos envios, tente mais tarde", 429)
    form = request.form
    tipo = form.get("tipo", "")
    relato = (form.get("relato") or "").strip()
    anonimo = _bool(form.get("anonimo"), True)
    nome = _limpo(form.get("nome"))
    if tipo not in casos.TIPOS:
        return _erro("tipo invalido")
    if not RELATO_MIN <= len(relato) <= RELATO_MAX:
        return _erro("relato deve ter de 10 a 5000 caracteres")
    if not anonimo and not nome:
        return _erro("nome obrigatorio")
    arquivos = [
        f for f in request.files.getlist("anexos[]") + request.files.getlist("anexos")
        if f.filename or f.content_length
    ]
    if len(arquivos) > MAX_POR_CASO:
        return _erro("no maximo 5 anexos")

    config = current_app.config["SI_CONFIG"]
    respostas = None
    if form.get("respostas"):
        # antes de salvar anexos: resposta inválida não deixa arquivo órfão
        try:
            definicao = carregar(config.questionario_path)
        except QuestionarioInvalido:
            # o questionário nunca bloqueia o pedido de ajuda: sem definição
            # confiável, as respostas são descartadas e o caso é criado
            definicao = None
        if definicao is not None:
            try:
                respostas = definicao.validar_respostas(form.get("respostas"), tipo)
            except RespostasInvalidas:
                return _erro("respostas invalidas")
    salvos, recusados = [], []
    for arq in arquivos:
        # le no maximo MAX_BYTES + 1: arquivo grande nunca e carregado inteiro
        dados = arq.stream.read(MAX_BYTES + 1)
        try:
            salvos.append(salvar_anexo(config, dados))
        except AnexoInvalido as erro:
            recusados.append({"nome": _nome_seguro(arq.filename), "motivo": erro.motivo})

    try:
        with closing(connect(config)) as conn:
            codigo = casos.criar_caso(
                conn, config,
                {
                    "tipo": tipo, "relato": relato,
                    "quando": _limpo(form.get("quando")),
                    "onde": _limpo(form.get("onde")),
                    "em_andamento": _bool(form.get("em_andamento"), False),
                    "anonimo": anonimo, "nome": nome,
                    "turma": _limpo(form.get("turma"), 50),
                },
                salvos, respostas=respostas,
            )
    except Exception:
        # sem caso gravado, os arquivos ficariam órfãos em disco
        for a in salvos:
            (config.uploads_dir / a.nome_interno).unlink(missing_ok=True)
        raise
    corpo = {"codigo": codigo}
    publicar(None)
    if recusados:
        corpo["anexos_recusados"] = recusados
    return jsonify(corpo), 201


def _json_dict() -> dict:
    dados = request.get_json(silent=True)
    return dados if isinstance(dados, dict) else {}


@bp.post("/api/acompanhar")
def acompanhar():
    if _limite_estourado("consultas"):
        return _erro("muitas consultas, tente mais tarde", 429)
    config = current_app.config["SI_CONFIG"]
    with closing(connect(config)) as conn:
        caso = casos.caso_por_codigo(conn, config, _json_dict().get("codigo"))
        if caso is None:
            return jsonify(ERRO_CODIGO[0]), ERRO_CODIGO[1]
        msgs = casos.listar_mensagens(conn, caso["id"])
        pos = casos.resumo_aluno(conn, caso["id"])
        return jsonify({
            "status": caso["status"],
            "anexos_total": conn.execute('SELECT COUNT(*) FROM anexos WHERE caso_id=?', (caso['id'],)).fetchone()[0],
            "mensagens": [
                {"id": m["id"], "autor": m["autor"], "texto": "" if m["apagada_em"] else m["texto"],
                 "criado_em": m["criado_em"], "editada": m["editada_em"] is not None,
                 "apagada": m["apagada_em"] is not None}
                for m in msgs
            ],
            **pos,
        })


@bp.post('/api/acompanhar/anexos')
def adicionar_anexos():
    if _limite_estourado('consultas'):
        return _erro('muitas consultas, tente mais tarde', 429)
    if request.mimetype != 'multipart/form-data':
        return _erro('use multipart/form-data', 415)
    config = current_app.config['SI_CONFIG']
    salvos, recusados, gravados = [], [], False
    try:
        with closing(connect(config)) as conn:
            caso = casos.caso_por_codigo(conn, config, request.form.get('codigo'))
            if caso is None:
                return jsonify(ERRO_CODIGO[0]), ERRO_CODIGO[1]
            if set(request.files) - {'anexos', 'anexos[]'}:
                return _erro('campo de anexo invalido')
            arquivos = [f for f in request.files.getlist('anexos[]') + request.files.getlist('anexos')
                        if f.filename or f.content_length]
            if not arquivos:
                return _erro('selecione ao menos uma imagem')
            # Reserva os lugares antes de gravar arquivos, inclusive entre abas simultâneas.
            conn.execute('BEGIN IMMEDIATE')
            try:
                total = conn.execute('SELECT COUNT(*) FROM anexos WHERE caso_id=?', (caso['id'],)).fetchone()[0]
                if total + len(arquivos) > MAX_POR_CASO:
                    return _erro('no maximo 5 anexos por caso')
                for arquivo in arquivos:
                    try:
                        salvos.append(salvar_anexo(config, arquivo.stream.read(MAX_BYTES + 1)))
                    except AnexoInvalido as erro:
                        recusados.append({'nome': _nome_seguro(arquivo.filename), 'motivo': erro.motivo})
                for anexo in salvos:
                    conn.execute('INSERT INTO anexos (caso_id,nome_interno,tipo,tamanho) VALUES (?,?,?,?)',
                                 (caso['id'], anexo.nome_interno, anexo.tipo, anexo.tamanho))
                if salvos:
                    conn.execute('UPDATE casos SET atualizado_em=? WHERE id=?', (casos._agora(), caso['id']))
                    casos.registrar_evento(conn, caso['id'], 'anexos_aluno', None,
                                           f'{len(salvos)} imagem(ns)', commit=False)
                conn.commit()
                gravados = True
            finally:
                if not gravados:
                    conn.rollback()
        if salvos:
            publicar(caso['id'])
        return jsonify({'anexos_adicionados': len(salvos), 'anexos_total': total + len(salvos),
                        'anexos_recusados': recusados}), 201
    finally:
        if not gravados:
            for anexo in salvos:
                (config.uploads_dir / anexo.nome_interno).unlink(missing_ok=True)


@bp.post("/api/acompanhar/situacao")
def informar_situacao():
    if _limite_estourado("consultas"):
        return _erro("muitas consultas, tente mais tarde", 429)
    config = current_app.config["SI_CONFIG"]
    dados = _json_dict()
    with closing(connect(config)) as conn:
        caso = casos.caso_por_codigo(conn, config, dados.get("codigo"))
        if caso is None:
            return jsonify(ERRO_CODIGO[0]), ERRO_CODIGO[1]
        situacao = dados.get("situacao")
        if not isinstance(situacao, str) or situacao not in casos.SITUACOES:
            return _erro("situacao invalida")
        if casos.registrar_situacao(conn, caso["id"], situacao) != "ok":
            return _erro("caso ainda nao resolvido", 409)
    publicar(caso['id'])
    return jsonify({"ok": True}), 201


@bp.post("/api/acompanhar/mensagens")
def enviar_mensagem():
    if _limite_estourado("consultas"):
        return _erro("muitas consultas, tente mais tarde", 429)
    config = current_app.config["SI_CONFIG"]
    dados = _json_dict()
    with closing(connect(config)) as conn:
        caso = casos.caso_por_codigo(conn, config, dados.get("codigo"))
        if caso is None:
            return jsonify(ERRO_CODIGO[0]), ERRO_CODIGO[1]
        texto = dados.get("texto")
        if not isinstance(texto, str) or not 1 <= len(texto.strip()) <= TEXTO_MAX:
            return _erro("mensagem deve ter de 1 a 2000 caracteres")
        casos.adicionar_mensagem(conn, caso["id"], "aluno", texto.strip(),
                            commit=False)
        # um único commit grava a mensagem e o evento juntos
        casos.registrar_evento(conn, caso["id"], "mensagem_aluno", None, "")
    publicar(caso['id'])
    return jsonify({"ok": True}), 201


registrar_rotas_finais(bp)
