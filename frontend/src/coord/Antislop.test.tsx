import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import Atendimento from './Atendimento';
import Fila from './Fila';
import App from './App';
import type { CasoDetalhe, FiltrosFila } from '../shared/api';
import { servidor } from './testes/servidor';
import { limparRascunhosAtendimento, guardarRascunhoAtendimento, obterRascunhoAtendimento } from './rascunhosAtendimento';
afterEach(limparRascunhosAtendimento);

const caso = { id: 704, revisao_estado: 3, responsavel: null, proxima_acao: null, prazo_acao: null } as unknown as CasoDetalhe;

it('limpa também edições realizadas durante uma saída ainda pendente', async () => {
  let terminar: ((value: any) => void) | undefined;
  servidor({
    'GET /api/eu': () => ({ corpo: { id: 1, nome: 'Ana', papel: 'admin' } }),
    'GET /api/casos': () => ({ corpo: { casos: [] } }),
    'POST /api/logout': () => new Promise(resolve => { terminar = resolve; }),
  });
  window.history.replaceState(null, '', '/#casos');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
  guardarRascunhoAtendimento(704, { responsavel_id: null, proxima_acao: 'Edição durante saída', prazo_acao: null }, 3);
  terminar?.({ corpo: { ok: true } });
  await screen.findByRole('button', { name: 'Entrar' });
  expect(obterRascunhoAtendimento(704)).toBeUndefined();
});

it('recupera o rascunho do atendimento após sair e voltar ao mesmo caso', async () => {
  servidor({ 'GET /api/equipe': () => ({ corpo: { usuarios: [] } }) });
  const props = { caso, ocupado: false, aoSalvar: vi.fn().mockResolvedValue(true), aoConcluir: vi.fn() };
  const tela = render(<Atendimento {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Responsável pelo caso')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Próxima ação'), { target: { value: 'Texto não salvo' } });
  fireEvent.change(screen.getByLabelText('Prazo da ação'), { target: { value: '2026-10-20' } });
  tela.unmount();
  render(<Atendimento {...props} />);
  expect(screen.getByLabelText('Próxima ação')).toHaveValue('Texto não salvo');
  expect(screen.getByLabelText('Prazo da ação')).toHaveValue('2026-10-20');
});

it('indica atualização dos filtros e recolhe opções detalhadas inicialmente', async () => {
  let terminar: ((value: any) => void) | undefined;
  servidor({ 'GET /api/casos': (_body, url) => url.searchParams.has('status')
    ? new Promise(resolve => { terminar = resolve; })
    : { corpo: { casos: [] } } });
  function Tela() {
    const [filtros, setFiltros] = useState<FiltrosFila>({ status: '', prioridade: '', tipo: '', q: '' });
    return <Fila modo="casos" filtros={filtros} aoFiltrar={setFiltros} aoAbrir={() => {}} />;
  }
  render(<Tela />);
  await screen.findByText('Nenhum caso na fila.');
  const detalhes = screen.getByText('Filtros detalhados').closest('details');
  expect(detalhes).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('Filtros detalhados'));
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolvido' } });
  expect(await screen.findByText('Atualizando casos…')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Casos' })).toHaveAttribute('aria-busy', 'true');
  terminar?.({ corpo: { casos: [] } });
  await waitFor(() => expect(screen.getByRole('region', { name: 'Casos' })).toHaveAttribute('aria-busy', 'false'));
});
