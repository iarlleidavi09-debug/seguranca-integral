import sqlite3

from app import auth, casos
from app.config import Config
from app.db import connect, init_db


def novo_caso(conn, config):
    casos.criar_caso(conn, config, {'tipo': 'outro', 'relato': 'Preciso conversar'}, [])
    return conn.execute('SELECT max(id) FROM casos').fetchone()[0]


def nova_mensagem(conn, caso_id, autor='coordenacao', texto='Olá', usuario_id=None):
    casos.adicionar_mensagem(conn, caso_id, autor, texto, usuario_id=usuario_id)
    return conn.execute('SELECT max(id) FROM mensagens').fetchone()[0]


def cenario(conn, config, **kw):
    """Caso com uma mensagem da coordenação escrita pela coordenadora `ana`."""
    ana = auth.criar_usuario(conn, 'ana', 'senha-forte-123')
    caso_id = novo_caso(conn, config)
    msg_id = nova_mensagem(conn, caso_id, usuario_id=ana, **kw)
    return caso_id, msg_id, ana


def linha(conn, msg_id):
    return conn.execute('SELECT * FROM mensagens WHERE id=?', (msg_id,)).fetchone()


def versoes(conn, msg_id):
    return conn.execute(
        'SELECT * FROM mensagens_versoes WHERE mensagem_id=? ORDER BY id', (msg_id,)
    ).fetchall()


def eventos(conn, caso_id, tipo):
    return conn.execute(
        'SELECT * FROM eventos WHERE caso_id=? AND tipo=?', (caso_id, tipo)
    ).fetchall()


def test_migracao_adiciona_colunas_em_banco_antigo(tmp_path):
    """Banco anterior à edição ganha as colunas e a tabela sem perder mensagens."""
    config = Config(data_dir=tmp_path, secret_key='chave-de-teste')
    init_db(config)
    c = connect(config)
    casos.criar_caso(c, config, {'tipo': 'outro', 'relato': 'Relato'}, [])
    caso_id = c.execute('SELECT max(id) FROM casos').fetchone()[0]
    casos.adicionar_mensagem(c, caso_id, 'aluno', 'Mensagem antiga')
    c.close()
    # reconstrói `mensagens` no esquema antigo e remove a tabela de versões
    raw = sqlite3.connect(config.db_path)
    raw.execute('PRAGMA foreign_keys = OFF')
    raw.executescript(
        'DROP TABLE IF EXISTS mensagens_versoes;'
        'ALTER TABLE mensagens RENAME TO mensagens_nova;'
        'CREATE TABLE mensagens (id INTEGER PRIMARY KEY AUTOINCREMENT, '
        'caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE, '
        "autor TEXT NOT NULL CHECK (autor IN ('aluno', 'coordenacao')), "
        'texto TEXT NOT NULL, criado_em TEXT NOT NULL, '
        'usuario_id INTEGER REFERENCES usuarios(id));'
        'INSERT INTO mensagens (id, caso_id, autor, texto, criado_em, usuario_id) '
        'SELECT id, caso_id, autor, texto, criado_em, usuario_id FROM mensagens_nova;'
        'DROP TABLE mensagens_nova;'
    )
    raw.commit()
    raw.close()

    init_db(config)
    init_db(config)  # idempotente
    c = connect(config)
    try:
        colunas = {r[1] for r in c.execute('PRAGMA table_info(mensagens)')}
        assert {'editada_em', 'apagada_em'} <= colunas
        assert c.execute(
            "SELECT 1 FROM sqlite_master WHERE name='mensagens_versoes'"
        ).fetchone()
        antigas = c.execute('SELECT texto FROM mensagens').fetchall()
        assert [r['texto'] for r in antigas] == ['Mensagem antiga']
    finally:
        c.close()


def test_autor_edita_e_versao_guarda_texto_anterior(conn, config):
    caso_id, msg_id, ana = cenario(conn, config, texto='Texto original')
    assert casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'Texto novo') == 'ok'
    m = linha(conn, msg_id)
    assert m['texto'] == 'Texto novo'
    assert m['editada_em']
    assert m['apagada_em'] is None
    v = versoes(conn, msg_id)
    assert len(v) == 1
    assert v[0]['acao'] == 'edicao'
    assert v[0]['texto'] == 'Texto original'
    assert v[0]['usuario_id'] == ana
    ev = eventos(conn, caso_id, 'mensagem_editada')
    assert len(ev) == 1
    assert 'Texto original' not in ev[0]['detalhe']
    assert 'Texto novo' not in ev[0]['detalhe']


def test_edicao_nao_altera_atualizado_em_do_caso(conn, config):
    caso_id, msg_id, ana = cenario(conn, config)
    antes = conn.execute('SELECT atualizado_em FROM casos WHERE id=?', (caso_id,)).fetchone()[0]
    casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'Outro texto')
    casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador')
    depois = conn.execute('SELECT atualizado_em FROM casos WHERE id=?', (caso_id,)).fetchone()[0]
    assert antes == depois


def test_edicao_igual_nao_cria_versao_nem_evento(conn, config):
    caso_id, msg_id, ana = cenario(conn, config, texto='Mesmo texto')
    assert casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'Mesmo texto') == 'sem_mudanca'
    assert versoes(conn, msg_id) == []
    assert eventos(conn, caso_id, 'mensagem_editada') == []
    assert linha(conn, msg_id)['editada_em'] is None


def test_outro_coordenador_nao_edita(conn, config):
    caso_id, msg_id, ana = cenario(conn, config)
    bia = auth.criar_usuario(conn, 'bia', 'senha-forte-123')
    assert casos.alterar_mensagem(conn, caso_id, msg_id, bia, 'coordenador', 'Invasão') == 'proibido'
    assert casos.apagar_mensagem(conn, caso_id, msg_id, bia, 'coordenador') == 'proibido'
    assert linha(conn, msg_id)['texto'] == 'Olá'
    assert versoes(conn, msg_id) == []


def test_admin_edita_mensagem_alheia(conn, config):
    caso_id, msg_id, ana = cenario(conn, config)
    adm = auth.criar_usuario(conn, 'adm', 'senha-forte-123', 'admin')
    assert casos.alterar_mensagem(conn, caso_id, msg_id, adm, 'admin', 'Corrigido') == 'ok'
    assert linha(conn, msg_id)['texto'] == 'Corrigido'
    assert versoes(conn, msg_id)[0]['usuario_id'] == adm


def test_mensagem_legada_sem_usuario_id_so_admin(conn, config):
    caso_id = novo_caso(conn, config)
    msg_id = nova_mensagem(conn, caso_id, usuario_id=None)
    ana = auth.criar_usuario(conn, 'ana', 'senha-forte-123')
    adm = auth.criar_usuario(conn, 'adm', 'senha-forte-123', 'admin')
    assert casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'X') == 'proibido'
    assert casos.alterar_mensagem(conn, caso_id, msg_id, adm, 'admin', 'X') == 'ok'


def test_mensagem_do_aluno_nunca_e_alteravel(conn, config):
    caso_id = novo_caso(conn, config)
    msg_id = nova_mensagem(conn, caso_id, autor='aluno', texto='Do aluno')
    adm = auth.criar_usuario(conn, 'adm', 'senha-forte-123', 'admin')
    assert casos.alterar_mensagem(conn, caso_id, msg_id, adm, 'admin', 'X') == 'proibido'
    assert casos.apagar_mensagem(conn, caso_id, msg_id, adm, 'admin') == 'proibido'
    assert linha(conn, msg_id)['texto'] == 'Do aluno'


def test_apagar_limpa_texto_guarda_versao_e_e_idempotente(conn, config):
    caso_id, msg_id, ana = cenario(conn, config, texto='Para apagar')
    assert casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador') == 'ok'
    m = linha(conn, msg_id)
    assert m['texto'] == ''
    assert m['apagada_em']
    v = versoes(conn, msg_id)
    assert len(v) == 1
    assert v[0]['acao'] == 'exclusao'
    assert v[0]['texto'] == 'Para apagar'
    ev = eventos(conn, caso_id, 'mensagem_apagada')
    assert len(ev) == 1
    assert 'Para apagar' not in ev[0]['detalhe']
    assert casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador') == 'ja_apagada'
    assert len(versoes(conn, msg_id)) == 1
    assert len(eventos(conn, caso_id, 'mensagem_apagada')) == 1


def test_editar_apagada_devolve_apagada(conn, config):
    caso_id, msg_id, ana = cenario(conn, config)
    casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador')
    assert casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'Volta') == 'apagada'
    assert linha(conn, msg_id)['texto'] == ''


def test_mensagem_de_outro_caso_e_inexistente(conn, config):
    caso_id, msg_id, ana = cenario(conn, config)
    outro = novo_caso(conn, config)
    assert casos.alterar_mensagem(conn, outro, msg_id, ana, 'coordenador', 'X') == 'inexistente'
    assert casos.apagar_mensagem(conn, outro, msg_id, ana, 'coordenador') == 'inexistente'
    assert casos.versoes_mensagem(conn, outro, msg_id) is None
    assert casos.alterar_mensagem(conn, caso_id, 99999, ana, 'coordenador', 'X') == 'inexistente'
    assert linha(conn, msg_id)['texto'] == 'Olá'


def test_versoes_mensagem_ordem_e_campos(conn, config):
    caso_id, msg_id, ana = cenario(conn, config, texto='Um')
    casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'Dois')
    casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador')
    v = casos.versoes_mensagem(conn, caso_id, msg_id)
    assert [(x['acao'], x['texto']) for x in v] == [('edicao', 'Um'), ('exclusao', 'Dois')]
    assert set(v[0]) == {'id', 'texto', 'acao', 'usuario', 'criado_em'}
    assert v[0]['usuario'] == 'ana'
    assert v[0]['id'] < v[1]['id']


def test_pode_alterar_mensagem(conn, config):
    caso_id, msg_id, ana = cenario(conn, config)
    m = linha(conn, msg_id)
    assert casos.pode_alterar_mensagem(m, ana, 'coordenador')
    assert not casos.pode_alterar_mensagem(m, ana + 1, 'coordenador')
    assert casos.pode_alterar_mensagem(m, ana + 1, 'admin')
    assert casos.pode_alterar_mensagem(dict(m), ana, 'coordenador')


def test_leituras_trazem_editada_em_e_apagada_em(conn, config):
    caso_id, msg_id, ana = cenario(conn, config)
    casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'Novo')
    m = casos.listar_mensagens(conn, caso_id)[0]
    assert m['editada_em'] and m['apagada_em'] is None
    d = casos.detalhe_caso(conn, caso_id)['mensagens'][0]
    assert d['editada_em'] and d['apagada_em'] is None
    casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador')
    assert casos.listar_mensagens(conn, caso_id)[0]['apagada_em']
    assert casos.detalhe_caso(conn, caso_id)['mensagens'][0]['apagada_em']


def test_ultimo_id_e_contagem_de_novas_nao_mudam(conn, config):
    caso_id = novo_caso(conn, config)
    ana = auth.criar_usuario(conn, 'ana', 'senha-forte-123')
    nova_mensagem(conn, caso_id, autor='aluno', texto='Pergunta')
    msg_id = nova_mensagem(conn, caso_id, usuario_id=ana, texto='Resposta')
    antes = casos.estado_conversa(conn, caso_id, ana)
    casos.alterar_mensagem(conn, caso_id, msg_id, ana, 'coordenador', 'Resposta melhor')
    meio = casos.estado_conversa(conn, caso_id, ana)
    casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador')
    depois = casos.estado_conversa(conn, caso_id, ana)
    for estado in (meio, depois):
        assert estado['mensagens_novas'] == antes['mensagens_novas'] == 1
        assert estado['ultima_mensagem']['id'] == antes['ultima_mensagem']['id'] == msg_id
        assert estado['conversa_estado'] == antes['conversa_estado']


def test_ultima_mensagem_apagada_nao_expoe_texto(conn, config):
    caso_id, msg_id, ana = cenario(conn, config, texto='Segredo')
    casos.apagar_mensagem(conn, caso_id, msg_id, ana, 'coordenador')
    ultima = casos.estado_conversa(conn, caso_id, ana)['ultima_mensagem']
    assert ultima['apagada_em']
    assert ultima['texto'] == ''
    assert 'Segredo' not in str(ultima)
