import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RegistrarResolucao from './RegistrarResolucao';

const montar = (confirmar = vi.fn().mockResolvedValue(undefined), ocupado = false) => {
  const user = userEvent.setup();
  render(<RegistrarResolucao aoConfirmar={confirmar} ocupado={ocupado} />);
  return { user, confirmar };
};

const autoriaDesconhecida = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText('Autoria não identificada'));
  await user.type(screen.getByLabelText('Justificativa interna'), 'Apuração sem identificação');
};

describe('RegistrarResolucao: autoria interna', () => {
  it('exige nome, ano e sala dos autores antes de finalizar', async () => {
    const { user, confirmar } = montar();
    await user.click(screen.getByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'Acolhimento');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).not.toHaveBeenCalled();
    for (const campo of ['Nome', 'Ano', 'Sala']) expect(screen.getByLabelText(`${campo} do autor 1`)).toHaveAttribute('aria-invalid', 'true');
  });

  it('envia vários autores e foto opcional sem misturar com os textos do aluno e preserva em falha', async () => {
    const { user, confirmar } = montar(vi.fn().mockRejectedValue(new Error('409')));
    await user.click(screen.getByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'Texto público');
    await user.type(screen.getByLabelText('Nome do autor 1'), ' Ana ');
    await user.type(screen.getByLabelText('Ano do autor 1'), ' 7º ');
    await user.type(screen.getByLabelText('Sala do autor 1'), ' B ');
    const foto = new File(['foto'], 'ana.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Foto do autor 1 (opcional)'), foto);
    await user.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    await user.type(screen.getByLabelText('Nome do autor 2'), 'Bruno');
    await user.type(screen.getByLabelText('Ano do autor 2'), '8º');
    await user.type(screen.getByLabelText('Sala do autor 2'), 'A');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).toHaveBeenCalledWith({ desfecho: 'solucionada', providencias: 'Texto público', resultado: '', autoria: 'identificada', justificativa_autoria: '', autores: [{ nome: 'Ana', ano: '7º', sala: 'B', foto }, { nome: 'Bruno', ano: '8º', sala: 'A' }] });
    expect(screen.getByLabelText('Nome do autor 1')).toHaveValue(' Ana ');
    expect((screen.getByLabelText('Foto do autor 1 (opcional)') as HTMLInputElement).files?.[0]).toBe(foto);
    await user.click(screen.getByRole('button', { name: 'Remover autor 1' }));
    expect(screen.getByLabelText('Nome do autor 1')).toHaveValue('Bruno');
  });

  it('exige justificativa interna e omite autores quando não identificados', async () => {
    const { user, confirmar } = montar();
    await user.click(screen.getByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'Acolhimento');
    await user.type(screen.getByLabelText('Nome do autor 1'), 'Rascunho');
    await user.click(screen.getByLabelText('Autoria não identificada'));
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Justificativa interna')).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('Justificativa interna'), '  Não foi possível identificar  ');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).toHaveBeenCalledWith({ desfecho: 'solucionada', providencias: 'Acolhimento', resultado: '', autoria: 'nao_identificada', justificativa_autoria: 'Não foi possível identificar', autores: [] });
  });

  it('rejeita foto acima de 5 MiB ou de formato diferente e permite corrigir', async () => {
    const { user } = montar();
    const foto = screen.getByLabelText('Foto do autor 1 (opcional)');
    await userEvent.setup({ applyAccept: false }).upload(foto, new File(['x'], 'foto.gif', { type: 'image/gif' }));
    expect(screen.getByText('Use uma imagem JPG, PNG ou WebP de até 5 MiB.')).toBeInTheDocument();
    await user.upload(foto, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' }));
    expect(screen.getByText('Use uma imagem JPG, PNG ou WebP de até 5 MiB.')).toBeInTheDocument();
    await user.upload(foto, new File(['x'], 'foto.webp', { type: 'image/webp' }));
    expect(screen.queryByText('Use uma imagem JPG, PNG ou WebP de até 5 MiB.')).not.toBeInTheDocument();
  });

  it('limita a dez autores e permite remover antes de adicionar outro', async () => {
    const { user } = montar();
    for (let i = 1; i < 10; i++) await user.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    expect(screen.getByRole('button', { name: 'Adicionar autor' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remover autor 5' }));
    expect(screen.getByRole('button', { name: 'Adicionar autor' })).toBeEnabled();
    expect(screen.queryByLabelText('Nome do autor 10')).not.toBeInTheDocument();
  });

  it('mantém a foto selecionada visível ao alternar a autoria e permite removê-la', async () => {
    const { user } = montar();
    await user.upload(screen.getByLabelText('Foto do autor 1 (opcional)'), new File(['foto'], 'ana.png', { type: 'image/png' }));
    await user.click(screen.getByLabelText('Autoria não identificada'));
    await user.click(screen.getByLabelText('Autoria identificada'));
    expect(screen.getByText('Foto selecionada: ana.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover foto do autor 1' }));
    expect(screen.queryByText('Foto selecionada: ana.png')).not.toBeInTheDocument();
  });
});

describe('RegistrarResolucao', () => {
  it('mostra o título, o grupo de desfecho sem opção marcada, as dicas e a autoria automática', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Registrar resolução' })).toBeInTheDocument();
    const grupo = screen.getByRole('group', { name: 'Desfecho' });
    const opcoes = screen.getAllByRole('radio', { name: /Situação solucionada|Intervenção realizada/ });
    expect(opcoes.map(o => (o as HTMLInputElement).labels?.[0].textContent)).toEqual(['Situação solucionada', 'Intervenção realizada']);
    expect(grupo).toContainElement(opcoes[0]);
    opcoes.forEach(o => expect(o).not.toBeChecked());
    expect(screen.getByLabelText('Providências')).toHaveAttribute('maxlength', '2000');
    expect(screen.getByLabelText('Resultado observado')).toHaveAttribute('maxlength', '2000');
    expect(screen.getAllByText('Visível para o aluno.')).toHaveLength(2);
    expect(screen.getByText('Registrado automaticamente com o seu nome e a data de hoje.')).toBeInTheDocument();
    expect(screen.getByText('Para resolver, registre a resolução.')).toBeInTheDocument();
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
    await autoriaDesconhecida(user);
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).toHaveBeenCalledWith({ desfecho: 'intervencao_realizada', providencias: 'Conversei com a turma', resultado: '', autoria: 'nao_identificada', justificativa_autoria: 'Apuração sem identificação', autores: [] });
  });

  it('envia o resultado aparado quando preenchido', async () => {
    const { user, confirmar } = montar();
    await user.click(screen.getByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'p');
    await user.type(screen.getByLabelText('Resultado observado'), ' parou ');
    await autoriaDesconhecida(user);
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(confirmar).toHaveBeenCalledWith({ desfecho: 'solucionada', providencias: 'p', resultado: 'parou', autoria: 'nao_identificada', justificativa_autoria: 'Apuração sem identificação', autores: [] });
  });

  it('falha no envio mantém os textos e devolve o foco às providências', async () => {
    const { user } = montar(vi.fn().mockRejectedValue(new Error('x')));
    await user.click(screen.getByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'texto');
    await autoriaDesconhecida(user);
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
