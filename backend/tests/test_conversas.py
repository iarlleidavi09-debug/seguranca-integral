from app import auth, casos
from app.db import init_db
from conftest import SENHA_COORD


def criar(conn, config):
    codigo = casos.criar_caso(conn, config, {'tipo': 'outro', 'relato': 'Preciso conversar'}, [])
    return conn.execute('SELECT max(id) FROM casos').fetchone()[0], codigo


def item(client, caso_id):
    return next(c for c in client.get('/api/casos').json['casos'] if c['id'] == caso_id)


def test_estados_ids_e_leitura_por_usuario(conn, config, coord_app, coord_logado, student_client):
    caso_id, codigo = criar(conn, config)
    assert item(coord_logado, caso_id)['conversa_estado'] == 'sem_mensagem'
    assert item(coord_logado, caso_id)['ultima_mensagem'] is None
    assert item(coord_logado, caso_id)['canal'] == 'relato'
    casos.adicionar_mensagem(conn, caso_id, 'aluno', 'Primeira')
    primeira = casos.listar_mensagens(conn, caso_id)[0]['id']
    assert student_client.post('/api/acompanhar', json={'codigo': codigo}).json['mensagens'][0]['id'] == primeira
    antes = item(coord_logado, caso_id)
    assert antes['conversa_estado'] == 'mensagem_nova'
    assert antes['mensagens_novas'] == 1
    assert antes['ultima_mensagem']['texto'] == 'Primeira'
    assert coord_logado.get(f'/api/casos/{caso_id}').json['mensagens'][0]['id'] == primeira
    assert item(coord_logado, caso_id)['mensagens_novas'] == 1
    # Detalhe não marca lido; uma mensagem que chega durante a leitura permanece nova.
    casos.adicionar_mensagem(conn, caso_id, 'aluno', 'Segunda')
    segunda = casos.listar_mensagens(conn, caso_id)[1]['id']
    rota = f'/api/casos/{caso_id}/conversa/lida'
    assert coord_logado.post(rota, json={'ultimo_id': primeira}).status_code == 200
    assert item(coord_logado, caso_id)['mensagens_novas'] == 1
    assert coord_logado.post(rota, json={'ultimo_id': segunda}).status_code == 200
    assert item(coord_logado, caso_id)['conversa_estado'] == 'aguardando_equipe'
    # Recibos atrasados nunca fazem a leitura retroceder.
    coord_logado.post(rota, json={'ultimo_id': primeira})
    assert item(coord_logado, caso_id)['mensagens_novas'] == 0
    auth.criar_usuario(conn, 'colega', SENHA_COORD)
    colega = coord_app.test_client()
    colega.post('/api/login', json={'nome': 'colega', 'senha': SENHA_COORD})
    assert item(colega, caso_id)['mensagens_novas'] == 2
    casos.adicionar_mensagem(conn, caso_id, 'coordenacao', 'Resposta')
    assert item(coord_logado, caso_id)['conversa_estado'] == 'aguardando_aluno'
    assert item(colega, caso_id)['conversa_estado'] == 'mensagem_nova'


def test_recibo_valida_caso_id_e_autorizacao(conn, config, coord_logado, coord_app):
    primeiro, _ = criar(conn, config)
    segundo, _ = criar(conn, config)
    casos.adicionar_mensagem(conn, segundo, 'aluno', 'Outro caso')
    outro_id = casos.listar_mensagens(conn, segundo)[0]['id']
    rota = f'/api/casos/{primeiro}/conversa/lida'
    for valor in (None, True, -1, 0, '1', 2**64, outro_id):
        assert coord_logado.post(rota, json={'ultimo_id': valor}).status_code == 400
    assert coord_app.test_client().post(rota, json={'ultimo_id': outro_id}).status_code == 401
    assert coord_logado.post('/api/casos/99999/conversa/lida', json={'ultimo_id': 1}).status_code == 404
    assert coord_logado.post(rota, data='{}').status_code == 415


def test_instalacao_idempotente_preserva_mensagens_existentes(conn, config, coord_logado):
    caso_id, _ = criar(conn, config)
    casos.adicionar_mensagem(conn, caso_id, 'aluno', 'Antiga')
    conn.execute('DROP TABLE IF EXISTS leituras_conversa')
    conn.commit()
    init_db(config)
    init_db(config)
    assert item(coord_logado, caso_id)['mensagens_novas'] == 1
