import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

const responder = (body: unknown, status = 200) => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

// Os testes do pedido de ajuda foram migrados para Denuncia.test.tsx.
describe('Portal do aluno', () => {
  it('mostra mensagens, normaliza o código no corpo POST e permite responder', async () => {
    const user = userEvent.setup();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    responder({ status: 'aguardando_aluno', mensagens: [{ autor: 'coordenacao', texto: '<img src=x onerror=alert(1)>', criado_em: '2026-10-14T12:00:00Z' }] });
    await user.type(screen.getByLabelText('Acompanhar meu caso'), ' k7m2 9qxd ');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByText('Aguardando sua resposta')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/acompanhar', expect.objectContaining({ body: JSON.stringify({ codigo: 'K7M29QXD' }) }));
    responder({ ok: true }, 201);
    responder({ status: 'em_analise', mensagens: [{ autor: 'aluno', texto: 'Obrigado pela ajuda', criado_em: '2026-10-14T12:01:00Z' }] });
    await user.type(screen.getByLabelText('Sua resposta'), 'Obrigado pela ajuda');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByText('Obrigado pela ajuda')).toBeInTheDocument();
    expect(storage).not.toHaveBeenCalled();
    expect(document.querySelector('[style]')).toBeNull();
  });
  it('usa o mesmo texto genérico para código inválido ou inexistente (404)', async () => {
    const user = userEvent.setup();
    render(<App />);
    responder({ erro: 'detalhe privado' }, 404);
    await user.type(screen.getByLabelText('Acompanhar meu caso'), 'invalido');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível encontrar o caso. Confira o código e tente de novo.');
    expect(screen.queryByText('detalhe privado')).not.toBeInTheDocument();
  });
});
