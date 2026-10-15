import { describe, expect, it } from 'vitest';
import { comporRelato, LIMITE_RELATO, SITUACOES, tipoDe } from './situacoes';

describe('situações do aluno', () => {
  it('são 7, na ordem aprovada', () => {
    expect(SITUACOES.map(s => s.nome)).toEqual(['Cyberbullying', 'Ameaças', 'Vazamento de conteúdo particular', 'Perfil falso ou página de fofoca', 'Golpe', 'Aliciamento', 'Outros']);
  });
  it('as cinco primeiras têm 5 opções não vazias; Aliciamento e Outros nenhuma', () => {
    for (const s of SITUACOES.slice(0, 5)) {
      expect(s.opcoes).toHaveLength(5);
      for (const o of s.opcoes) expect(o.trim()).not.toBe('');
    }
    expect(SITUACOES[5].opcoes).toEqual([]);
    expect(SITUACOES[6].opcoes).toEqual([]);
  });
  it('tipoDe mapeia cada id ao tipo do backend', () => {
    const esperado = ['cyberbullying', 'ameaca', 'vazamento', 'perfil_falso', 'golpe', 'aliciamento', 'outro'];
    expect(SITUACOES.map(s => tipoDe(s.id))).toEqual(esperado);
    expect(SITUACOES.map(s => s.tipo)).toEqual(esperado);
  });
  it('nenhum texto contém travessão longo', () => {
    const tudo = SITUACOES.flatMap(s => [s.nome, s.descricao, ...s.opcoes]).join('\n');
    expect(tudo).not.toMatch(/[—–]/);
  });
  it('limite do relato', () => { expect(LIMITE_RELATO).toBe(5000); });
});

describe('comporRelato', () => {
  it('sem marcadas devolve o texto aparado', () => { expect(comporRelato('  oi  ', [])).toBe('oi'); });
  it('com marcadas acrescenta o bloco', () => {
    expect(comporRelato('  oi  ', ['A', 'B'])).toBe('oi\n\nSituações marcadas:\n- A\n- B');
  });
  it('é idempotente sobre o mesmo texto base', () => {
    const a = comporRelato('oi', ['A']);
    expect(comporRelato('oi', ['A'])).toBe(a);
  });
});
