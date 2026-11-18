"""Validação e gravação de anexos enviados pelos alunos.

O tipo é decidido só pelos bytes iniciais do conteúdo; o nome e a extensão
enviados pelo navegador são ignorados. Cada arquivo recebe um nome interno
aleatório, e a leitura posterior só aceita nomes nesse formato.
"""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timezone
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
    # registro de integridade: hash do conteúdo gravado e momento no servidor
    sha256: str | None = None
    recebido_em: str | None = None


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


# --- remoção de metadados ----------------------------------------------------
# Fotos de celular levam GPS, modelo do aparelho, data e às vezes o nome do
# dono. Tudo isso some antes da gravação; só a estrutura da imagem fica.

_CORROMPIDO = "arquivo corrompido"


def _corrompido() -> AnexoInvalido:
    return AnexoInvalido(_CORROMPIDO)


def _limpar_jpeg(d: bytes) -> bytes:
    """Remove APP1..APP15 e COM; mantém APP0 só se for JFIF.

    Corta tudo depois do primeiro fim de imagem (FFD9): celulares anexam
    ali vídeo (motion photo) e blocos de metadados próprios.
    """
    n = len(d)
    saida = bytearray(b"\xff\xd8")
    i = 2
    while True:
        if i >= n or d[i] != 0xFF:
            raise _corrompido()
        while i < n and d[i] == 0xFF:  # bytes de preenchimento
            i += 1
        if i >= n:
            raise _corrompido()
        marcador = d[i]
        i += 1
        if marcador in (0x00, 0xD8):
            raise _corrompido()
        if marcador == 0xD9:
            raise _corrompido()  # fim antes de qualquer varredura: sem imagem
        if 0xD0 <= marcador <= 0xD7 or marcador == 0x01:
            saida += bytes((0xFF, marcador))  # marcadores sem tamanho
            continue
        if i + 2 > n:
            raise _corrompido()
        tamanho = int.from_bytes(d[i:i + 2], "big")
        if tamanho < 2 or i + tamanho > n:
            raise _corrompido()
        segmento = d[i:i + tamanho]
        i += tamanho
        if marcador == 0xE0:
            if segmento[2:7] == b"JFIF\x00":
                saida += b"\xff\xe0" + segmento
            continue
        if 0xE1 <= marcador <= 0xEF or marcador == 0xFE:
            continue  # EXIF, XMP, ICC, IPTC, comentários e afins
        saida += bytes((0xFF, marcador)) + segmento
        if marcador != 0xDA:
            continue
        # dados comprimidos após o SOS: vão até um marcador que não seja
        # FF00 (byte recheado), FFD0-FFD7 (reinício) ou FF de preenchimento
        j = i
        while True:
            k = d.find(b"\xff", j)
            if k == -1 or k + 1 >= n:
                raise _corrompido()  # sem fim de imagem
            seguinte = d[k + 1]
            if seguinte == 0x00 or 0xD0 <= seguinte <= 0xD7 or seguinte == 0xFF:
                j = k + 1
                continue
            break
        saida += d[i:k]
        if seguinte == 0xD9:
            saida += b"\xff\xd9"
            return bytes(saida)
        i = k  # outro segmento (JPEG progressivo): volta ao laço


_PNG_ASSINATURA = b"\x89PNG\r\n\x1a\n"
_PNG_DESCARTAR = {b"eXIf", b"tEXt", b"iTXt", b"zTXt", b"tIME"}


def _limpar_png(d: bytes) -> bytes:
    """Remove blocos de texto, EXIF e data; corta o que vier depois do IEND."""
    n = len(d)
    saida = bytearray(_PNG_ASSINATURA)
    i = len(_PNG_ASSINATURA)
    primeiro = True
    while True:
        if i + 12 > n:
            raise _corrompido()
        tamanho = int.from_bytes(d[i:i + 4], "big")
        tipo = d[i + 4:i + 8]
        fim = i + 12 + tamanho
        if tamanho > 0x7FFFFFFF or fim > n or not tipo.isalpha():
            raise _corrompido()
        if primeiro and tipo != b"IHDR":
            raise _corrompido()
        primeiro = False
        if tipo not in _PNG_DESCARTAR:
            saida += d[i:fim]  # bloco inteiro, com o CRC original
        i = fim
        if tipo == b"IEND":
            return bytes(saida)


_WEBP_DESCARTAR = {b"EXIF", b"XMP "}
_VP8X_EXIF = 0x08
_VP8X_XMP = 0x04


def _limpar_webp(d: bytes) -> bytes:
    """Remove os blocos EXIF e XMP, limpa as flags do VP8X e refaz o tamanho."""
    declarado = int.from_bytes(d[4:8], "little")
    if declarado < 4 or declarado + 8 > len(d):
        raise _corrompido()
    fim_riff = declarado + 8
    corpo = bytearray(b"WEBP")
    i = 12
    blocos = 0
    while i < fim_riff:
        if i + 8 > fim_riff:
            raise _corrompido()
        fourcc = d[i:i + 4]
        tamanho = int.from_bytes(d[i + 4:i + 8], "little")
        inicio = i + 8
        fim = inicio + tamanho
        if fim > fim_riff:
            raise _corrompido()
        pad = tamanho % 2
        if fim + pad > fim_riff:
            raise _corrompido()
        dados = d[inicio:fim]
        i = fim + pad
        blocos += 1
        if fourcc in _WEBP_DESCARTAR:
            continue
        if fourcc == b"VP8X":
            if tamanho < 1:
                raise _corrompido()
            dados = bytes((dados[0] & ~(_VP8X_EXIF | _VP8X_XMP) & 0xFF,)) + dados[1:]
        corpo += fourcc + tamanho.to_bytes(4, "little") + dados + b"\x00" * pad
    if blocos == 0:
        raise _corrompido()
    return b"RIFF" + len(corpo).to_bytes(4, "little") + bytes(corpo)


def _pular_subblocos(d: bytes, i: int) -> int:
    """Devolve a posição logo após a sequência de sub-blocos que começa em i."""
    n = len(d)
    while True:
        if i >= n:
            raise _corrompido()
        tamanho = d[i]
        i += 1
        if tamanho == 0:
            return i
        i += tamanho
        if i > n:
            raise _corrompido()


def _limpar_gif(d: bytes) -> bytes:
    """Remove extensões de comentário (FE) e de aplicativo (FF)."""
    n = len(d)
    if n < 13:
        raise _corrompido()
    flags = d[10]
    i = 13
    if flags & 0x80:
        i += 3 * (2 ** ((flags & 0x07) + 1))
    if i > n:
        raise _corrompido()
    saida = bytearray(d[:i])
    while True:
        if i >= n:
            raise _corrompido()
        bloco = d[i]
        if bloco == 0x3B:
            saida.append(0x3B)
            return bytes(saida)
        if bloco == 0x21:
            if i + 2 > n:
                raise _corrompido()
            rotulo = d[i + 1]
            fim = _pular_subblocos(d, i + 2)
            if rotulo not in (0xFE, 0xFF):
                saida += d[i:fim]
            i = fim
        elif bloco == 0x2C:
            if i + 10 > n:
                raise _corrompido()
            flags_img = d[i + 9]
            j = i + 10
            if flags_img & 0x80:
                j += 3 * (2 ** ((flags_img & 0x07) + 1))
            j += 1  # tamanho mínimo do código LZW
            if j > n:
                raise _corrompido()
            fim = _pular_subblocos(d, j)
            saida += d[i:fim]
            i = fim
        else:
            raise _corrompido()


_LIMPADORES = {"jpeg": _limpar_jpeg, "png": _limpar_png,
               "webp": _limpar_webp, "gif": _limpar_gif}


def limpar_metadados(tipo: str, dados: bytes) -> bytes:
    """Devolve a imagem sem metadados; estrutura inválida vira AnexoInvalido."""
    try:
        return _LIMPADORES[tipo](dados)
    except AnexoInvalido:
        raise
    except (IndexError, ValueError) as erro:  # defesa: nunca derruba a rota
        raise _corrompido() from erro


def salvar_anexo(config: Config, dados: bytes) -> AnexoSalvo:
    """Valida o conteúdo e grava com nome aleatório em `config.uploads_dir`."""
    if not dados:
        raise AnexoInvalido("arquivo vazio")
    if len(dados) > MAX_BYTES:
        raise AnexoInvalido("arquivo maior que 5 MB")
    tipo = detectar_tipo(dados)
    if tipo is None:
        raise AnexoInvalido("tipo de arquivo não permitido")
    # o teto de 5 MB vale para o original; grava-se só a versão limpa
    dados = limpar_metadados(tipo, dados)

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
        return AnexoSalvo(
            nome_interno=nome, tipo=tipo, tamanho=len(dados),
            sha256=hashlib.sha256(dados).hexdigest(),
            recebido_em=datetime.now(timezone.utc).isoformat(timespec="seconds"))
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
