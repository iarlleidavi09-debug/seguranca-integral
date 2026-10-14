"""Ajudantes de segurança. Por ora, apenas a chave do limitador de taxa."""
from __future__ import annotations

import ipaddress


def _loopback(endereco: str | None) -> bool:
    try:
        return ipaddress.ip_address(endereco or "").is_loopback
    except ValueError:
        return False


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
