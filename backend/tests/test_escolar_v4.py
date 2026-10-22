import io
import json
import pytest
from app.db import connect


def enviar(client, **kw):
    data = dict(envio_id='a'*32, relato='Preciso de ajuda com esta situação', anonimo='true',
                ano_relator='7º', sala_relator='A')
    data.update(kw)
    return client.post('/api/v4/denuncias', data=data, content_type='multipart/form-data')


def resolver(client, case_id=1, **kw):
    data = dict(revisao_estado=0, desfecho='solucionada', providencias='Providências públicas',
                resultado='', autoria='identificada', justificativa_autoria='',
                autores=[dict(nome='Pessoa interna', ano='8º', sala='B')])
    files = kw.pop('_files', {})
    data.update(kw)
    return client.post(f'/api/v4/casos/{case_id}/resolucao',
                       data={'dados': json.dumps(data), **files}, content_type='multipart/form-data',
                       headers={'X-SI-Coord':'1'})


def test_multipart_exige_cabecalho_coord_para_impedir_formulario_externo(coord_logado):
    r = coord_logado.post('/api/v4/casos/1/resolucao',data={'dados':'{}'},content_type='multipart/form-data')
    assert r.status_code == 403


def test_v4_turma_obrigatoria_anonimato_recibo_e_local(student_client, coord_logado, config):
    assert enviar(student_client, ano_relator='').status_code == 400
    assert enviar(student_client, sala_relator='').status_code == 400
    assert enviar(student_client, local_id='ausente').status_code == 400
    assert coord_logado.post('/api/mapa', json={'revisao': 0, 'ambientes': [dict(
        id='p', nome='Pátio', tipo='area', pai_id=None, x=0,y=0,largura=100,altura=100)]}).status_code == 200
    first = enviar(student_client, nome='Não gravar', local_id='p')
    assert first.status_code == 201
    assert enviar(student_client, nome='Não gravar', local_id='p').json == first.json
    assert enviar(student_client, sala_relator='B', local_id='p').status_code == 409
    detail = coord_logado.get('/api/casos/1').json
    assert detail['nome'] is None
    assert (detail['ano_relator'], detail['sala_relator'], detail['local_nome']) == ('7º','A','Pátio')
    assert coord_logado.post('/api/mapa', json={'revisao':1,'ambientes':[]}).status_code == 409
    with connect(config) as c:
        assert c.execute('SELECT COUNT(*) FROM casos').fetchone()[0] == 1


def test_resolucao_autoria_privada_e_validacao(student_client, coord_logado, coord_app):
    code = enviar(student_client).json['codigo']
    assert resolver(coord_logado, autores=[]).status_code == 400
    assert resolver(coord_logado, autoria='nao_identificada', autores=[], justificativa_autoria='').status_code == 400
    assert resolver(coord_logado, autoria='nao_identificada', justificativa_autoria='Apuração interna').status_code == 400
    r = resolver(coord_logado)
    assert r.status_code == 201, r.json
    detail = coord_logado.get('/api/casos/1').json
    assert detail['resolucoes'][0]['autores'][0]['nome'] == 'Pessoa interna'
    assert detail['resolucoes'][0]['autores'][0]['tem_foto'] is False
    public = student_client.post('/api/acompanhar', json={'codigo': code})
    assert public.status_code == 200
    # Student response must never include private resolution fields.
    assert 'Pessoa interna' not in public.get_data(as_text=True)
    assert 'autores' not in public.get_data(as_text=True)
    assert 'justificativa_autoria' not in public.get_data(as_text=True)


def test_foto_invalida_e_conflito_sem_orfaos(student_client, coord_logado, config):
    enviar(student_client)
    authors = [dict(nome='Pessoa', ano='8º', sala='B', foto_campo='foto_0')]
    r = resolver(coord_logado, autores=authors, _files={'foto_0':(io.BytesIO(b'invalido'),'x.png')})
    assert r.status_code == 400
    assert not list(config.uploads_dir.glob('*'))
    assert resolver(coord_logado, revisao_estado=9).status_code == 409
    assert coord_logado.get('/api/casos/1').json['resolucoes'] == []


def test_resumo_conta_casos_unicos_e_ultima_autoria(student_client, coord_logado, config):
    coord_logado.post('/api/mapa', json={'revisao':0,'ambientes':[dict(id='p',nome='Pátio',tipo='area',pai_id=None,x=0,y=0,largura=100,altura=100)]})
    enviar(student_client, local_id='p')
    enviar(student_client, envio_id='b'*32)
    authors = [dict(nome='Um',ano='8º',sala='B'),dict(nome='Dois',ano='8º',sala='B')]
    assert resolver(coord_logado, autores=authors).status_code == 201
    r = coord_logado.get('/api/mapa/resumo?periodo=todos&base=autores').json
    assert r['total'] == 1 and r['sem_autoria'] == 1 and r['sem_local'] == 0
    assert r['ambientes'][0] == {'id':'p','total':1,'anos':[{'ano':'8º','total':1}], 'salas':[{'ano':'8º','sala':'B','total':1}]}
    assert coord_logado.post('/api/v3/casos/1/status',json={'status':'em_investigacao','revisao_estado':1}).status_code == 200
    assert resolver(coord_logado, revisao_estado=2, autoria='nao_identificada', autores=[], justificativa_autoria='Não localizado').status_code == 201
    r = coord_logado.get('/api/mapa/resumo?periodo=todos&base=autores&ano=8º').json
    assert r['total'] == 0 and r['sem_autoria'] == 2


def test_foto_privada_sem_metadados_backup_e_rollback(student_client, coord_logado, coord_app, config):
    from datetime import datetime, timezone
    from imagens import png, bloco_png
    from app.backup import fazer_backup
    enviar(student_client)
    photo = png([bloco_png(b'tEXt', b'GPS\0local privado')])
    authors = [dict(nome='Interno',ano='8',sala='B',foto_campo='foto_0')]
    # A stale writer may have staged a sanitized image, but leaves no orphan or resolution.
    assert resolver(coord_logado, revisao_estado=4, autores=authors,
                    _files={'foto_0':(io.BytesIO(photo),'foto.png')}).status_code == 409
    assert list(config.uploads_dir.iterdir()) == []
    assert resolver(coord_logado, autores=authors,
                    _files={'foto_0':(io.BytesIO(photo),'foto.png')}).status_code == 201
    detail = coord_logado.get('/api/casos/1').json
    author_id = detail['resolucoes'][0]['autores'][0]['id']
    url = f'/api/casos/1/autores/{author_id}/foto'
    r = coord_logado.get(url)
    assert r.status_code == 200 and r.data == png()
    assert r.headers['Cache-Control'] == 'private, no-store'
    assert coord_logado.get(f'/api/casos/2/autores/{author_id}/foto').status_code == 404
    assert student_client.get(url).status_code == 404
    assert coord_app.test_client().get(url).status_code == 401
    backup = fazer_backup(config,datetime.now(timezone.utc))
    files = list((backup/'uploads').iterdir())
    assert len(files) == 1 and files[0].read_bytes() == png()
    with connect(config) as c:
        c.execute('UPDATE casos SET simulacao=1 WHERE id=1')
    assert coord_logado.delete('/api/simulacao',json={}).status_code == 200
    assert list(config.uploads_dir.iterdir()) == []


def test_falha_transacional_remove_fotos_e_mantem_caso(student_client, coord_logado, config):
    from imagens import png
    enviar(student_client)
    with connect(config) as c:
        c.execute("CREATE TRIGGER falhar_autor BEFORE INSERT ON autores_resolucao BEGIN SELECT RAISE(ABORT,'falha de teste'); END")
    r = resolver(coord_logado, autores=[dict(nome='Interno',ano='8',sala='B',foto_campo='foto_0')],
                  _files={'foto_0':(io.BytesIO(png()),'foto.png')})
    assert r.status_code == 500
    assert list(config.uploads_dir.iterdir()) == []
    detail = coord_logado.get('/api/casos/1').json
    assert detail['status'] == 'novo' and detail['resolucoes'] == []


def test_recibo_sobrevive_renomear_local_e_dados_legados_nao_inferidos(student_client, coord_logado, config):
    from app.casos import criar_caso
    room = dict(id='p',nome='Antigo',tipo='area',pai_id=None,x=0,y=0,largura=100,altura=100)
    coord_logado.post('/api/mapa',json={'revisao':0,'ambientes':[room]})
    first = enviar(student_client,local_id='p')
    assert first.status_code == 201
    coord_logado.post('/api/mapa',json={'revisao':1,'ambientes':[{**room,'nome':'Novo'}]})
    assert enviar(student_client,local_id='p').json == first.json
    assert coord_logado.get('/api/casos/1').json['local_nome'] == 'Antigo'
    with connect(config) as c:
        criar_caso(c,config,dict(tipo='outro',relato='Legado',anonimo=False,nome='Nome',turma='9A'),[])
        criar_caso(c,config,dict(tipo='outro',relato='Simulado'),[],simulacao=True)
        criar_caso(c,config,dict(tipo='outro',relato='Antigo'),[],criado_em='2020-01-01T00:00:00+00:00')
    r = coord_logado.get('/api/mapa/resumo?periodo=7&base=relator').json
    assert r['total'] == 2 and r['sem_turma'] == 1 and r['sem_local'] == 1
    assert r['sem_autoria'] == 2
    r = coord_logado.get('/api/mapa/resumo?periodo=todos&base=relator').json
    assert r['total'] == 3 and r['sem_turma'] == 2


@pytest.mark.parametrize('field,content', [('foto_0', b'GIF89a'), ('foto_0', b'\x89PNG\r\n\x1a\n'+b'x'*(5*1024*1024))], ids=['gif','excesso'])
def test_foto_tipo_e_limite(student_client,coord_logado,config,field,content):
    enviar(student_client)
    r = resolver(coord_logado,autores=[dict(nome='Interno',ano='8',sala='B',foto_campo=field)],
                 _files={field:(io.BytesIO(content),'foto.png')})
    assert r.status_code == 400 and not list(config.uploads_dir.glob('*'))


def test_remocao_simulacao_bloqueia_resolucao_durante_coleta_de_arquivos(conn,config):
    import sqlite3
    from contextlib import closing
    from app.casos import criar_caso
    from app.simulation import remover_simulacao
    criar_caso(conn,config,{'tipo':'outro','relato':'Ensaio'},[],simulacao=True)
    blocked = []
    def tentar_escrita_concorrente(sql):
        if sql.startswith('DELETE FROM casos') and not blocked:
            with closing(connect(config)) as other:
                other.execute('PRAGMA busy_timeout=0')
                try:
                    other.execute('BEGIN IMMEDIATE')
                    blocked.append(False)
                    other.rollback()
                except sqlite3.OperationalError:
                    blocked.append(True)
    conn.set_trace_callback(tentar_escrita_concorrente)
    assert remover_simulacao(conn,config) == 1
    conn.set_trace_callback(None)
    assert blocked == [True]


def test_snapshot_local_preserva_caminho_da_hierarquia(student_client,coord_logado):
    def room(id,nome,pai,tipo):
        return dict(id=id,nome=nome,pai_id=pai,tipo=tipo,x=0,y=0,largura=100,altura=100)
    rooms = [room('a','Ala A',None,'ala'),room('b','2º andar','a','andar'),room('c','Sala 201','b','sala')]
    assert coord_logado.post('/api/mapa',json={'revisao':0,'ambientes':rooms}).status_code == 200
    result = enviar(student_client,local_id='c')
    assert result.status_code == 201
    expected = 'Ala A / 2º andar / Sala 201'
    assert coord_logado.get('/api/casos/1').json['local_nome'] == expected
    rooms[0]['nome'] = 'Ala renomeada'
    assert coord_logado.post('/api/mapa',json={'revisao':1,'ambientes':rooms}).status_code == 200
    assert enviar(student_client,local_id='c').json == result.json
    assert coord_logado.get('/api/casos/1').json['local_nome'] == expected
