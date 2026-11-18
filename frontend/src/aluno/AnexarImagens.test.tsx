import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnexarImagens from './AnexarImagens';

describe('Enviar imagens ao caso existente', () => {
  it('envia código no corpo e mostra os arquivos recusados sem duplicar os enviados', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ anexos_adicionados: 1, anexos_total: 2,
      anexos_recusados: [{ nome: 'ruim.png', motivo: 'arquivo corrompido' }] }), { status: 201 }));
    const atualizou = vi.fn();
    render(<AnexarImagens codigo="K7M2-9QXD" totalInicial={1} aoEnviar={atualizou} />);
    await user.click(screen.getByText('Adicionar imagens'));
    const input = screen.getByLabelText('Selecionar imagens');
    await user.upload(input, [new File(['imagem'], 'boa.png', { type: 'image/png' }), new File(['ruim'], 'ruim.png', { type: 'image/png' })]);
    await user.click(screen.getByRole('button', { name: 'Enviar imagens' }));
    expect(await screen.findByText('1 imagem enviada para a coordenação.')).toBeInTheDocument();
    expect(screen.getByText(/ruim.png: arquivo corrompido/)).toBeInTheDocument();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/acompanhar/anexos');
    expect((init?.body as FormData).get('codigo')).toBe('K7M2-9QXD');
    expect((init?.body as FormData).getAll('anexos[]')).toHaveLength(2);
    expect(input).toHaveValue('');
    expect(atualizou).toHaveBeenCalledWith(2);
    expect(localStorage.length).toBe(0);
  });

  it('mantém os arquivos selecionados se a rede falha e permite tentar de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    render(<AnexarImagens codigo="K7M2-9QXD" totalInicial={0} aoEnviar={vi.fn()} />);
    await user.click(screen.getByText('Adicionar imagens'));
    await user.upload(screen.getByLabelText('Selecionar imagens'), new File(['imagem'], 'foto.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Enviar imagens' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
    expect(screen.getByRole('button', { name: 'Enviar imagens' })).toBeEnabled();
    expect(screen.getByText('foto.png')).toBeInTheDocument();
  });

  it('bloqueia uma seleção que ultrapassa o total restante', async () => {
    const user = userEvent.setup();
    render(<AnexarImagens codigo="K7M2-9QXD" totalInicial={4} aoEnviar={vi.fn()} />);
    await user.click(screen.getByText('Adicionar imagens'));
    await user.upload(screen.getByLabelText('Selecionar imagens'), ['a', 'b'].map(name => new File(['imagem'], `${name}.png`, { type: 'image/png' })));
    expect(screen.getByRole('alert')).toHaveTextContent('mais 1 imagem');
    expect(screen.getByRole('button', { name: 'Enviar imagens' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
