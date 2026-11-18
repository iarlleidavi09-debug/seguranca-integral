import io
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing

import pytest

from app import create_student_app
from app.db import connect, init_db
from imagens import png


def criar(client, **extra):
    return client.post('/api/denuncias', data={
        'tipo': 'outro', 'relato': 'Preciso de ajuda com uma situação na escola.', **extra,
    }).get_json()['codigo']


def anexar(client, code, total=1, **extra):
    return client.post('/api/acompanhar/anexos', data={
        'codigo': code, 'anexos[]': [(io.BytesIO(png()), f'foto{i}.png') for i in range(total)], **extra,
    }, content_type='multipart/form-data')


def test_anexos_no_mesmo_caso_com_erros_parciais_e_evento(student_client, config):
    code = criar(student_client)
    central = student_client.application.extensions['eventos']
    team = central.assinar()
    try:
        response = student_client.post('/api/acompanhar/anexos', data={
            'codigo': code.lower().replace('-', ' '),
            'anexos[]': [(io.BytesIO(png()), 'foto.png'), (io.BytesIO(b'PDF'), 'errado.pdf')],
        }, content_type='multipart/form-data')
        assert response.status_code == 201
        body = response.get_json()
        assert body['anexos_adicionados'] == body['anexos_total'] == 1
        assert body['anexos_recusados'] == [{'nome': 'errado.pdf', 'motivo': 'tipo de arquivo não permitido'}]
        assert team.fila.get_nowait() == 'atualizar'
        with closing(connect(config)) as conn:
            assert conn.execute('SELECT COUNT(*) FROM casos').fetchone()[0] == 1
            assert conn.execute("SELECT COUNT(*) FROM eventos WHERE tipo='anexos_aluno'").fetchone()[0] == 1
        tracking = student_client.post('/api/acompanhar', json={'codigo': code}).get_json()
        assert tracking['anexos_total'] == 1
    finally:
        team.fechar()


def test_anexos_exigem_codigo_no_corpo_e_nao_aceitam_get(student_client, config):
    code = criar(student_client)
    assert student_client.get('/api/acompanhar/anexos').status_code in (404, 405)
    assert student_client.post('/api/acompanhar/anexos', json={'codigo': code}).status_code == 415
    response = student_client.post('/api/acompanhar/anexos', query_string={'codigo': code},
                                   data={'anexos[]': (io.BytesIO(png()), 'foto.png')}, content_type='multipart/form-data')
    assert response.status_code == 404
    assert anexar(student_client, 'AAAA-BBBB').status_code == 404
    with closing(connect(config)) as conn:
        assert conn.execute('SELECT COUNT(*) FROM anexos').fetchone()[0] == 0
    assert not list(config.uploads_dir.glob('*'))


def test_anexos_teto_total_sem_arquivos_orfaos(student_client, config):
    code = criar(student_client)
    assert anexar(student_client, code, 4).status_code == 201
    assert anexar(student_client, code, 2).status_code == 400
    assert len(list(config.uploads_dir.iterdir())) == 4
    assert anexar(student_client, code).status_code == 201
    assert anexar(student_client, code).status_code == 400
    assert len(list(config.uploads_dir.iterdir())) == 5


def test_anexos_teto_concorrente(student_client, config):
    code = criar(student_client)
    assert anexar(student_client, code, 4).status_code == 201
    app = student_client.application
    def enviar(_):
        with app.test_client() as client:
            return anexar(client, code).status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(enviar, range(2))) == [201, 400]
    assert len(list(config.uploads_dir.iterdir())) == 5


def test_anexos_limite_consultas(config):
    app = create_student_app(config, limites={'consultas': (1, 600)})
    client = app.test_client()
    code = criar(client)
    assert anexar(client, code).status_code == 201
    assert anexar(client, code).status_code == 429


def test_anexos_rollback_remove_arquivos(student_client, config):
    code = criar(student_client)
    with closing(connect(config)) as conn:
        conn.execute("CREATE TRIGGER fail_event BEFORE INSERT ON eventos BEGIN SELECT RAISE(ABORT, 'forced rollback'); END")
        conn.commit()
    assert anexar(student_client, code).status_code == 500
    with closing(connect(config)) as conn:
        assert conn.execute('SELECT COUNT(*) FROM anexos').fetchone()[0] == 0
    assert not list(config.uploads_dir.glob('*'))


def test_anexos_recusam_imagem_grande_e_corrompida_sem_perder_valida(student_client, config):
    code = criar(student_client)
    response = student_client.post('/api/acompanhar/anexos', data={
        'codigo': code, 'anexos[]': [(io.BytesIO(png()), 'boa.png'),
                                   (io.BytesIO(b'x' * (5 * 1024 * 1024 + 1)), 'grande.png'),
                                   (io.BytesIO(b'\x89PNG\r\n\x1a\n'), 'corrompida.png')],
    }, content_type='multipart/form-data')
    assert response.status_code == 201
    body = response.get_json()
    assert body['anexos_adicionados'] == 1
    assert {item['motivo'] for item in body['anexos_recusados']} == {'arquivo maior que 5 MB', 'arquivo corrompido'}
    assert len(list(config.uploads_dir.iterdir())) == 1


@pytest.mark.parametrize('route', ['/api/denuncias', '/api/v3/denuncias', '/api/v4/denuncias', '/api/acolhimento'])
def test_codigo_original_apenas_detalhe_autenticado(student_client, coord_logado, config, route):
    data = {'tipo': 'outro', 'relato': 'Uma situação que precisa de ajuda.', 'envio_id': 'a' * 32,
            'ano_relator': '9', 'sala_relator': 'A'}
    if route == '/api/acolhimento':
        response = student_client.post(route, json={'envio_id': 'a' * 32, 'texto': data['relato']})
    else:
        if route == '/api/v3/denuncias':
            data = {k: v for k, v in data.items() if k not in ('tipo', 'ano_relator', 'sala_relator')}
        if route == '/api/v4/denuncias':
            data.pop('tipo')
        response = student_client.post(route, data=data, content_type='multipart/form-data')
    assert response.status_code == 201
    code = response.get_json()['codigo']
    with closing(connect(config)) as conn:
        identity = conn.execute('SELECT id FROM casos').fetchone()[0]
    assert coord_logado.get(f'/api/casos/{identity}').get_json()['codigo_acompanhamento'] == code
    assert code not in coord_logado.get('/api/casos').get_data(as_text=True)
    assert code not in coord_logado.get(f'/api/casos/{identity}/exportacao').get_data(as_text=True)
    assert code not in student_client.post('/api/acompanhar', json={'codigo': code}).get_data(as_text=True)
    assert create_student_app(config).test_client().get(f'/api/casos/{identity}').status_code == 404
    coord_logado.post('/api/logout', json={})
    assert coord_logado.get(f'/api/casos/{identity}').status_code == 401


def test_codigo_legado_null_ate_acesso_valido_sem_trocar_codigo(student_client, coord_logado, config):
    code = criar(student_client)
    with closing(connect(config)) as conn:
        conn.execute('ALTER TABLE casos DROP COLUMN codigo_acompanhamento')
        conn.commit()
        identity, before = conn.execute('SELECT id,codigo_hash FROM casos').fetchone()
    init_db(config)
    assert coord_logado.get(f'/api/casos/{identity}').get_json()['codigo_acompanhamento'] is None
    assert student_client.post('/api/acompanhar', json={'codigo': 'AAAA-BBBB'}).status_code == 404
    assert coord_logado.get(f'/api/casos/{identity}').get_json()['codigo_acompanhamento'] is None
    assert student_client.post('/api/acompanhar', json={'codigo': code.lower()}).status_code == 200
    assert coord_logado.get(f'/api/casos/{identity}').get_json()['codigo_acompanhamento'] == code
    with closing(connect(config)) as conn:
        assert conn.execute('SELECT codigo_hash FROM casos').fetchone()[0] == before
