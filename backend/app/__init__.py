"""Fábricas das aplicações Flask."""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask, jsonify, request

from .config import Config
from .db import init_db
from .ratelimit import Limitador

# (máximo de eventos, janela em segundos) por cliente
LIMITES_PADRAO = {"denuncias": (5, 600), "consultas": (20, 600)}


def create_student_app(config: Config, limites: dict | None = None) -> Flask:
    """Portal do aluno (porta 3000)."""
    from .routes_student import bp

    init_db(config)
    app = Flask(__name__, static_folder=None)
    app.config["SI_CONFIG"] = config
    app.config["SI_STATIC"] = Path(__file__).parent / "static" / "aluno"
    app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024
    efetivos = {**LIMITES_PADRAO, **(limites or {})}
    app.extensions["limitadores"] = {
        nome: Limitador(maximo, janela) for nome, (maximo, janela) in efetivos.items()
    }
    app.register_blueprint(bp)

    # O log de requisições do werkzeug inclui o IP; fica silenciado.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    acesso = logging.getLogger("seguranca.acesso")

    @app.after_request
    def registrar_acesso(resposta):
        # só método, caminho e status: sem IP, query string nem corpo
        acesso.info("%s %s %s", request.method, request.path, resposta.status_code)
        return resposta

    @app.errorhandler(405)
    def metodo_nao_permitido(_erro):
        return jsonify({"erro": "metodo nao permitido"}), 405

    @app.errorhandler(500)
    def erro_interno(_erro):
        return jsonify({"erro": "erro interno"}), 500

    @app.errorhandler(413)
    def grande_demais(_erro):
        return jsonify({"erro": "envio grande demais"}), 413

    @app.errorhandler(404)
    def nao_encontrado(_erro):
        return jsonify({"erro": "nao encontrado"}), 404

    return app
