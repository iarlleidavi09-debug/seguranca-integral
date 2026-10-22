from datetime import date

from app.relatorios import gerar_relatorio


def inserir(conn, codigo, data, simulacao=0):
    return conn.execute(
        "INSERT INTO casos(codigo_hash,tipo,relato,prioridade,criado_em,atualizado_em,simulacao) VALUES (?,?,?,?,?,?,?)",
        (codigo, 'outro', 'relato privado', 'alta', data, data, simulacao),
    ).lastrowid


def test_evolucao_completa_dias_e_exclui_simulacoes(conn):
    caso = inserir(conn, 'real', '2026-10-01T12:00:00+00:00')
    inserir(conn, 'simulado', '2026-10-01T12:00:00+00:00', 1)
    inserir(conn, 'fora', '2026-09-30T12:00:00+00:00')
    conn.execute("INSERT INTO resolucoes(caso_id,desfecho,providencias,criado_em) VALUES (?,?,?,?)",
                 (caso, 'solucionada', 'privado', '2026-10-03T12:00:00+00:00'))
    conn.commit()
    dados = gerar_relatorio(conn, date(2026, 10, 1), date(2026, 10, 3))
    assert dados['evolucao'] == [
        {'data': '2026-10-01', 'recebidos': 1, 'resolvidos': 0},
        {'data': '2026-10-02', 'recebidos': 0, 'resolvidos': 0},
        {'data': '2026-10-03', 'recebidos': 0, 'resolvidos': 1},
    ]
    assert dados['recebidos'] == 1 and dados['resolvidos'] == 1
    assert dados['evolucao_prioridades'] == [
        {'data': '2026-10-01', 'critica': 0, 'alta': 1, 'media': 0, 'baixa': 0},
        {'data': '2026-10-02', 'critica': 0, 'alta': 0, 'media': 0, 'baixa': 0},
        {'data': '2026-10-03', 'critica': 0, 'alta': 0, 'media': 0, 'baixa': 0},
    ]
    assert 'privado' not in str(dados)


def test_relatorio_exige_sessao(coord_client):
    assert coord_client.get('/api/relatorios').status_code == 401


def test_dias_em_brasilia_e_primeira_resolucao_sem_duplicar(conn):
    caso = inserir(conn, 'madrugada', '2026-10-02T01:00:00+00:00')
    for dia in (2, 3):
        conn.execute("INSERT INTO resolucoes(caso_id,desfecho,providencias,criado_em) VALUES (?,?,?,?)",
                     (caso, 'solucionada', 'privado', f'2026-10-0{dia}T02:00:00+00:00'))
    dados = gerar_relatorio(conn, date(2026, 10, 1), date(2026, 10, 3))
    assert dados['evolucao'][0] == {'data': '2026-10-01', 'recebidos': 1, 'resolvidos': 1}
    assert dados['resolvidos'] == 1


def test_relatorio_valida_periodo_e_exporta(coord_logado):
    for query in ['inicio=erro', 'inicio=2026-10-04&fim=2026-10-01',
                  'inicio=2020-01-01&fim=2026-10-01', 'formato=exe']:
        assert coord_logado.get('/api/relatorios?' + query).status_code == 400
    resposta = coord_logado.get('/api/relatorios?inicio=2026-10-01&fim=2026-10-03&formato=csv')
    assert resposta.status_code == 200
    assert 'attachment' in resposta.headers['Content-Disposition']
    assert 'no-store' in resposta.headers['Cache-Control']
    texto = resposta.data.decode('utf-8-sig')
    assert 'Data;Recebidos;Resolvidos' in texto
    assert '2026-10-02;0;0' in texto
