from datetime import date

import pytest

from app import casos
from app.auth import criar_usuario
from app.db import connect, init_db
from test_coord_api import _caso


def test_salva_atendimento_com_historico_e_conflito(config, coord_logado):
    cid, _ = _caso(config)
    with connect(config) as conn:
        uid = conn.execute('SELECT id FROM usuarios').fetchone()[0]
    payload = dict(responsavel_id=uid, proxima_acao='Conversar com aluno', prazo_acao='2026-10-20', revisao_estado=0)
    r = coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json=payload)
    assert r.status_code == 200
    d = coord_logado.get(f'/api/casos/{cid}').json
    assert d['responsavel']['nome'] == 'coord'
    assert d['proxima_acao'] == 'Conversar com aluno'
    assert d['prazo_acao'] == '2026-10-20'
    assert d['eventos'][-1]['tipo'] == 'atendimento'
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json=payload).status_code == 409


@pytest.mark.parametrize('extra', [
    {'responsavel_id': True}, {'responsavel_id': 999}, {'responsavel_id': []},
    {'proxima_acao': 'x', 'prazo_acao': None},
    {'proxima_acao': '', 'prazo_acao': '2026-10-20'},
    {'proxima_acao': 'x', 'prazo_acao': '2026-02-30'},
    {'proxima_acao': 'x' * 501, 'prazo_acao': '2026-10-20'},
])
def test_valida_atendimento(config, coord_logado, extra):
    cid, _ = _caso(config)
    payload = dict(responsavel_id=None, proxima_acao='', prazo_acao=None, revisao_estado=0)
    payload.update(extra)
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json=payload).status_code == 400


def test_atencao_resolvidos_mensagens_e_acesso(config, coord_logado):
    cid, _ = _caso(config)
    row = coord_logado.get('/api/casos').json['casos'][0]
    assert row['nao_aberto'] is True
    assert set(row['atencao']) == {'sem_responsavel', 'sem_resposta'}
    coord_logado.get(f'/api/casos/{cid}')
    assert coord_logado.get('/api/casos').json['casos'][0]['nao_aberto'] is False
    with connect(config) as conn:
        conn.execute("UPDATE casos SET status='resolvido' WHERE id=?", (cid,))
        conn.commit()
    assert coord_logado.get('/api/casos').json['casos'][0]['atencao'] == []
    with connect(config) as conn:
        casos.adicionar_mensagem(conn, cid, 'aluno', 'Voltou a acontecer')
    assert coord_logado.get('/api/casos').json['casos'][0]['atencao'] == ['mensagem_pendente']
    coord_logado.post(f'/api/casos/{cid}/mensagens', json={'texto': 'Vamos conversar'})
    assert coord_logado.get('/api/casos').json['casos'][0]['atencao'] == []


def test_prazo_e_conclusao(config, coord_logado):
    from app.atendimento import projetar_atendimento
    cid, _ = _caso(config, status='resolvido')
    payload = dict(responsavel_id=None, proxima_acao='Checar retorno', prazo_acao='2026-10-17', revisao_estado=0)
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json=payload).status_code == 200
    with connect(config) as conn:
        assert projetar_atendimento(conn, cid, date(2026, 10, 17))['atencao'] == []
        assert projetar_atendimento(conn, cid, date(2026, 10, 18))['atencao'] == ['acao_vencida']
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento/concluir', json={'revisao_estado': 1}).status_code == 200
    detail = coord_logado.get(f'/api/casos/{cid}').json
    assert detail['proxima_acao'] is None
    assert detail['eventos'][-1]['tipo'] == 'acao_concluida'


def test_equipe_e_responsavel_desativado(config, coord_logado):
    cid, _ = _caso(config)
    with connect(config) as conn:
        uid = criar_usuario(conn, 'Ana', 'senha-forte-123')
    payload = dict(responsavel_id=uid, proxima_acao='', prazo_acao=None, revisao_estado=0)
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json=payload).status_code == 200
    with connect(config) as conn:
        conn.execute('UPDATE usuarios SET ativo=0 WHERE id=?', (uid,))
        conn.commit()
    assert 'Ana' not in [u['nome'] for u in coord_logado.get('/api/equipe').json['usuarios']]
    row = coord_logado.get('/api/casos').json['casos'][0]
    assert row['responsavel'] == {'id': uid, 'nome': 'Ana', 'ativo': False}
    assert 'sem_responsavel' in row['atencao']
    payload['revisao_estado'] = 1
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json=payload).status_code == 400


def test_migracao_idempotente_e_privacidade(config, coord_logado, student_client):
    cid, codigo = _caso(config)
    init_db(config)
    init_db(config)
    payload = dict(responsavel_id=None, proxima_acao='Informação interna', prazo_acao='2026-10-20', revisao_estado=0)
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json=payload).status_code == 200
    r = student_client.post('/api/acompanhar', json={'codigo': codigo})
    assert r.status_code == 200
    assert 'Informação interna' not in r.get_data(as_text=True)
    assert 'responsavel' not in r.json


def test_mapa_permite_crescer_alem_da_area_inicial():
    from app.mapa import validar
    ambiente = dict(id='ala', nome='Ala distante', tipo='ala', pai_id=None,
                    x=1400, y=1000, largura=300, altura=200)
    assert validar({'revisao': 0, 'ambientes': [ambiente]})[0]['x'] == 1400
    ambiente['x'] = 12000
    with pytest.raises(ValueError):
        validar({'revisao': 0, 'ambientes': [ambiente]})


def test_migracao_parcial_atendimento_cria_backup_antes_de_completar(config):
    init_db(config)
    with connect(config) as conn:
        conn.execute('ALTER TABLE casos DROP COLUMN prazo_acao')
        conn.commit()
    init_db(config)
    backup = config.db_path.with_name(config.db_path.name + '.pre-atendimento.bak')
    assert backup.is_file()
    original = backup.read_bytes()
    init_db(config)
    assert backup.read_bytes() == original


def test_atendimento_protegido_e_revisao_obrigatoria(config, coord_client, student_client):
    assert coord_client.get('/api/equipe').status_code == 401
    assert coord_client.post('/api/v3/casos/1/atendimento', json={}).status_code == 401
    assert coord_client.post('/api/v3/casos/1/atendimento/concluir', json={}).status_code == 401
    assert student_client.get('/api/equipe').status_code == 404


def test_revisao_obrigatoria_e_json(config, coord_logado):
    cid, _ = _caso(config)
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', json={}).status_code == 400
    assert coord_logado.post(f'/api/v3/casos/{cid}/atendimento', data='{}').status_code == 415
