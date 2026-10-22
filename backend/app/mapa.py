"""Planta versionada e contagens de casos sem dados de identificação."""
from __future__ import annotations

import math
import json
import re
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone


class MapaConflitante(ValueError):
    pass


@contextmanager
def _leitura(conn):
    propria = not conn.in_transaction
    if propria:
        conn.execute('BEGIN')
    try:
        yield
    finally:
        if propria:
            conn.rollback()


def ler(conn, *, catalogo=False):
    with _leitura(conn):
        return _ler(conn,catalogo=catalogo)


def _ler(conn, *, catalogo=False):
    fields = 'id,nome,tipo,pai_id' if catalogo else '*'
    revision = conn.execute('SELECT revisao FROM mapa_estado WHERE id=1').fetchone()[0]
    rooms = [dict(row) for row in conn.execute(f'SELECT {fields} FROM ambientes ORDER BY rowid')]
    if not catalogo:
        for room in rooms:
            geometry = json.loads(room.pop('geometria_json') or '{}')
            if geometry.get('formato') == 'l':
                room.update({key:geometry[key] for key in ('formato','rotacao','espessura')})
    return {'revisao': revision, 'ambientes': rooms}


def validar(data):
    if not isinstance(data, dict) or set(data) != {'revisao', 'ambientes'}:
        raise ValueError('planta invalida')
    if type(data['revisao']) is not int or not 0 <= data['revisao'] < 2**63-1:
        raise ValueError('revisao invalida')
    rooms = data['ambientes']
    if not isinstance(rooms, list) or len(rooms) > 500:
        raise ValueError('no maximo 500 ambientes')
    by_id = {}
    fields = {'id','nome','tipo','pai_id','x','y','largura','altura'}
    optional = {'formato','rotacao','espessura'}
    for room in rooms:
        if not isinstance(room, dict) or not fields <= set(room) or set(room)-fields-optional:
            raise ValueError('ambiente invalido')
        id = room['id']
        if not isinstance(id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', id) or id in by_id:
            raise ValueError('identidade de ambiente invalida ou repetida')
        if not isinstance(room['nome'], str) or not 1 <= len(room['nome'].strip()) <= 80:
            raise ValueError('nome deve ter de 1 a 80 caracteres')
        if room['tipo'] not in ('ala','andar','sala','area','escadaria'):
            raise ValueError('tipo de ambiente invalido')
        parent = room['pai_id']
        if parent is not None and not isinstance(parent, str):
            raise ValueError('pai invalido')
        for key in ('x','y','largura','altura'):
            value = room[key]
            if type(value) not in (int,float) or (type(value) is float and not math.isfinite(value)):
                raise ValueError('geometria invalida')
        if (room['x'] < 0 or room['y'] < 0 or room['largura'] < 40 or room['altura'] < 40
                or room['x'] + room['largura'] > 12000 or room['y'] + room['altura'] > 8000):
            raise ValueError('ambiente fora dos limites da planta')
        shape = room.get('formato','retangulo')
        rotation = room.get('rotacao',0)
        thickness = room.get('espessura',0.35)
        if shape not in ('retangulo','l') or type(rotation) is not int or rotation not in (0,90,180,270):
            raise ValueError('formato ou rotacao invalida')
        if type(thickness) not in (int,float) or not 0.15 <= thickness <= 0.85:
            raise ValueError('espessura deve ficar entre 0.15 e 0.85')
        clean = {key:room[key] for key in fields}
        clean['nome'] = room['nome'].strip()
        if shape == 'l':
            clean.update(formato=shape,rotacao=rotation,espessura=thickness)
        by_id[id] = clean
    for id in by_id:
        seen = set()
        current = id
        while current is not None:
            if current in seen or current not in by_id:
                raise ValueError('hierarquia com ciclo ou pai ausente')
            seen.add(current)
            if len(seen) > 6:
                raise ValueError('no maximo seis niveis')
            current = by_id[current]['pai_id']
    return list(by_id.values())


def salvar(conn, data):
    rooms = validar(data)
    conn.execute('BEGIN IMMEDIATE')
    try:
        if conn.execute('SELECT revisao FROM mapa_estado WHERE id=1').fetchone()[0] != data['revisao']:
            raise MapaConflitante('planta alterada por outra pessoa; revise antes de salvar')
        old = list(conn.execute('SELECT id,pai_id FROM ambientes'))
        removed = {r['id'] for r in old} - {r['id'] for r in rooms}
        if any(r['pai_id'] in removed for r in old):
            raise MapaConflitante('ambiente com filhos nao pode ser excluido')
        if any(conn.execute('SELECT 1 FROM casos WHERE local_id=? LIMIT 1', (id,)).fetchone() for id in removed):
            raise MapaConflitante('ambiente vinculado a casos nao pode ser excluido')
        conn.execute('DELETE FROM ambientes')
        conn.executemany('''INSERT INTO ambientes (id,nome,tipo,pai_id,x,y,largura,altura,geometria_json)
            VALUES (:id,:nome,:tipo,:pai_id,:x,:y,:largura,:altura,:geometria_json)''',
            [{**room,'geometria_json':json.dumps({key:room[key] for key in ('formato','rotacao','espessura') if key in room})} for room in rooms])
        conn.execute('UPDATE mapa_estado SET revisao=revisao+1 WHERE id=1')
        result = ler(conn)
        conn.commit()
        return result
    except BaseException:
        conn.rollback()
        raise


def resumo(conn, periodo='30', base='relator', ano='', sala=''):
    with _leitura(conn):
        return _resumo(conn,periodo,base,ano,sala)


def _resumo(conn, periodo, base, ano, sala):
    if periodo not in ('7','30','90','todos') or base not in ('relator','autores') or len(ano)>40 or len(sala)>50:
        raise ValueError('filtro invalido')
    cutoff = '' if periodo == 'todos' else (datetime.now(timezone.utc)-timedelta(days=int(periodo))).isoformat()
    rows = conn.execute('''SELECT c.id,c.local_id,c.ano_relator,c.sala_relator,
        (SELECT MAX(r.id) FROM resolucoes r WHERE r.caso_id=c.id) resolucao_id
        FROM casos c WHERE c.simulacao=0 AND c.criado_em>=?''', (cutoff,)).fetchall()
    result = dict(total=0, sem_local=0, sem_turma=0, sem_autoria=0, ambientes=[])
    locations = {}
    for row in rows:
        authors = list(conn.execute('SELECT ano,sala FROM autores_resolucao WHERE resolucao_id=?', (row['resolucao_id'],)))
        if not authors:
            result['sem_autoria'] += 1
            if base == 'autores':
                continue
        classes = ({(a['ano'],a['sala']) for a in authors} if base == 'autores'
                   else {(row['ano_relator'],row['sala_relator'])})
        matching = {(y,s) for y,s in classes if (not ano or ano==y) and (not sala or sala==s)}
        if (ano or sala) and not matching:
            continue
        result['total'] += 1
        if not classes or any(not y or not s for y,s in classes):
            result['sem_turma'] += 1
        if not row['local_id']:
            result['sem_local'] += 1
            continue
        location = locations.setdefault(row['local_id'], {'id':row['local_id'],'total':0,'anos':defaultdict(int),'salas':defaultdict(int)})
        location['total'] += 1
        for year in {y for y,_ in matching if y}:
            location['anos'][year] += 1
        for year,room in matching:
            if year and room:
                location['salas'][(year,room)] += 1
    for location in locations.values():
        location['anos'] = [{'ano':y,'total':n} for y,n in sorted(location['anos'].items())]
        location['salas'] = [{'ano':y,'sala':s,'total':n} for (y,s),n in sorted(location['salas'].items())]
    result['ambientes'] = sorted(locations.values(), key=lambda item:item['id'])
    return result
