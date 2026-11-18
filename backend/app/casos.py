"""Camada de dados dos casos: criar, consultar, mensagens e eventos."""
from __future__ import annotations

import json
import sqlite3
import unicodedata
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


def _extras_do_questionario(config: Config, respostas: dict | None) -> dict:
    """Pesos, alertas e faixas do questionário; vazio sem respostas.

    Sem respostas a definição nem é lida. Definição que não carrega não
    impede a denúncia: o caso nasce sem os extras.
    """
    if not respostas:
        return {}
    # import tardio: questionario importa TIPOS deste módulo
    from .questionario import QuestionarioInvalido, carregar
    try:
        definicao = carregar(config.questionario_path)
    except QuestionarioInvalido:
        return {}
    pontos, motivos, alertas = definicao.pontuar(respostas)
    return {"extra_pontos": pontos, "extra_motivos": tuple(motivos),
            "alertas": tuple(alertas), "limiares": definicao.limiares()}


def criar_caso(conn: sqlite3.Connection, config: Config, dados: dict,
               anexos: list[AnexoSalvo], *, simulacao: bool = False,
               criado_em: str | None = None,
               respostas: dict | None = None) -> str:
    """Grava o caso, a triagem, os anexos e o evento `criado` numa transação.

    Guarda o código original para o detalhe autenticado da equipe. Denúncia anônima
    nunca guarda nome nem turma. `simulacao` e `criado_em` só são usados
    pelo modo de ensaio; o caso já nasce marcado, no mesmo INSERT.
    `respostas` é o dicionário já validado do questionário (ou None).
    """
    termos = carregar_termos(config.risk_terms_path)
    em_andamento = bool(dados.get("em_andamento"))
    extras = _extras_do_questionario(config, respostas)
    triagem = classificar(dados["tipo"], dados["relato"], em_andamento, termos,
                          **extras)
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
                    "motivos_json, status, simulacao, criado_em, atualizado_em, respostas_json) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'novo',?,?,?,?)",
                    (codigo_hash, dados["tipo"], dados["relato"],
                     dados.get("quando"), dados.get("onde"), int(em_andamento),
                     int(anonimo), nome, turma, triagem.prioridade,
                     triagem.prioridade, triagem.pontos, json.dumps(list(triagem.motivos)),
                     int(simulacao), agora, agora,
                     json.dumps(respostas) if respostas else None),
                )
                caso_id = cur.lastrowid
                conn.execute('UPDATE casos SET codigo_acompanhamento=? WHERE id=?',
                             (codigo, caso_id))
                for a in anexos:
                    conn.execute(
                        "INSERT INTO anexos (caso_id, nome_interno, tipo, tamanho, "
                        "sha256, recebido_em) VALUES (?,?,?,?,?,?)",
                        (caso_id, a.nome_interno, a.tipo, a.tamanho,
                         a.sha256, a.recebido_em),
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
    caso = conn.execute(
        "SELECT * FROM casos WHERE codigo_hash = ?",
        (hash_codigo(normalizado, config.secret_key),),
    ).fetchone()
    if caso is not None and caso['codigo_acompanhamento'] is None:
        # Bancos antigos têm só HMAC: um acesso válido recupera o código original.
        conn.execute('UPDATE casos SET codigo_acompanhamento=? WHERE id=? AND codigo_acompanhamento IS NULL',
                     (normalizado, caso['id']))
        conn.commit()
    return caso


def listar_mensagens(conn: sqlite3.Connection, caso_id: int) -> list[sqlite3.Row]:
    """Mensagens do caso. Notas internas ficam em outra tabela e nunca entram."""
    return conn.execute(
        "SELECT id, autor, texto, criado_em, editada_em, apagada_em "
        "FROM mensagens WHERE caso_id = ? ORDER BY id",
        (caso_id,),
    ).fetchall()


def adicionar_mensagem(conn: sqlite3.Connection, caso_id: int, autor: str,
                       texto: str, commit: bool = True,
                       usuario_id: int | None = None) -> None:
    """`usuario_id` é quem da coordenação escreveu; None para o aluno."""
    agora = _agora()
    conn.execute(
        "INSERT INTO mensagens (caso_id, autor, texto, criado_em, usuario_id) "
        "VALUES (?,?,?,?,?)",
        (caso_id, autor, texto, agora, usuario_id),
    )
    conn.execute("UPDATE casos SET atualizado_em = ? WHERE id = ?", (agora, caso_id))
    if commit:
        conn.commit()


def pode_alterar_mensagem(mensagem, usuario_id: int, papel: str) -> bool:
    """Só mensagens da coordenação: o autor ou o admin. Sem autor, só o admin."""
    if mensagem["autor"] != "coordenacao":
        return False
    if papel == "admin":
        return True
    return mensagem["usuario_id"] is not None and mensagem["usuario_id"] == usuario_id


def _mensagem_do_caso(conn: sqlite3.Connection, caso_id: int, mensagem_id: int):
    return conn.execute(
        "SELECT id, autor, texto, usuario_id, apagada_em FROM mensagens "
        "WHERE id = ? AND caso_id = ?",
        (mensagem_id, caso_id),
    ).fetchone()


def _guardar_versao(conn: sqlite3.Connection, caso_id: int, mensagem_id: int,
                    texto: str, acao: str, usuario_id: int, agora: str) -> None:
    conn.execute(
        "INSERT INTO mensagens_versoes (mensagem_id, caso_id, texto, acao, "
        "usuario_id, criado_em) VALUES (?,?,?,?,?,?)",
        (mensagem_id, caso_id, texto, acao, usuario_id, agora),
    )


def alterar_mensagem(conn: sqlite3.Connection, caso_id: int, mensagem_id: int,
                     usuario_id: int, papel: str, texto: str) -> str:
    """Edita o texto; a versão anterior fica guardada. Não mexe em `atualizado_em`."""
    msg = _mensagem_do_caso(conn, caso_id, mensagem_id)
    if msg is None:
        return "inexistente"
    if not pode_alterar_mensagem(msg, usuario_id, papel):
        return "proibido"
    if msg["apagada_em"] is not None:
        return "apagada"
    if texto == msg["texto"]:
        return "sem_mudanca"
    agora = _agora()
    try:
        # condicional: uma exclusão concorrente não pode ser sobrescrita
        mudou = conn.execute(
            "UPDATE mensagens SET texto = ?, editada_em = ? "
            "WHERE id = ? AND apagada_em IS NULL",
            (texto, agora, mensagem_id)).rowcount
        if mudou == 0:
            conn.rollback()
            return "apagada"
        _guardar_versao(conn, caso_id, mensagem_id, msg["texto"], "edicao",
                        usuario_id, agora)
        # o detalhe nunca leva o texto da mensagem
        registrar_evento(conn, caso_id, "mensagem_editada", usuario_id,
                         f"mensagem {mensagem_id}", commit=False)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return "ok"


def apagar_mensagem(conn: sqlite3.Connection, caso_id: int, mensagem_id: int,
                    usuario_id: int, papel: str) -> str:
    """Limpa o texto e marca `apagada_em`; o texto original fica na versão."""
    msg = _mensagem_do_caso(conn, caso_id, mensagem_id)
    if msg is None:
        return "inexistente"
    if not pode_alterar_mensagem(msg, usuario_id, papel):
        return "proibido"
    if msg["apagada_em"] is not None:
        return "ja_apagada"
    agora = _agora()
    try:
        mudou = conn.execute(
            "UPDATE mensagens SET texto = '', apagada_em = ? "
            "WHERE id = ? AND apagada_em IS NULL", (agora, mensagem_id)).rowcount
        if mudou == 0:
            conn.rollback()
            return "ja_apagada"
        _guardar_versao(conn, caso_id, mensagem_id, msg["texto"], "exclusao",
                        usuario_id, agora)
        registrar_evento(conn, caso_id, "mensagem_apagada", usuario_id,
                         f"mensagem {mensagem_id}", commit=False)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return "ok"


def versoes_mensagem(conn: sqlite3.Connection, caso_id: int,
                     mensagem_id: int) -> list[dict] | None:
    """Histórico da mensagem, mais antigo primeiro; None se não é deste caso."""
    if _mensagem_do_caso(conn, caso_id, mensagem_id) is None:
        return None
    return [
        dict(v) for v in conn.execute(
            "SELECT v.id, v.texto, v.acao, u.nome AS usuario, v.criado_em "
            "FROM mensagens_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id "
            "WHERE v.mensagem_id = ? ORDER BY v.id",
            (mensagem_id,),
        )
    ]


# --- consultas e ações da coordenação ------------------------------------

def estado_conversa(conn: sqlite3.Connection, caso_id: int,
                    usuario_id: int | None) -> dict:
    ultima = conn.execute(
        'SELECT id, autor, texto, criado_em, apagada_em FROM mensagens '
        'WHERE caso_id=? ORDER BY id DESC LIMIT 1',
        (caso_id,),
    ).fetchone()
    novas = conn.execute(
        "SELECT count(*) FROM mensagens WHERE caso_id=? AND autor='aluno' "
        "AND id > coalesce((SELECT ultimo_id FROM leituras_conversa WHERE caso_id=? AND usuario_id=?),0)",
        (caso_id, caso_id, usuario_id),
    ).fetchone()[0]
    estado = ('sem_mensagem' if ultima is None else 'mensagem_nova' if novas else
              'aguardando_equipe' if ultima['autor'] == 'aluno' else 'aguardando_aluno')
    return {'conversa_estado': estado, 'mensagens_novas': novas,
            'ultima_mensagem': dict(ultima) if ultima else None}


def registrar_leitura_conversa(conn: sqlite3.Connection, caso_id: int,
                              usuario_id: int, ultimo_id: int) -> bool:
    # O ID precisa pertencer ao caso. Não avançar ao MAX atual: uma mensagem
    # recebida depois de montar o detalhe ainda não foi exibida.
    if not conn.execute('SELECT 1 FROM mensagens WHERE caso_id=? AND id=?',
                        (caso_id, ultimo_id)).fetchone():
        return False
    conn.execute(
        'INSERT INTO leituras_conversa (caso_id, usuario_id, ultimo_id) VALUES (?,?,?) '
        'ON CONFLICT(caso_id,usuario_id) DO UPDATE SET ultimo_id=max(ultimo_id,excluded.ultimo_id)',
        (caso_id, usuario_id, ultimo_id),
    )
    conn.commit()
    return True

STATUS = ("novo", "em_investigacao", "resolvido")
DESFECHOS = ("solucionada", "intervencao_realizada")
SITUACOES = ("melhorou", "voltou")
PRIORIDADES = ("critica", "alta", "media", "baixa")  # ordem da fila
RESUMO_MAX = 120

_ORDEM_FILA = (
    "CASE c.prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 "
    "WHEN 'media' THEN 2 ELSE 3 END, "
    "c.criado_em, c.id"
)


def _bools(d: dict) -> dict:
    for campo in ("em_andamento", "anonimo", "simulacao", "recorrencia_pendente"):
        if campo in d:
            d[campo] = bool(d[campo])
    return d


BUSCA_MAX = 100
ID_MAX = 2**63 - 1  # maior inteiro que o SQLite aceita como parâmetro


def _normalizar(texto) -> str:
    """Minúsculas sem acento, para comparar busca e relato; None vira ''."""
    if texto is None:
        return ""
    decomposto = unicodedata.normalize("NFKD", str(texto).casefold())
    return "".join(c for c in decomposto if not unicodedata.combining(c))


def _escapar_like(texto: str) -> str:
    return (texto.replace("\\", "\\\\").replace("%", "\\%")
            .replace("_", "\\_"))


def listar_fila(conn: sqlite3.Connection, status: str | None = None,
                prioridade: str | None = None, tipo: str | None = None,
                q: str | None = None, grupo: str | None = None,
                opcao: str | None = None, usuario_id: int | None = None) -> list[dict]:
    """Fila da coordenação: prioridade (critica, alta, media, baixa) e depois antiguidade.

    Os filtros chegam já validados pela rota; aqui só entram como parâmetro.
    `q` só com dígitos casa o número do caso ou o texto; senão, só o texto
    do relato (sem diferenciar maiúsculas nem acentos; `%`, `_` e a barra invertida valem como texto).
    """
    filtros, params = [], []
    if status == 'abertos':
        filtros.append("c.status != 'resolvido'")
        status = None
    for coluna, valor in (("c.status", status), ("c.prioridade", prioridade),
                          ("c.tipo", tipo)):
        if valor:
            filtros.append(f"{coluna} = ?")
            params.append(valor)
    if q:
        # função local a esta chamada: o LOWER() do SQLite só cobre ASCII
        conn.create_function("norm", 1, _normalizar, deterministic=True)
        trecho = "norm(c.relato) LIKE ? ESCAPE '\\'"
        padrao = f"%{_escapar_like(_normalizar(q))}%"
        if q.isascii() and q.isdigit() and int(q) <= ID_MAX:
            filtros.append(f"(c.id = ? OR {trecho})")
            params.extend([int(q), padrao])
        else:
            filtros.append(trecho)
            params.append(padrao)
    onde = f"WHERE {' AND '.join(filtros)} " if filtros else ""
    linhas = conn.execute(
        "SELECT c.id, c.canal, c.tipo, c.prioridade, c.pontos, c.status, c.em_andamento, "
        "c.anonimo, c.simulacao, c.relato, c.criado_em, c.atualizado_em, "
        "c.recorrencia_pendente, c.motivos_json, c.triagem_snapshot_json, c.revisao_estado, "
        "u.nome AS ultimo_acesso_por, c.ultimo_acesso_em "
        "FROM casos c LEFT JOIN usuarios u ON u.id = c.ultimo_acesso_por "
        f"{onde}ORDER BY {_ORDEM_FILA}",
        params,
    ).fetchall()
    fila = []
    from .atendimento import listar_atendimentos
    atendimentos = listar_atendimentos(conn)
    from .questionario_v3 import projetar
    for linha in linhas:
        d = _bools(dict(linha))
        snapshot_json = d.pop('triagem_snapshot_json')
        d['categorias'], d['opcoes'] = projetar(d['tipo'], snapshot_json)
        d['assuntos'] = _assuntos_snapshot(snapshot_json)
        if (grupo and grupo not in d['categorias']) or (opcao and opcao not in d['opcoes']):
            continue
        d["motivos"] = json.loads(d.pop("motivos_json") or "[]")
        d["resumo"] = d.pop("relato")[:RESUMO_MAX]
        d.update(atendimentos[d['id']])
        d.update(estado_conversa(conn, d['id'], usuario_id))
        fila.append(d)
    return fila


def resumo(conn: sqlite3.Connection, *, somente_abertos: bool = False) -> dict:
    """Contagens para o painel; todas as chaves aparecem, mesmo com zero."""
    por_status = dict.fromkeys(STATUS, 0)
    por_prioridade = dict.fromkeys(PRIORIDADES, 0)
    filtro = " WHERE status != 'resolvido'" if somente_abertos else ''
    for linha in conn.execute("SELECT status, COUNT(*) FROM casos" + filtro + " GROUP BY status"):
        if linha[0] in por_status:
            por_status[linha[0]] = linha[1]
    for linha in conn.execute(
            "SELECT prioridade, COUNT(*) FROM casos" + filtro + " GROUP BY prioridade"):
        if linha[0] in por_prioridade:
            por_prioridade[linha[0]] = linha[1]
    recorrencia = conn.execute(
        "SELECT COUNT(*) FROM casos WHERE recorrencia_pendente = 1" +
        (" AND status != 'resolvido'" if somente_abertos else '')
    ).fetchone()[0]
    return {"status": por_status, "prioridade": por_prioridade,
            "recorrencia_pendente": recorrencia}


def existe_caso(conn: sqlite3.Connection, caso_id: int) -> bool:
    return conn.execute(
        "SELECT 1 FROM casos WHERE id = ?", (caso_id,)
    ).fetchone() is not None


# Colunas nomeadas: uma coluna sensível nova na tabela (como codigo_hash)
# nunca vaza para a coordenação sem alguém incluí-la aqui de propósito.
COLUNAS_DETALHE = (
    "codigo_acompanhamento",
    "canal",
    "id", "tipo", "relato", "quando", "onde", "em_andamento", "anonimo",
    "nome", "turma", "prioridade", "prioridade_original", "pontos",
    "motivos_json", "status", "simulacao", "criado_em", "atualizado_em",
    "recorrencia_pendente", "respostas_json", "revisao_estado", "triagem_snapshot_json",
    "ano_relator", "sala_relator", "local_id", "local_nome", "local_outro",
)


def _assuntos_snapshot(snapshot_json: str | None) -> list[str]:
    if not snapshot_json:
        return []
    descricao = json.loads(snapshot_json)['descricao']
    return descricao['marcadas'] or [descricao['situacao']['nome']]


def detalhe_caso(conn: sqlite3.Connection, caso_id: int,
                 questionario=None) -> dict | None:
    """Caso completo para a coordenação, sem o hash do código.

    `questionario` é a definição carregada (ou None); a chave `questionario`
    do resultado traz as respostas em texto, ou None.
    """
    linha = conn.execute(
        f"SELECT {', '.join(COLUNAS_DETALHE)} FROM casos WHERE id = ?", (caso_id,)
    ).fetchone()
    if linha is None:
        return None
    caso = _bools(dict(linha))
    from .questionario_v3 import projetar
    snapshot_json = caso.pop('triagem_snapshot_json')
    caso['categorias'], caso['opcoes'] = projetar(caso['tipo'], snapshot_json)
    caso['assuntos'] = _assuntos_snapshot(snapshot_json)
    caso["motivos"] = json.loads(caso.pop("motivos_json") or "[]")
    bruto = caso.pop("respostas_json")
    try:
        respostas = json.loads(bruto) if bruto else None
    except (ValueError, RecursionError):
        respostas = None
    caso["questionario"] = (
        json.loads(snapshot_json)['descricao'] if snapshot_json else
        questionario.descrever(respostas) if questionario is not None else None)
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
    caso["mensagens"] = [
        dict(m) for m in conn.execute(
            "SELECT m.id, m.autor, m.texto, m.criado_em, m.editada_em, m.apagada_em, "
            "m.usuario_id, u.nome AS usuario "
            "FROM mensagens m LEFT JOIN usuarios u ON u.id = m.usuario_id "
            "WHERE m.caso_id = ? ORDER BY m.id",
            (caso_id,),
        )
    ]
    caso["notas"] = [
        dict(n) for n in conn.execute(
            "SELECT n.id, n.usuario_id, u.nome AS usuario, n.texto, n.criado_em "
            "FROM notas_internas n LEFT JOIN usuarios u ON u.id = n.usuario_id "
            "WHERE n.caso_id = ? ORDER BY n.id",
            (caso_id,),
        )
    ]
    caso["resolucoes"] = [
        dict(r) for r in conn.execute(
            "SELECT r.id, r.autoria, r.justificativa_autoria, r.desfecho, r.providencias, r.resultado, u.nome AS usuario, "
            "r.criado_em FROM resolucoes r LEFT JOIN usuarios u "
            "ON u.id = r.usuario_id WHERE r.caso_id = ? ORDER BY r.id",
            (caso_id,),
        )
    ]
    for resolution in caso['resolucoes']:
        resolution['autores'] = [dict(row) for row in conn.execute(
            'SELECT id,nome,ano,sala,(foto_nome IS NOT NULL) AS tem_foto FROM autores_resolucao WHERE resolucao_id=? ORDER BY id',
            (resolution.pop('id'),))]
        for author in resolution['autores']:
            author['tem_foto'] = bool(author['tem_foto'])
    caso["situacoes"] = [
        dict(s) for s in conn.execute(
            "SELECT situacao, criado_em FROM situacoes_aluno "
            "WHERE caso_id = ? ORDER BY id", (caso_id,),
        )
    ]
    caso["revisoes_recorrencia"] = [
        dict(r) for r in conn.execute(
            "SELECT u.nome AS usuario, r.criado_em FROM revisoes_recorrencia r "
            "LEFT JOIN usuarios u ON u.id = r.usuario_id "
            "WHERE r.caso_id = ? ORDER BY r.id", (caso_id,),
        )
    ]
    from .atendimento import projetar_atendimento
    caso.update(projetar_atendimento(conn, caso_id))
    return caso


def registrar_acesso(conn: sqlite3.Connection, caso_id: int,
                     usuario_id: int) -> dict | None:
    """Grava quem abriu o caso agora e devolve o acesso anterior.

    Devolve {"por": nome, "em": iso} ou None se ninguém abriu antes (ou o caso
    não existe). Leitura e gravação na mesma transação; sem evento e sem mexer
    em `atualizado_em`.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        linha = conn.execute(
            "SELECT u.nome, c.ultimo_acesso_em FROM casos c "
            "LEFT JOIN usuarios u ON u.id = c.ultimo_acesso_por WHERE c.id = ?",
            (caso_id,),
        ).fetchone()
        if linha is None:
            conn.rollback()
            return None
        conn.execute(
            "UPDATE casos SET ultimo_acesso_por = ?, ultimo_acesso_em = ? "
            "WHERE id = ?",
            (usuario_id, _agora(), caso_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    if linha[1] is None:
        return None
    return {"por": linha[0], "em": linha[1]}


class RevisaoConflitante(Exception):
    pass


def _conferir_revisao(linha, revisao):
    if linha is not None and revisao is not None and linha['revisao_estado'] != revisao:
        raise RevisaoConflitante()


def _mudar(conn: sqlite3.Connection, caso_id: int, campo: str, valor: str,
           usuario_id: int, detalhe, revisao=None) -> bool:
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
            f"SELECT {campo}, revisao_estado FROM casos WHERE id = ?", (caso_id,)
        ).fetchone()
        _conferir_revisao(linha, revisao)
        if linha is None:
            conn.rollback()
            return False
        anterior = linha[0]
        if anterior != valor:
            conn.execute(
                f"UPDATE casos SET {campo} = ?, atualizado_em = ?, revisao_estado = revisao_estado + 1 WHERE id = ?",
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
                 usuario_id: int, revisao=None) -> bool:
    """Marca o caso como novo ou em investigação (reabrir um resolvido vale).

    `resolvido` não passa por aqui: vem só da resolução. False se o caso não
    existe.
    """
    if valor not in ("novo", "em_investigacao"):
        raise ValueError("status invalido")
    return _mudar(conn, caso_id, "status", valor, usuario_id,
                  lambda ant: f"status: {ant} -> {valor}", revisao)


def registrar_resolucao(conn: sqlite3.Connection, caso_id: int, desfecho: str,
                        providencias: str, resultado: str,
                        usuario_id: int, revisao=None, *, autoria_dados=None) -> str:
    """Resolve o caso: grava a resolução, o status e o evento numa transação.

    Devolve "ok", "nao_encontrado" ou "ja_resolvido" (sem gravar nada).
    """
    if desfecho not in DESFECHOS:
        raise ValueError("desfecho invalido")
    conn.execute("BEGIN IMMEDIATE")
    try:
        linha = conn.execute(
            "SELECT status, revisao_estado FROM casos WHERE id = ?", (caso_id,)
        ).fetchone()
        _conferir_revisao(linha, revisao)
        if linha is None:
            conn.rollback()
            return "nao_encontrado"
        if linha[0] == "resolvido":
            conn.rollback()
            return "ja_resolvido"
        agora = _agora()
        resolution = conn.execute(
            "INSERT INTO resolucoes (caso_id, desfecho, providencias, resultado, "
            "usuario_id, criado_em) VALUES (?,?,?,?,?,?)",
            (caso_id, desfecho, providencias, resultado, usuario_id, agora),
        )
        if autoria_dados is not None:
            conn.execute('UPDATE resolucoes SET autoria=?,justificativa_autoria=? WHERE id=?',
                         (autoria_dados['autoria'],autoria_dados['justificativa_autoria'],resolution.lastrowid))
            for author in autoria_dados['autores']:
                photo = author.get('_foto')
                conn.execute('''INSERT INTO autores_resolucao
                    (resolucao_id,nome,ano,sala,foto_nome,foto_tipo) VALUES (?,?,?,?,?,?)''',
                    (resolution.lastrowid,author['nome'],author['ano'],author['sala'],
                     photo.nome_interno if photo else None,photo.tipo if photo else None))
        conn.execute(
            "UPDATE casos SET status = 'resolvido', atualizado_em = ?, revisao_estado = revisao_estado + 1 WHERE id = ?",
            (agora, caso_id),
        )
        registrar_evento(conn, caso_id, "resolucao", usuario_id, desfecho,
                         commit=False)
        conn.commit()
        return "ok"
    except BaseException:
        conn.rollback()
        raise


def resumo_aluno(conn: sqlite3.Connection, caso_id: int) -> dict:
    """Parte pós-resolução da resposta do aluno, só com campos permitidos.

    `resolucao` e `ultima_situacao` só existem com o caso `resolvido`; a
    situação conta só se foi dada sobre a resolução mais recente (por id).
    """
    linha = conn.execute(
        "SELECT status FROM casos WHERE id = ?", (caso_id,)
    ).fetchone()
    vazio = {"resolucao": None, "pos_resolucao": False, "ultima_situacao": None}
    if linha is None or linha[0] != "resolvido":
        return vazio
    res = conn.execute(
        "SELECT id, desfecho, providencias, resultado, criado_em FROM resolucoes "
        "WHERE caso_id = ? ORDER BY id DESC LIMIT 1", (caso_id,)
    ).fetchone()
    if res is None:
        return {**vazio, "pos_resolucao": True}
    sit = conn.execute(
        "SELECT situacao FROM situacoes_aluno WHERE caso_id = ? "
        "AND resolucao_id = ? ORDER BY id DESC LIMIT 1", (caso_id, res["id"])
    ).fetchone()
    return {
        "resolucao": {
            "desfecho": res["desfecho"], "providencias": res["providencias"],
            "resultado": res["resultado"], "criado_em": res["criado_em"],
        },
        "pos_resolucao": True,
        "ultima_situacao": None if sit is None else sit["situacao"],
    }


def registrar_situacao(conn: sqlite3.Connection, caso_id: int,
                       situacao: str) -> str:
    """Grava a situação informada pelo aluno depois da resolução.

    Devolve "ok" ou "nao_resolvido" (sem gravar). `voltou` liga a pendência de
    recorrência; `melhorou` só entra no histórico e nunca desliga a pendência.
    """
    if situacao not in SITUACOES:
        raise ValueError("situacao invalida")
    conn.execute("BEGIN IMMEDIATE")
    try:
        linha = conn.execute(
            "SELECT status FROM casos WHERE id = ?", (caso_id,)
        ).fetchone()
        if linha is None or linha[0] != "resolvido":
            conn.rollback()
            return "nao_resolvido"
        agora = _agora()
        conn.execute(
            "INSERT INTO situacoes_aluno (caso_id, situacao, criado_em, "
            "resolucao_id) VALUES (?,?,?,(SELECT MAX(id) FROM resolucoes "
            "WHERE caso_id = ?))", (caso_id, situacao, agora, caso_id),
        )
        if situacao == "voltou":
            conn.execute(
                "UPDATE casos SET recorrencia_pendente = 1, revisao_estado = revisao_estado + 1 WHERE id = ?",
                (caso_id,),
            )
            registrar_evento(conn, caso_id, "recorrencia", None,
                             "voltou a acontecer", commit=False)
        conn.execute("UPDATE casos SET atualizado_em = ? WHERE id = ?",
                     (agora, caso_id))
        conn.commit()
        return "ok"
    except BaseException:
        conn.rollback()
        raise


def revisar_recorrencia(conn: sqlite3.Connection, caso_id: int,
                        usuario_id: int, revisao=None) -> str:
    """Marca a recorrência como revisada: zera a pendência e registra quem.

    Devolve "ok", "nao_encontrado" ou "nao_pendente" (sem gravar).
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        linha = conn.execute(
            "SELECT recorrencia_pendente, revisao_estado FROM casos WHERE id = ?", (caso_id,)
        ).fetchone()
        _conferir_revisao(linha, revisao)
        if linha is None:
            conn.rollback()
            return "nao_encontrado"
        if not linha[0]:
            conn.rollback()
            return "nao_pendente"
        agora = _agora()
        conn.execute(
            "UPDATE casos SET recorrencia_pendente = 0, atualizado_em = ?, revisao_estado = revisao_estado + 1 "
            "WHERE id = ?", (agora, caso_id),
        )
        conn.execute(
            "INSERT INTO revisoes_recorrencia (caso_id, usuario_id, criado_em) "
            "VALUES (?,?,?)", (caso_id, usuario_id, agora),
        )
        registrar_evento(conn, caso_id, "revisao_recorrencia", usuario_id, "",
                         commit=False)
        conn.commit()
        return "ok"
    except BaseException:
        conn.rollback()
        raise


def mudar_prioridade(conn: sqlite3.Connection, caso_id: int, valor: str,
                     justificativa: str, usuario_id: int, revisao=None) -> bool:
    """Troca a prioridade com justificativa; `prioridade_original` não muda."""
    if valor not in PRIORIDADES:
        raise ValueError("prioridade invalida")
    return _mudar(conn, caso_id, "prioridade", valor, usuario_id,
                  lambda ant: f"{ant} -> {valor}: {justificativa}", revisao)


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
