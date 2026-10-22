from contextlib import closing

import pytest
from app import create_student_app
from app.db import connect
from test_collaboration_contract import caso


def central_nova(**kwargs):
    from app.realtime import CentralEventos
    return CentralEventos(**kwargs)


def test_queues_coalesce_segregate_and_cleanup():
    central = central_nova()
    team, first, other = central.assinar(), central.assinar(1), central.assinar(2)
    for _ in range(1000):
        central.publicar(1)
    assert team.fila.qsize() == first.fila.qsize() == 1
    assert other.fila.empty()
    assert first.fila.get_nowait() == 'atualizar'
    central.publicar(None)
    assert first.fila.empty()
    team.fechar(); first.fechar(); other.fechar()
    assert central.assinantes == 0


def test_presence_ttl_tabs_and_removal():
    now = [0.0]
    central = central_nova(relogio=lambda: now[0])
    user = {'id': 1, 'nome': 'Equipe'}
    central.pulsar(1, user, 'a', 'mensagem')
    now[0] = 10
    central.pulsar(1, user, 'b', 'vendo')
    assert central.presenca(1) == [{'id': 1, 'nome': 'Equipe', 'atividade': 'mensagem'}]
    now[0] = 46
    assert central.presenca(1) == [{'id': 1, 'nome': 'Equipe', 'atividade': 'vendo'}]
    central.remover_presenca(1, 1, 'b')
    assert central.presenca(1) == []
    assert central.presenca(2) == []


def test_publication_after_commit_and_notes_only_for_team(coord_logado, config):
    identity, code = caso(config)
    other_id, _ = caso(config)
    central = coord_logado.application.extensions['eventos']
    team, student, other = central.assinar(), central.assinar(identity), central.assinar(other_id)
    try:
        assert coord_logado.post(f'/api/casos/{identity}/mensagens', json={'texto': 'Mensagem publicada.'}).status_code == 201
        assert student.fila.get_nowait() == 'atualizar'
        with closing(connect(config)) as c:
            assert c.execute('SELECT texto FROM mensagens WHERE caso_id=?', (identity,)).fetchone()[0] == 'Mensagem publicada.'
        assert other.fila.empty()
        team.fila.get_nowait()
        assert coord_logado.post(f'/api/casos/{identity}/notas', json={'texto': 'Nota privada.'}).status_code == 201
        assert not team.fila.empty()
        assert student.fila.empty()
        app = create_student_app(config, central=central)
        assert app.test_client().post('/api/acompanhar/mensagens', json={'codigo': code, 'texto': 'Resposta aluno.'}).status_code == 201
        assert student.fila.get_nowait() == 'atualizar'
    finally:
        team.fechar(); student.fechar(); other.fechar()


def test_failed_transaction_does_not_publish_or_leave_message(coord_logado, config):
    identity, _ = caso(config)
    central = coord_logado.application.extensions['eventos']
    sub = central.assinar(identity)
    with closing(connect(config)) as c:
        c.execute("CREATE TRIGGER fail_event BEFORE INSERT ON eventos BEGIN SELECT RAISE(ABORT, 'forced rollback'); END")
        c.commit()
    response = coord_logado.post(f'/api/casos/{identity}/mensagens', json={'texto': 'Deve falhar.'})
    assert response.status_code == 500
    assert sub.fila.empty()
    sub.fechar()
    with closing(connect(config)) as c:
        assert c.execute('SELECT COUNT(*) FROM mensagens').fetchone()[0] == 0


@pytest.mark.parametrize('reason', ['logout', 'expired', 'disabled'])
def test_stream_revalidates_session_and_releases_subscription(coord_logado, config, monkeypatch, reason):
    import app.routes_realtime as routes
    central = coord_logado.application.extensions['eventos']
    response = coord_logado.get('/api/eventos', buffered=False)
    iterator = iter(response.response)
    assert b'data: {}' in next(iterator)
    assert central.assinantes == 1
    if reason == 'logout':
        assert coord_logado.post('/api/logout', json={}).status_code == 200
    elif reason == 'expired':
        monkeypatch.setattr(routes.time, 'time', lambda: 10**12)
    else:
        with closing(connect(config)) as c:
            c.execute('UPDATE usuarios SET ativo=0')
            c.commit()
    central.publicar(None)
    with pytest.raises(StopIteration):
        next(iterator)
    response.close()
    assert central.assinantes == 0


def test_stream_does_not_hold_sqlite_connection_while_yielding(coord_logado, monkeypatch):
    import app.routes_coord as coord
    import app.routes_realtime as realtime
    opened = []
    original = connect

    class Tracked:
        def __init__(self, config):
            self.conn = original(config)
            opened.append(self)
        def __getattr__(self, name):
            return getattr(self.conn, name)
        def close(self):
            self.conn.close()
            opened.remove(self)

    monkeypatch.setattr(coord, 'connect', Tracked)
    monkeypatch.setattr(realtime, 'connect', Tracked)
    response = coord_logado.get('/api/eventos', buffered=False)
    try:
        assert b'event: atualizar' in next(iter(response.response))
        assert opened == []
    finally:
        response.close()


@pytest.mark.parametrize('revision', [None, True, -1, '0', 1.5])
def test_cas_requires_integer_revision(coord_logado, config, revision):
    identity, _ = caso(config)
    response = coord_logado.post(f'/api/v3/casos/{identity}/status', json={'status': 'em_investigacao', 'revisao_estado': revision})
    assert response.status_code == 400
    assert coord_logado.get(f'/api/casos/{identity}').json['revisao_estado'] == 0


def test_student_recurrence_and_resolution_participate_in_cas(coord_logado, student_client, config):
    identity, code = caso(config)
    url = f'/api/v3/casos/{identity}'
    assert coord_logado.post(url + '/resolucao', json={'desfecho': 'solucionada', 'providencias': 'Acompanhamento realizado.', 'revisao_estado': 0}).status_code == 201
    assert student_client.post('/api/acompanhar/situacao', json={'codigo': code, 'situacao': 'voltou'}).status_code == 201
    assert coord_logado.get(f'/api/casos/{identity}').json['revisao_estado'] == 2
    assert coord_logado.post(url + '/revisao-recorrencia', json={'revisao_estado': 1}).status_code == 409
    assert coord_logado.post(url + '/revisao-recorrencia', json={'revisao_estado': 2}).status_code == 201
    assert coord_logado.get(f'/api/casos/{identity}').json['revisao_estado'] == 3


def test_heartbeat_revalidates_without_any_publication(coord_logado, config, monkeypatch):
    import app.routes_realtime as routes
    monkeypatch.setattr(routes, 'HEARTBEAT', 0.001)
    response = coord_logado.get('/api/eventos', buffered=False)
    iterator = iter(response.response)
    assert next(iterator) == b'event: atualizar\ndata: {}\n\n'
    assert next(iterator) == b': heartbeat\n\n'
    with closing(connect(config)) as c:
        c.execute('UPDATE usuarios SET ativo=0')
        c.commit()
    with pytest.raises(StopIteration):
        next(iterator)
    response.close()
    assert coord_logado.application.extensions['eventos'].assinantes == 0


def test_student_stream_is_minimal_and_close_cleans_queue(coord_logado, config):
    identity, code = caso(config)
    central = coord_logado.application.extensions['eventos']
    student = create_student_app(config, central=central).test_client()
    response = student.post('/api/acompanhar/eventos', json={'codigo': code}, buffered=False)
    try:
        iterator = iter(response.response)
        assert next(iterator) == b'event: atualizar\ndata: {}\n\n'
        assert coord_logado.post(f'/api/casos/{identity}/mensagens', json={'texto': 'Mensagem nunca transmitida no SSE.'}).status_code == 201
        assert next(iterator) == b'event: atualizar\ndata: {}\n\n'
    finally:
        response.close()
    assert central.assinantes == 0


def test_presence_repeated_pulse_does_not_invalidate_loop_or_persist(coord_logado, config):
    identity, _ = caso(config)
    central = coord_logado.application.extensions['eventos']
    sub = central.assinar()
    url = f'/api/casos/{identity}/presenca'
    payload = {'aba': 'c' * 32, 'atividade': 'nota'}
    before = coord_logado.get(f'/api/casos/{identity}').json
    assert coord_logado.post(url, json=payload).status_code == 200
    sub.fila.get_nowait()
    assert coord_logado.post(url, json=payload).status_code == 200
    assert sub.fila.empty()
    assert coord_logado.post(url, json={**payload, 'texto': 'não pode sair do navegador'}).status_code == 400
    assert coord_logado.delete(url, json={'aba': 'c' * 32}).json == {'pessoas': []}
    after = coord_logado.get(f'/api/casos/{identity}').json
    assert after['eventos'] == before['eventos']
    assert after['revisao_estado'] == before['revisao_estado']
    sub.fechar()


def test_conflict_does_not_publish_and_append_notes_needs_no_revision(coord_logado, config):
    identity, _ = caso(config)
    central = coord_logado.application.extensions['eventos']
    sub = central.assinar()
    assert coord_logado.post(f'/api/v3/casos/{identity}/prioridade', json={'prioridade': 'alta', 'justificativa': 'Urgência confirmada.', 'revisao_estado': 0}).status_code == 200
    sub.fila.get_nowait()
    assert coord_logado.post(f'/api/v3/casos/{identity}/resolucao', json={'desfecho': 'solucionada', 'providencias': 'Texto preservado.', 'revisao_estado': 0}).status_code == 409
    assert sub.fila.empty()
    assert coord_logado.post(f'/api/casos/{identity}/notas', json={'texto': 'Nota simultânea.'}).status_code == 201
    detail = coord_logado.get(f'/api/casos/{identity}').json
    assert detail['revisao_estado'] == 1
    assert detail['resolucoes'] == []
    assert detail['notas'][0]['texto'] == 'Nota simultânea.'
    sub.fechar()


def test_two_database_writers_cannot_both_accept_same_revision(coord_logado, config):
    from concurrent.futures import ThreadPoolExecutor
    from app.casos import RevisaoConflitante, mudar_status
    identity, _ = caso(config)
    def change(value):
        with closing(connect(config)) as c:
            try:
                mudar_status(c, identity, value, 1, 0)
                return 'ok'
            except RevisaoConflitante:
                return 'conflito'
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(change, ['em_investigacao', 'em_investigacao']))
    assert sorted(results) == ['conflito', 'ok']


def test_legacy_cookie_without_session_id_requires_new_login(coord_logado):
    with coord_logado.session_transaction() as session:
        del session['sid']
    cookie = coord_logado.get_cookie('si_coord_sessao').value
    clone = coord_logado.application.test_client()
    clone.set_cookie('si_coord_sessao', cookie)
    assert coord_logado.get('/api/eu').status_code == 401
    assert clone.get('/api/eu').status_code == 401


def test_logout_revokes_cloned_cookie_and_open_stream(coord_logado):
    cookie = coord_logado.get_cookie('si_coord_sessao').value
    clone = coord_logado.application.test_client()
    clone.set_cookie('si_coord_sessao', cookie)
    response = clone.get('/api/eventos', buffered=False)
    iterator = iter(response.response)
    next(iterator)
    assert coord_logado.post('/api/logout', json={}).status_code == 200
    with pytest.raises(StopIteration):
        next(iterator)
    clone.set_cookie('si_coord_sessao', cookie)
    assert clone.get('/api/eu').status_code == 401
    response.close()
