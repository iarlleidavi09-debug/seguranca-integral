"""Integração entre catálogo editável e rótulos históricos da coordenação."""
import json
from uuid import uuid4


def test_coord_catalog_requires_session(coord_client):
    assert coord_client.get('/api/v3/questionario').status_code == 401


def test_coord_catalog_uses_canonical_public_definition(coord_logado, config):
    definition = json.loads(config.questionario_v3_path.read_text(encoding='utf-8'))
    definition['grupos'][0]['nome'] = 'Grupo editado localmente'
    (config.data_dir / 'questionario_v3.json').write_text(json.dumps(definition), encoding='utf-8')
    response = coord_logado.get('/api/v3/questionario')
    assert response.status_code == 200
    assert response.json['grupos'][0]['nome'] == 'Grupo editado localmente'
    assert response.json['versao'] == 3
    assert set(response.json) == {'versao', 'grupos', 'comuns', 'perguntas', 'dimensoes'}
    assert set(response.json['grupos'][0]['opcoes'][0]) == {'id', 'texto', 'perguntas'}
    assert set(response.json['perguntas'][0]['respostas'][0]) == {'id', 'texto'}


def test_case_subjects_keep_snapshot_labels_after_catalog_edit(student_client, coord_logado, config):
    response = student_client.post('/api/v3/denuncias', data={
        'envio_id': uuid4().hex, 'relato': 'Relato fictício para conferir os rótulos históricos.',
        'respostas': json.dumps({'versao': 3, 'marcadas': ['cyber'], 'respostas': {}}),
    }, content_type='multipart/form-data')
    assert response.status_code == 201
    definition = json.loads(config.questionario_v3_path.read_text(encoding='utf-8'))
    definition['grupos'][0]['opcoes'][1]['texto'] = 'Nome novo somente na definição'
    (config.data_dir / 'questionario_v3.json').write_text(json.dumps(definition), encoding='utf-8')
    queue = coord_logado.get('/api/casos').json['casos']
    assert queue[0].get('assuntos') == ['Ataques, boatos ou exposição na internet']
    detail = coord_logado.get(f"/api/casos/{queue[0]['id']}").json
    assert detail.get('assuntos') == ['Ataques, boatos ou exposição na internet']
