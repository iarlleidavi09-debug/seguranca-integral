import { describe, expect, it } from 'vitest';
import { dataLegivel, rotuloDesfecho, rotuloStatus } from './rotulos';

describe('rótulos do aluno', () => {
  it('status atuais', () => {
    expect(rotuloStatus('novo')).toBe('Recebido');
    expect(rotuloStatus('em_investigacao')).toBe('Em investigação');
    expect(rotuloStatus('resolvido')).toBe('Resolvido');
  });
  it.each(['em_analise', 'aguardando_aluno', 'encaminhado'])('legado %s vira Em investigação', v => {
    expect(rotuloStatus(v)).toBe('Em investigação');
  });
  it('status desconhecido', () => { expect(rotuloStatus('xyz')).toBe('Status indisponível'); });
  it('desfechos', () => {
    expect(rotuloDesfecho('solucionada')).toBe('Situação solucionada');
    expect(rotuloDesfecho('intervencao_realizada')).toBe('Intervenção realizada');
  });
  it('data legível', () => {
    expect(dataLegivel('lixo')).toBe('Data indisponível');
    expect(dataLegivel('2026-10-15T12:00:00Z')).not.toBe('Data indisponível');
  });
});
