import copy
import io
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app import create_student_app
from app.db import connect, init_db
from imagens import png


def definition():
    from app.questionario_v3 import carregar
    return carregar(Path(__file__).parents[1] / 'app' / 'questionario_v3.json')


def payload(marcadas=None, respostas=None):
    return {'versao': 3, 'marcadas': marcadas or [], 'respostas': respostas or {}}


def validated(d, marcadas=None, respostas=None):
    return d.validar_respostas(json.dumps(payload(marcadas, respostas)))


def test_multigrupo_common_once_and_maxima():
    d = definition()
    r = validated(d, ['cyber', 'ameaca'], {
        'q-quando': ['q-quando.sim'], 'q-frequencia': ['q-frequencia.diaria'],
        'q-impacto': ['q-impacto.escola'], 'q-risco-arma': ['q-risco-arma.sim'],
        'q-seguranca': ['q-seguranca.incerta'],
    })
    visible = d.visiveis(r['marcadas'], r['respostas'])
    assert visible[:4] == ['q-seguranca', 'q-quem', 'q-quando', 'q-frequencia']
    assert len(visible) == len(set(visible))
    triagem = d.classificar(r, 'Relato simples sem palavras especiais.', False, {})
    assert triagem.pontos == 13  # 4 + 2 + 2 + 2 + max(3,1)
    assert triagem.prioridade == 'alta'
    neutral = validated(d, ['cyber', 'ameaca'], {**r['respostas'], 'q-quem': ['q-quem.prefiro']})
    assert d.classificar(neutral, '', False, {}).pontos == 13


def test_hidden_answers_and_transitive_removal():
    from app.questionario_v3 import RespostasInvalidas
    d = definition()
    with pytest.raises(RespostasInvalidas):
        validated(d, ['cyber'], {'q-contato-atual': ['q-contato-atual.sim']})
    answers = {'q-exigencia': ['q-exigencia.intimidade'],
               'q-contato-atual': ['q-contato-atual.sim'], 'q-adulto': ['q-adulto.sim']}
    assert 'q-adulto' in d.visiveis(['chantagem'], answers)
    answers['q-exigencia'] = ['q-exigencia.silencio']
    visible = d.visiveis(['chantagem'], answers)
    assert 'q-contato-atual' not in visible
    assert 'q-adulto' not in visible
    with pytest.raises(RespostasInvalidas):
        validated(d, ['chantagem'], answers)


@pytest.mark.parametrize('options,answers,points,priority', [
    (['ameaca'], {}, 4, 'baixa'),
    (['contato'], {}, 5, 'media'),
    (['ameaca'], {'q-quando': ['q-quando.sim'], 'q-frequencia': ['q-frequencia.diaria']}, 8, 'media'),
    (['contato'], {'q-quando': ['q-quando.sim'], 'q-frequencia': ['q-frequencia.diaria']}, 9, 'alta'),
])
def test_thresholds(options, answers, points, priority):
    d = definition()
    t = d.classificar(validated(d, options, answers), '', False, {})
    assert (t.pontos, t.prioridade) == (points, priority)


@pytest.mark.parametrize('options,answers', [
    (['cyber'], {'q-seguranca': ['q-seguranca.nao']}),
    (['agressao'], {'q-socorro': ['q-socorro.sim']}),
    (['ameaca'], {'q-risco-arma': ['q-risco-arma.sim'], 'q-risco-local': ['q-risco-local.hoje']}),
    (['ataque-escola'], {'q-quando': ['q-quando.sim']}),
    (['adulteracao'], {'q-socorro': ['q-socorro.sim']}),
    (['contato'], {'q-contato-atual': ['q-contato-atual.sim']}),
    (['intimidade'], {'q-exigencia': ['q-exigencia.dinheiro']}),
])
def test_seven_critical_alerts(options, answers):
    d = definition()
    t = d.classificar(validated(d, options, answers), '', False, {})
    assert t.prioridade == 'critica'
    assert any(m.startswith('alerta:') for m in t.motivos)


def test_text_only_elevates_structured_and_public_hides_rules():
    d = definition()
    r = validated(d, ['ameaca'])
    terms = {'violencia': ['arma'], 'nudes': ['intimo'], 'extorsao': ['chantagem']}
    t = d.classificar(r, 'arma', False, terms)
    assert (t.pontos, t.prioridade) == (4, 'baixa')
    t = d.classificar(r, 'arma', True, terms)
    assert (t.pontos, t.prioridade) == (4, 'critica')
    public = d.para_aluno()
    assert len(public['grupos']) == 8
    assert sum(len(g['opcoes']) for g in public['grupos']) == 29
    text = json.dumps(public)
    for private in ('peso', 'alertas', 'faixas', 'tipo_legado'):
        assert private not in text


def test_invalid_definition_cycle_dimensions_weights_and_alerts(tmp_path):
    from app.questionario_v3 import QuestionarioInvalido, carregar
    original = definition().dados
    mutations = [
        lambda d: d['perguntas'][0].update(mostrar_se=['q-seguranca.sim']),
        lambda d: d['perguntas'][0].update(dimensao='invalida'),
        lambda d: d['perguntas'][0]['respostas'][0].update(peso=-1),
        lambda d: d['alertas'][0].update(todas=['inexistente']),
    ]
    for mutation in mutations:
        data = copy.deepcopy(original)
        mutation(data)
        path = tmp_path / 'broken.json'
        path.write_text(json.dumps(data), encoding='utf-8')
        with pytest.raises(QuestionarioInvalido):
            carregar(path)


def test_snapshot_keeps_text_and_rules_after_file_edit(tmp_path):
    from app.questionario_v3 import carregar
    d = definition()
    r = validated(d, ['cyber'], {'q-impacto': ['q-impacto.escola']})
    snapshot = d.snapshot(r)
    data = copy.deepcopy(d.dados)
    data['grupos'][0]['opcoes'][1]['texto'] = 'Mudou'
    path = tmp_path / 'changed.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    carregar(path)
    assert snapshot['descricao']['marcadas'] == ['Ataques, boatos ou exposição na internet']
    assert snapshot['definicao']['grupos'][0]['opcoes'][1]['peso'] == 2


def post(client, envio='a' * 32, answers=None, files=None, **extra):
    data = {'envio_id': envio, 'relato': 'Um relato de teste completo.', **extra}
    if answers is not None:
        data['respostas'] = json.dumps(answers)
    if files:
        data['anexos[]'] = [(io.BytesIO(content), name) for content, name in files]
    return client.post('/api/v3/denuncias', data=data, content_type='multipart/form-data')


def test_idempotency_restart_attachments_conflict_and_anonymous(config, student_client):
    first = post(student_client, answers=payload(['cyber']), files=[(png(), 'x.png')], nome='Vazar', turma='X')
    assert first.status_code == 201
    again = post(create_student_app(config).test_client(), answers=payload(['cyber']), files=[(png(), 'x.png')], nome='Vazar', turma='X')
    assert again.status_code == 201
    assert again.json == first.json
    conflict = post(student_client, answers=payload(['cyber']), files=[(b'diferente', 'x.png')], nome='Vazar', turma='X')
    assert conflict.status_code == 409
    with connect(config) as c:
        row = c.execute('SELECT * FROM casos').fetchone()
        assert row['nome'] is None and row['turma'] is None
        assert c.execute('SELECT count(*) FROM casos').fetchone()[0] == 1
        assert c.execute('SELECT count(*) FROM anexos').fetchone()[0] == 1
        dump = '\n'.join(c.iterdump())
        assert first.json['codigo'] not in dump
        assert 'a' * 32 not in dump
    assert len(list(config.uploads_dir.iterdir())) == 1


def test_rejected_attachments_confirmation_and_fallback(student_client, config):
    first = post(student_client, files=[(b'invalido', '\x01ruim.exe')])
    assert first.status_code == 201
    assert first.json['anexos_recusados'][0]['nome'] == 'ruim.exe'
    again = post(student_client, files=[(b'invalido', '\x01ruim.exe')])
    assert again.json == first.json
    (config.data_dir / 'questionario_v3.json').write_text('{', encoding='utf-8')
    assert student_client.get('/api/v3/questionario').status_code == 503
    assert post(student_client, envio='b' * 32).status_code == 201
    assert post(student_client, envio='c' * 32, answers=payload(['cyber'])).status_code == 400


def test_concurrent_same_receipt_creates_one_case(config):
    app = create_student_app(config)
    def send(_):
        with app.test_client() as client:
            return post(client, files=[(png(), 'foto.png')])
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(send, range(4)))
    assert [r.status_code for r in results] == [201] * 4
    assert len({r.json['codigo'] for r in results}) == 1
    with connect(config) as c:
        assert c.execute('SELECT count(*) FROM casos').fetchone()[0] == 1
        assert c.execute('SELECT count(*) FROM envios').fetchone()[0] == 1
    assert len(list(config.uploads_dir.iterdir())) == 1


def test_single_definition_capture_during_send(student_client, config, monkeypatch):
    from app import routes_v3
    calls = []
    real = routes_v3.carregar
    def load(path):
        calls.append(path)
        d = real(path)
        (config.data_dir / 'questionario_v3.json').write_text('{', encoding='utf-8')
        return d
    monkeypatch.setattr(routes_v3, 'carregar', load)
    result = post(student_client, answers=payload(['cyber']))
    assert result.status_code == 201
    assert len(calls) == 1
    with connect(config) as c:
        assert c.execute('SELECT pontos FROM casos').fetchone()[0] == 2


def test_legacy_and_v3_filters_and_historical_detail(student_client, coord_logado, config):
    old = student_client.post('/api/denuncias', data={'tipo': 'cyberbullying', 'relato': 'Relato de um caso antigo.'})
    assert old.status_code == 201
    new = post(student_client, answers=payload(['cyber', 'ameaca']))
    assert new.status_code == 201
    fila = coord_logado.get('/api/casos?grupo=humilhacao').json['casos']
    assert len(fila) == 2
    assert fila[0]['categorias'] == ['humilhacao']
    assert len(coord_logado.get('/api/casos?opcao=ameaca').json['casos']) == 1
    assert coord_logado.get('/api/casos?grupo=xyz').status_code == 400
    with connect(config) as c:
        new_id = c.execute('SELECT max(id) FROM casos').fetchone()[0]
    detail = coord_logado.get(f'/api/casos/{new_id}').json
    assert detail['revisao_estado'] == 0
    assert detail['categorias'] == ['humilhacao', 'ameacas']
    assert detail['opcoes'] == ['cyber', 'ameaca']
    assert detail['questionario']['marcadas'] == ['Ataques, boatos ou exposição na internet', 'Ameaça de machucar alguém']


def test_migration_backups_before_any_schema_change(config):
    from app.db import SCHEMA
    config.data_dir.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(config.db_path)
    # Existing v2 database, including an old case and tracking hash.
    schema = SCHEMA.replace('    revisao_estado INTEGER NOT NULL DEFAULT 0,\n', '').replace('    triagem_snapshot_json TEXT,\n', '')
    schema = schema.split('CREATE TABLE IF NOT EXISTS envios')[0]
    c.executescript(schema)
    c.execute("INSERT INTO casos (codigo_hash,tipo,relato,prioridade,criado_em,atualizado_em) VALUES ('antigo','outro','Relato antigo','media','ontem','ontem')")
    c.commit()
    c.close()
    init_db(config)
    backup = Path(str(config.db_path) + '.pre-v3.bak')
    assert backup.is_file()
    with sqlite3.connect(backup) as original:
        assert 'revisao_estado' not in {r[1] for r in original.execute('PRAGMA table_info(casos)')}
        assert original.execute('SELECT codigo_hash FROM casos').fetchone()[0] == 'antigo'
    before = backup.read_bytes()
    init_db(config)
    assert backup.read_bytes() == before


def test_collision_retries_counter_and_recovers_after_restart(config, student_client, monkeypatch):
    from app import envios
    real = envios.derivar_codigo
    first = post(student_client, envio='a' * 32)
    collision = first.json['codigo']
    def derive(receipt, counter, secret):
        return collision if receipt == 'b' * 32 and counter == 0 else real(receipt, counter, secret)
    monkeypatch.setattr(envios, 'derivar_codigo', derive)
    second = post(student_client, envio='b' * 32)
    assert second.status_code == 201
    assert second.json['codigo'] != collision
    with connect(config) as c:
        assert c.execute('SELECT contador FROM envios WHERE caso_id=2').fetchone()[0] == 1
    assert post(create_student_app(config).test_client(), envio='b' * 32).json == second.json


def test_derivation_rejects_biased_bytes(monkeypatch):
    from app import envios
    calls = []
    class Digest:
        def digest(self):
            return bytes([255] * 24 + [0, 1, 2, 3, 4, 5, 6, 7])
    def digest(key, message, algorithm):
        calls.append(message)
        return Digest()
    monkeypatch.setattr(envios.hmac, 'new', digest)
    assert envios.derivar_codigo('a' * 32, 0, 'key') == 'ABCD-EFGH'
    assert len(calls) == 1


def test_database_failure_rolls_back_receipt_case_and_files(config, student_client):
    with connect(config) as c:
        c.execute("CREATE TRIGGER abort_envio BEFORE INSERT ON envios BEGIN SELECT RAISE(ABORT, 'teste'); END")
        c.commit()
    result = post(student_client, files=[(png(), 'x.png')])
    assert result.status_code == 500
    with connect(config) as c:
        for table in ('casos', 'envios', 'anexos', 'eventos'):
            assert c.execute(f'SELECT count(*) FROM {table}').fetchone()[0] == 0
    assert not list(config.uploads_dir.iterdir())


@pytest.mark.parametrize('changes', [
    {'envio_id': 'curto'}, {'relato': 'x' * 5001}, {'nome': 'x' * 201},
    {'turma': 'x' * 51}, {'onde': 'x' * 201}, {'respostas': 'x' * 16385},
])
def test_field_limits(student_client, changes):
    response = student_client.post('/api/v3/denuncias', data={
        'envio_id': 'a' * 32, 'relato': 'Relato completo de teste.', **changes},
        content_type='multipart/form-data')
    assert response.status_code == 400


def test_request_and_file_limits(student_client, config):
    from app.uploads import MAX_BYTES
    big = png() + b'x' * MAX_BYTES
    result = post(student_client, files=[(big, 'grande.png')])
    assert result.status_code == 201
    assert result.json['anexos_recusados'][0]['motivo'] == 'arquivo maior que 5 MB'
    assert post(student_client, envio='b' * 32, files=[(png(), 'x.png')] * 6).status_code == 400
    result = student_client.post('/api/v3/denuncias', data=b'x' * (30 * 1024 * 1024 + 1), content_type='multipart/form-data; boundary=x')
    assert result.status_code == 413


def test_transitive_visibility_cannot_be_kept_alive_by_stale_answers(tmp_path):
    from app.questionario_v3 import carregar
    data = copy.deepcopy(definition().dados)
    adult = next(p for p in data['perguntas'] if p['id'] == 'q-adulto')
    adult['mostrar_se'] = ['q-contato-atual.sim']
    path = tmp_path / 'chain.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    d = carregar(path)
    answers = {'q-exigencia': ['q-exigencia.intimidade'], 'q-contato-atual': ['q-contato-atual.sim'], 'q-adulto': ['q-adulto.sim']}
    assert 'q-adulto' in d.visiveis(['chantagem'], answers)
    answers['q-exigencia'] = ['q-exigencia.silencio']
    assert d.visiveis(['chantagem'], answers) == ['q-seguranca', 'q-quem', 'q-quando', 'q-frequencia', 'q-exigencia', 'q-chantagem-pressao']


def test_consequences_dimension_is_maximum_and_base_tie_is_canonical():
    d = definition()
    r = validated(d, ['golpe', 'cyber', 'ameaca'], {
        'q-impacto': ['q-impacto.escola'], 'q-perda': ['q-perda.dinheiro']})
    assert d.classificar(r, '', False, {}).pontos == 6  # 4 + max(2,2)
    assert d.tipo_legado(validated(d, ['contato', 'ataque'])) == 'aliciamento'


def test_definition_validation_bounds_unique_and_boolean_weights(tmp_path):
    from app.questionario_v3 import QuestionarioInvalido, carregar
    original = definition().dados
    mutations = [
        lambda d: d['perguntas'][0]['respostas'][0].update(peso=True),
        lambda d: d['perguntas'][0]['respostas'][0].update(peso=4),
        lambda d: d['perguntas'][0]['respostas'][0].pop('peso'),
        lambda d: d['perguntas'][0].update(id='cyber'),
        lambda d: d['grupos'][0]['opcoes'][0].update(peso=6),
        lambda d: d['faixas'].update(media=9, alta=5),
        lambda d: d['grupos'][0]['opcoes'][0].update(perguntas=['ausente']),
    ]
    for mutate in mutations:
        data = copy.deepcopy(original)
        mutate(data)
        path = tmp_path / 'bad.json'
        path.write_text(json.dumps(data), encoding='utf-8')
        with pytest.raises(QuestionarioInvalido):
            carregar(path)


def test_snapshot_detail_survives_rule_change(student_client, coord_logado, config):
    response = post(student_client, answers=payload(['cyber'], {'q-impacto': ['q-impacto.escola']}))
    assert response.status_code == 201
    data = copy.deepcopy(definition().dados)
    data['grupos'][0]['opcoes'][1].update(texto='Novo rótulo', peso=5)
    (config.data_dir / 'questionario_v3.json').write_text(json.dumps(data), encoding='utf-8')
    detail = coord_logado.get('/api/casos/1').json
    assert detail['pontos'] == 4
    assert detail['prioridade_original'] == 'baixa'
    assert detail['questionario']['marcadas'] == ['Ataques, boatos ou exposição na internet']
    assert detail['questionario']['dimensoes'][0]['itens'][0]['respostas'] == ['Ela tem evitado a escola']
    # Mesmo recibo recupera a confirmação sem validar contra regras editadas.
    assert post(student_client, answers=payload(['cyber'], {'q-impacto': ['q-impacto.escola']})).json == response.json


def test_backup_failure_aborts_schema_change(config, monkeypatch):
    from app import db
    c = sqlite3.connect(config.db_path)
    c.execute('CREATE TABLE casos (id INTEGER PRIMARY KEY)')
    c.commit()
    c.close()
    def fail(*args):
        raise OSError('sem espaço')
    monkeypatch.setattr(db.os, 'replace', fail)
    with pytest.raises(OSError):
        init_db(config)
    with sqlite3.connect(config.db_path) as c:
        assert {r[1] for r in c.execute('PRAGMA table_info(casos)')} == {'id'}


def test_public_definition_is_an_allowlist_even_with_local_metadata(tmp_path):
    from app.questionario_v3 import carregar
    data = copy.deepcopy(definition().dados)
    data['anotacao_privada'] = {'peso': 9, 'segredo': 'nao publicar'}
    data['grupos'][0]['opcoes'][0]['anotacao_privada'] = 'regra interna'
    data['perguntas'][0]['respostas'][0]['anotacao_privada'] = 'regra interna'
    path = tmp_path / 'custom.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    public = carregar(path).para_aluno()
    assert set(public) == {'versao', 'grupos', 'comuns', 'perguntas', 'dimensoes'}
    assert 'anotacao_privada' not in json.dumps(public)


def test_public_endpoint_and_tracking_do_not_expose_triage(student_client):
    public = student_client.get('/api/v3/questionario')
    assert public.status_code == 200
    assert public.headers['Cache-Control'] == 'no-store'
    result = post(student_client, answers=payload(['contato'], {'q-contato-atual': ['q-contato-atual.sim']}))
    assert result.status_code == 201
    tracking = student_client.post('/api/acompanhar', json={'codigo': result.json['codigo']})
    assert tracking.status_code == 200
    assert not {'prioridade', 'pontos', 'motivos', 'questionario', 'triagem_snapshot_json'} & set(tracking.json)


def test_receipt_ignores_order_of_selections_and_answers(student_client):
    first = payload(['cyber', 'ameaca'], {'q-quando': ['q-quando.sim'], 'q-quem': ['q-quem.comigo']})
    second = payload(['ameaca', 'cyber'], {'q-quem': ['q-quem.comigo'], 'q-quando': ['q-quando.sim']})
    one = post(student_client, answers=first)
    two = post(student_client, answers=second)
    assert one.status_code == two.status_code == 201
    assert one.json == two.json


def test_questionnaire_v3_invalid_stops_server_but_allows_recovery(tmp_path, monkeypatch, capsys):
    from app import server
    (tmp_path / 'questionario_v3.json').write_text('{', encoding='utf-8')
    monkeypatch.setattr(server, 'servir', lambda *a, **kw: pytest.fail('nao deve servir'))
    assert server.main(['--data-dir', str(tmp_path)]) == 4
    assert 'Traceback' not in capsys.readouterr().err
    assert server.main(['--data-dir', str(tmp_path), '--redefinir-senha']) == 5


def test_v3_migration_rolls_back_both_columns_when_second_alter_fails(tmp_path):
    from app.db import _migrar_v3
    class BrokenSecondAlter(sqlite3.Connection):
        def execute(self, sql, *args):
            if sql.startswith('ALTER TABLE casos ADD COLUMN triagem_snapshot_json'):
                raise sqlite3.OperationalError('falha de armazenamento')
            return super().execute(sql, *args)
    c = sqlite3.connect(tmp_path / 'partial.db', factory=BrokenSecondAlter)
    try:
        c.execute('CREATE TABLE casos (id INTEGER PRIMARY KEY)')
        with pytest.raises(sqlite3.OperationalError):
            _migrar_v3(c)
        assert {r[1] for r in c.execute('PRAGMA table_info(casos)')} == {'id'}
    finally:
        c.close()


def test_weapon_option_and_today_are_critical_without_reasking_weapon():
    d = definition()
    recent = validated(d, ['arma'], {'q-risco-local': ['q-risco-local.hoje']})
    assert d.classificar(recent, '', False, {}).prioridade == 'critica'
    past = validated(d, ['arma'], {'q-risco-local': ['q-risco-local.outro']})
    assert d.classificar(past, '', False, {}).prioridade == 'media'


def test_dimension_labels_are_validated_as_public_text(tmp_path):
    from app.questionario_v3 import QuestionarioInvalido, carregar
    for label in ({'peso': 9, 'segredo': 'interno'}, [], '', 'x' * 501):
        data = copy.deepcopy(definition().dados)
        data['dimensoes']['risco'] = label
        path = tmp_path / 'bad-label.json'
        path.write_text(json.dumps(data), encoding='utf-8')
        with pytest.raises(QuestionarioInvalido):
            carregar(path)
