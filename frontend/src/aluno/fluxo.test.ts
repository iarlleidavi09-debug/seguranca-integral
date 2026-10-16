import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Questionario } from '../shared/api';
import { limparInvisiveis, montarEnvio, perguntasVisiveis, proxima } from './fluxo';

// A definição real, sem o que o servidor não entrega ao aluno.
const bruto = JSON.parse(readFileSync(resolve(process.cwd(), '../backend/app/questionario.json'), 'utf-8'));
delete bruto.pesos; delete bruto.alertas; delete bruto.faixas;
const q = bruto as Questionario;

const DE_A1 = ['q1', 'q3', 'q6', 'a1.local', 'a1.arma', 'a1.antes', 'a1.como'];

describe('perguntasVisiveis', () => {
  it('marcar a1 deixa visíveis exatamente as perguntas da opção, na ordem da definição', () => {
    expect(perguntasVisiveis(q, 'ameaca', ['a1'], {})).toEqual(DE_A1);
  });
  it('responder q6.nao não acrescenta pergunta', () => {
    expect(perguntasVisiveis(q, 'ameaca', ['a1'], { q6: ['q6.nao'] })).toEqual(DE_A1);
  });
  it('sem marcadas nada é visível', () => {
    expect(perguntasVisiveis(q, 'ameaca', [], {})).toEqual([]);
  });
  it('gatilho de mostrar_se abre perguntas de c1 mesmo sem marcar c1', () => {
    const v = perguntasVisiveis(q, 'cyberbullying', ['c3'], { 'c3.piadas': ['c3.piadas.sim'] });
    expect(v).toEqual(expect.arrayContaining(['c1.onde', 'c1.prints', 'c1.alvos']));
  });
  it('encadeia: c1.onde.grupo abre c1.testemunhas', () => {
    const v = perguntasVisiveis(q, 'cyberbullying', ['c3'], { 'c3.piadas': ['c3.piadas.sim'], 'c1.onde': ['c1.onde.grupo'] });
    expect(v).toContain('c1.testemunhas');
  });
  it('resposta de pergunta invisível não funciona como gatilho', () => {
    const v = perguntasVisiveis(q, 'cyberbullying', ['c3'], { 'c1.onde': ['c1.onde.grupo'] });
    expect(v).not.toContain('c1.testemunhas');
    expect(v).not.toContain('c1.onde');
  });
  it('desmarcar c3 esconde de novo e limparInvisiveis apaga as respostas', () => {
    const respostas = { 'c3.piadas': ['c3.piadas.sim'], 'c1.onde': ['c1.onde.grupo'], 'c1.testemunhas': ['c1.testemunhas.sim'], q1: ['q1.agora'] };
    expect(perguntasVisiveis(q, 'cyberbullying', [], respostas)).toEqual([]);
    expect(limparInvisiveis(q, 'cyberbullying', [], respostas)).toEqual({});
  });
  it('opção de outra situação em marcadas é ignorada', () => {
    expect(perguntasVisiveis(q, 'ameaca', ['c1'], {})).toEqual([]);
    expect(perguntasVisiveis(q, 'ameaca', ['c1', 'a1'], {})).toEqual(DE_A1);
  });
  it('ids desconhecidos em marcadas e respostas são ignorados', () => {
    expect(perguntasVisiveis(q, 'ameaca', ['zzz', 'a1'], { naoexiste: ['x'], q1: ['q1.fantasma'] })).toEqual(DE_A1);
    expect(perguntasVisiveis(q, 'inventada', ['a1'], {})).toEqual([]);
  });
});

describe('limparInvisiveis', () => {
  it('remove ids de resposta que não pertencem à pergunta e mantém os válidos', () => {
    expect(limparInvisiveis(q, 'ameaca', ['a1'], { q1: ['q1.agora', 'q2.dia', 'lixo'], q6: ['q6.nao'] })).toEqual({ q1: ['q1.agora'], q6: ['q6.nao'] });
  });
  it('descarta pergunta cuja lista de respostas fica vazia', () => {
    expect(limparInvisiveis(q, 'ameaca', ['a1'], { q1: ['lixo'] })).toEqual({});
  });
});

describe('proxima', () => {
  it('devolve a primeira visível não visitada e null ao acabar', () => {
    expect(proxima(['a', 'b', 'c'], [])).toBe('a');
    expect(proxima(['a', 'b', 'c'], ['a', 'b'])).toBe('c');
    expect(proxima(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeNull();
    expect(proxima([], [])).toBeNull();
  });
  it('pergunta que ficou visível depois, antes da atual, não é pulada', () => {
    expect(proxima(['a', 'nova', 'b'], ['a', 'b'])).toBe('nova');
  });
});

describe('montarEnvio', () => {
  it('gera o JSON exato, só com perguntas visíveis, na ordem da definição', () => {
    const respostas = { q6: ['q6.nao'], q1: ['q1.agora'], 'c1.onde': ['c1.onde.grupo'], 'a1.como': ['a1.como.audio', 'a1.como.pessoa'] };
    const texto = montarEnvio(q, 'ameaca', ['a1', 'c1'], respostas);
    const obj = JSON.parse(texto);
    expect(obj).toEqual({ situacao: 'ameaca', marcadas: ['a1'], respostas: { q1: ['q1.agora'], q6: ['q6.nao'], 'a1.como': ['a1.como.audio', 'a1.como.pessoa'] } });
    expect(Object.keys(obj)).toEqual(['situacao', 'marcadas', 'respostas']);
    expect(Object.keys(obj.respostas)).toEqual(['q1', 'q6', 'a1.como']);
  });
  it('sem respostas devolve respostas vazio', () => {
    expect(JSON.parse(montarEnvio(q, 'ameaca', ['a1'], {}))).toEqual({ situacao: 'ameaca', marcadas: ['a1'], respostas: {} });
  });
});

describe('limites do envio', () => {
  it('pior caso de cyberbullying cabe em 8192 bytes e em 150 ids', () => {
    const situacao = q.situacoes.find(s => s.id === 'cyberbullying')!;
    const marcadas = situacao.opcoes.map(o => o.id);
    // responde tudo o que aparece: todas as respostas das múltiplas e a primeira das únicas; repete até estabilizar
    let respostas: Record<string, string[]> = {};
    for (let volta = 0; volta < 10; volta++) {
      for (const id of perguntasVisiveis(q, 'cyberbullying', marcadas, respostas)) {
        const p = q.perguntas.find(x => x.id === id)!;
        respostas[id] = p.tipo === 'multipla' ? p.respostas.map(r => r.id) : [p.respostas[0].id];
      }
    }
    const texto = montarEnvio(q, 'cyberbullying', marcadas, respostas);
    const obj = JSON.parse(texto);
    const ids = obj.marcadas.length + (Object.values(obj.respostas) as string[][]).flat().length;
    expect(ids).toBeLessThanOrEqual(150);
    expect(new TextEncoder().encode(texto).length).toBeLessThanOrEqual(8192);
    expect(ids).toBeGreaterThan(60);
  });
});

describe('dedupe e pergunta única', () => {
  it('limparInvisiveis tira ids repetidos e fica com o primeiro de pergunta única', () => {
    expect(limparInvisiveis(q, 'ameaca', ['a1'], { q1: ['q1.agora', 'q1.parou'], 'a1.como': ['a1.como.audio', 'a1.como.audio', 'a1.como.pessoa'] }))
      .toEqual({ q1: ['q1.agora'], 'a1.como': ['a1.como.audio', 'a1.como.pessoa'] });
  });
  it('montarEnvio deduplica marcadas', () => {
    expect(JSON.parse(montarEnvio(q, 'ameaca', ['a1', 'a1'], {})).marcadas).toEqual(['a1']);
  });
});
