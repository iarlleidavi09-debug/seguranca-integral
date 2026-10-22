"""Contrato editorial dos percursos por assunto, independente do motor."""
import json
from pathlib import Path

import pytest

PATH = Path(__file__).parents[1] / 'app' / 'questionario_v3.json'
DATA = json.loads(PATH.read_text(encoding='utf-8'))
QUESTIONS = {q['id']: q for q in DATA['perguntas']}
OPTIONS = {o['id']: o for g in DATA['grupos'] for o in g['opcoes']}


@pytest.mark.parametrize('option', list(OPTIONS))
def test_cada_assunto_tem_raiz_e_descendente_exclusivos(option):
    roots = [QUESTIONS[pid] for pid in OPTIONS[option]['perguntas']
             if QUESTIONS[pid].get('para_opcoes') == [option]]
    assert roots, option
    assert all(not q.get('mostrar_se') and not q.get('mostrar_se_todas') for q in roots)
    root_answers = {r['id'] for q in roots for r in q['respostas']}
    descendants = [q for q in QUESTIONS.values() if q.get('para_opcoes') == [option]
                   and root_answers.intersection(q.get('mostrar_se', []) + q.get('mostrar_se_todas', []))]
    assert descendants, option
    assert all(q['id'] not in OPTIONS[option]['perguntas'] for q in descendants)


def test_limites_e_pesos_descritivos():
    assert len(OPTIONS) == 29
    assert len(DATA['grupos']) == 8
    assert len(QUESTIONS) <= 200
    assert PATH.stat().st_size <= 256 * 1024
    assert DATA['comuns'] == ['q-seguranca', 'q-quem', 'q-quando', 'q-frequencia']
    for q in QUESTIONS.values():
        if q.get('para_opcoes') and q['id'].startswith('q-' + q['para_opcoes'][0] + '-'):
            assert all(r['peso'] == 0 for r in q['respostas'])
            assert any(r['id'].endswith('.prefiro') for r in q['respostas'])
            assert any(r['id'].endswith('.nao-sei') for r in q['respostas'])


def test_cyber_tem_cinco_caminhos_e_canal_sem_invasao_implicita():
    root = QUESTIONS['q-cyber-forma']
    for suffix in ('mensagens', 'boatos', 'imagens', 'exclusao', 'ameacas'):
        rid = 'q-cyber-forma.' + suffix
        assert rid in {r['id'] for r in root['respostas']}
        assert any(rid in q.get('mostrar_se', []) for q in QUESTIONS.values()
                   if q.get('para_opcoes') == ['cyber'])
    assert 'q-cyber-canal' in OPTIONS['cyber']['perguntas']
    assert 'q-acesso' not in OPTIONS['cyber']['perguntas']


@pytest.mark.parametrize('option,wrong', [('dados', 'q-acesso'), ('perfil', 'q-acesso'),
                                       ('adulteracao', 'q-risco-local'),
                                       ('perseguicao', 'q-risco-local'), ('perseguicao', 'q-risco-arma')])
def test_raizes_fora_de_contexto_removidas(option, wrong):
    assert wrong not in OPTIONS[option]['perguntas']


def test_referencias_e_filhos_nunca_sao_raizes():
    response_ids = {r['id'] for q in QUESTIONS.values() for r in q['respostas']}
    specific_roots = {pid for o in OPTIONS.values() for pid in o['perguntas']
                      if QUESTIONS[pid].get('para_opcoes') == [o['id']]}
    for q in QUESTIONS.values():
        triggers = q.get('mostrar_se', []) + q.get('mostrar_se_todas', [])
        assert set(triggers) <= response_ids
        assert set(q.get('para_opcoes', [])) <= set(OPTIONS)
        if triggers and q['id'] in specific_roots:
            pytest.fail(q['id'])


def test_tres_niveis_cyber_sem_pedir_detalhes_graficos():
    q = QUESTIONS['q-cyber-imagens-circulacao']
    assert q['mostrar_se_todas'] == ['q-cyber-forma.imagens', 'q-cyber-imagens.publicadas']
    assert q['para_opcoes'] == ['cyber']
    assert all('descreva' not in q['texto'].lower() for q in QUESTIONS.values())


@pytest.mark.parametrize('choice', ['mensagens', 'boatos', 'imagens', 'exclusao', 'ameacas'])
def test_percurso_cyber_abre_somente_o_conteudo_escolhido(choice):
    from app.questionario_v3 import carregar

    definition = carregar(PATH)
    visible = definition.visiveis(['cyber'], {'q-cyber-forma': ['q-cyber-forma.' + choice]})
    assert 'q-cyber-' + choice in visible
    for other in {'mensagens', 'boatos', 'imagens', 'exclusao', 'ameacas'} - {choice}:
        assert 'q-cyber-' + other not in visible
    assert 'q-acesso' not in visible
    assert 'q-risco-arma' not in visible


def test_imagens_so_abrem_alcance_depois_da_publicacao_e_limpam_a_cadeia():
    from app.questionario_v3 import carregar

    definition = carregar(PATH)
    answers = {'q-cyber-forma': ['q-cyber-forma.imagens'],
               'q-cyber-imagens': ['q-cyber-imagens.publicadas'],
               'q-cyber-imagens-circulacao': ['q-cyber-imagens-circulacao.publico']}
    assert 'q-cyber-imagens-circulacao' in definition.visiveis(['cyber'], answers)
    answers['q-cyber-imagens'] = ['q-cyber-imagens.ameaca']
    assert 'q-cyber-imagens-circulacao' not in definition.visiveis(['cyber'], answers)
    answers['q-cyber-forma'] = ['q-cyber-forma.exclusao']
    visible = definition.visiveis(['cyber'], answers)
    assert 'q-cyber-imagens' not in visible
    assert 'q-cyber-imagens-circulacao' not in visible


@pytest.mark.parametrize('option', ['perfil', 'dados', 'adulteracao', 'perseguicao'])
def test_percursos_especificos_sem_supor_fatos_de_outros_temas(option):
    from app.questionario_v3 import carregar

    visible = carregar(PATH).visiveis([option], {})
    assert 'q-acesso' not in visible
    assert 'q-risco-local' not in visible
    assert 'q-risco-arma' not in visible


def test_ameaca_fisica_cyber_preserva_alerta_existente_com_evidencia_completa():
    from app.questionario_v3 import carregar

    definition = carregar(PATH)
    answers = {'q-cyber-forma': ['q-cyber-forma.ameacas'],
               'q-cyber-ameacas': ['q-cyber-ameacas.fisica'],
               'q-risco-arma': ['q-risco-arma.sim'],
               'q-risco-local': ['q-risco-local.hoje']}
    visible = definition.visiveis(['cyber'], answers)
    assert {'q-risco-arma', 'q-risco-local'} <= set(visible)
    normalized = definition.validar_respostas(json.dumps({'versao': 3, 'marcadas': ['cyber'], 'respostas': answers}))
    assert normalized['respostas']['q-risco-local'] == ['q-risco-local.hoje']
    result = definition.classificar(normalized, '', False, {})
    assert result.prioridade == 'critica'
    assert 'alerta: ameaça com arma para hoje' in result.motivos
    neutral = definition.validar_respostas(json.dumps({'versao': 3, 'marcadas': ['cyber'], 'respostas': {}}))
    assert definition.classificar(neutral, '', False, {}).prioridade == 'baixa'


@pytest.mark.parametrize('answers,expected', [
    ({'q-conta-sinal': ['q-conta-sinal.senha']}, False),
    ({'q-conta-sinal': ['q-conta-sinal.aviso']}, False),
    ({'q-conta-sinal': ['q-conta-sinal.atividade'],
      'q-conta-atividade': ['q-conta-atividade.perfil']}, False),
    ({'q-conta-sinal': ['q-conta-sinal.atividade'],
      'q-conta-atividade': ['q-conta-atividade.publicacao']}, True),
    ({'q-conta-sinal': ['q-conta-sinal.atividade'],
      'q-conta-atividade': ['q-conta-atividade.mensagem']}, True),
])
def test_invasao_so_pergunta_circulacao_quando_houve_conteudo(answers, expected):
    from app.questionario_v3 import carregar

    assert ('q-circulacao' in carregar(PATH).visiveis(['conta'], answers)) is expected
    assert 'q-circulacao' not in OPTIONS['conta']['perguntas']
    assert QUESTIONS['q-circulacao']['para_opcoes'] == ['conta', 'dados', 'intimidade']
    assert any(r['id'] == 'q-circulacao.nao' and r['peso'] == 0
               for r in QUESTIONS['q-circulacao']['respostas'])


def test_arma_vista_nao_pressupoe_fala_ao_perguntar_momento_local():
    from app.questionario_v3 import carregar

    answers = {'q-arma-presenca': ['q-arma-presenca.visto']}
    assert 'q-risco-local' in carregar(PATH).visiveis(['arma'], answers)
    assert QUESTIONS['q-risco-local']['texto'] == 'Houve indicação de quando ou onde alguém seria machucado?'
    assert next(r for r in QUESTIONS['q-risco-local']['respostas']
                if r['id'] == 'q-risco-local.nao')['texto'] == 'Não houve indicação'
