"""Padrões observados: relatos que coincidem em local e tipo, ou local e horário.

O cálculo é uma função pura sobre linhas de casos. Privacidade: só entram
casos com local do mapa; nada agrupa por turma, ano ou aluno; só existe
padrão com 3 ou mais casos distintos; a saída traz apenas ids de casos,
contagem, datas e um texto neutro, nunca o relato.
"""
from __future__ import annotations

import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone

MINIMO_CASOS = 3          # nunca abaixo disto, mesmo se configurarem menos
JANELA_DIAS = 21
CRESCIMENTO_REAPARECER = 2  # padrão descartado volta com +2 casos
ESTADOS = ('acompanhando', 'descartado')
BRASILIA = timezone(timedelta(hours=-3))
DIAS = ('segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo')
FAIXAS = (  # (início inclusivo, fim exclusivo, nome, frase)
    (0, 6, 'madrugada', 'de madrugada'),
    (6, 12, 'manhã', 'de manhã'),
    (12, 18, 'tarde', 'à tarde'),
    (18, 24, 'noite', 'à noite'),
)
CHAVE_RE = re.compile(r'[A-Za-z0-9_:\-]{1,200}')


def _quando(valor) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(valor))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _faixa(hora: int) -> tuple[str, str]:
    for ini, fim, nome, frase in FAIXAS:
        if ini <= hora < fim:
            return nome, frase
    raise ValueError(hora)


def _texto(n, nome_local, locais, dias_span):
    """Frase neutra: contagem, local, dia/faixa comuns (se houver) e período."""
    faixas = {_faixa(t.hour) for t in locais}
    dias = {t.weekday() for t in locais}
    quando = ''
    if len(faixas) == 1:
        frase = next(iter(faixas))[1]
        quando = f'{DIAS[next(iter(dias))]} {frase}' if len(dias) == 1 else frase
    elif len(dias) == 1:
        quando = DIAS[next(iter(dias))]
    partes = [f'{n} relatos no local {nome_local}']
    if quando:
        partes.append(quando)
    partes.append(f'em {dias_span} dia' + ('' if dias_span == 1 else 's'))
    return ', '.join(partes)


def detectar_padroes(casos, hoje: datetime, limiares: dict | None = None, *,
                     nomes_locais: dict | None = None,
                     minimo: int | None = None, janela_dias: int | None = None) -> list[dict]:
    """Agrupa por local+tipo e por local+faixa de horário dentro da janela.

    `casos`: dicts com id, local_id, tipo, criado_em (ISO) e simulacao.
    Os limiares vêm de `minimo`/`janela_dias` ou do dict `limiares`.
    """
    limiares = limiares or {}
    minimo = max(MINIMO_CASOS, int(minimo if minimo is not None else limiares.get('minimo', MINIMO_CASOS)))
    janela = int(janela_dias if janela_dias is not None else limiares.get('janela_dias', JANELA_DIAS))
    nomes_locais = nomes_locais or {}
    if hoje.tzinfo is None:
        hoje = hoje.replace(tzinfo=timezone.utc)
    corte = hoje.astimezone(BRASILIA).date() - timedelta(days=janela)  # dias de Brasília
    vistos, validos = set(), []
    for c in casos:
        if c.get('simulacao') or not c.get('local_id') or c['id'] in vistos:
            continue
        t = _quando(c.get('criado_em'))
        if t is None or not corte <= t.astimezone(BRASILIA).date() or t > hoje:
            continue
        vistos.add(c['id'])
        validos.append((c, t.astimezone(BRASILIA)))
    grupos: dict[tuple, list] = defaultdict(list)
    for c, t in validos:
        grupos[('local_tipo', c['local_id'], c['tipo'])].append((c, t))
        grupos[('local_faixa', c['local_id'], _faixa(t.hour)[0])].append((c, t))
    achados, conjuntos = [], set()
    # local_tipo primeiro: com o mesmo conjunto de casos, ele vence o local_faixa
    for chave in sorted(grupos, key=lambda k: (k[0] != 'local_tipo', k)):
        itens = grupos[chave]
        ids = frozenset(c['id'] for c, _ in itens)
        if len(ids) < minimo or ids in conjuntos:
            continue
        conjuntos.add(ids)
        regra, local_id, detalhe = chave
        datas = [t for _, t in itens]
        primeiro, ultimo = min(datas).date(), max(datas).date()
        span = (ultimo - primeiro).days + 1
        achados.append({
            'chave': f'{regra}:{local_id}:{detalhe}',
            'regra': regra, 'local_id': local_id,
            'local_nome': nomes_locais.get(local_id, local_id),
            'tipo': detalhe if regra == 'local_tipo' else None,
            'faixa': detalhe if regra == 'local_faixa' else None,
            'contagem': len(ids), 'casos': sorted(ids),
            'primeiro_em': primeiro.isoformat(), 'ultimo_em': ultimo.isoformat(),
            'janela_dias': janela,
            'texto': _texto(len(ids), nomes_locais.get(local_id, local_id), datas, span),
            'estado': 'novo',
        })
    achados.sort(key=lambda p: (-p['contagem'], p['chave']))
    return achados


def aplicar_estados(padroes: list[dict], estados: dict) -> list[dict]:
    """Esconde descartados que não cresceram o bastante; marca acompanhando."""
    saida = []
    for p in padroes:
        estado, contagem = estados.get(p['chave'], ('novo', 0))
        if estado == 'descartado':
            if p['contagem'] < contagem + CRESCIMENTO_REAPARECER:
                continue
            estado = 'novo'
        saida.append({**p, 'estado': estado})
    return saida


# ---------- banco ----------

def migrar(conn: sqlite3.Connection, config) -> None:
    """Cria `padroes_estado`; antes, copia o banco com casos (`.pre-padroes.bak`)."""
    from pathlib import Path
    from .db import _backup_atomico, _colunas
    if not _colunas(conn, 'padroes_estado') and _colunas(conn, 'casos') \
            and conn.execute('SELECT 1 FROM casos LIMIT 1').fetchone():
        _backup_atomico(conn, Path(str(config.db_path) + '.pre-padroes.bak'))
    with conn:
        conn.execute(
            'CREATE TABLE IF NOT EXISTS padroes_estado ('
            'chave TEXT PRIMARY KEY, '
            "estado TEXT NOT NULL CHECK (estado IN ('acompanhando','descartado')), "
            'contagem INTEGER NOT NULL, '
            'usuario_id INTEGER REFERENCES usuarios(id), '
            'atualizado_em TEXT NOT NULL)')


def _calcular(conn, hoje=None):
    hoje = hoje or datetime.now(timezone.utc)
    corte = (hoje - timedelta(days=JANELA_DIAS + 2)).isoformat()
    casos = [dict(r) for r in conn.execute(
        'SELECT id, local_id, tipo, criado_em, simulacao FROM casos '
        'WHERE simulacao = 0 AND local_id IS NOT NULL AND criado_em >= ?', (corte,))]
    nomes = {r['id']: r['nome'] for r in conn.execute('SELECT id, nome FROM ambientes')}
    return detectar_padroes(casos, hoje, nomes_locais=nomes)


def _estados(conn) -> dict:
    return {r['chave']: (r['estado'], r['contagem'])
            for r in conn.execute('SELECT chave, estado, contagem FROM padroes_estado')}


def listar(conn, hoje=None) -> list[dict]:
    return aplicar_estados(_calcular(conn, hoje), _estados(conn))


def marcar(conn, chave: str, estado: str, usuario_id: int, hoje=None) -> bool:
    """Grava o estado com a contagem atual; `novo` apaga a marca. False se a chave não existe."""
    atual = next((p for p in _calcular(conn, hoje) if p['chave'] == chave), None)
    if atual is None:
        return False
    with conn:
        if estado == 'novo':
            conn.execute('DELETE FROM padroes_estado WHERE chave = ?', (chave,))
        else:
            conn.execute(
                'INSERT INTO padroes_estado (chave, estado, contagem, usuario_id, atualizado_em) '
                'VALUES (?,?,?,?,?) ON CONFLICT(chave) DO UPDATE SET estado=excluded.estado, '
                'contagem=excluded.contagem, usuario_id=excluded.usuario_id, '
                'atualizado_em=excluded.atualizado_em',
                (chave, estado, atual['contagem'], usuario_id,
                 datetime.now(timezone.utc).isoformat()))
    return True


# ---------- rotas ----------

def registrar(bp) -> None:
    from flask import current_app, g, jsonify, request
    from .routes_coord import _db, _erro, _json, _nao_encontrado

    def _taxa(nome, maximo):
        limitadores = current_app.extensions['limitadores']
        limitador = limitadores.get(nome)
        if limitador is None:
            from .ratelimit import Limitador
            limitador = limitadores.setdefault(nome, Limitador(maximo, 60))
        return limitador.permitir(str(g.usuario['id']))

    @bp.get('/api/coord/padroes')
    def padroes_listar():
        if not _taxa('padroes', 120):
            return _erro('muitas requisicoes', 429)
        resposta = jsonify({'padroes': listar(_db())})
        resposta.headers['Cache-Control'] = 'no-store'
        return resposta

    @bp.post('/api/coord/padroes/<chave>/estado')
    def padroes_estado(chave):
        if not _taxa('padroes_estado', 60):
            return _erro('muitas requisicoes', 429)
        estado = _json().get('estado')
        if estado not in ESTADOS + ('novo',):
            return _erro('estado invalido')
        if not CHAVE_RE.fullmatch(chave) or not marcar(_db(), chave, estado, g.usuario['id']):
            return _nao_encontrado()
        return jsonify({'ok': True})
