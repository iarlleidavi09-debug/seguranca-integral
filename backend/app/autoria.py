"""Autoria da apuração, exclusiva da coordenação."""
from __future__ import annotations

import json
import re
from flask import Response, current_app, g, jsonify, request
from . import casos
from .realtime import publicar
from .uploads import AnexoInvalido, MAX_BYTES, caminho_anexo, detectar_tipo, salvar_anexo


def _texto(data, key, limit, *, required=True):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value.strip()) > limit or (required and not value.strip()):
        raise ValueError(f'{key} invalido')
    return value.strip()


def validar(data):
    fields = {'revisao_estado','desfecho','providencias','resultado','autoria','justificativa_autoria','autores'}
    if not isinstance(data, dict) or set(data)-fields:
        raise ValueError('dados invalidos')
    if type(data.get('revisao_estado')) is not int or not 0 <= data['revisao_estado'] <= casos.ID_MAX:
        raise ValueError('revisao_estado invalida')
    if data.get('desfecho') not in casos.DESFECHOS:
        raise ValueError('desfecho invalido')
    result = dict(revisao_estado=data['revisao_estado'],desfecho=data['desfecho'],
                  providencias=_texto(data,'providencias',2000),resultado=_texto(data,'resultado',2000,required=False),
                  autoria=data.get('autoria'),justificativa_autoria=_texto(data,'justificativa_autoria',2000,required=False))
    authors = data.get('autores', [])
    if not isinstance(authors,list) or len(authors)>10:
        raise ValueError('no maximo dez autores')
    if result['autoria'] == 'nao_identificada':
        if authors or not result['justificativa_autoria']:
            raise ValueError('autoria nao identificada exige justificativa e nenhum autor')
    elif result['autoria'] == 'identificada':
        if not authors:
            raise ValueError('informe ao menos um autor')
    else:
        raise ValueError('autoria invalida')
    clean = []
    photos = set()
    for author in authors:
        if not isinstance(author,dict) or set(author)-{'nome','ano','sala','foto_campo'}:
            raise ValueError('autor invalido')
        item = {key:_texto(author,key,limit) for key,limit in [('nome',200),('ano',40),('sala',50)]}
        field = author.get('foto_campo')
        if field is not None:
            if not isinstance(field,str) or not re.fullmatch(r'foto_[0-9]',field) or field in photos:
                raise ValueError('campo de foto invalido ou repetido')
            photos.add(field)
            item['foto_campo'] = field
        clean.append(item)
    result['autores'] = clean
    return result, photos


def registrar_rotas(bp):
    from .routes_coord import MIME_ANEXO, _db, _erro, _nao_encontrado

    @bp.post('/api/v4/casos/<int:caso_id>/resolucao')
    def registrar_resolucao_v4(caso_id):
        conn = _db()
        if not casos.existe_caso(conn,caso_id):
            return _nao_encontrado()
        if set(request.form) != {'dados'} or len(request.form.getlist('dados')) != 1:
            return _erro('informe dados da resolucao')
        raw = request.form['dados']
        if len(raw.encode('utf-8')) > 128*1024:
            return _erro('dados grandes demais')
        try:
            data, photo_fields = validar(json.loads(raw))
        except (ValueError, TypeError, RecursionError) as exc:
            return _erro(str(exc) if isinstance(exc,ValueError) and not isinstance(exc,json.JSONDecodeError) else 'dados invalidos')
        if set(request.files) != photo_fields or any(len(request.files.getlist(field))!=1 for field in request.files):
            return _erro('arquivos de foto nao correspondem aos autores')
        config = current_app.config['SI_CONFIG']
        saved = []
        committed = False
        try:
            for author in data['autores']:
                if 'foto_campo' not in author:
                    continue
                content = request.files[author['foto_campo']].stream.read(MAX_BYTES+1)
                if detectar_tipo(content) not in ('png','jpeg','webp'):
                    raise AnexoInvalido('foto deve ser PNG, JPEG ou WebP')
                photo = salvar_anexo(config,content)
                saved.append(photo)
                author['_foto'] = photo
            outcome = casos.registrar_resolucao(conn,caso_id,data['desfecho'],data['providencias'],data['resultado'],
                g.usuario['id'],data['revisao_estado'],autoria_dados=data)
            if outcome == 'nao_encontrado':
                return _nao_encontrado()
            if outcome == 'ja_resolvido':
                return _erro('caso ja resolvido',409)
            committed = True
            publicar(caso_id)
            return jsonify({'ok':True}),201
        except AnexoInvalido as exc:
            return _erro(exc.motivo)
        finally:
            if not committed:
                for photo in saved:
                    (config.uploads_dir/photo.nome_interno).unlink(missing_ok=True)

    @bp.get('/api/casos/<int:caso_id>/autores/<int:autor_id>/foto')
    def foto_autor(caso_id,autor_id):
        row = _db().execute('''SELECT a.foto_nome,a.foto_tipo FROM autores_resolucao a
            JOIN resolucoes r ON r.id=a.resolucao_id WHERE a.id=? AND r.caso_id=?''',(autor_id,caso_id)).fetchone()
        if row is None or row['foto_tipo'] not in ('png','jpeg','webp') or not row['foto_nome']:
            return _nao_encontrado()
        try:
            content = caminho_anexo(current_app.config['SI_CONFIG'],row['foto_nome']).read_bytes()
        except (AnexoInvalido,OSError):
            return _nao_encontrado()
        response = Response(content,mimetype=MIME_ANEXO[row['foto_tipo']][0])
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response
