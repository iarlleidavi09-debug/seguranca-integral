import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { limparRascunhosAtendimento } from './rascunhosAtendimento';
import Atendimento from './Atendimento';
import { servidor } from './testes/servidor';
import type { CasoDetalhe } from '../shared/api';

const caso = { id: 1, revisao_estado: 3, responsavel: null, proxima_acao: null, prazo_acao: null } as unknown as CasoDetalhe;
afterEach(limparRascunhosAtendimento);

describe('Atendimento interno', () => {
  it('resume responsável e ação em uma linha', () => {
    servidor({ 'GET /api/equipe': () => ({ corpo: { usuarios: [] } }) });
    const { unmount } = render(<Atendimento caso={caso} ocupado={false} aoSalvar={vi.fn()} aoConcluir={vi.fn()} />);
    expect(screen.getByText(/Responsável:/)).toHaveTextContent('Responsável: Sem responsável · Próxima ação: Nenhuma pendente');
    unmount();
    render(<Atendimento caso={{ ...caso, responsavel: { id: 2, nome: 'Ana', ativo: true }, proxima_acao: 'Ligar', prazo_acao: '2026-10-20' }} ocupado={false} aoSalvar={vi.fn()} aoConcluir={vi.fn()} />);
    expect(screen.getByText(/Responsável:/)).toHaveTextContent('Responsável: Ana · Próxima ação: Ligar até 20/10');
  });

  it('mostra a síntese e deixa a edição recolhida até ser solicitada', async () => {
    servidor({ 'GET /api/equipe': () => ({ corpo: { usuarios: [] } }) });
    render(<Atendimento caso={caso} ocupado={false} aoSalvar={vi.fn()} aoConcluir={vi.fn()} />);
    const editar = screen.getByText('Editar responsável e ação');
    expect(editar.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(editar);
    expect(editar.closest('details')).toHaveAttribute('open');
  });
  it('salva responsável, ação, data e revisão capturada ao editar', async () => {
    servidor({ 'GET /api/equipe': () => ({ corpo: { usuarios: [{ id: 2, nome: 'Ana' }] } }) });
    const salvar = vi.fn().mockResolvedValue(true);
    const { rerender } = render(<Atendimento caso={caso} ocupado={false} aoSalvar={salvar} aoConcluir={vi.fn()} />);
    await screen.findByRole('option', { name: 'Ana' });
    fireEvent.change(screen.getByLabelText('Responsável pelo caso'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Próxima ação'), { target: { value: 'Conversar amanhã' } });
    fireEvent.change(screen.getByLabelText('Prazo da ação'), { target: { value: '2026-10-20' } });
    rerender(<Atendimento caso={{ ...caso, revisao_estado: 4 }} ocupado={false} aoSalvar={salvar} aoConcluir={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atendimento' }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith({ responsavel_id: 2, proxima_acao: 'Conversar amanhã', prazo_acao: '2026-10-20' }, 3));
  });

  it('preserva texto em conflito e exige conferência antes de reenviar', async () => {
    servidor({ 'GET /api/equipe': () => ({ corpo: { usuarios: [] } }) });
    const salvar = vi.fn().mockResolvedValue(false);
    const { rerender } = render(<Atendimento caso={caso} ocupado={false} aoSalvar={salvar} aoConcluir={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Responsável pelo caso')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Próxima ação'), { target: { value: 'Texto preservado' } });
    fireEvent.change(screen.getByLabelText('Prazo da ação'), { target: { value: '2026-10-20' } });
    rerender(<Atendimento caso={{ ...caso, revisao_estado: 4 }} ocupado={false} aoSalvar={salvar} aoConcluir={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atendimento' }));
    await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Próxima ação')).toHaveValue('Texto preservado');
    expect(await screen.findByRole('button', { name: 'Conferi o atendimento atualizado' })).toBeInTheDocument();
  });

  it('conclui ação existente e permite tentar novamente ao falhar a equipe', async () => {
    servidor({ 'GET /api/equipe': () => ({ status: 503, corpo: {} }) });
    const concluir = vi.fn().mockResolvedValue(true);
    render(<Atendimento caso={{ ...caso, proxima_acao: 'Checar aluno', prazo_acao: '2026-10-20' }} ocupado={false} aoSalvar={vi.fn()} aoConcluir={concluir} />);
    fireEvent.click(screen.getByText('Editar responsável e ação'));
    expect(await screen.findByRole('button', { name: 'Tentar carregar equipe novamente' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir ação' }));
    expect(concluir).toHaveBeenCalledWith(3);
  });

  it('oferece conferência quando a recarga do conflito chega depois da resposta', async () => {
    servidor({ 'GET /api/equipe': () => ({ corpo: { usuarios: [] } }) });
    const salvar = vi.fn().mockResolvedValue(false);
    const { rerender } = render(<Atendimento caso={caso} ocupado={false} aoSalvar={salvar} aoConcluir={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Responsável pelo caso')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Próxima ação'), { target: { value: 'Rascunho local' } });
    fireEvent.change(screen.getByLabelText('Prazo da ação'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atendimento' }));
    await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
    rerender(<Atendimento caso={{ ...caso, revisao_estado: 4 }} ocupado={false} aoSalvar={salvar} aoConcluir={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Conferi o atendimento atualizado' })).toBeInTheDocument();
    expect(screen.getByLabelText('Próxima ação')).toHaveValue('Rascunho local');
  });
});
