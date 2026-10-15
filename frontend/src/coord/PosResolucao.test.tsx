import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PosResolucao from './PosResolucao';
import type { CasoDetalhe } from '../shared/api';

const caso = (extra: Partial<CasoDetalhe> = {}) => ({
  id: 5, status: 'resolvido', recorrencia_pendente: false, resolucoes: [], situacoes: [], revisoes_recorrencia: [], ...extra,
}) as unknown as CasoDetalhe;
const resolucao = (extra = {}) => ({ desfecho: 'intervencao_realizada', providencias: 'Conversa com a turma', resultado: 'Os ataques pararam', usuario: 'Marina', criado_em: '2026-10-10T10:00:00+00:00', ...extra });

describe('PosResolucao', () => {
  it('com recorrência pendente mostra o alerta com ícone, orientação e botão', async () => {
    const aoRevisar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PosResolucao caso={caso({ recorrencia_pendente: true, resolucoes: [resolucao()] as any })} aoRevisar={aoRevisar} ocupado={false} />);
    const alerta = screen.getByRole('alert');
    expect(within(alerta).getByRole('heading', { name: 'Situação voltou a acontecer' })).toBeInTheDocument();
    expect(alerta).toHaveTextContent('Revise o resultado da intervenção anterior e avalie medidas mais efetivas');
    expect(alerta.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Registrar revisão' }));
    expect(aoRevisar).toHaveBeenCalledTimes(1);
  });

  it('o alerta só é anunciado na primeira exibição', () => {
    const { rerender } = render(<PosResolucao caso={caso({ recorrencia_pendente: true })} aoRevisar={vi.fn()} ocupado={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<PosResolucao caso={caso({ recorrencia_pendente: true })} aoRevisar={vi.fn()} ocupado />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Situação voltou a acontecer' })).toBeInTheDocument();
  });

  it('sem pendência não há alerta nem botão de revisão', () => {
    render(<PosResolucao caso={caso({ resolucoes: [resolucao()] as any })} aoRevisar={vi.fn()} ocupado={false} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar revisão' })).not.toBeInTheDocument();
    expect(screen.queryByText('Situação voltou a acontecer')).not.toBeInTheDocument();
  });

  it('mostra a resolução mais recente, situações e revisões', () => {
    render(<PosResolucao aoRevisar={vi.fn()} ocupado={false} caso={caso({
      resolucoes: [resolucao({ providencias: 'Primeira tentativa', usuario: 'Paulo' }), resolucao({ providencias: 'Segunda tentativa', resultado: 'Melhorou bastante' })] as any,
      situacoes: [{ situacao: 'melhorou', criado_em: '2026-10-11T10:00:00+00:00' }, { situacao: 'voltou', criado_em: '2026-10-12T10:00:00+00:00' }],
      revisoes_recorrencia: [{ usuario: 'Rita', criado_em: '2026-10-13T10:00:00+00:00' }],
    })} />);
    expect(screen.getByText('Segunda tentativa')).toBeInTheDocument();
    expect(screen.queryByText('Primeira tentativa')).not.toBeInTheDocument();
    expect(screen.getByText('Melhorou bastante')).toBeInTheDocument();
    expect(screen.getByText(/Intervenção realizada/)).toBeInTheDocument();
    expect(screen.getByText(/por Marina/)).toBeInTheDocument();
    expect(screen.getByText(/^Melhorou/, { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText(/^Voltou a acontecer/, { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText(/Revisado por Rita/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/intervencao_realizada|voltou\b/);
  });

  it('sem registros mostra os avisos vazios sem quebrar', () => {
    render(<PosResolucao caso={caso({ status: 'em_investigacao', recorrencia_pendente: true })} aoRevisar={vi.fn()} ocupado={false} />);
    expect(screen.getByRole('button', { name: 'Registrar revisão' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma resolução registrada.')).toBeInTheDocument();
  });

  it('falha ao revisar devolve o foco ao botão; sucesso foca o título do bloco', async () => {
    const user = userEvent.setup();
    const aoRevisar = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    render(<PosResolucao caso={caso({ recorrencia_pendente: true })} aoRevisar={aoRevisar} ocupado={false} />);
    await user.click(screen.getByRole('button', { name: 'Registrar revisão' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Registrar revisão' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Registrar revisão' }));
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Acompanhamento após a resolução' })).toHaveFocus();
  });

  it('ocupado desabilita o botão', () => {
    render(<PosResolucao caso={caso({ recorrencia_pendente: true })} aoRevisar={vi.fn()} ocupado />);
    expect(screen.getByRole('button', { name: 'Registrar revisão' })).toBeDisabled();
  });
});
