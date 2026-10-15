import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PosResolucao from './PosResolucao';
import { ErroApi } from '../shared/api';
import type { Caso } from '../shared/api';

const caso = (extra: Partial<Caso> = {}): Caso => ({
  status: 'resolvido', mensagens: [], pos_resolucao: true, ultima_situacao: null,
  resolucao: { desfecho: 'solucionada', providencias: 'Conversamos com a turma.\nAcompanhamos a semana.', resultado: 'Tudo certo', criado_em: '2026-10-14T12:00:00Z' },
  ...extra,
});

describe('PosResolucao', () => {
  it('mostra a resolução como texto, com desfecho e data', () => {
    render(<PosResolucao caso={caso({ resolucao: { desfecho: 'intervencao_realizada', providencias: '<b>x</b>', resultado: '<i>y</i>', criado_em: '2026-10-14T12:00:00Z' } })} aoInformar={vi.fn()} ocupado={false} />);
    expect(screen.getByRole('heading', { name: 'Seu caso foi resolvido' })).toBeInTheDocument();
    expect(screen.getByText('Intervenção realizada')).toBeInTheDocument();
    expect(screen.getByText('<b>x</b>')).toBeInTheDocument();
    expect(screen.getByText('<i>y</i>')).toBeInTheDocument();
    expect(document.querySelector('b, i')).toBeNull();
    expect(document.querySelector('time')).toHaveAttribute('datetime', '2026-10-14T12:00:00Z');
  });
  it('pergunta como o aluno está e agradece ao informar "melhorou"', async () => {
    const user = userEvent.setup();
    const aoInformar = vi.fn().mockResolvedValue(undefined);
    render(<PosResolucao caso={caso()} aoInformar={aoInformar} ocupado={false} />);
    expect(screen.getByText('Como você está agora?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(aoInformar).toHaveBeenCalledWith('melhorou');
    expect(await screen.findByRole('status')).toHaveTextContent('Obrigado por contar. A equipe vai ver.');
  });
  it('agradece de outro jeito quando voltou a acontecer', async () => {
    const user = userEvent.setup();
    render(<PosResolucao caso={caso()} aoInformar={vi.fn().mockResolvedValue(undefined)} ocupado={false} />);
    await user.click(screen.getByRole('button', { name: 'Voltou a acontecer' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Obrigado por contar. A equipe vai rever o que foi feito.');
  });
  it('mostra a última situação informada e permite informar de novo', async () => {
    const user = userEvent.setup();
    const aoInformar = vi.fn().mockResolvedValue(undefined);
    render(<PosResolucao caso={caso({ ultima_situacao: 'voltou' })} aoInformar={aoInformar} ocupado={false} />);
    expect(screen.getByText('Você informou: Voltou a acontecer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(aoInformar).toHaveBeenCalledWith('melhorou');
  });
  it('desabilita os botões enquanto ocupado', () => {
    render(<PosResolucao caso={caso()} aoInformar={vi.fn()} ocupado />);
    expect(screen.getByRole('button', { name: 'Melhorou' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltou a acontecer' })).toBeDisabled();
  });
  it('não envia duas vezes com duplo clique', async () => {
    const user = userEvent.setup();
    let liberar: () => void = () => {};
    const aoInformar = vi.fn().mockReturnValue(new Promise<void>(r => { liberar = r; }));
    render(<PosResolucao caso={caso()} aoInformar={aoInformar} ocupado={false} />);
    await user.dblClick(screen.getByRole('button', { name: 'Melhorou' }));
    expect(aoInformar).toHaveBeenCalledTimes(1);
    liberar();
    expect(await screen.findByRole('status')).toHaveTextContent('Obrigado por contar');
  });
  it('429 mostra a mensagem de espera e mantém os botões', async () => {
    const user = userEvent.setup();
    render(<PosResolucao caso={caso()} aoInformar={vi.fn().mockRejectedValue(new ErroApi(429))} ocupado={false} />);
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Tente de novo em alguns minutos.');
    expect(screen.queryByText(/Obrigado por contar/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Melhorou' })).toBeEnabled();
  });
  it('409 e falha de rede mostram a mensagem da situação', async () => {
    const user = userEvent.setup();
    const aoInformar = vi.fn().mockRejectedValueOnce(new ErroApi(409)).mockRejectedValueOnce(new ErroApi(0));
    render(<PosResolucao caso={caso()} aoInformar={aoInformar} ocupado={false} />);
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse caso ainda não foi resolvido.');
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText(/Não foi possível conectar/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seu caso foi resolvido' })).toBeInTheDocument();
  });
  it('leva o foco ao título do bloco depois de informar', async () => {
    const user = userEvent.setup();
    render(<PosResolucao caso={caso()} aoInformar={vi.fn().mockResolvedValue(undefined)} ocupado={false} />);
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    await screen.findByRole('status');
    expect(screen.getByRole('heading', { name: 'Seu caso foi resolvido' })).toHaveFocus();
  });
  it('não aparece sem pos_resolucao ou sem resolução (caso reaberto)', () => {
    const { rerender } = render(<PosResolucao caso={caso({ pos_resolucao: false })} aoInformar={vi.fn()} ocupado={false} />);
    expect(screen.queryByText('Seu caso foi resolvido')).toBeNull();
    rerender(<PosResolucao caso={caso({ resolucao: null })} aoInformar={vi.fn()} ocupado={false} />);
    expect(screen.queryByText('Seu caso foi resolvido')).toBeNull();
  });
});
