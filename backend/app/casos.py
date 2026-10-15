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
               anexos: list[AnexoSalvo], *, simulacao: bool = False,
               criado_em: str | None = None) -> str:
    """Grava o caso, a triagem, os anexos e o evento `criado` numa transação.

    Devolve o código em claro; só o hash fica no banco. Denúncia anônima
    nunca guarda nome nem turma. `simulacao` e `criado_em` só são usados
    pelo modo de ensaio; o caso já nasce marcado, no mesmo INSERT.
    """
    termos = carregar_termos(config.risk_terms_path)
    em_andamento = bool(dados.get("em_andamento"))
    triagem = classificar(dados["tipo"], dados["relato"], em_andamento, termos)
    anonimo = bool(dados.get("anonimo", True))
    nome = None if anonimo else dados.get("nome")
    turma = None if anonimo else dados.get("turma")
    agora = criado_em or _agora()

    for _ in range(5):  # nova tentativa só se o código colidir
        codigo = gerar_codigo()
        codigo_hash = hash_codigo(codigo, config.secret_key)
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                cur = conn.execute(
                    "INSERT INTO casos (codigo_hash, tipo, relato, quando, onde, "
                    "em_andamento, anonimo, nome, turma, prioridade, prioridade_original, pontos, "
                    "motivos_json, status, simulacao, criado_em, atualizado_em) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'novo',?,?,?)",
                    (codigo_hash, dados["tipo"], dados["relato"],
                     dados.get("quando"), dados.get("onde"), int(em_andamento),
                     int(anonimo), nome, turma, triagem.prioridade,
                     triagem.prioridade, triagem.pontos, json.dumps(list(triagem.motivos)),
                     int(simulacao), agora, agora),
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
                    (caso_id, f"prioridade {triagem.prioridade}", agora),
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


def listar_mensagens(conn: sqlite3.Connection, caso_id: int) -> list[sqlite3.Row]:
    """Mensagens do caso. Notas internas ficam em outra tabela e nunca entram."""
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


# --- consultas e ações da coordenação ------------------------------------

STATUS = ("novo", "em_investigacao", "resolvido")
PRIORIDADES = ("critica", "alta", "media", "baixa")  # ordem da fila
RESUMO_MAX = 120

_ORDEM_FILA = (
    "CASE prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 "
    "WHEN 'media' THEN 2 ELSE 3 END, "
    "criado_em, id"
)


def _bools(d: dict) -> dict:
    for campo in ("em_andamento", "anonimo", "simulacao"):
        if campo in d:
            d[campo] = bool(d[campo])
    return d


def listar_fila(conn: sqlite3.Connection, status: str | None = None,
                tipo: str | None = None) -> list[dict]:
    """Fila da coordenação: prioridade (critica, alta, media, baixa) e depois antiguidade.

    Os filtros chegam já validados pela rota; aqui só entram como parâmetro.
    """
    filtros, params = [], []
    if status:
        filtros.append("status = ?")
        params.append(status)
    if tipo:
        filtros.append("tipo = ?")
        params.append(tipo)
    onde = f"WHERE {' AND '.join(filtros)} " if filtros else ""
    linhas = conn.execute(
        "SELECT id, tipo, prioridade, pontos, status, em_andamento, anonimo, "
        "simulacao, relato, criado_em, atualizado_em FROM casos "
        f"{onde}ORDER BY {_ORDEM_FILA}",
        params,
    ).fetchall()
    fila = []
    for linha in linhas:
        d = _bools(dict(linha))
        d["resumo"] = d.pop("relato")[:RESUMO_MAX]
        fila.append(d)
    return fila


def existe_caso(conn: sqlite3.Connection, caso_id: int) -> bool:
    return conn.execute(
        "SELECT 1 FROM casos WHERE id = ?", (caso_id,)
    ).fetchone() is not None


# Colunas nomeadas: uma coluna sensível nova na tabela (como codigo_hash)
# nunca vaza para a coordenação sem alguém incluí-la aqui de propósito.
COLUNAS_DETALHE = (
    "id", "tipo", "relato", "quando", "onde", "em_andamento", "anonimo",
    "nome", "turma", "prioridade", "prioridade_original", "pontos",
    "motivos_json", "status", "simulacao", "criado_em", "atualizado_em",
)


def detalhe_caso(conn: sqlite3.Connection, caso_id: int) -> dict | None:
    """Caso completo para a coordenação, sem o hash do código."""
    linha = conn.execute(
        f"SELECT {', '.join(COLUNAS_DETALHE)} FROM casos WHERE id = ?", (caso_id,)
    ).fetchone()
    if linha is None:
        return None
    caso = _bools(dict(linha))
    caso["motivos"] = json.loads(caso.pop("motivos_json") or "[]")
    caso["anexos"] = [
        dict(a) for a in conn.execute(
            "SELECT id, tipo, tamanho FROM anexos WHERE caso_id = ? ORDER BY id",
            (caso_id,),
        )
    ]
    caso["eventos"] = [
        dict(e) for e in conn.execute(
            "SELECT e.id, e.tipo, e.usuario_id, u.nome AS usuario, e.detalhe, "
            "e.criado_em FROM eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id "
            "WHERE e.caso_id = ? ORDER BY e.id",
            (caso_id,),
        )
    ]
    caso["mensagens"] = [dict(m) for m in listar_mensagens(conn, caso_id)]
    caso["notas"] = [
        dict(n) for n in conn.execute(
            "SELECT n.id, n.usuario_id, u.nome AS usuario, n.texto, n.criado_em "
            "FROM notas_internas n LEFT JOIN usuarios u ON u.id = n.usuario_id "
            "WHERE n.caso_id = ? ORDER BY n.id",
            (caso_id,),
        )
    ]
    return caso


def _mudar(conn: sqlite3.Connection, caso_id: int, campo: str, valor: str,
           usuario_id: int, detalhe) -> bool:
    """Muda `status` ou `prioridade` e registra o evento (tipo = campo).

    Leitura, atualização e evento ficam na mesma transação. Devolve False se
    o caso não existe. Mesmo valor não grava nada. `detalhe(anterior)` monta
    o texto do evento.
    """
    if campo not in ("status", "prioridade"):
        raise ValueError("campo nao editavel")
    conn.execute("BEGIN IMMEDIATE")
    try:
        linha = conn.execute(
            f"SELECT {campo} FROM casos WHERE id = ?", (caso_id,)
        ).fetchone()
        if linha is None:
            conn.rollback()
            return False
        anterior = linha[0]
        if anterior != valor:
            conn.execute(
                f"UPDATE casos SET {campo} = ?, atualizado_em = ? WHERE id = ?",
                (valor, _agora(), caso_id),
            )
            registrar_evento(conn, caso_id, campo, usuario_id,
                             detalhe(anterior), commit=False)
        conn.commit()
        return True
    except BaseException:
        conn.rollback()
        raise


def mudar_status(conn: sqlite3.Connection, caso_id: int, valor: str,
                 usuario_id: int) -> bool:
    """Marca o caso como novo ou em investigação (reabrir um resolvido vale).

    `resolvido` não passa por aqui: vem só da resolução. False se o caso não
    existe.
    """
    if valor not in ("novo", "em_investigacao"):
        raise ValueError("status invalido")
    return _mudar(conn, caso_id, "status", valor, usuario_id,
                  lambda ant: f"status: {ant} -> {valor}")


def mudar_prioridade(conn: sqlite3.Connection, caso_id: int, valor: str,
                     justificativa: str, usuario_id: int) -> bool:
    """Troca a prioridade com justificativa; `prioridade_original` não muda."""
    if valor not in PRIORIDADES:
        raise ValueError("prioridade invalida")
    return _mudar(conn, caso_id, "prioridade", valor, usuario_id,
                  lambda ant: f"{ant} -> {valor}: {justificativa}")


def adicionar_nota(conn: sqlite3.Connection, caso_id: int, usuario_id: int,
                   texto: str, commit: bool = True) -> None:
    """Nota interna: só a coordenação vê; nunca vai para o aluno."""
    conn.execute(
        "INSERT INTO notas_internas (caso_id, usuario_id, texto, criado_em) "
        "VALUES (?,?,?,?)",
        (caso_id, usuario_id, texto, _agora()),
    )
    if commit:
        conn.commit()


def anexo_do_caso(conn: sqlite3.Connection, caso_id: int,
                  anexo_id: int) -> sqlite3.Row | None:
    """Anexo só se pertencer ao caso pedido; senão None."""
    return conn.execute(
        "SELECT id, nome_interno, tipo FROM anexos WHERE id = ? AND caso_id = ?",
        (anexo_id, caso_id),
    ).fetchone()
