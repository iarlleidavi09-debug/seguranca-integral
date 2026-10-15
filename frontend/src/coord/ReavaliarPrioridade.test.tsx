import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ReavaliarPrioridade from './ReavaliarPrioridade';

const abrir = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Reavaliar prioridade' }));
};

describe('ReavaliarPrioridade', () => {
  it('abre o formulário com as 4 prioridades e o campo Justificativa limitado a 2000', async () => {
    const user = userEvent.setup();
    render(<ReavaliarPrioridade atual="media" aoConfirmar={vi.fn()} ocupado={false} />);
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
    await abrir(user);
    const seletor = screen.getByLabelText('Nova prioridade');
    expect(seletor).toHaveFocus();
    expect(Array.from((seletor as HTMLSelectElement).options).map(o => o.text)).toEqual(['Crítica', 'Alta', 'Média', 'Baixa']);
    const campo = screen.getByLabelText('Justificativa');
    expect(campo).toHaveAttribute('maxlength', '2000');
    expect(screen.getByText('0 de 2000')).toBeInTheDocument();
    await user.type(campo, 'abc');
    expect(screen.getByText('3 de 2000')).toBeInTheDocument();
  });

  it('justificativa vazia ou só com espaços mostra a mensagem e não envia', async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn().mockResolvedValue(undefined);
    render(<ReavaliarPrioridade atual="media" aoConfirmar={confirmar} ocupado={false} />);
    await abrir(user);
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'alta');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva de 1 a 2000 caracteres.');
    await user.type(screen.getByLabelText('Justificativa'), '   ');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva de 1 a 2000 caracteres.');
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('a mesma prioridade desabilita Confirmar', async () => {
    const user = userEvent.setup();
    render(<ReavaliarPrioridade atual="media" aoConfirmar={vi.fn()} ocupado={false} />);
    await abrir(user);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'baixa');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'media');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('sucesso envia a justificativa sem espaços nas pontas, fecha e devolve o foco ao botão', async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn().mockResolvedValue(undefined);
    render(<ReavaliarPrioridade atual="media" aoConfirmar={confirmar} ocupado={false} />);
    const gatilho = screen.getByRole('button', { name: 'Reavaliar prioridade' });
    await user.click(gatilho);
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'critica');
    await user.type(screen.getByLabelText('Justificativa'), '  Há ameaça nova  ');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(confirmar).toHaveBeenCalledWith('critica', 'Há ameaça nova');
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(gatilho).toHaveFocus());
  });

  it('durante o envio os controles ficam desabilitados', async () => {
    const user = userEvent.setup();
    let liberar: () => void = () => {};
    const confirmar = vi.fn(() => new Promise<void>(r => { liberar = r; }));
    render(<ReavaliarPrioridade atual="media" aoConfirmar={confirmar} ocupado={false} />);
    await abrir(user);
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'alta');
    await user.type(screen.getByLabelText('Justificativa'), 'motivo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByLabelText('Nova prioridade')).toBeDisabled();
    expect(screen.getByLabelText('Justificativa')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await act(async () => { liberar(); });
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
  });

  it('ocupado vindo de fora também desabilita os controles', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReavaliarPrioridade atual="media" aoConfirmar={vi.fn()} ocupado={false} />);
    await abrir(user);
    rerender(<ReavaliarPrioridade atual="media" aoConfirmar={vi.fn()} ocupado />);
    expect(screen.getByLabelText('Justificativa')).toBeDisabled();
  });

  it('falha mantém o formulário aberto e o texto digitado', async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn().mockRejectedValue(new Error('falhou'));
    render(<ReavaliarPrioridade atual="media" aoConfirmar={confirmar} ocupado={false} />);
    await abrir(user);
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'alta');
    await user.type(screen.getByLabelText('Justificativa'), 'meu motivo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByLabelText('Justificativa')).toHaveValue('meu motivo');
    expect(screen.getByLabelText('Nova prioridade')).toHaveValue('alta');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled());
  });

  it('Cancelar e Escape fecham sem enviar e devolvem o foco', async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn();
    render(<ReavaliarPrioridade atual="media" aoConfirmar={confirmar} ocupado={false} />);
    const gatilho = screen.getByRole('button', { name: 'Reavaliar prioridade' });
    await user.click(gatilho);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(gatilho).toHaveFocus());
    await user.click(gatilho);
    await user.type(screen.getByLabelText('Justificativa'), 'x');
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(gatilho).toHaveFocus());
    await user.click(gatilho);
    expect(screen.getByLabelText('Justificativa')).toHaveValue('');
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe('ReavaliarPrioridade: acessibilidade do erro', () => {
  it('o erro liga o campo por aria-invalid e aria-describedby e some ao digitar', async () => {
    const user = userEvent.setup();
    render(<ReavaliarPrioridade atual="media" aoConfirmar={vi.fn()} ocupado={false} />);
    await abrir(user);
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'alta');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    const campo = screen.getByLabelText('Justificativa');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    const alvo = campo.getAttribute('aria-describedby')!.split(' ').find(i => document.getElementById(i)?.textContent === 'Escreva de 1 a 2000 caracteres.');
    expect(alvo).toBeTruthy();
    expect(campo).toHaveFocus();
    await user.type(campo, 'a');
    expect(screen.queryByText('Escreva de 1 a 2000 caracteres.')).not.toBeInTheDocument();
    expect(campo).not.toHaveAttribute('aria-invalid');
  });

  it('falha no envio devolve o foco à justificativa', async () => {
    const user = userEvent.setup();
    render(<ReavaliarPrioridade atual="media" aoConfirmar={vi.fn().mockRejectedValue(new Error('x'))} ocupado={false} />);
    await abrir(user);
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'alta');
    await user.type(screen.getByLabelText('Justificativa'), 'motivo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Justificativa')).toHaveFocus());
  });
});
