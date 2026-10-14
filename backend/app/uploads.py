"""Validação e gravação de anexos enviados pelos alunos.

O tipo é decidido só pelos bytes iniciais do conteúdo; o nome e a extensão
enviados pelo navegador são ignorados. Cada arquivo recebe um nome interno
aleatório, e a leitura posterior só aceita nomes nesse formato.
"""
from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from pathlib import Path

from app.config import Config

MAX_BYTES = 5 * 1024 * 1024  # 5 MB por anexo
MAX_POR_CASO = 5  # aplicado pela camada de casos

# extensão gravada em disco para cada tipo detectado
EXTENSOES = {"png": "png", "jpeg": "jpg", "webp": "webp", "gif": "gif"}

_PADRAO_NOME = re.compile(r"[0-9a-f]{32}\.(png|jpe?g|webp|gif)")


class AnexoInvalido(Exception):
    """Anexo recusado; `motivo` é seguro para mostrar ao usuário."""

    def __init__(self, motivo: str) -> None:
        super().__init__(motivo)
        self.motivo = motivo


@dataclass(frozen=True)
class AnexoSalvo:
    nome_interno: str
    tipo: str
    tamanho: int


def detectar_tipo(dados: bytes) -> str | None:
    """Identifica PNG, JPEG, WEBP ou GIF pela assinatura; senão devolve None."""
    if dados.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if dados.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if dados.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    # RIFF, 4 bytes de tamanho, depois a marca WEBP
    if len(dados) >= 12 and dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        return "webp"
    return None


def salvar_anexo(config: Config, dados: bytes) -> AnexoSalvo:
    """Valida o conteúdo e grava com nome aleatório em `config.uploads_dir`."""
    if not dados:
        raise AnexoInvalido("arquivo vazio")
    if len(dados) > MAX_BYTES:
        raise AnexoInvalido("arquivo maior que 5 MB")
    tipo = detectar_tipo(dados)
    if tipo is None:
        raise AnexoInvalido("tipo de arquivo não permitido")

    pasta = config.uploads_dir
    try:
        pasta.mkdir(parents=True, exist_ok=True)
    except OSError as erro:
        raise AnexoInvalido("armazenamento indisponivel") from erro

    # nova tentativa só na colisão de nome, que com 128 bits é improvável
    for _ in range(3):
        nome = f"{secrets.token_hex(16)}.{EXTENSOES[tipo]}"
        destino = pasta / nome
        try:
            # "xb" cria o arquivo de forma exclusiva: nunca sobrescreve
            with open(destino, "xb") as arquivo:
                try:
                    arquivo.write(dados)
                except OSError:
                    arquivo.close()
                    destino.unlink(missing_ok=True)  # não deixa arquivo parcial
                    raise
        except FileExistsError:
            continue
        except OSError as erro:
            raise AnexoInvalido("armazenamento indisponivel") from erro
        return AnexoSalvo(nome_interno=nome, tipo=tipo, tamanho=len(dados))
    raise AnexoInvalido("armazenamento indisponivel")


def caminho_anexo(config: Config, nome_interno: str) -> Path:
    """Devolve o caminho do anexo, recusando qualquer nome fora do padrão."""
    # fullmatch evita que "$" aceite uma quebra de linha no fim
    if not isinstance(nome_interno, str) or not _PADRAO_NOME.fullmatch(nome_interno):
        raise AnexoInvalido("nome de anexo inválido")
    pasta = config.uploads_dir.resolve()
    caminho = (pasta / nome_interno).resolve()
    # defesa extra: o padrão já impede separadores, mas confere o pai
    if caminho.parent != pasta:
        raise AnexoInvalido("nome de anexo inválido")
    return caminho
