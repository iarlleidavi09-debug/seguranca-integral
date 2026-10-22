"""Contratos observáveis de colaboração; regressões para a fase de tempo real."""
from contextlib import closing

from app.casos import criar_caso
from app.db import connect


def caso(config):
    with closing(connect(config)) as c:
        code = criar_caso(c, config, {
            'tipo': 'outro', 'relato': 'Relato fictício de colaboração na escola.',
            'anonimo': True,
        }, [])
        identity = c.execute('SELECT id FROM casos ORDER BY id DESC LIMIT 1').fetchone()[0]
    return identity, code


def test_event_stream_requires_coord_session(coord_client):
    response = coord_client.get('/api/eventos')
    assert response.status_code == 401


def test_student_event_stream_checks_code_in_post_body(student_client):
    response = student_client.post('/api/acompanhar/eventos', json={'codigo': 'AAAA-AAAA'})
    assert response.status_code == 404
    assert response.json == {'erro': 'codigo nao encontrado'}


def test_coord_event_stream_starts_with_invalidation(coord_logado):
    response = coord_logado.get('/api/eventos', buffered=False)
    try:
        assert response.status_code == 200
        assert response.mimetype == 'text/event-stream'
        first = next(iter(response.response))
        first = first.decode() if isinstance(first, bytes) else first
        assert 'event: atualizar' in first
        assert 'data: {}' in first
    finally:
        response.close()


def test_presence_consolidates_tabs_without_draft_text(coord_logado, config):
    identity, _ = caso(config)
    url = f'/api/casos/{identity}/presenca'
    first = coord_logado.post(url, json={'aba': 'a' * 32, 'atividade': 'vendo'})
    second = coord_logado.post(url, json={'aba': 'b' * 32, 'atividade': 'mensagem'})
    assert first.status_code in (200, 201)
    assert second.status_code in (200, 201)
    result = coord_logado.get(url)
    assert result.status_code == 200
    people = result.json['pessoas']
    assert len(people) == 1
    assert people[0]['nome'] == 'coord'
    assert people[0]['atividade'] == 'mensagem'
    assert set(people[0]) == {'id', 'nome', 'atividade'}


def test_stale_case_revision_rejects_change_and_keeps_first_action(coord_logado, config):
    identity, _ = caso(config)
    original = coord_logado.get(f'/api/casos/{identity}').json
    assert original['revisao_estado'] == 0
    first = coord_logado.post(f'/api/v3/casos/{identity}/status', json={
        'status': 'em_investigacao', 'revisao_estado': 0,
    })
    assert first.status_code == 200
    stale = coord_logado.post(f'/api/v3/casos/{identity}/prioridade', json={
        'prioridade': 'alta', 'justificativa': 'Minha tela estava desatualizada.',
        'revisao_estado': 0,
    })
    assert stale.status_code == 409
    updated = coord_logado.get(f'/api/casos/{identity}').json
    assert updated['status'] == 'em_investigacao'
    assert updated['prioridade'] == original['prioridade']
    assert updated['revisao_estado'] == 1
    assert len(updated['eventos']) == len(original['eventos']) + 1


def test_messages_append_without_invalidating_state_revision(coord_logado, student_client, config):
    identity, code = caso(config)
    before = coord_logado.get(f'/api/casos/{identity}').json['revisao_estado']
    assert coord_logado.post(f'/api/casos/{identity}/mensagens', json={'texto': 'Resposta fictícia.'}).status_code == 201
    assert student_client.post('/api/acompanhar/mensagens', json={'codigo': code, 'texto': 'Mensagem fictícia.'}).status_code == 201
    detail = coord_logado.get(f'/api/casos/{identity}').json
    assert detail['revisao_estado'] == before
    assert [m['texto'] for m in detail['mensagens']] == ['Resposta fictícia.', 'Mensagem fictícia.']


def test_legacy_state_change_invalidates_new_client_revision(coord_logado, config):
    identity, _ = caso(config)
    assert coord_logado.post(f'/api/casos/{identity}/status', json={'status': 'em_investigacao'}).status_code == 200
    detail = coord_logado.get(f'/api/casos/{identity}').json
    assert detail['revisao_estado'] == 1
    stale = coord_logado.post(f'/api/v3/casos/{identity}/status', json={
        'status': 'novo', 'revisao_estado': 0,
    })
    assert stale.status_code == 409
