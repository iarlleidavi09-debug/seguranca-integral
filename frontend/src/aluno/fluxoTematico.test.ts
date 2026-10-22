import { describe, expect, it } from 'vitest';
import type { Pergunta } from '../shared/api';
import type { QuestionarioV3 } from '../shared/v3';
import { limparRespostasV3, perguntasVisiveisV3 } from './fluxoV3';

function definicao(): QuestionarioV3 {
  const pergunta = (id: string, campos: Partial<Pergunta> = {}): Pergunta => ({ id, texto: id, dimensao: 'risco', tipo: 'unica',
    respostas: [{ id: `${id}.sim`, texto: 'Sim' }, { id: `${id}.nao`, texto: 'Não' }], ...campos });
  return { versao: 3, dimensoes: { risco: 'Risco' }, comuns: ['q0'], grupos: [{ id: 'grupo', nome: 'Grupo', opcoes: [
    { id: 'a', texto: 'A', perguntas: ['q1', 'q2'] }, { id: 'b', texto: 'B', perguntas: ['q2'] },
  ] }], perguntas: [pergunta('q0'), pergunta('q1', { para_opcoes: ['a'], mostrar_se: ['q0.sim'] }),
    pergunta('q2', { para_opcoes: ['b'] }),
    pergunta('q3', { para_opcoes: ['a'], mostrar_se: ['q1.sim'], mostrar_se_todas: ['q0.sim'] }),
    pergunta('q4', { mostrar_se_todas: ['q3.sim', 'q0.sim'] }), pergunta('q5', { mostrar_se: ['q4.sim'] }), pergunta('q6')] };
}

const cases: [string[], Record<string, string[]>, string[]][] = [
  [['a'], {}, ['q0', 'q1']],
  [['b'], { q0: ['q0.sim'], q1: ['q1.sim'] }, ['q0', 'q2']],
  [['a'], { q1: ['q1.sim'] }, ['q0', 'q1']],
  [['a'], { q0: ['q0.sim'], q1: ['q1.sim'] }, ['q0', 'q1', 'q3']],
  [['a', 'b'], { q0: ['q0.sim'], q1: ['q1.sim'], q3: ['q3.sim'], q4: ['q4.sim'] }, ['q0', 'q1', 'q2', 'q3', 'q4', 'q5']],
  [['a'], { q0: ['q0.nao'], q1: ['q1.sim'], q3: ['q3.sim'], q4: ['q4.sim'] }, ['q0', 'q1']],
  [['a'], { q0: ['q0.sim'], q1: ['q0.sim', 'q1.inventada'] }, ['q0', 'q1']],
];

describe('motor temático: casos equivalentes ao Python', () => {
  it.each(cases)('alcança somente respostas válidas do percurso (%j, %j)', (marcadas, respostas, esperadas) => {
    expect(perguntasVisiveisV3(definicao(), marcadas, respostas)).toEqual(esperadas);
  });
  it('aplica escopo nas comuns e aceita outro gatilho OR sem aceitar ID na pergunta errada', () => {
    const q = definicao();
    q.perguntas[0].para_opcoes = ['a'];
    expect(perguntasVisiveisV3(q, ['b'], { q0: ['q0.sim'] })).toEqual(['q2']);
    q.perguntas[3].mostrar_se!.push('q2.sim');
    expect(perguntasVisiveisV3(q, ['a', 'b'], { q0: ['q0.sim'], q2: ['q2.sim'] })).toEqual(['q0', 'q1', 'q2', 'q3']);
    expect(perguntasVisiveisV3(q, ['a'], { q0: ['q0.sim', 'q1.sim'] })).toEqual(['q0', 'q1']);
  });
  it('limpa três níveis ao trocar gatilho ou retirar assunto', () => {
    const respostas = { q0: ['q0.sim'], q1: ['q1.sim'], q3: ['q3.sim'], q4: ['q4.sim'], q5: ['q5.sim'] };
    expect(limparRespostasV3(definicao(), ['a'], { ...respostas, q0: ['q0.nao'] })).toEqual({ q0: ['q0.nao'], q1: ['q1.sim'] });
    expect(limparRespostasV3(definicao(), ['b'], respostas)).toEqual({ q0: ['q0.sim'] });
  });
  it('não preserva descendentes abertos pela segunda alternativa de uma pergunta única', () => {
    expect(limparRespostasV3(definicao(), ['a'], {
      q0: ['q0.sim'], q1: ['q1.nao', 'q1.sim'], q3: ['q3.sim'], q4: ['q4.sim'],
    })).toEqual({ q0: ['q0.sim'], q1: ['q1.nao'] });
  });
  it('mantém legado sem novos campos e condições vazias não abrem perguntas isoladas', () => {
    const q = definicao();
    q.perguntas.forEach(p => { delete p.para_opcoes; delete p.mostrar_se_todas; });
    q.perguntas.at(-1)!.mostrar_se_todas = [];
    expect(perguntasVisiveisV3(q, ['a'], {})).toEqual(['q0', 'q1', 'q2']);
  });
});
