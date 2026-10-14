"""Códigos de acompanhamento: geração, normalização e hash."""
import hashlib
import hmac
import secrets

# Sem I, L, O, 0 e 1 para evitar confusão ao digitar.
ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_TAMANHO = 8


def gerar_codigo() -> str:
    """Gera um código aleatório no formato XXXX-XXXX."""
    letras = "".join(secrets.choice(ALFABETO) for _ in range(_TAMANHO))
    return f"{letras[:4]}-{letras[4:]}"


def normalizar_codigo(texto: str) -> str | None:
    """Aceita minúsculas, espaços e hífen opcional; devolve XXXX-XXXX ou None."""
    if not isinstance(texto, str):
        return None
    limpo = "".join(texto.split()).replace("-", "").upper()
    if len(limpo) != _TAMANHO or any(c not in ALFABETO for c in limpo):
        return None
    return f"{limpo[:4]}-{limpo[4:]}"


def hash_codigo(codigo_normalizado: str, secret_key: str) -> str:
    """HMAC-SHA256 em hex; só o hash é guardado no banco."""
    return hmac.new(
        secret_key.encode("utf-8"),
        codigo_normalizado.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
