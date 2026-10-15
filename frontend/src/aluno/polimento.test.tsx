import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import Confirmacao from './Confirmacao';
import Acompanhar from './Acompanhar';

const responder = (body: unknown, status = 200) => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

// Foco, rascunho e miniaturas do pedido migraram para Denuncia.test.tsx.

describe('Confirmação', () => {
  it('copia o código e avisa; avisa também quando a cópia falha', async () => {
    const user = userEvent.setup();
    const gravar = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('negado'));
    vi.stubGlobal('navigator', { clipboard: { writeText: gravar } });
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(gravar).toHaveBeenCalledWith('K7M2-9QXD');
    expect(await screen.findByText(/Código copiado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(await screen.findByText(/Não foi possível copiar/)).toBeInTheDocument();
  });
});

describe('Início', () => {
  it('pede o código quando o campo está vazio e não consulta', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Digite seu código');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Acompanhar em StrictMode', () => {
  it('consulta o caso uma única vez e mostra o resultado', async () => {
    responder({ status: 'em_analise', mensagens: [{ autor: 'coordenacao', texto: 'Olá, aluno', criado_em: '2026-10-14T12:00:00Z' }] });
    render(<StrictMode><Acompanhar codigoInicial="K7M2-9QXD" /></StrictMode>);
    expect(await screen.findByText('Olá, aluno')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
