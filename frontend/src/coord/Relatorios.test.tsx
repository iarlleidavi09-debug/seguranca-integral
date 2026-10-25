import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
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

function relatorio(evolucao: { data: string; recebidos: number; resolvidos: number }[]) {
  servidor({ 'GET /api/relatorios': (_corpo, url) => ({ corpo: {
    inicio: url.searchParams.get('inicio'), fim: url.searchParams.get('fim'),
    recebidos: evolucao.reduce((t, d) => t + d.recebidos, 0), resolvidos: evolucao.reduce((t, d) => t + d.resolvidos, 0),
    evolucao, prioridades: [], evolucao_prioridades: [],
  } }) });
}
function larguraEstreita(estreita: boolean) {
  window.matchMedia = ((consulta: string) => ({ matches: estreita && consulta === '(max-width: 599px)', media: consulta,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
}
afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

it('em tela estreita troca a tabela por uma lista empilhada com os mesmos valores', async () => {
  larguraEstreita(true);
  relatorio([{ data: '2026-10-01', recebidos: 2, resolvidos: 0 }, { data: '2026-10-02', recebidos: 3, resolvidos: 1 }]);
  const { container } = render(<Relatorios />);
  fireEvent.click(await screen.findByText('Consultar os dados por dia'));
  expect(screen.queryByRole('table')).toBeNull();
  const lista = container.querySelector('.relatorio-lista') as HTMLElement;
  const itens = within(lista).getAllByRole('listitem');
  expect(itens).toHaveLength(2);
  expect(itens[1]).toHaveTextContent('Data: 02/10/2026');
  expect(itens[1]).toHaveTextContent('Recebidos: 3');
  expect(itens[1]).toHaveTextContent('Primeira resolução: 1');
  expect(itens[0]).toHaveTextContent('Recebidos: 2');
});

it('em tela larga mantém a tabela, e sem matchMedia também', async () => {
  larguraEstreita(false);
  relatorio([{ data: '2026-10-01', recebidos: 2, resolvidos: 0 }]);
  const { container, unmount } = render(<Relatorios />);
  fireEvent.click(await screen.findByText('Consultar os dados por dia'));
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(container.querySelector('.relatorio-lista')).toBeNull();
  unmount();
  delete (window as { matchMedia?: unknown }).matchMedia;
  render(<Relatorios />);
  fireEvent.click(await screen.findByText('Consultar os dados por dia'));
  expect(screen.getByRole('table')).toBeInTheDocument();
});

it('avisa que há pouco histórico com menos de 3 dias de dados e usa o singular', async () => {
  const dias = Array.from({ length: 30 }, (_, i) => ({ data: `2026-09-${String(i + 1).padStart(2, '0')}`, recebidos: i === 4 ? 2 : 0, resolvidos: 0 }));
  relatorio(dias);
  render(<Relatorios />);
  expect(await screen.findByText('Ainda há pouco histórico: só existem dados em 1 dia neste período.')).toBeInTheDocument();
});

it('usa o plural com 2 dias e esconde a nota com 3 ou mais dias de dados', async () => {
  relatorio([{ data: '2026-10-01', recebidos: 1, resolvidos: 0 }, { data: '2026-10-02', recebidos: 0, resolvidos: 1 }]);
  const { unmount } = render(<Relatorios />);
  expect(await screen.findByText('Ainda há pouco histórico: só existem dados em 2 dias neste período.')).toBeInTheDocument();
  unmount();
  relatorio([1, 2, 3].map(n => ({ data: `2026-10-0${n}`, recebidos: n, resolvidos: 0 })));
  render(<Relatorios />);
  await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
  expect(screen.queryByText(/Ainda há pouco histórico/)).toBeNull();
});

it('conta os dias da série diária bruta em qualquer visualização e não avisa com N = 0', async () => {
  const dias = (com: number[]) => Array.from({ length: 10 }, (_, i) => ({ data: `2026-09-${String(i + 1).padStart(2, '0')}`, recebidos: com.includes(i) ? 2 : 0, resolvidos: 0 }));
  relatorio(dias([4]));
  const { unmount } = render(<Relatorios />);
  await screen.findByText(/só existem dados em 1 dia neste/);
  fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }));
  expect(screen.getByText(/só existem dados em 1 dia neste/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Por prioridade' }));
  expect(screen.getByText(/só existem dados em 1 dia neste/)).toBeInTheDocument();
  unmount();
  relatorio(dias([2, 4, 6]));
  const outro = render(<Relatorios />);
  await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
  fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }));
  expect(screen.queryByText(/Ainda há pouco histórico/)).toBeNull();
  outro.unmount();
  relatorio(dias([]));
  render(<Relatorios />);
  await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
  expect(screen.queryByText(/Ainda há pouco histórico/)).toBeNull();
});

it('a lista empilhada tem papel de lista explícito', async () => {
  larguraEstreita(true);
  relatorio([{ data: '2026-10-01', recebidos: 2, resolvidos: 0 }]);
  const { container } = render(<Relatorios />);
  await screen.findByText('Consultar os dados por dia');
  expect(container.querySelector('ul.relatorio-lista')).toHaveAttribute('role', 'list');
});

it('mantém os rótulos do gráfico com pelo menos 12 px', () => {
  // Lê o CSS como texto (jsdom não aplica folhas de estilo): procura todas as regras cujo seletor
  // termina em "svg text" dentro de .relatorio-grafico e exige font/font-size em px >= 12.
  const css = readFileSync('src/coord/fluent.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => /\.relatorio-grafico\s+svg\s+text\s*$/.test(m[1].trim()));
  expect(regras.length).toBeGreaterThan(0);
  const tamanhos = regras.flatMap(m => [...m[2].matchAll(/font(?:-size)?\s*:\s*(?:[\w\s-]*?\s)?(\d+(?:\.\d+)?)px/g)].map(t => Number(t[1])));
  expect(tamanhos.length).toBeGreaterThan(0);
  tamanhos.forEach(t => expect(t).toBeGreaterThanOrEqual(12));
});
