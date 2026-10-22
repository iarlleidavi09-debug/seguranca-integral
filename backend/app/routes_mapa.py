"""Rotas registradas nos portais existentes, com a mesma portaria."""
from contextlib import closing
from flask import current_app, jsonify, request
from . import mapa
from .db import connect
from .realtime import publicar


def registrar_coord(bp):
    from .routes_coord import _db, _erro

    @bp.get('/api/mapa')
    def obter_mapa():
        return jsonify(mapa.ler(_db()))

    @bp.post('/api/mapa')
    def salvar_mapa():
        try:
            result = mapa.salvar(_db(), request.get_json(silent=True))
        except mapa.MapaConflitante as exc:
            return _erro(str(exc), 409)
        except (ValueError, TypeError):
            return _erro('planta invalida; confira ambientes, hierarquia e limites')
        publicar(None)
        return jsonify(result)

    @bp.get('/api/mapa/resumo')
    def resumo_mapa():
        try:
            return jsonify(mapa.resumo(_db(), **{key:request.args.get(key, default)
                for key,default in [('periodo','30'),('base','relator'),('ano',''),('sala','')]}))
        except ValueError as exc:
            return _erro(str(exc))


def registrar_aluno(bp):
    @bp.get('/api/planta')
    def planta():
        with closing(connect(current_app.config['SI_CONFIG'])) as conn:
            response = jsonify(mapa.ler(conn))
        response.headers['Cache-Control'] = 'no-store'
        return response

    @bp.get('/api/locais')
    def locais():
        with closing(connect(current_app.config['SI_CONFIG'])) as conn:
            response = jsonify(mapa.ler(conn, catalogo=True))
        response.headers['Cache-Control'] = 'no-store'
        return response
