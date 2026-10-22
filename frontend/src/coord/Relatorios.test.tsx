import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Relatorios from './Relatorios';
import { servidor } from './testes/servidor';

it('aplica o período, mostra totais e mantém a exportação alinhada ao gráfico', async () => {
  servidor({ 'GET /api/relatorios': (_corpo, url) => ({ corpo: {
    inicio: url.searchParams.get('inicio'), fim: url.searchParams.get('fim'), recebidos: 7, resolvidos: 3,
    evolucao: [{ data: url.searchParams.get('inicio'), recebidos: 7, resolvidos: 3 }],
    prioridades: [{ prioridade: 'alta', quantidade: 7 }],
  } }) });
  render(<Relatorios />);
  expect(await screen.findByRole('link', { name: 'Exportar CSV / Excel' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-03' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }));
  const link = await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
  expect(link.getAttribute('href')).toContain('inicio=2026-10-01&fim=2026-10-03&formato=csv');
  fireEvent.click(screen.getByText('Consultar os dados por dia'));
  expect(within(screen.getByRole('table')).getByText('01/10/2026')).toBeInTheDocument();
  const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Imprimir / PDF' }));
  expect(imprimir).toHaveBeenCalledOnce();
  imprimir.mockRestore();
});

it('recusa períodos invertidos antes de consultar', async () => {
  servidor({ 'GET /api/relatorios': () => ({ status: 503, corpo: {} }) });
  render(<Relatorios />);
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-03' } });
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Escolha datas em ordem');
});

it('alterna entre dados diários, acumulados e distribuição por prioridade', async () => {
  servidor({ 'GET /api/relatorios': (_corpo, url) => ({ corpo: {
    inicio: url.searchParams.get('inicio'), fim: url.searchParams.get('fim'), recebidos: 5, resolvidos: 1,
    evolucao: [{ data: '2026-10-01', recebidos: 2, resolvidos: 0 }, { data: '2026-10-02', recebidos: 3, resolvidos: 1 }],
    prioridades: [{ prioridade: 'alta', quantidade: 5 }],
    evolucao_prioridades: [{ data: '2026-10-01', critica: 0, alta: 2, media: 0, baixa: 0 }, { data: '2026-10-02', critica: 0, alta: 3, media: 0, baixa: 0 }],
  } }) });
  render(<Relatorios />);
  await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
  const exportacao = screen.getByRole('link', { name: 'Exportar CSV / Excel' }).getAttribute('href');
  fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }));
  expect(screen.getByRole('button', { name: 'Acumulado' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByText('Consultar os dados acumulados'));
  expect(within(screen.getByRole('table')).getByText('5')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Por dia' }));
  expect(within(screen.getByRole('table')).getByText('3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Por prioridade' }));
  expect(screen.getByRole('img', { name: /Evolução diária por prioridade/ })).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Alta' })).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getByText('3')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Exportar CSV / Excel' })).toHaveAttribute('href', exportacao);
});
