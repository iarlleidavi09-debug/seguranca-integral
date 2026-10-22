import pytest

from app.db import connect, init_db


def acolher(client, texto='Quero conversar com alguém da escola.', recibo='a' * 32):
    return client.post('/api/acolhimento', json={'envio_id': recibo, 'texto': texto})


def test_acolhimento_anonimo_com_primeira_mensagem_e_retry(student_client, coord_logado, config):
    resposta = acolher(student_client)
    assert resposta.status_code == 201
    assert acolher(student_client).json == resposta.json
    assert acolher(student_client, 'Outra mensagem').status_code == 409
    with connect(config) as conn:
        caso = dict(conn.execute('SELECT * FROM casos').fetchone())
        assert caso['canal'] == 'acolhimento'
        assert caso['anonimo'] == 1
        assert all(caso[campo] is None for campo in ('nome', 'turma', 'ano_relator', 'sala_relator', 'respostas_json'))
        assert conn.execute('SELECT count(*) FROM casos').fetchone()[0] == 1
        assert conn.execute('SELECT count(*) FROM mensagens').fetchone()[0] == 1
    consulta = student_client.post('/api/acompanhar', json={'codigo': resposta.json['codigo']})
    assert consulta.status_code == 200
    assert consulta.json['mensagens'][0]['texto'] == 'Quero conversar com alguém da escola.'


@pytest.mark.parametrize('dados', [None, [], {}, {'envio_id': 'a' * 32, 'texto': ''},
    {'envio_id': 'a' * 32, 'texto': ' '}, {'envio_id': 'a' * 32, 'texto': 'x' * 2001},
    {'envio_id': 'errado', 'texto': 'Olá'}, {'envio_id': 'a' * 32, 'texto': 5},
    {'envio_id': 'a' * 32, 'texto': 'Olá', 'nome': 'Pessoa'}])
def test_acolhimento_rejeita_dados_invalidos_sem_criar_caso(student_client, config, dados):
    assert student_client.post('/api/acolhimento', json=dados).status_code in (400, 415)
    with connect(config) as conn:
        assert conn.execute('SELECT count(*) FROM casos').fetchone()[0] == 0


def test_exportacao_autorizada_escapa_relato_sem_codigo_ou_notas(student_client, coord_logado, coord_client, config):
    codigo = acolher(student_client, '<script>alert(1)</script> Preciso de ajuda.').json['codigo']
    with connect(config) as conn:
        conn.execute("INSERT INTO notas_internas(caso_id,texto,criado_em) VALUES(1,'SEGREDO INTERNO','2026-10-20')")
        conn.execute("INSERT INTO resolucoes(caso_id,desfecho,providencias,criado_em) "
                     "VALUES(1,'intervencao_realizada','Conversa com a equipe','2026-10-20')")
    # Cliente independente, sem a sessão do fixture coord_logado.
    with coord_client.application.test_client() as visitante:
        assert visitante.get('/api/casos/1/exportacao').status_code == 401
        assert visitante.get('/api/exportacao.css').status_code == 401
    resposta = coord_logado.get('/api/casos/1/exportacao')
    assert resposta.status_code == 200
    html = resposta.get_data(as_text=True)
    assert '&lt;script&gt;' in html and '<script>' not in html
    assert codigo not in html and 'SEGREDO INTERNO' not in html and 'codigo_hash' not in html
    assert 'Não informado' in html and 'preenchimento do ROE' in html
    assert 'Intervenção realizada' in html and 'intervencao_realizada' not in html
    assert coord_logado.get('/api/casos/999/exportacao').status_code == 404
    assert coord_logado.get('/api/exportacao.css').status_code == 200
    init_db(config)
    with connect(config) as conn:
        assert conn.execute('SELECT canal FROM casos').fetchone()[0] == 'acolhimento'
