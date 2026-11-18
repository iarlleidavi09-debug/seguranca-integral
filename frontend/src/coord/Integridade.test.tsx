import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Integridade from './Integridade';

const resposta = (corpo: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => corpo, headers: new Headers() });

describe('Integridade', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra estados, alerta de divergência e botão para quem pode exportar', async () => {
    vi.stubGlobal('fetch', resposta({
      pode_exportar: true,
      anexos: [{ id: 1, recebido_em: '2026-11-17T10:00:00+00:00', sha256: 'a'.repeat(64), estado: 'divergente' },
        { id: 2, recebido_em: null, sha256: null, estado: 'sem_registro' }],
    }));
    render(<Integridade casoId={7} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/diferente do registrado/);
    expect(screen.getByText(/Sem registro de integridade/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Exportar dossiê/ }).getAttribute('href')).toBe('/api/casos/7/dossie');
  });

  it('sem permissão não mostra o botão de exportar', async () => {
    vi.stubGlobal('fetch', resposta({ pode_exportar: false, anexos: [{ id: 1, recebido_em: '2026-11-17T10:00:00+00:00', sha256: 'b'.repeat(64), estado: 'integro' }] }));
    render(<Integridade casoId={7} />);
    await waitFor(() => expect(screen.getByText(/Hash confere/)).toBeTruthy());
    expect(screen.queryByRole('link', { name: /Exportar dossiê/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
