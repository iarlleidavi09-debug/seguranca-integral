import { describe, expect, it, vi } from 'vitest';
import { apagarRascunho, lerRascunho, salvarRascunho } from './rascunho';
import type { DadosRascunho } from './rascunho';
import { SITUACOES } from './situacoes';

const CHAVE = 'si-aluno-rascunho-v2';
const HORA = 60 * 60 * 1000;
const opcao = SITUACOES.find(s => s.id === 'ameaca')!.opcoes[0];
const base: DadosRascunho = { situacaoId: 'ameaca', marcadas: [opcao], relato: 'Estão me ameaçando.', quando: 'ontem', onde: 'grupo da turma', em_andamento: true, anonimo: false, nome: 'Ana', turma: '2A' };

describe('rascunho de 24 horas', () => {
  it('grava e lê de volta dentro de 24 horas', () => {
    expect(salvarRascunho(base, 1000)).toBe(true);
    expect(lerRascunho(1000 + 24 * HORA)).toEqual(base);
    expect(JSON.parse(localStorage.getItem(CHAVE)!).salvoEm).toBe(1000);
  });
  it('com 24 horas e 1 ms vira null e a chave some', () => {
    salvarRascunho(base, 1000);
    expect(lerRascunho(1000 + 24 * HORA + 1)).toBeNull();
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });
  it('ausente, JSON inválido e formato inesperado viram null sem exceção', () => {
    expect(lerRascunho(1)).toBeNull();
    localStorage.setItem(CHAVE, '{nao e json');
    expect(lerRascunho(1)).toBeNull();
    localStorage.setItem(CHAVE, '[1,2]');
    expect(lerRascunho(1)).toBeNull();
    localStorage.setItem(CHAVE, JSON.stringify({ ...base, salvoEm: 'ontem' }));
    expect(lerRascunho(1)).toBeNull();
    localStorage.setItem(CHAVE, JSON.stringify({ salvoEm: 1, situacaoId: 7 }));
    expect(lerRascunho(1)).toBeNull();
    localStorage.setItem(CHAVE, JSON.stringify({ ...base, situacaoId: 'inventada', salvoEm: 1 }));
    expect(lerRascunho(1)).toBeNull();
  });
  it('armazenamento bloqueado: ler dá null, salvar dá false, apagar não lança', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(lerRascunho(1)).toBeNull();
    expect(salvarRascunho(base, 1)).toBe(false);
    expect(() => apagarRascunho()).not.toThrow();
  });
  it('apaga a chave antiga v1 ao ler', () => {
    localStorage.setItem('si-aluno-rascunho-v1', '{"tipo":"ameaca"}');
    expect(lerRascunho(1)).toBeNull();
    expect(localStorage.getItem('si-aluno-rascunho-v1')).toBeNull();
  });
  it('corta os textos nos limites ao ler', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ ...base, relato: 'r'.repeat(6000), quando: 'q'.repeat(300), onde: 'o'.repeat(300), nome: 'n'.repeat(300), turma: 't'.repeat(90), salvoEm: 1 }));
    const lido = lerRascunho(2)!;
    expect(lido.relato).toHaveLength(5000);
    expect(lido.quando).toHaveLength(200);
    expect(lido.onde).toHaveLength(200);
    expect(lido.nome).toHaveLength(200);
    expect(lido.turma).toHaveLength(50);
  });
  it('corta os textos nos limites ao salvar', () => {
    salvarRascunho({ ...base, relato: 'r'.repeat(6000), nome: 'n'.repeat(300) }, 1);
    const guardado = JSON.parse(localStorage.getItem(CHAVE)!);
    expect(guardado.relato).toHaveLength(5000);
    expect(guardado.nome).toHaveLength(200);
  });
  it('anônimo zera nome e turma, ao salvar e ao ler', () => {
    salvarRascunho({ ...base, anonimo: true }, 1);
    const guardado = JSON.parse(localStorage.getItem(CHAVE)!);
    expect(guardado.nome).toBe('');
    expect(guardado.turma).toBe('');
    localStorage.setItem(CHAVE, JSON.stringify({ ...base, anonimo: true, salvoEm: 1 }));
    expect(lerRascunho(2)).toMatchObject({ nome: '', turma: '' });
  });
  it('descarta opções marcadas que não pertencem à situação', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ ...base, marcadas: [opcao, 'texto inventado', 5], salvoEm: 1 }));
    expect(lerRascunho(2)!.marcadas).toEqual([opcao]);
  });
  it('apagarRascunho remove a chave', () => {
    salvarRascunho(base, 1);
    apagarRascunho();
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });
});
