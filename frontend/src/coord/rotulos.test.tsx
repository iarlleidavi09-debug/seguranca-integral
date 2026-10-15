import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Evento } from '../shared/api';
import { Prioridade, Status, acessoLegivel, descricaoEvento, motivo, prioridade, status } from './rotulos';

const ev = (tipo: string, detalhe = '', usuario: string | null = 'Ana'): Evento =>
  ({ id: 1, tipo, usuario_id: 1, usuario, detalhe, criado_em: '2026-10-14T10:00:00+00:00' });

describe('Rótulos da v2', () => {
  it('status antigos viram Em investigação', () => {
    for (const v of ['em_analise', 'aguardando_aluno', 'encaminhado']) expect(status(v)).toBe('Em investigação');
    expect(status('novo')).toBe('Novo');
    expect(status('resolvido')).toBe('Resolvido');
  });
  it('prioridades', () => {
    expect(prioridade('critica')).toBe('Crítica');
    expect(prioridade('media')).toBe('Média');
  });
  it('motivos de alerta ganham acento', () => {
    expect(motivo('alerta: ameaca com violencia em andamento')).toBe('Alerta: ameaça com violência em andamento');
    expect(motivo('alerta: risco de automutilacao em andamento')).toBe('Alerta: risco de automutilação em andamento');
    expect(motivo('alerta: conteudo intimo com extorsao')).toBe('Alerta: conteúdo íntimo com extorsão');
    expect(motivo('tipo: ameaca')).toBe('Tipo: Ameaça');
  });
  it('descreve eventos', () => {
    expect(descricaoEvento(ev('criado', 'prioridade alta', null))).toBe('Caso recebido com prioridade alta');
    expect(descricaoEvento(ev('criado', 'gravidade alta', null))).toBe('Caso recebido com prioridade alta');
    expect(descricaoEvento(ev('status', 'status: novo -> em_investigacao'))).toBe('Status mudou de Novo para Em investigação por Ana');
    expect(descricaoEvento(ev('prioridade', 'media -> critica: motivo X'))).toBe('Prioridade mudou de Média para Crítica por Ana. Motivo: motivo X');
    expect(descricaoEvento(ev('gravidade', 'media -> critica: motivo X'))).toBe('Prioridade mudou de Média para Crítica por Ana. Motivo: motivo X');
    expect(descricaoEvento(ev('resolucao', 'solucionada'))).toBe('Caso resolvido por Ana: situação solucionada');
    expect(descricaoEvento(ev('resolucao', 'intervencao_realizada'))).toBe('Caso resolvido por Ana: intervenção realizada');
    expect(descricaoEvento(ev('recorrencia', 'voltou a acontecer', null))).toBe('O aluno informou que a situação voltou a acontecer');
    expect(descricaoEvento(ev('revisao_recorrencia', ''))).toBe('Recorrência revisada por Ana');
    expect(() => descricaoEvento(ev('tipo_novo', 'x'))).not.toThrow();
    expect(descricaoEvento(ev('tipo_novo', 'x'))).toContain('tipo_novo');
  });
  it('acesso legível', () => {
    expect(acessoLegivel(null, null)).toBe('Ainda não acessado');
    expect(acessoLegivel('Ana', '2026-10-14T10:00:00+00:00')).toMatch(/^Ana, \d/);
  });
  it('selos mostram texto e forma', () => {
    render(<><Prioridade valor="critica" /><Status valor="em_investigacao" /></>);
    expect(screen.getByText('Crítica')).toBeInTheDocument();
    expect(screen.getByText('Em investigação')).toBeInTheDocument();
  });
});
