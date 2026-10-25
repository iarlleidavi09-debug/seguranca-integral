import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Usuarios from './Usuarios';
import { servidor } from './testes/servidor';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

it('Usuarios renderiza o cartão Zona de risco quando o servidor permite', async () => {
  servidor({
    'GET /api/usuarios': () => ({ corpo: { usuarios: [] } }),
    'GET /api/implantacao': () => ({ corpo: { secundaria: true, resumo: { casos: 1, mensagens: 2, anexos: 3, arquivos: 3, backups: 4 }, ultima_limpeza: null } }),
  });
  render(<Usuarios meuId={1} />);
  expect(await screen.findByRole('heading', { name: 'Implantação secundária: apagar todos os dados' })).toBeInTheDocument();
});
