import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RegistrarResolucao from './RegistrarResolucao';

const montar = (confirmar = vi.fn().mockResolvedValue(undefined), ocupado = false) => {
  const user = userEvent.setup();
  render(<RegistrarResolucao aoConfirmar={confirmar} ocupado={ocupado} />);
  return { user, confirmar };
};

describe('RegistrarResolucao', () => {
  it('mostra o título, o grupo de desfecho sem opção marcada, as dicas e a autoria automática', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Registrar resolução' })).toBeInTheDocument();
    const grupo = screen.getByRole('group', { name: 'Desfecho' });
    const opcoes = screen.getAllByRole('radio');
    expect(opcoes.map(o => (o as HTMLInputElement).labels?.[0].textContent)).toEqual(['Situação solucionada', 'Intervenção realizada']);
    expect(grupo).toContainElement(opcoes[0]);
    opcoes.forEach(o => expect(o).not.toBeChecked());
    expect(screen.getByLabelText('Providências')).toHaveAttribute('maxlength', '2000');
    expect(screen.getByLabelText('Resultado observado')).toHaveAttribute('maxlength', '2000');
    expect(screen.getAllByText('Visível para o aluno')).toHaveLength(2);
    expect(screen.getByText('Registrado automaticamente com o seu nome e a data de hoje')).toBeInTheDocument();
    expect(screen.getByText('Para resolver, registre a resolução')).toBeInTheDocument();
  });

  it('sem desfecho ou sem providências mostra a mensagem do campo e não envia', async () => {
    const { user, confirmar } = montar();
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(screen.getByText('Escolha o desfecho.')).toBeInTheDocument();
    expect(screen.getByText('Escreva de 1 a 2000 caracteres.')).toBeInTheDocument();
    const providencias = screen.getByLabelText('Providências');
    expect(providencias).toHaveAttribute('aria-invalid', 'true');
    expect(providencias.getAttribute('aria-describedby')).toContain('erro-providencias');
    expect(document.getElementById('erro-providencias')).toHaveTextContent('Escreva de 1 a 2000 caracteres.');
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    await user.click(screen.getAllByRole('radio')[0]);
    await user.type(providencias, '   ');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(providencias).toHaveFocus();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('a mensagem de erro some ao digitar e ao escolher', async () => {
    const { user } = montar();
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    await user.type(screen.getByLabelText('Providências'), 'a');
    expect(screen.queryByText('Escreva de 1 a 2000 caracteres.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Providências')).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByLabelText('Intervenção realizada'));
    expect(screen.queryByText('Escolha o desfecho.')).not.toBeInTheDocument();
  });

  it('envia os textos aparados e o resultado pode ficar vazio', async () => {
    const { user, confirmar } = montar();
    await user.click(screen.getByLabelText('Intervenção realizada'));
    await user.type(screen.getByLabelText('Providências'), '  Conversei com a turma  ');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).toHaveBeenCalledWith({ desfecho: 'intervencao_realizada', providencias: 'Conversei com a turma', resultado: '' });
  });

  it('envia o resultado aparado quando preenchido', async () => {
    const { user, confirmar } = montar();
    await user.click(screen.getByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'p');
    await user.type(screen.getByLabelText('Resultado observado'), ' parou ');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).toHaveBeenCalledWith({ desfecho: 'solucionada', providencias: 'p', resultado: 'parou' });
  });

  it('falha no envio mantém os textos e devolve o foco às providências', async () => {
    const { user } = montar(vi.fn().mockRejectedValue(new Error('x')));
    await user.click(screen.getByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'texto');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Providências')).toHaveFocus());
    expect(screen.getByLabelText('Providências')).toHaveValue('texto');
    expect(screen.getByLabelText('Situação solucionada')).toBeChecked();
  });

  it('ocupado desabilita os controles', () => {
    montar(undefined, true);
    expect(screen.getByLabelText('Providências')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Registrar resolução' })).toBeDisabled();
  });
});
