#!/usr/bin/env python
"""Teste de carga do portal do aluno: envia denúncias variadas e mede o tempo.

Só biblioteca padrão (http.client + threading), para rodar em qualquer máquina
com Python 3, inclusive no servidor da escola. O multipart é montado à mão.

Uso:
    python scripts/carga.py --alvo http://127.0.0.1:3000 --total 60 --concorrencia 6

Cada envio é uma denúncia nova: tipos em rodízio, duas anônimas para cada
identificada e um PNG minúsculo válido em metade delas. Os casos criados
ficam no banco; use uma pasta de dados de ensaio (veja docs/cenarios-escola.md).

O servidor limita 5 denúncias por 10 minutos por cliente. Resposta 429 é
tratada como limite esperado: conta à parte e não é falha. Para um ensaio com
limites elevados (config.json com "limites"), passe --sem-limite-esperado e um
429 passa a contar como falha.

Saída: 0 se não houve falha; 1 se houve qualquer falha (erro de rede, status
diferente de 201, resposta sem código válido) ou 429 com --sem-limite-esperado.
"""
from __future__ import annotations

import argparse
import http.client
import json
import re
import statistics
import struct
import sys
import threading
import time
import uuid
import zlib
from urllib.parse import urlsplit

TIPOS = ["cyberbullying", "ameaca", "vazamento", "golpe",
         "perfil_falso", "aliciamento", "outro"]
RELATOS = [
    "Um colega esta me xingando todos os dias no grupo da turma, ja faz duas semanas.",
    "Recebi uma mensagem dizendo que vao me bater na saida da escola amanha.",
    "Alguem divulgou fotos minhas sem eu autorizar em um perfil publico.",
    "Me mandaram um link dizendo que eu ganhei um premio e pediram a minha senha.",
    "Criaram um perfil falso com o meu nome e estao falando mal de outros alunos.",
    "Um adulto desconhecido insiste em conversar comigo e pede para eu guardar segredo.",
    "Aconteceu uma coisa estranha na internet e eu queria contar para a coordenacao.",
]
CODIGO = re.compile(r"[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}")


def png_minimo() -> bytes:
    """PNG 1x1 válido (assinatura, IHDR, IDAT, IEND), montado sem bibliotecas."""
    def bloco(tipo: bytes, dados: bytes) -> bytes:
        crc = zlib.crc32(tipo + dados) & 0xFFFFFFFF
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    pixel = zlib.compress(b"\x00\xff\xff\xff")
    return (b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", ihdr)
            + bloco(b"IDAT", pixel) + bloco(b"IEND", b""))


def multipart(campos: dict[str, str], arquivos: list[tuple[str, str, bytes]]):
    """Monta o corpo multipart/form-data; devolve (cabeçalho Content-Type, corpo)."""
    limite = "----carga" + uuid.uuid4().hex
    partes: list[bytes] = []
    for nome, valor in campos.items():
        partes.append(
            f'--{limite}\r\nContent-Disposition: form-data; name="{nome}"\r\n\r\n'
            .encode() + valor.encode("utf-8") + b"\r\n")
    for nome, arquivo, dados in arquivos:
        partes.append(
            f'--{limite}\r\nContent-Disposition: form-data; name="{nome}"; '
            f'filename="{arquivo}"\r\nContent-Type: image/png\r\n\r\n'.encode()
            + dados + b"\r\n")
    partes.append(f"--{limite}--\r\n".encode())
    return f"multipart/form-data; boundary={limite}", b"".join(partes)


def montar_envio(indice: int, png: bytes):
    """Corpo da denúncia número `indice`: tipo em rodízio, anonimato e anexo variados."""
    identificado = indice % 3 == 0  # duas anônimas para cada identificada
    campos = {
        "tipo": TIPOS[indice % len(TIPOS)],
        "relato": f"{RELATOS[indice % len(RELATOS)]} (carga {indice})",
        "anonimo": "false" if identificado else "true",
        "em_andamento": "true" if indice % 5 == 0 else "false",
    }
    if identificado:
        campos["nome"] = f"Aluno de Teste {indice}"
        campos["turma"] = "9A"
    arquivos = [("anexos[]", f"foto{indice}.png", png)] if indice % 2 == 0 else []
    return multipart(campos, arquivos)


class Resultado:
    def __init__(self) -> None:
        self.trava = threading.Lock()
        self.tempos: list[float] = []
        self.ok = 0
        self.limitados = 0
        self.falhas: list[str] = []

    def registrar(self, tempo: float, estado: str, detalhe: str = "") -> None:
        with self.trava:
            self.tempos.append(tempo)
            if estado == "ok":
                self.ok += 1
            elif estado == "429":
                self.limitados += 1
            else:
                self.falhas.append(detalhe)


def trabalhador(alvo, fila: list[int], trava: threading.Lock, res: Resultado,
                tolera_429: bool, png: bytes, timeout: float) -> None:
    conexao = None
    while True:
        with trava:
            if not fila:
                break
            indice = fila.pop()
        tipo_conteudo, corpo = montar_envio(indice, png)
        inicio = time.perf_counter()
        try:
            if conexao is None:
                classe = (http.client.HTTPSConnection if alvo.scheme == "https"
                          else http.client.HTTPConnection)
                conexao = classe(alvo.hostname, alvo.port, timeout=timeout)
            conexao.request("POST", "/api/denuncias", body=corpo,
                            headers={"Content-Type": tipo_conteudo})
            resposta = conexao.getresponse()
            dados = resposta.read()
            tempo = time.perf_counter() - inicio
            if resposta.status == 429 and tolera_429:
                res.registrar(tempo, "429")
                continue
            if resposta.status != 201:
                res.registrar(tempo, "falha", f"#{indice}: status {resposta.status}")
                continue
            try:
                codigo = json.loads(dados).get("codigo", "")
            except (ValueError, AttributeError):
                codigo = ""
            if not CODIGO.fullmatch(str(codigo)):
                res.registrar(tempo, "falha", f"#{indice}: resposta sem codigo valido")
            else:
                res.registrar(tempo, "ok")
        except (OSError, http.client.HTTPException) as erro:
            tempo = time.perf_counter() - inicio
            res.registrar(tempo, "falha", f"#{indice}: {type(erro).__name__}")
            if conexao is not None:
                conexao.close()
            conexao = None  # reconecta no próximo envio
    if conexao is not None:
        conexao.close()


def percentil(valores: list[float], p: float) -> float:
    """Percentil pelo método do posto mais próximo (sem interpolar)."""
    if not valores:
        return 0.0
    ordenados = sorted(valores)
    posto = -(-int(p * 1000) * len(ordenados) // 1000)  # teto de p * n
    return ordenados[max(0, min(len(ordenados) - 1, posto - 1))]


def rodar(alvo_url: str, total: int, concorrencia: int, tolera_429: bool,
          timeout: float = 30.0) -> tuple[Resultado, float]:
    alvo = urlsplit(alvo_url)
    if alvo.scheme not in ("http", "https") or not alvo.hostname:
        raise ValueError(f"alvo invalido: {alvo_url}")
    fila = list(range(total, 0, -1))  # pop() entrega 1, 2, 3...
    trava = threading.Lock()
    res = Resultado()
    png = png_minimo()
    inicio = time.perf_counter()
    threads = [
        threading.Thread(target=trabalhador,
                         args=(alvo, fila, trava, res, tolera_429, png, timeout))
        for _ in range(max(1, min(concorrencia, total)))
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return res, time.perf_counter() - inicio


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Teste de carga do portal do aluno.")
    ap.add_argument("--alvo", default="http://127.0.0.1:3000",
                    help="endereco do portal do aluno (padrao: %(default)s)")
    ap.add_argument("--total", type=int, default=60, help="denuncias a enviar")
    ap.add_argument("--concorrencia", type=int, default=6,
                    help="envios simultaneos")
    ap.add_argument("--sem-limite-esperado", action="store_true",
                    help="o servidor foi aberto com limites altos: 429 conta como falha")
    ap.add_argument("--timeout", type=float, default=30.0,
                    help="segundos por requisicao (padrao: %(default)s)")
    args = ap.parse_args(argv)
    if args.total < 1 or args.concorrencia < 1:
        ap.error("--total e --concorrencia precisam ser maiores que zero")
    try:
        res, duracao = rodar(args.alvo, args.total, args.concorrencia,
                             tolera_429=not args.sem_limite_esperado,
                             timeout=args.timeout)
    except ValueError as erro:
        ap.error(str(erro))

    print(f"enviadas: {len(res.tempos)} (aceitas {res.ok}, "
          f"limitadas por 429: {res.limitados})")
    print(f"falhas: {len(res.falhas)}")
    for linha in res.falhas[:10]:
        print(f"  {linha}")
    if res.tempos:
        mediana = statistics.median(res.tempos) * 1000
        p95 = percentil(res.tempos, 0.95) * 1000
        print(f"tempo mediano: {mediana:.0f} ms")
        print(f"p95: {p95:.0f} ms")
    print(f"duracao total: {duracao:.1f} s")
    return 1 if res.falhas else 0


if __name__ == "__main__":
    sys.exit(main())
