"""Fábricas das aplicações Flask."""
from __future__ import annotations

import hashlib
import hmac
from pathlib import Path

from flask import Flask

from ._comum import configurar_app
from .config import Config
from .db import init_db
from .ratelimit import Limitador

# (máximo de eventos, janela em segundos) por cliente; None = sem limite.
# Atrás do Wi-Fi da escola todos os alunos saem pelo mesmo IP público, então
# o limite vale para a escola inteira. Envio de denúncias sem limite por
# pedido do usuário (ambiente controlado); o config.json pode religar.
LIMITES_PADRAO = {"denuncias": None, "consultas": (600, 600)}
LIMITES_COORD = {"login": (20, 600)}


def _limitadores(padrao: dict, limites: dict | None) -> dict:
    # só os nomes deste portal; o config.json traz os de todos
    sobrepostos = {n: v for n, v in (limites or {}).items() if n in padrao}
    efetivos = {**padrao, **sobrepostos}
    return {nome: Limitador(*par) for nome, par in efetivos.items() if par is not None}


def create_student_app(config: Config, limites: dict | None = None) -> Flask:
    """Portal do aluno (porta 3000)."""
    from .routes_student import bp

    init_db(config)
    app = Flask(__name__, static_folder=None)
    app.config["SI_CONFIG"] = config
    app.config["SI_STATIC"] = Path(__file__).parent / "static" / "aluno"
    app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024
    app.extensions["limitadores"] = _limitadores(
        LIMITES_PADRAO, config.limites if limites is None else limites)
    app.register_blueprint(bp)
    configurar_app(app)
    return app


def create_coord_app(config: Config, limites: dict | None = None) -> Flask:
    """Portal da coordenação (porta 4000), com sessão assinada de 12 horas."""
    from .routes_coord import DURACAO_SESSAO, SessaoCoordenacao, bp

    init_db(config)
    app = Flask(__name__, static_folder=None)
    app.config["SI_CONFIG"] = config
    app.config["SI_STATIC"] = Path(__file__).parent / "static" / "coordenacao"
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024  # só JSON pequeno
    # chave da sessão derivada da sessao.key, separada da secret.key (que
    # assina os códigos de acompanhamento): apagar a sessao.key e reiniciar
    # derruba todas as sessões sem invalidar os códigos dos alunos
    app.secret_key = hmac.new(
        config.sessao_key.encode("utf-8"), b"sessao-coordenacao", hashlib.sha256
    ).hexdigest()
    app.session_interface = SessaoCoordenacao()
    app.config.update(
        # nome próprio: os dois portais rodam em localhost e dividiriam o cookie
        SESSION_COOKIE_NAME="si_coord_sessao",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
        PERMANENT_SESSION_LIFETIME=DURACAO_SESSAO,
    )
    app.extensions["limitadores"] = _limitadores(
        LIMITES_COORD, config.limites if limites is None else limites)
    app.register_blueprint(bp)
    configurar_app(app)
    return app
