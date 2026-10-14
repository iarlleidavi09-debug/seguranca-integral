"""Comportamento comum aos dois portais: log de acesso, erros JSON e SPA."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from flask import Blueprint, Flask, current_app, jsonify, request, send_from_directory

from .security import aplicar_seguranca

METODOS_API = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def configurar_app(app: Flask) -> None:
    """Log de acesso sem IP e respostas JSON para os erros HTTP e do banco."""
    # O log de requisições do werkzeug inclui o IP; fica silenciado.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    acesso = logging.getLogger("seguranca.acesso")
    # Host permitido e cabeçalhos de segurança, iguais nos dois portais
    aplicar_seguranca(app, app.config["SI_CONFIG"])

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

    @app.errorhandler(sqlite3.OperationalError)
    def erro_do_banco(erro):
        # banco travado por escrita concorrente: o cliente pode tentar de novo
        texto = str(erro).lower()
        if "locked" in texto or "busy" in texto:
            return jsonify({"erro": "servidor ocupado"}), 503
        logging.getLogger("seguranca.erro").error(
            "erro operacional do banco", exc_info=erro
        )
        return jsonify({"erro": "erro interno"}), 500


def registrar_rotas_finais(bp: Blueprint) -> None:
    """404 JSON para /api desconhecida e fallback da SPA para o resto.

    Chamar uma única vez, na importação do módulo do blueprint: o Flask
    não aceita rotas novas num blueprint que já foi registrado.
    """

    @bp.route("/api/", defaults={"resto": ""})
    @bp.route("/api/<path:resto>", methods=METODOS_API)
    def api_desconhecida(resto):
        return jsonify({"erro": "nao encontrado"}), 404

    @bp.get("/", defaults={"caminho": ""})
    @bp.get("/<path:caminho>")
    def spa(caminho):
        """Serve o build do portal; qualquer rota não-API cai no index.html."""
        pasta: Path = current_app.config["SI_STATIC"]
        if not (pasta / "index.html").is_file():
            return jsonify({"erro": "nao encontrado"}), 404
        alvo = (pasta / caminho).resolve()
        if caminho and alvo.is_file() and pasta.resolve() in alvo.parents:
            return send_from_directory(pasta, caminho)
        return send_from_directory(pasta, "index.html")
