from contextlib import closing
from app.db import connect, init_db


def ambiente(id='sala', **kw):
    return dict(id=id, nome='Sala 1', tipo='sala', pai_id=None,
                x=0, y=0, largura=100, altura=80, **kw)


def test_mapa_autenticado_e_catalogo_minimo(coord_client, coord_logado, student_client):
    assert coord_client.get('/api/mapa').status_code == 200  # same logged-in client
    assert coord_logado.get('/api/mapa').json == {'revisao': 0, 'ambientes': []}
    saved = coord_logado.post('/api/mapa', json={'revisao': 0, 'ambientes': [ambiente()]})
    assert saved.status_code == 200
    assert saved.json['revisao'] == 1
    assert coord_logado.get('/api/mapa').json == saved.json
    assert student_client.get('/api/locais').json == {'revisao': 1, 'ambientes': [
        {'id': 'sala', 'nome': 'Sala 1', 'tipo': 'sala', 'pai_id': None}]}
    assert student_client.get('/api/mapa').status_code == 404
    coord_logado.post('/api/logout', json={})
    assert coord_logado.get('/api/mapa').status_code == 401


def test_revisao_invalida_nao_substitui_mapa(coord_logado):
    state = {'revisao': 0, 'ambientes': [ambiente()]}
    assert coord_logado.post('/api/mapa', json=state).status_code == 200
    assert coord_logado.post('/api/mapa', json=state).status_code == 409
    assert coord_logado.get('/api/mapa').json['revisao'] == 1


def test_planta_publica_contem_geometria_sem_contagens(coord_logado, student_client):
    room = {**ambiente(), 'tipo': 'escadaria', 'formato': 'l', 'rotacao': 90, 'espessura': 0.4}
    assert coord_logado.post('/api/mapa', json={'revisao': 0, 'ambientes': [room]}).status_code == 200
    response = student_client.get('/api/planta')
    assert response.status_code == 200
    assert response.json == {'revisao': 1, 'ambientes': [room]}
    assert response.headers['Cache-Control'] == 'no-store'
    assert student_client.get('/api/mapa/resumo').status_code == 404


def test_mapa_valida_ciclos_geometria_e_pais(coord_logado):
    for rooms in ([{**ambiente(), 'x': -1}], [{**ambiente(), 'largura': 39}],
                  [{**ambiente(), 'x': 11950}], [{**ambiente(), 'pai_id': 'inexistente'}],
                  [{**ambiente(), 'pai_id': 'sala'}], [ambiente(), ambiente()],
                  [{**ambiente(), 'id': '../x'}], [{**ambiente(), 'nome': ''}],
                  [{**ambiente(), 'x': True}],
                  [{**ambiente(), 'x': 10**400}],
                  [{**ambiente('a'), 'pai_id': 'b'}, {**ambiente('b'), 'pai_id': 'a'}],
                  [{**ambiente(str(i)), 'pai_id': str(i-1) if i else None} for i in range(7)]):
        r = coord_logado.post('/api/mapa', json={'revisao': 0, 'ambientes': rooms})
        assert r.status_code == 400, r.json
    rooms = [ambiente('a'), {**ambiente('b'), 'pai_id': 'a'}]
    assert coord_logado.post('/api/mapa', json={'revisao': 0, 'ambientes': rooms}).status_code == 200
    assert coord_logado.post('/api/mapa', json={'revisao': 1, 'ambientes': [
        {**ambiente('b'), 'pai_id': None}]}).status_code == 409


def test_migracao_backup_aditiva_idempotente(config):
    import sqlite3
    from app.casos import criar_caso, registrar_resolucao
    init_db(config)
    with connect(config) as c:
        criar_caso(c,config,{'tipo':'outro','relato':'Caso preservado'},[])
        registrar_resolucao(c,1,'solucionada','Providência preservada','',None)
        c.execute("INSERT INTO envios VALUES ('recibo-preservado',0,'hash-preservado',1,'{}')")
        c.commit()
        codigo_hash = c.execute('SELECT codigo_hash FROM casos').fetchone()[0]
        assert 'ano_relator' in {r[1] for r in c.execute('PRAGMA table_info(casos)')}
        c.execute('DROP TABLE autores_resolucao')
        c.execute('DROP TABLE ambientes')
        c.execute('DROP TABLE mapa_estado')
        for col in ('ano_relator','sala_relator','local_id','local_nome','local_outro'):
            c.execute(f'ALTER TABLE casos DROP COLUMN {col}')
        for col in ('autoria','justificativa_autoria'):
            c.execute(f'ALTER TABLE resolucoes DROP COLUMN {col}')
    init_db(config)
    backup = config.db_path.with_name(config.db_path.name + '.pre-v4.bak')
    assert backup.exists()
    before = backup.read_bytes()
    init_db(config)
    assert backup.read_bytes() == before
    with connect(config) as c:
        assert {'ano_relator','sala_relator','local_id','local_nome'} <= {r[1] for r in c.execute('PRAGMA table_info(casos)')}
        assert c.execute('SELECT codigo_hash FROM casos').fetchone()[0] == codigo_hash
        assert c.execute('SELECT providencias FROM resolucoes').fetchone()[0] == 'Providência preservada'
        assert c.execute('SELECT recibo_hmac FROM envios').fetchone()[0] == 'recibo-preservado'
        assert c.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    with closing(sqlite3.connect(backup)) as c:
        assert 'ano_relator' not in {r[1] for r in c.execute('PRAGMA table_info(casos)')}
        assert c.execute('SELECT codigo_hash FROM casos').fetchone()[0] == codigo_hash


def test_migracao_parcial_tambem_faz_backup(config):
    init_db(config)
    with connect(config) as c:
        c.execute('ALTER TABLE casos DROP COLUMN sala_relator')
    init_db(config)
    assert config.db_path.with_name(config.db_path.name+'.pre-v4.bak').is_file()


def test_leitura_mapa_usa_mesmo_snapshot_para_revisao_e_ambientes(conn,config):
    from app.mapa import ler,salvar
    def alterar_durante_leitura(sql):
        if sql.startswith('SELECT * FROM ambientes'):
            conn.set_trace_callback(None)
            with closing(connect(config)) as other:
                salvar(other,{'revisao':0,'ambientes':[ambiente()]})
    conn.set_trace_callback(alterar_durante_leitura)
    assert ler(conn) == {'revisao':0,'ambientes':[]}
    assert ler(conn)['revisao'] == 1


def test_ala_l_persiste_rotacao_espessura_e_defaults(coord_logado,student_client):
    rooms = [{**ambiente('ala-l'),'tipo':'ala','formato':'l','rotacao':90,'espessura':0.45},
             {**ambiente('l-default'),'formato':'l'},ambiente('antigo')]
    r = coord_logado.post('/api/mapa',json={'revisao':0,'ambientes':rooms})
    assert r.status_code == 200
    result = coord_logado.get('/api/mapa').json
    assert result['ambientes'][0] == rooms[0]
    assert result['ambientes'][1] == {**rooms[1],'rotacao':0,'espessura':0.35}
    assert result['ambientes'][2] == rooms[2]
    assert set(student_client.get('/api/locais').json['ambientes'][0]) == {'id','nome','tipo','pai_id'}
    assert 'geometria_json' not in str(result)


def test_formato_l_valida_rotacao_e_espessura(coord_logado):
    for geometry in ({'formato':'triangulo'},{'formato':'l','rotacao':45},
                     {'formato':'l','rotacao':True},{'formato':'l','espessura':True},
                     {'formato':'l','espessura':0.1},{'formato':'l','espessura':0.9},
                     {'formato':'l','espessura':float('nan')},{'formato':'l','espessura':'0.35'}):
        r = coord_logado.post('/api/mapa',json={'revisao':0,'ambientes':[{**ambiente(),**geometry}]})
        assert r.status_code == 400
    r = coord_logado.post('/api/mapa',json={'revisao':0,'ambientes':[{**ambiente(),'formato':'retangulo','rotacao':0,'espessura':0.35}]})
    assert r.status_code == 200
    assert r.json['ambientes'] == [ambiente()]


def test_migracao_geometria_faz_backup_e_preserva_planta(config):
    import sqlite3
    from app.mapa import salvar,ler
    init_db(config)
    with closing(connect(config)) as c:
        assert 'geometria_json' in {r[1] for r in c.execute('PRAGMA table_info(ambientes)')}
        salvar(c,{'revisao':0,'ambientes':[ambiente()]})
        c.execute('ALTER TABLE ambientes DROP COLUMN geometria_json')
        c.commit()
    previous = config.db_path.with_name(config.db_path.name+'.pre-v4.bak')
    previous.write_bytes(b'backup anterior preservado')
    init_db(config)
    assert previous.read_bytes() == b'backup anterior preservado'
    backup = config.db_path.with_name(config.db_path.name+'.pre-mapa-l.bak')
    assert backup.is_file()
    original = backup.read_bytes()
    with closing(sqlite3.connect(backup)) as c:
        assert c.execute('SELECT nome FROM ambientes').fetchone()[0] == 'Sala 1'
        assert 'geometria_json' not in {r[1] for r in c.execute('PRAGMA table_info(ambientes)')}
    init_db(config)
    assert backup.read_bytes() == original
    with closing(connect(config)) as c:
        assert ler(c) == {'revisao':1,'ambientes':[ambiente()]}


def test_backup_l_bloqueado_aborta_migracao(config):
    import pytest
    init_db(config)
    with closing(connect(config)) as c:
        c.execute('ALTER TABLE ambientes DROP COLUMN geometria_json')
        c.commit()
    config.db_path.with_name(config.db_path.name+'.pre-mapa-l.bak').mkdir()
    with pytest.raises(OSError):
        init_db(config)
    with closing(connect(config)) as c:
        assert 'geometria_json' not in {r[1] for r in c.execute('PRAGMA table_info(ambientes)')}
