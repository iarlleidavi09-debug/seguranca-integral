"""Trilha de evidências: conferência de integridade, registro de acessos e dossiê em PDF.

O carimbo de data e o hash são do servidor da escola, não de terceiro
confiável. O documento é um "registro de integridade", nunca prova legal.
O dossiê não leva o texto do relato nem anexos de resolução.
"""
from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime, timezone

from .config import Config
from .uploads import AnexoInvalido, caminho_anexo

ACOES = ("visualizar", "exportar")

# estados de integridade de um anexo
INTEGRO = "integro"
DIVERGENTE = "divergente"
SEM_REGISTRO = "sem_registro"
AUSENTE = "ausente"


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def registrar_acesso(conn: sqlite3.Connection, caso_id: int, anexo_id: int | None,
                     usuario_id: int, acao: str) -> None:
    """Acrescenta um acesso. Só existe inserção: nada edita nem apaga o registro."""
    if acao not in ACOES:
        raise ValueError("acao invalida")
    conn.execute(
        "INSERT INTO acessos_anexo (caso_id, anexo_id, usuario_id, acao, criado_em) "
        "VALUES (?,?,?,?,?)", (caso_id, anexo_id, usuario_id, acao, _agora()))
    conn.commit()


def listar_acessos(conn: sqlite3.Connection, caso_id: int) -> list[dict]:
    return [dict(l) for l in conn.execute(
        "SELECT a.id, a.anexo_id, a.acao, a.criado_em, u.nome AS usuario "
        "FROM acessos_anexo a LEFT JOIN usuarios u ON u.id = a.usuario_id "
        "WHERE a.caso_id = ? ORDER BY a.id", (caso_id,))]


def _hash_do_arquivo(config: Config, nome_interno: str) -> str | None:
    try:
        return hashlib.sha256(caminho_anexo(config, nome_interno).read_bytes()).hexdigest()
    except (AnexoInvalido, OSError):
        return None


def conferir_anexos(conn: sqlite3.Connection, config: Config, caso_id: int) -> list[dict]:
    """Recalcula o hash de cada anexo do caso e compara com o registrado."""
    saida = []
    for a in conn.execute(
            "SELECT id, nome_interno, tipo, tamanho, sha256, recebido_em "
            "FROM anexos WHERE caso_id = ? ORDER BY id", (caso_id,)):
        atual = _hash_do_arquivo(config, a["nome_interno"])
        if atual is None:
            estado = AUSENTE
        elif not a["sha256"]:
            estado = SEM_REGISTRO
        else:
            estado = INTEGRO if atual == a["sha256"] else DIVERGENTE
        saida.append({"id": a["id"], "tipo": a["tipo"], "tamanho": a["tamanho"],
                      "sha256": a["sha256"], "recebido_em": a["recebido_em"],
                      "sha256_atual": atual, "estado": estado})
    return saida


def pode_exportar(conn: sqlite3.Connection, caso_id: int, usuario: dict) -> bool:
    """Admin ou responsável do caso (ruling provisório, configurável aqui)."""
    if usuario["papel"] == "admin":
        return True
    linha = conn.execute("SELECT responsavel_id FROM casos WHERE id = ?",
                         (caso_id,)).fetchone()
    return linha is not None and linha["responsavel_id"] == usuario["id"]


# --- PDF mínimo -----------------------------------------------------------
# Texto simples em Courier (largura fixa), sem dependência externa. A largura
# fixa permite quebrar linhas com exatidão.

_LARGURA, _ALTURA, _MARGEM, _CORPO, _ENTRELINHA = 595, 842, 50, 9, 12
_COLUNAS = 90
_LINHAS_POR_PAGINA = int((_ALTURA - 2 * _MARGEM) // _ENTRELINHA)


def _escapar(texto: str) -> bytes:
    bruto = texto.encode("cp1252", "replace")
    return bruto.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def _quebrar(linha: str) -> list[str]:
    if not linha:
        return [""]
    return [linha[i:i + _COLUNAS] for i in range(0, len(linha), _COLUNAS)]


def gerar_pdf(linhas: list[str]) -> bytes:
    """Monta um PDF de texto a partir de linhas já escritas."""
    fisicas: list[str] = []
    for l in linhas:
        fisicas.extend(_quebrar(l))
    paginas = [fisicas[i:i + _LINHAS_POR_PAGINA]
               for i in range(0, len(fisicas), _LINHAS_POR_PAGINA)] or [[]]
    objetos: list[bytes] = []
    # 1 catálogo, 2 páginas, 3 fonte, depois (página, conteúdo) por página
    ids_paginas = [4 + 2 * i for i in range(len(paginas))]
    objetos.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids = b" ".join(b"%d 0 R" % i for i in ids_paginas)
    objetos.append(b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(paginas))
    objetos.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier "
                   b"/Encoding /WinAnsiEncoding >>")
    for i, pagina in enumerate(paginas):
        fluxo = bytearray(b"BT /F1 %d Tf %d TL %d %d Td\n" % (
            _CORPO, _ENTRELINHA, _MARGEM, _ALTURA - _MARGEM - _CORPO))
        for l in pagina:
            fluxo += b"(" + _escapar(l) + b") '\n"
        fluxo += b"ET"
        objetos.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "
            b"/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>"
            % (_LARGURA, _ALTURA, ids_paginas[i] + 1))
        objetos.append(b"<< /Length %d >>\nstream\n" % len(fluxo) + bytes(fluxo)
                       + b"\nendstream")
    saida = bytearray(b"%PDF-1.4\n")
    posicoes = []
    for n, corpo in enumerate(objetos, 1):
        posicoes.append(len(saida))
        saida += b"%d 0 obj\n" % n + corpo + b"\nendobj\n"
    xref = len(saida)
    saida += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objetos) + 1)
    for p in posicoes:
        saida += b"%010d 00000 n \n" % p
    saida += (b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
              % (len(objetos) + 1, xref))
    return bytes(saida)


_ROTULO_ACAO = {"visualizar": "visualizou", "exportar": "exportou"}
_STATUS = {"novo": "Recebido", "em_investigacao": "Em investigação",
           "resolvido": "Resolvido"}
_ESTADO = {INTEGRO: "integro (hash confere)",
           DIVERGENTE: "DIVERGENTE (arquivo diferente do registrado)",
           SEM_REGISTRO: "sem registro de integridade",
           AUSENTE: "arquivo nao encontrado"}


def montar_dossie(conn: sqlite3.Connection, config: Config, caso_id: int) -> bytes | None:
    """PDF do dossiê, ou None se o caso não existir. Não inclui o texto do relato."""
    caso = conn.execute(
        "SELECT c.id, c.canal, c.tipo, c.prioridade, c.status, c.anonimo, "
        "c.criado_em, c.atualizado_em, u.nome AS responsavel "
        "FROM casos c LEFT JOIN usuarios u ON u.id = c.responsavel_id "
        "WHERE c.id = ?", (caso_id,)).fetchone()
    if caso is None:
        return None
    anexos = conferir_anexos(conn, config, caso_id)
    eventos = conn.execute(
        "SELECT e.tipo, e.criado_em, u.nome AS usuario FROM eventos e "
        "LEFT JOIN usuarios u ON u.id = e.usuario_id "
        "WHERE e.caso_id = ? ORDER BY e.id", (caso_id,)).fetchall()
    acessos = listar_acessos(conn, caso_id)
    L = [f"DOSSIE DO CASO {caso['id']} - REGISTRO DE INTEGRIDADE", "",
         "Gerado em (UTC): " + _agora(),
         "Aviso: data e hash sao do servidor da escola, nao de terceiro",
         "confiavel. Este documento e um registro de integridade e nao",
         "constitui prova legal. Nao contem o texto do relato.", "",
         "1. DADOS DO CASO",
         f"Numero interno: {caso['id']}",
         "Canal: " + ("Acolhimento anonimo" if caso["canal"] == "acolhimento" else "Relato"),
         f"Tipo: {caso['tipo']}", f"Prioridade: {caso['prioridade']}",
         "Situacao: " + _STATUS.get(caso["status"], caso["status"]),
         "Relator anonimo: " + ("sim" if caso["anonimo"] else "nao"),
         f"Recebido em (UTC): {caso['criado_em']}",
         f"Ultima atualizacao (UTC): {caso['atualizado_em']}",
         "Responsavel: " + (caso["responsavel"] or "nao definido"), "",
         "2. CRONOLOGIA"]
    L += [f"{e['criado_em']}  {e['tipo']}  ({e['usuario'] or 'sistema'})" for e in eventos] \
        or ["Nenhum evento."]
    L += ["", "3. ANEXOS (hash SHA-256)"]
    if not anexos:
        L.append("Nenhum anexo.")
    for a in anexos:
        L += [f"Anexo {a['id']}: {a['tipo']}, {a['tamanho']} bytes",
              "  Recebido em (UTC): " + (a["recebido_em"] or "sem registro"),
              "  Hash registrado:   " + (a["sha256"] or "sem registro de integridade"),
              "  Hash recalculado:  " + (a["sha256_atual"] or "indisponivel"),
              "  Conferencia:       " + _ESTADO[a["estado"]]]
    L += ["", "4. REGISTRO DE ACESSOS AOS ANEXOS"]
    L += [f"{x['criado_em']}  {x['usuario'] or 'desconhecido'} "
          f"{_ROTULO_ACAO[x['acao']]} " + (f"o anexo {x['anexo_id']}" if x["anexo_id"]
                                           else "o dossie do caso")
          for x in acessos] or ["Nenhum acesso registrado."]
    return gerar_pdf(L)
