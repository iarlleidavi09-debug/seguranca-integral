"""SSE autenticado e presença efêmera, sem contexto SQLite no gerador."""
from contextlib import closing
import re
import time

from flask import Blueprint, Response, current_app, g, jsonify, request, session
from gevent.queue import Empty

from . import casos
from .db import connect
from .routes_coord import DURACAO_SESSAO, _db, _erro, _fechar_db, _json, _nao_encontrado, portaria
from .routes_student import ERRO_CODIGO, _json_dict, _limite_estourado

coord = Blueprint('realtime_coord', __name__)
aluno = Blueprint('realtime_aluno', __name__)
coord.before_request(portaria)
coord.teardown_request(_fechar_db)
HEARTBEAT = 15
INVALIDACAO = 'event: atualizar\ndata: {}\n\n'


def _resposta(central, caso_id=None, autorizado=lambda: True):
    assinatura = central.assinar(caso_id)

    def stream():
        try:
            if not autorizado():
                return
            yield INVALIDACAO
            while True:
                try:
                    assinatura.fila.get(timeout=HEARTBEAT)
                    evento = INVALIDACAO
                except Empty:
                    evento = ': heartbeat\n\n'
                if not autorizado():
                    return
                yield evento
        finally:
            assinatura.fechar()

    resposta = Response(stream(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
    })
    resposta.call_on_close(assinatura.fechar)
    return resposta


@coord.get('/api/eventos')
def eventos_coord():
    config = current_app.config['SI_CONFIG']
    central = current_app.extensions['eventos']
    usuario_id, inicio, sid = g.usuario['id'], session['inicio'], session['sid']
    _fechar_db(None)

    def autorizado():
        agora = time.time()
        if not central.sessao_ativa(sid) or agora - inicio > DURACAO_SESSAO.total_seconds() or inicio > agora + 60:
            return False
        with closing(connect(config)) as conn:
            usuario = conn.execute('SELECT ativo FROM usuarios WHERE id=?', (usuario_id,)).fetchone()
        return usuario is not None and bool(usuario['ativo'])

    return _resposta(central, autorizado=autorizado)


@aluno.post('/api/acompanhar/eventos')
def eventos_aluno():
    if request.mimetype != 'application/json':
        return _erro('use application/json', 415)
    if _limite_estourado('consultas'):
        return _erro('muitas consultas, tente mais tarde', 429)
    config = current_app.config['SI_CONFIG']
    with closing(connect(config)) as conn:
        caso = casos.caso_por_codigo(conn, config, _json_dict().get('codigo'))
    if caso is None:
        return jsonify(ERRO_CODIGO[0]), ERRO_CODIGO[1]
    return _resposta(current_app.extensions['eventos'], caso['id'])


@coord.route('/api/casos/<int:caso_id>/presenca', methods=['GET', 'POST', 'DELETE'])
def presenca(caso_id):
    if not casos.existe_caso(_db(), caso_id):
        return _nao_encontrado()
    central = current_app.extensions['eventos']
    if request.method != 'GET':
        dados = _json()
        aba = dados.get('aba')
        if not isinstance(aba, str) or not re.fullmatch('[a-fA-F0-9]{32}', aba):
            return _erro('aba invalida')
        if request.method == 'POST':
            atividade = dados.get('atividade')
            if atividade not in ('vendo', 'mensagem', 'nota') or set(dados) - {'aba', 'atividade'}:
                return _erro('atividade invalida')
            central.pulsar(caso_id, g.usuario, aba, atividade)
        else:
            central.remover_presenca(caso_id, g.usuario['id'], aba)
    return jsonify({'pessoas': central.presenca(caso_id)})
