"""Rota pública de orientação imediata (portal do aluno)."""
from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .orientacoes import OrientacoesInvalidas, carregar, ids_pedidos
from .routes_student import _erro, _limite_estourado

bp = Blueprint('aluno_orientacoes', __name__)


@bp.get('/api/orientacoes')
def orientacoes():
    if _limite_estourado('consultas'):
        return _erro('muitas consultas, tente mais tarde', 429)
    ids = ids_pedidos(request.args.get('situacoes', ''))
    if ids is None:
        return _erro('lista de situacoes grande demais')
    config = current_app.config['SI_CONFIG']
    try:
        definicao = carregar(config.orientacoes_path)
    except OrientacoesInvalidas:
        return _erro('orientacoes indisponiveis', 503)
    resposta = jsonify(definicao.para_aluno(ids, config.contatos_apoio))
    resposta.headers['Cache-Control'] = 'no-store'
    return resposta
