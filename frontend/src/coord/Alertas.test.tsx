import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Alertas from './Alertas';
import { chamadasA, servidor } from './testes/servidor';

const minhas = { critico: false, recorrencia: false, resumo: true, tem_email: true };
const equipe = [
  { id: 1, nome: 'Chefe', ativo: true, email: 'chefe@escola.example', critico: true, recorrencia: false, resumo: false },
  { id: 2, nome: 'Mara', ativo: true, email: '', critico: false, recorrencia: false, resumo: false },
];

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Alertas', () => {
  it('coordenador vê só as próprias preferências, sem lista de endereços', async () => {
    servidor({ 'GET /api/alertas': () => ({ corpo: { configurado: true, resumo_hora: '08:00', minhas } }) });
    const { container } = render(<Alertas />);
    expect(await screen.findByRole('heading', { name: 'Alertas' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Resumo diário/)).toBeChecked();
    expect(screen.getByLabelText(/Novo caso crítico/)).not.toBeChecked();
    expect(screen.getByText(/Sai por volta das 08:00/)).toBeInTheDocument();
    expect(container.querySelector('details')).toBeNull();
    expect(screen.queryByText(/ainda não foi configurado/)).not.toBeInTheDocument();
  });

  it('avisa quando o SMTP não está configurado e quando falta e-mail', async () => {
    servidor({ 'GET /api/alertas': () => ({ corpo: { configurado: false, resumo_hora: null, minhas: { ...minhas, tem_email: false } } }) });
    render(<Alertas />);
    expect(await screen.findByText(/ainda não foi configurado/)).toBeInTheDocument();
    expect(screen.getByText(/ainda não tem e-mail cadastrado/)).toBeInTheDocument();
  });

  it('salva as preferências marcadas', async () => {
    const u = userEvent.setup();
    servidor({
      'GET /api/alertas': () => ({ corpo: { configurado: true, resumo_hora: null, minhas } }),
      'POST /api/alertas/preferencias': () => ({ corpo: { ...minhas, critico: true } }),
    });
    render(<Alertas />);
    await u.click(await screen.findByLabelText(/Novo caso crítico/));
    await u.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    expect(await screen.findByText('Preferências salvas.')).toBeInTheDocument();
    expect(chamadasA('POST', '/api/alertas/preferencias')[0].corpo).toEqual({ critico: true, recorrencia: false, resumo: true });
  });

  it('admin vê a lista de endereços num details nativo e salva um e-mail', async () => {
    const u = userEvent.setup();
    servidor({
      'GET /api/alertas': () => ({ corpo: { configurado: true, resumo_hora: null, minhas, usuarios: equipe } }),
      'POST /api/alertas/usuarios/2/email': () => ({ corpo: { ok: true, email: 'mara@escola.example' } }),
    });
    const { container } = render(<Alertas />);
    await screen.findByText('Endereços de e-mail da equipe');
    expect(container.querySelector('details > summary')).toHaveTextContent('Endereços de e-mail da equipe');
    const campo = screen.getByLabelText('E-mail de Mara');
    expect(screen.getByRole('button', { name: 'Salvar e-mail de Mara' })).toBeDisabled();
    await u.type(campo, ' mara@escola.example ');
    await u.click(screen.getByRole('button', { name: 'Salvar e-mail de Mara' }));
    await waitFor(() => expect(chamadasA('POST', '/api/alertas/usuarios/2/email')).toHaveLength(1));
    expect(chamadasA('POST', '/api/alertas/usuarios/2/email')[0].corpo).toEqual({ email: 'mara@escola.example' });
    expect(await screen.findByText('Endereço salvo.')).toBeInTheDocument();
  });

  it('mostra erro claro para e-mail recusado', async () => {
    const u = userEvent.setup();
    servidor({
      'GET /api/alertas': () => ({ corpo: { configurado: true, resumo_hora: null, minhas, usuarios: equipe } }),
      'POST /api/alertas/usuarios/2/email': () => ({ status: 400, corpo: { erro: 'e-mail invalido' } }),
    });
    render(<Alertas />);
    await u.type(await screen.findByLabelText('E-mail de Mara'), 'xyz');
    await u.click(screen.getByRole('button', { name: 'Salvar e-mail de Mara' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não parece válido');
  });
});
