"""Padrões observados: cálculo puro, estado, migração e rotas."""
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app import padroes
from app.db import connect, init_db

HOJE = datetime(2026, 11, 20, 15, 0, tzinfo=timezone.utc)  # sexta, 12h em Brasília


def caso(id, local='patio', tipo='ameaca', dias=1, hora=13, simulacao=0):
    """Caso `dias` dias antes de HOJE, às `hora` UTC (Brasília = UTC-3)."""
    quando = (HOJE - timedelta(days=dias)).replace(hour=hora, minute=0)
    return {'id': id, 'local_id': local, 'tipo': tipo, 'criado_em': quando.isoformat(), 'simulacao': simulacao}


NOMES = {'patio': 'pátio', 'quadra': 'quadra'}


def calcular(casos, **kw):
    return padroes.detectar_padroes(casos, HOJE, nomes_locais=NOMES, **kw)


def test_tres_casos_mesmo_local_e_tipo_formam_padrao():
    res = calcular([caso(1), caso(2, dias=3), caso(3, dias=5)])
    assert len(res) == 1
    p = res[0]
    assert p['regra'] == 'local_tipo' and p['contagem'] == 3
    assert p['casos'] == [1, 2, 3] and p['local_id'] == 'patio'
    assert 'pátio' in p['texto'] and p['texto'].startswith('3 relatos')


def test_dois_casos_nao_formam_padrao():
    assert calcular([caso(1), caso(2)]) == []


def test_tipos_diferentes_no_mesmo_horario_formam_padrao_local_faixa():
    res = calcular([caso(1, tipo='a'), caso(2, tipo='b', dias=2), caso(3, tipo='c', dias=4)])
    assert [p['regra'] for p in res] == ['local_faixa']
    assert 'manhã' in res[0]['texto']


def test_fronteira_da_janela_de_21_dias():
    dentro = [caso(1, dias=21), caso(2, dias=2), caso(3, dias=3)]
    assert len(calcular(dentro)) == 1
    fora = [caso(1, dias=22), caso(2, dias=2), caso(3, dias=3)]
    assert calcular(fora) == []


def test_limiares_configuraveis():
    tres = [caso(1), caso(2, dias=3), caso(3, dias=4)]
    assert calcular(tres, minimo=2)[0]['contagem'] == 3   # nunca abaixo de 3
    assert calcular(tres, minimo=4) == []
    assert calcular([caso(1), caso(2, dias=10), caso(3, dias=15)], janela_dias=7) == []


def test_ignora_simulacao_sem_local_e_ids_repetidos():
    casos = [caso(1), caso(2, dias=2), caso(3, simulacao=1), caso(4, local=None), caso(1)]
    assert calcular(casos) == []


def test_futuro_nao_conta():
    assert calcular([caso(1), caso(2), caso(3, dias=-2)]) == []


def test_faixa_usa_horario_de_brasilia():
    # 02:30 UTC = 23:30 do dia anterior em Brasília (noite)
    res = calcular([caso(1, hora=2), caso(2, hora=2, dias=2), caso(3, hora=2, dias=3)], minimo=3)
    assert any('noite' in p['texto'] for p in res)


def test_texto_cita_dia_da_semana_quando_comum():
    # quarta, quinta e sexta: sem dia comum
    r1 = calcular([caso(1, dias=7), caso(2, dias=14), caso(3, dias=0)])
    assert 'sexta' in r1[0]['texto']
    r2 = calcular([caso(1, dias=1), caso(2, dias=2), caso(3, dias=3)])
    assert 'sexta' not in r2[0]['texto'] and 'quinta' not in r2[0]['texto']


def test_saida_nao_tem_campos_de_relato_nem_aluno():
    res = calcular([caso(1), caso(2, dias=2), caso(3, dias=3)])
    proibidos = {'relato', 'nome', 'turma', 'ano_relator', 'sala_relator', 'codigo_hash'}
    assert not proibidos & set(res[0])


def test_chave_estavel_e_ordem_por_contagem():
    casos = [caso(i, dias=i) for i in range(1, 5)] + [caso(10 + i, local='quadra', dias=i) for i in range(1, 4)]
    res = calcular(casos)
    assert res[0]['contagem'] >= res[-1]['contagem']
    assert res == calcular(list(reversed(casos)))
    assert res[0]['chave'].startswith('local_tipo:')


def test_nunca_agrupa_por_turma():
    casos = [{**caso(i, dias=i), 'ano_relator': '9', 'sala_relator': 'A'} for i in (1, 2, 3)]
    assert not any('turma' in p['texto'] or '9' in p['texto'] for p in calcular(casos))


def test_estados_descartado_reaparece_com_dois_casos_a_mais():
    base = calcular([caso(1), caso(2, dias=2), caso(3, dias=3)])
    estados = {base[0]['chave']: ('descartado', 3)}
    assert padroes.aplicar_estados(base, estados) == []
    mais = calcular([caso(i, dias=i) for i in range(1, 6)])
    assert mais[0]['contagem'] == 5
    visivel = padroes.aplicar_estados(mais, estados)
    assert visivel[0]['estado'] == 'novo'
    um_a_mais = calcular([caso(i, dias=i) for i in range(1, 5)])
    assert padroes.aplicar_estados(um_a_mais, estados) == []


def test_estado_acompanhando_aparece_marcado():
    base = calcular([caso(1), caso(2, dias=2), caso(3, dias=3)])
    vis = padroes.aplicar_estados(base, {base[0]['chave']: ('acompanhando', 3)})
    assert vis[0]['estado'] == 'acompanhando'


# ---------- banco e rotas ----------

def inserir(c, id, local='patio', tipo='ameaca', dias=1, simulacao=0, relato='texto secreto do relato'):
    criado = (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()
    c.execute(
        "INSERT INTO casos (id,codigo_hash,tipo,relato,prioridade,criado_em,atualizado_em,local_id,simulacao,nome,turma) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (id, f'h{id}', tipo, relato, 'media', criado, criado, local, simulacao, 'Fulano Secreto', '9A'))


@pytest.fixture
def com_padrao(config, coord_logado):
    with connect(config) as c:
        c.execute("INSERT INTO ambientes (id,nome,tipo,pai_id,x,y,largura,altura,geometria_json) "
                  "VALUES ('patio','Pátio','area',NULL,0,0,100,80,'{}')")
        for i in (1, 2, 3):
            inserir(c, i, dias=i)
        c.commit()
    return coord_logado


def test_rota_lista_padrao_sem_vazar_relato(com_padrao):
    r = com_padrao.get('/api/coord/padroes')
    assert r.status_code == 200
    corpo = r.get_data(as_text=True)
    assert 'texto secreto' not in corpo and 'Fulano' not in corpo and '9A' not in corpo
    p = r.json['padroes'][0]
    assert p['contagem'] == 3 and p['casos'] == [1, 2, 3] and 'Pátio' in p['texto']
    assert r.headers['Cache-Control'] == 'no-store'


def test_rota_exige_sessao(coord_client):
    assert coord_client.get('/api/coord/padroes').status_code == 401
    assert coord_client.post('/api/coord/padroes/x/estado', json={'estado': 'descartado'}).status_code == 401


def test_coordenador_comum_tambem_acessa(config, com_padrao, coord_app):
    from app.auth import criar_usuario
    with connect(config) as c:
        criar_usuario(c, 'colega', 'senha-forte-123', 'coordenador')
    outro = coord_app.test_client()
    assert outro.post('/api/login', json={'nome': 'colega', 'senha': 'senha-forte-123'}).status_code == 200
    assert outro.get('/api/coord/padroes').status_code == 200


def test_marcar_descartado_esconde_e_acompanhando_marca(com_padrao):
    chave = com_padrao.get('/api/coord/padroes').json['padroes'][0]['chave']
    r = com_padrao.post(f'/api/coord/padroes/{chave}/estado', json={'estado': 'acompanhando'})
    assert r.status_code == 200
    assert com_padrao.get('/api/coord/padroes').json['padroes'][0]['estado'] == 'acompanhando'
    assert com_padrao.post(f'/api/coord/padroes/{chave}/estado', json={'estado': 'descartado'}).status_code == 200
    assert com_padrao.get('/api/coord/padroes').json['padroes'] == []
    assert com_padrao.post(f'/api/coord/padroes/{chave}/estado', json={'estado': 'novo'}).status_code == 200
    assert com_padrao.get('/api/coord/padroes').json['padroes'][0]['estado'] == 'novo'


def test_estado_invalido_chave_desconhecida_e_content_type(com_padrao):
    chave = com_padrao.get('/api/coord/padroes').json['padroes'][0]['chave']
    assert com_padrao.post(f'/api/coord/padroes/{chave}/estado', json={'estado': 'x'}).status_code == 400
    assert com_padrao.post(f'/api/coord/padroes/{chave}/estado', json={}).status_code == 400
    assert com_padrao.post('/api/coord/padroes/local_tipo:nada:nada/estado', json={'estado': 'descartado'}).status_code == 404
    assert com_padrao.post(f'/api/coord/padroes/{chave}/estado', data='estado=x').status_code == 415


def test_descartado_reaparece_com_mais_dois_casos(config, com_padrao):
    chave = com_padrao.get('/api/coord/padroes').json['padroes'][0]['chave']
    com_padrao.post(f'/api/coord/padroes/{chave}/estado', json={'estado': 'descartado'})
    with connect(config) as c:
        inserir(c, 4, dias=4); c.commit()
    assert com_padrao.get('/api/coord/padroes').json['padroes'] == []
    with connect(config) as c:
        inserir(c, 5, dias=5); c.commit()
    assert com_padrao.get('/api/coord/padroes').json['padroes'][0]['contagem'] == 5


def test_limite_de_taxa_devolve_429(com_padrao, coord_app):
    coord_app.extensions['limitadores']['padroes'] = __import__('app.ratelimit', fromlist=['x']).Limitador(2, 60)
    codigos = [com_padrao.get('/api/coord/padroes').status_code for _ in range(3)]
    assert codigos == [200, 200, 429]


def test_migracao_faz_backup_ensaiado_em_copia_e_e_idempotente(config):
    init_db(config)
    with connect(config) as c:
        inserir(c, 1); c.execute('DROP TABLE padroes_estado'); c.commit()
    bak = config.db_path.parent / (config.db_path.name + '.pre-padroes.bak')
    assert not bak.exists()
    init_db(config)
    assert bak.exists()
    from contextlib import closing
    with closing(sqlite3.connect(bak)) as velho:
        assert velho.execute('SELECT count(*) FROM casos').fetchone()[0] == 1
        assert velho.execute("SELECT 1 FROM sqlite_master WHERE name='padroes_estado'").fetchone() is None
    with connect(config) as c:
        assert c.execute("SELECT 1 FROM sqlite_master WHERE name='padroes_estado'").fetchone()
        assert c.execute('SELECT count(*) FROM casos').fetchone()[0] == 1
    init_db(config)
