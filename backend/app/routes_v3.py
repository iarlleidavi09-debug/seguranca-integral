"""Envio multipart v3, sem alterar o contrato v2."""
from __future__ import annotations

import hashlib
import json
import re
from contextlib import closing

from flask import Blueprint, current_app, jsonify, request

from .db import connect
from .realtime import publicar
from .envios import EnvioConflitante, LocalInvalido, consultar_envio, criar_caso_v3, resumo_conteudo
from .questionario_v3 import QuestionarioInvalido, RespostasInvalidas, carregar, MAX_BYTES_RESPOSTAS
from .routes_student import _bool, _erro, _limite_estourado, _nome_seguro
from .uploads import MAX_BYTES, MAX_POR_CASO, AnexoInvalido, salvar_anexo

bp = Blueprint('aluno_v3', __name__)


@bp.post('/api/acolhimento')
def criar_acolhimento():
    if _limite_estourado('denuncias'):
        return _erro('muitos envios, tente mais tarde', 429)
    if not request.is_json:
        return _erro('use application/json', 415)
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) != {'envio_id', 'texto'}:
        return _erro('informe envio_id e texto')
    receipt, text = body['envio_id'], body['texto']
    if not isinstance(receipt, str) or not re.fullmatch('[0-9a-fA-F]{32}', receipt):
        return _erro('envio_id invalido')
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 2000:
        return _erro('mensagem deve ter de 1 a 2000 caracteres')
    receipt = receipt.lower()
    text = text.strip()
    data = {'relato': text, 'em_andamento': False, 'anonimo': True,
            'canal': 'acolhimento', '_primeira_mensagem': text}
    config = current_app.config['SI_CONFIG']
    content_hash = resumo_conteudo(data, None, [])
    try:
        with closing(connect(config)) as conn:
            result = criar_caso_v3(conn, config, data, [], receipt, None, None, content_hash)
            reused = result.pop('_reutilizado')
        if not reused:
            publicar(None)
        return jsonify(result), 201
    except EnvioConflitante:
        return _erro('envio_id ja utilizado com outro conteudo', 409)


@bp.get('/api/v3/questionario')
def questionario():
    if _limite_estourado('consultas'):
        return _erro('muitas consultas, tente mais tarde', 429)
    try:
        definition = carregar(current_app.config['SI_CONFIG'].questionario_v3_path)
    except QuestionarioInvalido:
        return _erro('questionario indisponivel', 503)
    response = jsonify(definition.para_aluno())
    response.headers['Cache-Control'] = 'no-store'
    return response


@bp.post('/api/v3/denuncias')
@bp.post('/api/v4/denuncias')
def criar_denuncia():
    if _limite_estourado('denuncias'):
        return _erro('muitos envios, tente mais tarde', 429)
    if request.mimetype != 'multipart/form-data':
        return _erro('use multipart/form-data', 415)
    form = request.form
    limits = {'envio_id': 32, 'relato': 5000, 'quando': 200, 'onde': 200,
              'nome': 200, 'turma': 50, 'anonimo': 10, 'em_andamento': 10, 'respostas': MAX_BYTES_RESPOSTAS}
    escolar = request.path == '/api/v4/denuncias'
    if escolar:
        limits.update(ano_relator=40, sala_relator=50, local_id=64, local_outro=200)
    for field, values in form.lists():
        if field not in limits or len(values) != 1 or len(values[0].encode('utf-8')) > limits[field] * (4 if field != 'respostas' else 1):
            return _erro('campo invalido ou grande demais')
        if len(values[0]) > limits[field]:
            return _erro('campo grande demais')
    receipt = form.get('envio_id', '')
    if not re.fullmatch('[0-9a-fA-F]{32}', receipt):
        return _erro('envio_id invalido')
    receipt = receipt.lower()
    relato = form.get('relato', '').strip()
    if not 10 <= len(relato) <= 5000:
        return _erro('relato deve ter de 10 a 5000 caracteres')
    anonymous = _bool(form.get('anonimo'), True)
    name = form.get('nome', '').strip() or None
    if not anonymous and not name:
        return _erro('nome obrigatorio')
    data = {'relato': relato, 'quando': form.get('quando', '').strip() or None,
            'onde': form.get('onde', '').strip() or None,
            'em_andamento': _bool(form.get('em_andamento'), False), 'anonimo': anonymous,
            'nome': None if anonymous else name,
            'turma': None if anonymous else (form.get('turma', '').strip() or None)}
    if escolar:
        if not form.get('ano_relator', '').strip() or not form.get('sala_relator', '').strip():
            return _erro('ano e sala de quem relata sao obrigatorios')
        data.update({key:form.get(key, '').strip() or None
                     for key in ('ano_relator','sala_relator','local_id','local_outro')})
        if data['local_id']:
            with closing(connect(current_app.config['SI_CONFIG'])) as conn:
                if not conn.execute('SELECT 1 FROM ambientes WHERE id=?', (data['local_id'],)).fetchone():
                    return _erro('local inexistente; selecione novamente')
    raw_answers = form.get('respostas')
    try:
        unvalidated = json.loads(raw_answers) if raw_answers and raw_answers.strip() else None
        if unvalidated is not None and (not isinstance(unvalidated, dict)
                or not isinstance(unvalidated.get('marcadas'), list)
                or any(not isinstance(i, str) for i in unvalidated['marcadas'])
                or not isinstance(unvalidated.get('respostas'), dict)
                or any(not isinstance(ids, list) or any(not isinstance(i, str) for i in ids)
                       for ids in unvalidated['respostas'].values())):
            return _erro('respostas invalidas')
    except (ValueError, RecursionError, TypeError):
        return _erro('respostas invalidas')
    if set(request.files) - {'anexos', 'anexos[]'}:
        return _erro('campo de anexo invalido')
    files = [f for f in request.files.getlist('anexos[]') + request.files.getlist('anexos') if f.filename or f.content_length]
    if len(files) > MAX_POR_CASO:
        return _erro('no maximo 5 anexos')
    originals, summaries = [], []
    for file in files:
        content = file.stream.read(MAX_BYTES + 1)
        digest = hashlib.sha256(content)
        size = len(content)
        while chunk := file.stream.read(65536):
            digest.update(chunk)
            size += len(chunk)
        originals.append((content, _nome_seguro(file.filename)))
        summaries.append({'nome': _nome_seguro(file.filename), 'sha256': digest.hexdigest(), 'tamanho': size})
    content_hash = resumo_conteudo(data, unvalidated, summaries)
    config = current_app.config['SI_CONFIG']
    saved, committed = [], False
    try:
        with closing(connect(config)) as conn:
            repeated = consultar_envio(conn, config, receipt, content_hash)
            if repeated is not None:
                return jsonify(repeated), 201
            definition, answers = None, None
            if unvalidated is not None:
                try:
                    definition = carregar(config.questionario_v3_path)
                    answers = definition.validar_respostas(raw_answers)
                except (QuestionarioInvalido, RespostasInvalidas):
                    return _erro('respostas invalidas; revise ou confirme envio sem questionario')
            refused = []
            for content, name in originals:
                try:
                    saved.append(salvar_anexo(config, content))
                except AnexoInvalido as exc:
                    refused.append({'nome': name, 'motivo': exc.motivo})
            data['_recusados'] = refused
            result = criar_caso_v3(conn, config, data, saved, receipt, definition, answers, content_hash)
            committed = not result.pop('_reutilizado')
            if committed:
                publicar(None)
            return jsonify(result), 201
    except EnvioConflitante:
        return _erro('envio_id ja utilizado com outro conteudo', 409)
    except LocalInvalido:
        return _erro('local inexistente; selecione novamente')
    finally:
        if not committed:
            for attachment in saved:
                (config.uploads_dir / attachment.nome_interno).unlink(missing_ok=True)


from .routes_mapa import registrar_aluno
registrar_aluno(bp)
