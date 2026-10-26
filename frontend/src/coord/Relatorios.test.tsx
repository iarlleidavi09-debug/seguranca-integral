import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function medirGrafico(larguraSvg: number, larguraArea: number) {
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { return { width: larguraSvg, height: 200, top: 0, left: 0, right: larguraSvg, bottom: 200, x: 0, y: 0, toJSON() {} } as DOMRect; };
  const cw = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => larguraArea });
  const rolagens: number[] = [];
  const sl = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
  Object.defineProperty(Element.prototype, 'scrollLeft', { configurable: true, get: () => 0, set: (v: number) => { rolagens.push(v); } });
  return { rolagens, restaurar: () => {
    Element.prototype.getBoundingClientRect = rect;
    if (cw) Object.defineProperty(Element.prototype, 'clientWidth', cw); else delete (Element.prototype as { clientWidth?: unknown }).clientWidth;
    if (sl) Object.defineProperty(Element.prototype, 'scrollLeft', sl); else delete (Element.prototype as { scrollLeft?: unknown }).scrollLeft;
  } };
}
const dadosEsparsos = Array.from({ length: 30 }, (_, i) => ({ data: `2026-09-${String(i + 1).padStart(2, '0')}`, recebidos: i === 20 ? 4 : 0, resolvidos: 0 }));

it.each([320, 768, 1280])('rótulos do eixo têm tamanho efetivo de pelo menos 12 px com o SVG renderizado em %i px', async largura => {
  const m = medirGrafico(largura, 300);
  try {
    relatorio(dadosEsparsos);
    const { container } = render(<Relatorios />);
    await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
    const textos = () => [...container.querySelectorAll('.grafico-area svg text')];
    await waitFor(() => expect(Number(textos()[0]?.getAttribute('font-size')) * Math.min(1, largura / 900)).toBeGreaterThanOrEqual(12));
    expect(textos().length).toBeGreaterThan(0);
    for (const t of textos()) {
      expect(t).not.toHaveAttribute('style');
      const fs = Number(t.getAttribute('font-size'));
      expect(fs * Math.min(1, largura / 900)).toBeGreaterThanOrEqual(12);
      if (largura >= 900) expect(fs).toBe(14);
    }
  } finally { m.restaurar(); }
});

it('rola a área do gráfico até o último dia com dados ao montar e ao trocar a visualização', async () => {
  const m = medirGrafico(900, 300);
  try {
    relatorio(dadosEsparsos);
    render(<Relatorios />);
    await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
    // dia 20 de 30: x = 48 + 20 * 800 / 29 = 599,7; rolagem = 599,7 + 24 - 300 = 323,7
    await waitFor(() => expect(m.rolagens.at(-1)).toBeCloseTo(323.7, 0));
    const antes = m.rolagens.length;
    fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }));
    await waitFor(() => expect(m.rolagens.length).toBeGreaterThan(antes));
    expect(m.rolagens.at(-1)).toBeCloseTo(323.7, 0);
  } finally { m.restaurar(); }
});

it('sem medidas disponíveis (jsdom) o gráfico renderiza com 14 e não quebra', async () => {
  relatorio(dadosEsparsos);
  const { container } = render(<Relatorios />);
  await screen.findByRole('link', { name: 'Exportar CSV / Excel' });
  expect(container.querySelector('.grafico-area svg text')).toHaveAttribute('font-size', '14');
});

it('o CSS não fixa o tamanho dos rótulos do gráfico, para valer o atributo font-size', () => {
  // Lê o CSS como texto (jsdom não aplica folhas de estilo). Uma declaração font/font-size na regra
  // `.relatorio-grafico svg text` sobreporia o atributo de apresentação SVG.
  const css = readFileSync('src/coord/fluent.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => /\.relatorio-grafico\s+svg\s+text\s*$/.test(m[1].trim()));
  expect(regras.length).toBeGreaterThan(0);
  for (const m of regras) expect(m[2]).not.toMatch(/(^|[;\s])font(-size)?\s*:/);
  expect(css).toMatch(/\.relatorio-grafico svg\s*\{[^}]*min-width:\s*900px/);
});

it('na impressão o gráfico cabe na página: sem largura mínima e sem rolagem', () => {
  const css = readFileSync('src/coord/fluent.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const impressao = css.slice(css.search(/@media\s+print/));
  expect(impressao).toMatch(/\.relatorio-grafico svg\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/);
  expect(impressao).toMatch(/\.grafico-area\s*\{[^}]*overflow:\s*visible/);
});

it('o aviso de pouco histórico usa borda completa fina, sem acento lateral', () => {
  const css = readFileSync('src/coord/fluent.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const regra = css.match(/\.relatorio-pouco-historico\s*\{([^}]*)\}/)![1];
  expect(regra).not.toMatch(/border-left/);
  expect(regra).toMatch(/border:\s*var\(--linha-fina\)\s+solid\s+var\(--borda-suave\)/);
});
