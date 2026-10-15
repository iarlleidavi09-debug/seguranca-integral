"""Ajudantes de segurança: cabeçalhos, validação de Host e chave do limitador."""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import secrets

from flask import Flask, jsonify, request

from .config import Config

# blob: permite as miniaturas de anexos geradas no navegador
CSP = "default-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'"
HSTS = "max-age=31536000"


def https_encaminhado(req) -> bool:
    """True quando o túnel informa que a conexão original era https."""
    proto = req.headers.get("X-Forwarded-Proto", "")
    return proto.split(",")[0].strip().lower() == "https"


def _host_sem_porta(host: str) -> str:
    host = host.strip().lower()
    if host.startswith("["):  # IPv6 entre colchetes, com ou sem porta
        fim = host.find("]")
        return host[: fim + 1] if fim != -1 else host
    if host.count(":") == 1:
        return host.split(":", 1)[0]
    return host


def aplicar_seguranca(app: Flask, config: Config) -> None:
    """Valida o Host e põe os cabeçalhos de segurança em toda resposta."""
    permitidos = {_host_sem_porta(h) for h in config.allowed_hosts if h.strip()}

    @app.before_request
    def validar_host():
        # lista vazia libera (testes e uso local)
        if not permitidos:
            return None
        # environ direto: request.host cai no SERVER_NAME quando o Host vem vazio
        host = _host_sem_porta(request.environ.get("HTTP_HOST", ""))
        if host not in permitidos:
            return jsonify({"erro": "host invalido"}), 400
        return None

    @app.after_request
    def cabecalhos(resposta):
        h = resposta.headers
        h["X-Content-Type-Options"] = "nosniff"
        h.setdefault("Content-Security-Policy", CSP)
        h.setdefault("Referrer-Policy", "no-referrer")
        if https_encaminhado(request):
            h["Strict-Transport-Security"] = HSTS
        if request.path == "/api" or request.path.startswith("/api/"):
            # preserva o "private, no-store" da rota de anexo
            if "no-store" not in h.get("Cache-Control", ""):
                h["Cache-Control"] = "no-store"
        return resposta


def _loopback(endereco: str | None) -> bool:
    try:
        return ipaddress.ip_address(endereco or "").is_loopback
    except ValueError:
        return False


# sal aleatório por processo: a chave do limitador não volta a ser o IP e
# some com o processo
_SAL = secrets.token_bytes(32)


def _cliente_normalizado(endereco: str) -> str:
    """IPv4 como está; IPv6 reduzido ao /64 (um aparelho troca de endereço
    dentro do próprio /64 à vontade); IPv4 mapeado vira o IPv4."""
    texto = endereco.strip().split("%", 1)[0]
    try:
        ip = ipaddress.ip_address(texto)
    except ValueError:
        return "?" + endereco
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


def chave_limitador(request) -> str:
    """Chave do limitador de taxa: HMAC-SHA256 do cliente, nunca o IP."""
    cliente = _cliente_normalizado(ip_do_cliente(request))
    return hmac.new(_SAL, cliente.encode("utf-8"), hashlib.sha256).hexdigest()


def ip_do_cliente(request) -> str:
    """Identifica o cliente SOMENTE para o limitador de taxa.

    O cabeçalho CF-Connecting-IP vem do Cloudflare Tunnel (que conecta por
    loopback); só é aceito nesse caso, para ninguém forjá-lo de fora. O valor
    nunca é gravado nem registrado em log.
    """
    remoto = request.remote_addr or ""
    if _loopback(remoto):
        cf = (request.headers.get("CF-Connecting-IP") or "").strip()
        if cf:
            return cf
    return remoto or "desconhecido"
