"""Imagens mínimas e estruturalmente válidas, montadas byte a byte para os testes.

Cada função aceita blocos extras (metadados) para os testes de limpeza.
"""
from __future__ import annotations

import struct
import zlib


def bloco_png(tipo: bytes, dados: bytes) -> bytes:
    crc = zlib.crc32(tipo + dados) & 0xFFFFFFFF
    return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", crc)


def png(extras: list[bytes] = ()) -> bytes:
    """PNG 1x1 RGB; `extras` (blocos já montados) entram entre IHDR e IDAT."""
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    pixel = zlib.compress(b"\x00\xff\xff\xff")
    return (b"\x89PNG\r\n\x1a\n" + bloco_png(b"IHDR", ihdr) + b"".join(extras)
            + bloco_png(b"IDAT", pixel) + bloco_png(b"IEND", b""))


def segmento_jpeg(marcador: int, dados: bytes) -> bytes:
    return bytes([0xFF, marcador]) + struct.pack(">H", len(dados) + 2) + dados


def jpeg(extras: list[bytes] = (), apos_eoi: bytes = b"") -> bytes:
    """JPEG baseline 1x1 com JFIF; `extras` entram logo depois do APP0."""
    app0 = segmento_jpeg(0xE0, b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")
    dqt = segmento_jpeg(0xDB, b"\x00" + bytes(range(1, 65)))
    sof0 = segmento_jpeg(0xC0, b"\x08\x00\x01\x00\x01\x01\x01\x11\x00")
    dht = segmento_jpeg(0xC4, b"\x00" + b"\x01" + b"\x00" * 15 + b"\x00")
    sos = segmento_jpeg(0xDA, b"\x01\x01\x00\x00\x3f\x00")
    # dados comprimidos com um FF "recheado" (FF00) e um marcador de reinício
    entropia = b"\x12\xff\x00\x34\xff\xd0\x56"
    return (b"\xff\xd8" + app0 + b"".join(extras) + dqt + sof0 + dht + sos
            + entropia + b"\xff\xd9" + apos_eoi)


def gif(extras: list[bytes] = ()) -> bytes:
    """GIF89a 1x1 com paleta global de 2 cores; `extras` entram antes da imagem."""
    cabecalho = b"GIF89a" + struct.pack("<HH", 1, 1) + b"\x80\x00\x00"
    paleta = b"\x00\x00\x00\xff\xff\xff"
    gce = b"\x21\xf9\x04\x00\x00\x00\x00\x00"
    imagem = b"\x2c" + struct.pack("<HHHH", 0, 0, 1, 1) + b"\x00"
    lzw = b"\x02\x02\x44\x01\x00"  # tamanho mínimo 2, um sub-bloco, terminador
    return cabecalho + paleta + b"".join(extras) + gce + imagem + lzw + b"\x3b"


def extensao_gif(rotulo: int, dados: bytes) -> bytes:
    """Extensão com os dados em sub-blocos de até 255 bytes."""
    saida = bytes([0x21, rotulo])
    for i in range(0, len(dados), 255):
        parte = dados[i:i + 255]
        saida += bytes([len(parte)]) + parte
    return saida + b"\x00"


def bloco_riff(fourcc: bytes, dados: bytes) -> bytes:
    pad = b"\x00" if len(dados) % 2 else b""
    return fourcc + struct.pack("<I", len(dados)) + dados + pad


def webp(extras: list[bytes] = (), flags: int = 0) -> bytes:
    """WebP estendido (VP8X + VP8L); `extras` entram depois da imagem."""
    vp8x = bloco_riff(b"VP8X", bytes([flags]) + b"\x00" * 3 + b"\x00" * 6)
    # tamanho ímpar de propósito: exercita o byte de preenchimento
    vp8l = bloco_riff(b"VP8L", b"\x2f\x00\x00\x00\x00\x01\x02")
    corpo = b"WEBP" + vp8x + vp8l + b"".join(extras)
    return b"RIFF" + struct.pack("<I", len(corpo)) + corpo


def webp_simples() -> bytes:
    """WebP com um único bloco VP8L (sem VP8X)."""
    corpo = b"WEBP" + bloco_riff(b"VP8L", b"\x2f\x00\x00\x00\x00\x01\x02")
    return b"RIFF" + struct.pack("<I", len(corpo)) + corpo
