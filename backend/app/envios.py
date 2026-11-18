"""Recibos v3 e criação transacional de pedidos idempotentes."""
from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
from datetime import datetime, timezone

from .codes import ALFABETO, hash_codigo
from .triage import carregar_termos, classificar


class EnvioConflitante(ValueError):
    pass


class LocalInvalido(ValueError):
    pass


def _retrato_local(conn, local_id):
    names, seen = [], set()
    while local_id:
        if local_id in seen or len(seen) >= 6:
            raise LocalInvalido()
        seen.add(local_id)
        local = conn.execute('SELECT nome,pai_id FROM ambientes WHERE id=?',(local_id,)).fetchone()
        if local is None:
            raise LocalInvalido()
        names.append(local['nome'])
        local_id = local['pai_id']
    return ' / '.join(reversed(names)) or None


def recibo_hmac(envio_id, secret):
    return hmac.new(secret.encode(), b'envio-v3\0' + bytes.fromhex(envio_id), hashlib.sha256).hexdigest()


def derivar_codigo(envio_id, contador, secret):
    letters, block = [], 0
    limit = (256 // len(ALFABETO)) * len(ALFABETO)
    while len(letters) < 8:
        digest = hmac.new(secret.encode(), b'codigo-v3\0' + bytes.fromhex(envio_id)
                          + contador.to_bytes(8, 'big') + block.to_bytes(4, 'big'), hashlib.sha256).digest()
        letters.extend(ALFABETO[b % len(ALFABETO)] for b in digest if b < limit)
        block += 1
    code = ''.join(letters[:8])
    return code[:4] + '-' + code[4:]


def resumo_conteudo(dados, respostas, arquivos):
    canonical = dict(dados)
    if respostas is not None:
        respostas = {'versao': respostas.get('versao'),
                     'marcadas': sorted(respostas.get('marcadas', [])),
                     'respostas': {pid: sorted(ids) for pid, ids in respostas.get('respostas', {}).items() if ids}}
    canonical.update(respostas=respostas, anexos=arquivos)
    return hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def consultar_envio(conn, config, envio_id, conteudo_hash):
    row = conn.execute('SELECT * FROM envios WHERE recibo_hmac = ?',
                       (recibo_hmac(envio_id, config.secret_key),)).fetchone()
    if row is None:
        return None
    if not hmac.compare_digest(row['conteudo_hash'], conteudo_hash):
        raise EnvioConflitante('recibo ja utilizado com outro conteudo')
    return {'codigo': derivar_codigo(envio_id, row['contador'], config.secret_key),
            **json.loads(row['confirmacao_json'])}


def criar_caso_v3(conn, config, dados, anexos, envio_id, definicao, respostas, conteudo_hash):
    terms = carregar_termos(config.risk_terms_path)
    triagem = (definicao.classificar(respostas, dados['relato'], dados['em_andamento'], terms)
               if definicao is not None else classificar('outro', dados['relato'], dados['em_andamento'], terms))
    tipo = definicao.tipo_legado(respostas) if definicao is not None else 'outro'
    snapshot = definicao.snapshot(respostas) if definicao is not None else None
    if snapshot is not None:
        snapshot['triagem'] = {'pontos': triagem.pontos, 'motivos': list(triagem.motivos),
                               'prioridade_original': triagem.prioridade}
    confirmation = {'anexos_recusados': dados['_recusados']} if dados.get('_recusados') else {}
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    conn.execute('BEGIN IMMEDIATE')
    try:
        repeated = consultar_envio(conn, config, envio_id, conteudo_hash)
        if repeated is not None:
            conn.rollback()
            return {**repeated, '_reutilizado': True}
        for counter in range(100):
            code = derivar_codigo(envio_id, counter, config.secret_key)
            try:
                cur = conn.execute(
                    "INSERT INTO casos (codigo_hash,tipo,relato,quando,onde,em_andamento,anonimo,nome,turma,"
                    "prioridade,prioridade_original,pontos,motivos_json,criado_em,atualizado_em,respostas_json,triagem_snapshot_json) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (hash_codigo(code, config.secret_key), tipo, dados['relato'], dados.get('quando'), dados.get('onde'),
                     int(dados['em_andamento']), int(dados['anonimo']),
                     None if dados['anonimo'] else dados.get('nome'), None if dados['anonimo'] else dados.get('turma'),
                     triagem.prioridade, triagem.prioridade, triagem.pontos, json.dumps(triagem.motivos), now, now,
                     json.dumps(respostas) if respostas is not None else None,
                     json.dumps(snapshot, ensure_ascii=False) if snapshot is not None else None))
                break
            except sqlite3.IntegrityError as exc:
                if 'codigo_hash' not in str(exc):
                    raise
        else:
            raise RuntimeError('nao foi possivel derivar codigo unico')
        case_id = cur.lastrowid
        conn.execute('UPDATE casos SET codigo_acompanhamento=? WHERE id=?', (code, case_id))
        if dados.get('canal') == 'acolhimento':
            conn.execute("UPDATE casos SET canal='acolhimento' WHERE id=?", (case_id,))
            conn.execute("INSERT INTO mensagens(caso_id,autor,texto,criado_em) VALUES (?,'aluno',?,?)",
                         (case_id, dados['_primeira_mensagem'], now))
        if 'ano_relator' in dados:
            local_nome = _retrato_local(conn,dados.get('local_id'))
            conn.execute('''UPDATE casos SET ano_relator=?,sala_relator=?,local_id=?,local_nome=?,local_outro=? WHERE id=?''',
                         (dados['ano_relator'],dados['sala_relator'],dados.get('local_id'),
                          local_nome,dados.get('local_outro'),case_id))
        for attachment in anexos:
            conn.execute('INSERT INTO anexos (caso_id,nome_interno,tipo,tamanho) VALUES (?,?,?,?)',
                         (case_id, attachment.nome_interno, attachment.tipo, attachment.tamanho))
        conn.execute("INSERT INTO eventos (caso_id,tipo,detalhe,criado_em) VALUES (?,'criado',?,?)",
                     (case_id, f'prioridade {triagem.prioridade}', now))
        conn.execute('INSERT INTO envios (recibo_hmac,contador,conteudo_hash,caso_id,confirmacao_json) VALUES (?,?,?,?,?)',
                     (recibo_hmac(envio_id, config.secret_key), counter, conteudo_hash, case_id, json.dumps(confirmation)))
        conn.commit()
        return {'codigo': code, **confirmation, '_reutilizado': False}
    except BaseException:
        conn.rollback()
        raise
