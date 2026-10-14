"""Camada de dados dos casos: criar, consultar, mensagens e eventos."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from .codes import gerar_codigo, hash_codigo, normalizar_codigo
from .config import Config
from .triage import carregar_termos, classificar
from .uploads import AnexoSalvo

TIPOS = (
    "cyberbullying", "ameaca", "vazamento", "golpe",
    "perfil_falso", "aliciamento", "outro",
)


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def registrar_evento(conn: sqlite3.Connection, caso_id: int, tipo: str,
                     usuario_id: int | None, detalhe: str,
                     commit: bool = True) -> None:
    conn.execute(
        "INSERT INTO eventos (caso_id, tipo, usuario_id, detalhe, criado_em) "
        "VALUES (?, ?, ?, ?, ?)",
        (caso_id, tipo, usuario_id, detalhe, _agora()),
    )
    if commit:
        conn.commit()


def criar_caso(conn: sqlite3.Connection, config: Config, dados: dict,
               anexos: list[AnexoSalvo]) -> str:
    """Grava o caso, a triagem, os anexos e o evento `criado` numa transação.

    Devolve o código em claro; só o hash fica no banco. Denúncia anônima
    nunca guarda nome nem turma.
    """
    termos = carregar_termos(config.risk_terms_path)
    em_andamento = bool(dados.get("em_andamento"))
    triagem = classificar(dados["tipo"], dados["relato"], em_andamento, termos)
    anonimo = bool(dados.get("anonimo", True))
    nome = None if anonimo else dados.get("nome")
    turma = None if anonimo else dados.get("turma")
    agora = _agora()

    for _ in range(5):  # nova tentativa só se o código colidir
        codigo = gerar_codigo()
        codigo_hash = hash_codigo(codigo, config.secret_key)
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                cur = conn.execute(
                    "INSERT INTO casos (codigo_hash, tipo, relato, quando, onde, "
                    "em_andamento, anonimo, nome, turma, gravidade, pontos, "
                    "motivos_json, status, criado_em, atualizado_em) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'novo',?,?)",
                    (codigo_hash, dados["tipo"], dados["relato"],
                     dados.get("quando"), dados.get("onde"), int(em_andamento),
                     int(anonimo), nome, turma, triagem.gravidade,
                     triagem.pontos, json.dumps(list(triagem.motivos)),
                     agora, agora),
                )
                caso_id = cur.lastrowid
                for a in anexos:
                    conn.execute(
                        "INSERT INTO anexos (caso_id, nome_interno, tipo, tamanho) "
                        "VALUES (?,?,?,?)",
                        (caso_id, a.nome_interno, a.tipo, a.tamanho),
                    )
                conn.execute(
                    "INSERT INTO eventos (caso_id, tipo, usuario_id, detalhe, criado_em) "
                    "VALUES (?, 'criado', NULL, ?, ?)",
                    (caso_id, f"gravidade {triagem.gravidade}", agora),
                )
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
            return codigo
        except sqlite3.IntegrityError as erro:
            if "codigo_hash" not in str(erro):
                raise
    raise RuntimeError("nao foi possivel gerar codigo unico")


def caso_por_codigo(conn: sqlite3.Connection, config: Config,
                    codigo: str) -> sqlite3.Row | None:
    """Busca pelo código digitado; malformado e inexistente dão o mesmo None."""
    normalizado = normalizar_codigo(codigo)
    if normalizado is None:
        return None
    return conn.execute(
        "SELECT * FROM casos WHERE codigo_hash = ?",
        (hash_codigo(normalizado, config.secret_key),),
    ).fetchone()


def listar_mensagens(conn: sqlite3.Connection, caso_id: int,
                     apenas_publicas: bool = True) -> list[sqlite3.Row]:
    """Mensagens do caso. Notas internas ficam em outra tabela e nunca entram."""
    # `apenas_publicas` existe para a coordenação ampliar a lista no futuro;
    # hoje toda mensagem é visível ao aluno.
    return conn.execute(
        "SELECT autor, texto, criado_em FROM mensagens WHERE caso_id = ? "
        "ORDER BY id",
        (caso_id,),
    ).fetchall()


def adicionar_mensagem(conn: sqlite3.Connection, caso_id: int, autor: str,
                       texto: str, commit: bool = True) -> None:
    agora = _agora()
    conn.execute(
        "INSERT INTO mensagens (caso_id, autor, texto, criado_em) VALUES (?,?,?,?)",
        (caso_id, autor, texto, agora),
    )
    conn.execute("UPDATE casos SET atualizado_em = ? WHERE id = ?", (agora, caso_id))
    if commit:
        conn.commit()
