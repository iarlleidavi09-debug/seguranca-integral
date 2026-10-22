import copy
import json

import pytest

from app.questionario import QuestionarioInvalido, RespostasInvalidas
from app.questionario_v3 import DIMENSOES, QuestionarioV3, _validar, carregar


def definicao():
    def pergunta(pid, **campos):
        return dict(id=pid, texto=pid, dimensao='risco', tipo='unica',
                    respostas=[dict(id=f'{pid}.sim', texto='Sim', peso=0),
                               dict(id=f'{pid}.nao', texto='Não', peso=0)], **campos)
    return dict(versao=3, dimensoes={d: d for d in DIMENSOES}, comuns=['q0'],
                grupos=[dict(id='grupo', nome='Grupo', opcoes=[
                    dict(id='a', texto='A', peso=1, tipo_legado='outro', perguntas=['q1', 'q2']),
                    dict(id='b', texto='B', peso=1, tipo_legado='outro', perguntas=['q2'])])],
                perguntas=[pergunta('q0'),
                           pergunta('q1', para_opcoes=['a'], mostrar_se=['q0.sim']),
                           pergunta('q2', para_opcoes=['b']),
                           pergunta('q3', para_opcoes=['a'], mostrar_se=['q1.sim'], mostrar_se_todas=['q0.sim']),
                           pergunta('q4', mostrar_se_todas=['q3.sim', 'q0.sim']),
                           pergunta('q5', mostrar_se=['q4.sim']),
                           pergunta('q6')], alertas=[], faixas=dict(media=4, alta=8))


CASES = [
    (['a'], {}, ['q0', 'q1']),
    (['b'], {'q0': ['q0.sim'], 'q1': ['q1.sim']}, ['q0', 'q2']),
    (['a'], {'q1': ['q1.sim']}, ['q0', 'q1']),
    (['a'], {'q0': ['q0.sim'], 'q1': ['q1.sim']}, ['q0', 'q1', 'q3']),
    (['a', 'b'], {'q0': ['q0.sim'], 'q1': ['q1.sim'], 'q3': ['q3.sim'], 'q4': ['q4.sim']}, ['q0', 'q1', 'q2', 'q3', 'q4', 'q5']),
    (['a'], {'q0': ['q0.nao'], 'q1': ['q1.sim'], 'q3': ['q3.sim'], 'q4': ['q4.sim']}, ['q0', 'q1']),
    (['a'], {'q0': ['q0.sim'], 'q1': ['q0.sim', 'q1.inventada']}, ['q0', 'q1']),
]


@pytest.mark.parametrize('marcadas,respostas,esperadas', CASES)
def test_percurso_paridade(marcadas, respostas, esperadas):
    assert QuestionarioV3(definicao()).visiveis(marcadas, respostas) == esperadas


def test_escopo_comum_e_or_alternativo():
    data = definicao()
    data['perguntas'][0]['para_opcoes'] = ['a']
    assert QuestionarioV3(data).visiveis(['b'], {'q0': ['q0.sim']}) == ['q2']
    data['perguntas'][3]['mostrar_se'].append('q2.sim')
    assert QuestionarioV3(data).visiveis(['a', 'b'], {'q0': ['q0.sim'], 'q2': ['q2.sim']}) == ['q0', 'q1', 'q2', 'q3']
    # Um ID existente colocado na pergunta errada também é inválido como gatilho.
    assert QuestionarioV3(data).visiveis(['a'], {'q0': ['q0.sim', 'q1.sim']}) == ['q0', 'q1']


def test_payload_oculto_e_exportacao_publica():
    q = QuestionarioV3(definicao())
    with pytest.raises(RespostasInvalidas, match='fora do percurso'):
        q.validar_respostas(json.dumps(dict(versao=3, marcadas=['a'], respostas={'q2': ['q2.sim']})))
    public = q.para_aluno()
    assert public['perguntas'][3]['mostrar_se_todas'] == ['q0.sim']
    assert public['perguntas'][1]['para_opcoes'] == ['a']
    assert 'peso' not in json.dumps(public)
    assert 'alertas' not in public


@pytest.mark.parametrize('campo,valor', [('para_opcoes', []), ('para_opcoes', ['inexistente']),
    ('para_opcoes', ['a', 'a']), ('para_opcoes', 'a'), ('mostrar_se_todas', 'q0.sim'),
    ('mostrar_se_todas', ['inexistente']), ('mostrar_se_todas', ['q0.sim', 'q0.sim']),
    ('mostrar_se', [None])])
def test_rejeita_referencias_malformadas(campo, valor):
    data = definicao()
    data['perguntas'][3][campo] = valor
    with pytest.raises(QuestionarioInvalido):
        _validar(data)


def test_ciclo_misturando_or_e_and():
    data = definicao()
    data['perguntas'][0]['mostrar_se_todas'] = ['q5.sim']
    with pytest.raises(QuestionarioInvalido, match='ciclo'):
        _validar(data)


def test_legado_sem_campos_novos_e_vazios_nao_abrem():
    data = definicao()
    for p in data['perguntas']:
        p.pop('para_opcoes', None)
        p.pop('mostrar_se_todas', None)
    data['perguntas'][-1]['mostrar_se_todas'] = []
    _validar(data)
    assert QuestionarioV3(data).visiveis(['a'], {}) == ['q0', 'q1', 'q2']


def test_limites_ampliados(tmp_path):
    data = definicao()
    data['perguntas'] = []
    for i in range(200):
        data['perguntas'].append(dict(id=f'q{i}', texto=f'Pergunta {i}', dimensao='risco', tipo='multipla',
            respostas=[dict(id=f'q{i}.sim', texto='Sim', peso=0), dict(id=f'q{i}.nao', texto='Não', peso=0)]))
    data['comuns'] = [p['id'] for p in data['perguntas']]
    path = tmp_path / 'def.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    q = carregar(path)
    answers = {f'q{i}': [f'q{i}.sim', f'q{i}.nao'] for i in range(200)}
    assert q.validar_respostas(json.dumps(dict(versao=3, marcadas=[], respostas=answers)))
    with pytest.raises(RespostasInvalidas, match='alternativas'):
        q.validar_respostas(json.dumps(dict(versao=3, marcadas=['a'], respostas=answers)))
    padded = json.dumps(dict(versao=3, marcadas=[], respostas={})) + ' ' * 20000
    assert q.validar_respostas(padded)
    with pytest.raises(RespostasInvalidas, match='grandes demais'):
        q.validar_respostas(padded + ' ' * 65536)
    data['perguntas'].append(copy.deepcopy(data['perguntas'][0]))
    with pytest.raises(QuestionarioInvalido, match='perguntas invalidas'):
        _validar(data)
    path.write_bytes(b' ' * (256 * 1024 + 1))
    with pytest.raises(QuestionarioInvalido, match='definicao grande demais'):
        carregar(path)
