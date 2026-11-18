"""Rotas das preferências de alerta por e-mail (portal da coordenação)."""
from flask import current_app, g, jsonify

from . import notificacoes
from .config import email_valido


def registrar_alertas(bp):
    from .routes_coord import _db, _erro, _json, _nao_encontrado

    def admin() -> bool:
        return g.usuario["papel"] == "admin"

    @bp.get("/api/alertas")
    def alertas_estado():
        config = current_app.config["SI_CONFIG"]
        corpo = {"configurado": bool(config.alertas),
                 "resumo_hora": (config.alertas or {}).get("resumo_hora"),
                 "minhas": notificacoes.ler_preferencias(_db(), g.usuario["id"])}
        if admin():
            corpo["usuarios"] = notificacoes.listar_para_admin(_db())
        return jsonify(corpo)

    @bp.post("/api/alertas/preferencias")
    def alertas_preferencias():
        dados = _json()
        if set(dados) != set(notificacoes.GATILHOS) or not all(
                type(dados[nome]) is bool for nome in notificacoes.GATILHOS):
            return _erro("preferencias invalidas")
        notificacoes.salvar_preferencias(_db(), g.usuario["id"], dados)
        return jsonify(notificacoes.ler_preferencias(_db(), g.usuario["id"]))

    @bp.post("/api/alertas/usuarios/<int:usuario_id>/email")
    def alertas_email(usuario_id: int):
        if not admin():
            return _erro("apenas administrador", 403)
        email = _json().get("email")
        if not isinstance(email, str):
            return _erro("e-mail invalido")
        email = email.strip()
        if email and not email_valido(email):
            return _erro("e-mail invalido")
        if not notificacoes.definir_email(_db(), usuario_id, email):
            return _nao_encontrado()
        return jsonify({"ok": True, "email": email})
