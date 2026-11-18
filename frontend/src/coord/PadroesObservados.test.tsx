import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PadroesObservados from './PadroesObservados';
import { chamadasA, servidor } from './testes/servidor';

const padrao = (extra: Record<string, unknown> = {}) => ({
  chave: 'local_tipo:patio:ameaca', regra: 'local_tipo', local_id: 'patio', local_nome: 'Pátio', contagem: 3,
  casos: [4, 7, 9], primeiro_em: '2026-11-03', ultimo_em: '2026-11-17', estado: 'novo',
  texto: '3 relatos no local Pátio, sexta de manhã, em 15 dias', ...extra,
});

describe('Padrões observados', () => {
  it('mostra o cartão com texto neutro, período e casos recolhidos', async () => {
    servidor({ 'GET /api/coord/padroes': () => ({ corpo: { padroes: [padrao()] } }) });
    render(<PadroesObservados aoAbrirCaso={vi.fn()} />);
    const cartao = await screen.findByRole('article', { name: /Padrão observado: 3 relatos no local Pátio/ });
    expect(within(cartao).getByText('3 relatos no local Pátio, sexta de manhã, em 15 dias')).toBeInTheDocument();
    expect(within(cartao).getByText('3 casos, de 03/11 a 17/11')).toBeInTheDocument();
    const detalhes = cartao.querySelector('details')!;
    expect(detalhes.open).toBe(false);
    expect(detalhes.querySelector('summary')).toHaveTextContent('Ver os 3 casos');
  });

  it('abre o caso pelo link e marca como em acompanhamento', async () => {
    const aoAbrirCaso = vi.fn();
    let estado = 'novo';
    servidor({
      'GET /api/coord/padroes': () => ({ corpo: { padroes: [padrao({ estado })] } }),
      'POST /api/coord/padroes/local_tipo%3Apatio%3Aameaca/estado': (corpo) => { estado = corpo.estado; return { corpo: { ok: true } }; },
    });
    render(<PadroesObservados aoAbrirCaso={aoAbrirCaso} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Ver os 3 casos'));
    await user.click(screen.getByRole('button', { name: 'Abrir caso 7' }));
    expect(aoAbrirCaso).toHaveBeenCalledWith(7);
    await user.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByText('Em acompanhamento')).toBeInTheDocument();
    expect(chamadasA('POST', '/api/coord/padroes/local_tipo%3Apatio%3Aameaca/estado')[0].corpo).toEqual({ estado: 'acompanhando' });
    expect(screen.getByRole('button', { name: 'Parar de acompanhar' })).toBeInTheDocument();
  });

  it('descartar remove o cartão depois que o servidor deixa de listá-lo', async () => {
    let descartado = false;
    servidor({
      'GET /api/coord/padroes': () => ({ corpo: { padroes: descartado ? [] : [padrao()] } }),
      'POST /api/coord/padroes/local_tipo%3Apatio%3Aameaca/estado': () => { descartado = true; return { corpo: { ok: true } }; },
    });
    render(<PadroesObservados aoAbrirCaso={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Padrões observados' })).toBeNull();
  });

  it('sem padrões, ou se a leitura falhar, não ocupa espaço nem mostra erro', async () => {
    servidor({ 'GET /api/coord/padroes': () => ({ status: 500 }) });
    const { container } = render(<PadroesObservados aoAbrirCaso={vi.fn()} />);
    await waitFor(() => expect(chamadasA('GET', '/api/coord/padroes').length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra aviso quando marcar falha', async () => {
    servidor({
      'GET /api/coord/padroes': () => ({ corpo: { padroes: [padrao()] } }),
      'POST /api/coord/padroes/local_tipo%3Apatio%3Aameaca/estado': () => ({ status: 429 }),
    });
    render(<PadroesObservados aoAbrirCaso={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
  });
});
