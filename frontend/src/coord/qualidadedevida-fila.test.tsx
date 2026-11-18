import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import Fila from './Fila';
import App from './App';
import type { FiltrosFila } from '../shared/api';
import { chamadasA, servidor } from './testes/servidor';

const vazios: FiltrosFila = { status: '', prioridade: '', tipo: '', q: '' };
const caso = (id: number, extra = {}) => ({ id, tipo: 'ameaca', prioridade: 'media', status: 'novo', pontos: 3,
  em_andamento: false, anonimo: true, simulacao: false, resumo: `Resumo ${id}`, motivos: [], recorrencia_pendente: false,
  ultimo_acesso_em: null, ultimo_acesso_por: null, criado_em: '2026-10-14T10:00:00Z', atualizado_em: '2026-10-14T10:00:00Z',
  responsavel: { id: 7, nome: 'Ana', ativo: true }, revisao_estado: 4, proxima_acao: 'Conversar', prazo_acao: '2000-01-01', ...extra });
function FilaComEstado({ usuario = 7 }: { usuario?: number }) {
  const [filtros, mudar] = useState<FiltrosFila>({ ...vazios, prioridade: 'alta', q: 'texto privado' });
  return <Fila modo="casos" userId={usuario} meuId={7} filtros={filtros} aoFiltrar={mudar} aoAbrir={() => {}} />;
}
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/'); });

it('salva, aplica e remove favoritos por usuário sem guardar a busca', async () => {
  servidor({ 'GET /api/casos': () => ({ corpo: { casos: [caso(1)] } }) });
  const tela = render(<FilaComEstado />);
  await screen.findByText('Resumo 1');
  fireEvent.click(screen.getByText('Filtros favoritos'));
  fireEvent.change(screen.getByLabelText('Nome do filtro favorito'), { target: { value: 'Prioritários' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar filtro favorito' }));
  expect(JSON.stringify(localStorage)).not.toContain('texto privado');
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar Prioritários' }));
  expect(screen.getByLabelText('Prioridade')).toHaveValue('alta');
  expect(screen.getByLabelText('Buscar por assunto ou número do caso')).toHaveValue('');
  tela.unmount();
  const outra = render(<FilaComEstado usuario={8} />);
  expect(screen.queryByRole('button', { name: 'Aplicar Prioritários' })).toBeNull();
  outra.unmount();
  render(<FilaComEstado />);
  fireEvent.click(screen.getByText('Filtros favoritos (1)'));
  fireEvent.click(screen.getByRole('button', { name: 'Remover Prioritários' }));
  expect(screen.queryByRole('button', { name: 'Aplicar Prioritários' })).toBeNull();
});

it('reagenda com a revisão capturada e conclui a ação pela agenda', async () => {
  let atual = caso(1);
  servidor({ 'GET /api/casos': () => ({ corpo: { casos: [atual] } }),
    'POST /api/v3/casos/1/atendimento': dados => { atual = { ...atual, prazo_acao: dados.prazo_acao, revisao_estado: 5 }; return { corpo: { ok: true } }; },
    'POST /api/v3/casos/1/atendimento/concluir': () => { atual = { ...atual, proxima_acao: '', prazo_acao: '' }; return { corpo: { ok: true } }; },
  });
  render(<FilaComEstado />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reagendar ação do caso 1' }));
  fireEvent.change(screen.getByLabelText('Novo prazo do caso 1'), { target: { value: '2027-01-06' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar novo prazo' }));
  await screen.findByText('Prazo atualizado.');
  expect(chamadasA('POST', '/api/v3/casos/1/atendimento')[0].corpo).toEqual({ responsavel_id: 7, proxima_acao: 'Conversar', prazo_acao: '2027-01-06', revisao_estado: 4 });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Concluir ação do caso 1' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Concluir ação do caso 1' }));
  await screen.findByText('Ação concluída.');
  expect(chamadasA('POST', '/api/v3/casos/1/atendimento/concluir')[0].corpo).toEqual({ revisao_estado: 5 });
});

it('bloqueia reenvio do reagendamento após conflito e preserva o prazo digitado', async () => {
  servidor({ 'GET /api/casos': () => ({ corpo: { casos: [caso(1)] } }),
    'POST /api/v3/casos/1/atendimento': () => ({ status: 409 }),
  });
  render(<FilaComEstado />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reagendar ação do caso 1' }));
  fireEvent.change(screen.getByLabelText('Novo prazo do caso 1'), { target: { value: '2027-01-06' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar novo prazo' }));
  await screen.findByText(/O atendimento mudou/);
  expect(screen.getByLabelText('Novo prazo do caso 1')).toHaveValue('2027-01-06');
  expect(screen.getByRole('button', { name: 'Salvar novo prazo' })).toBeDisabled();
  expect(chamadasA('POST', '/api/v3/casos/1/atendimento')).toHaveLength(1);
});

it('volta ao Meu atendimento com filtros, foco e rolagem e navega apenas na ordem exibida', async () => {
  const rolar = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const linha = caso(12, { prioridade: 'alta' });
  servidor({ 'GET /api/eu': () => ({ corpo: { id: 7, nome: 'Ana', papel: 'coordenador' } }),
    'GET /api/resumo': () => ({ corpo: { recorrencia_pendente: 0 } }),
    'GET /api/casos': () => ({ corpo: { casos: [caso(99, { responsavel: { id: 8, nome: 'Bia', ativo: true } }), caso(14), linha] } }),
    ...Object.fromEntries([12, 14].map(id => [`GET /api/casos/${id}`, () => ({ corpo: { ...caso(id), relato: 'Relato', anexos: [], eventos: [], mensagens: [], notas: [], resolucoes: [], situacoes: [], revisoes_recorrencia: [] } })])),
  });
  window.history.replaceState(null, '', '/#atendimento');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ações vencidas (2)' }));
  await screen.findByRole('button', { name: 'Caso 12. Abrir.' });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
  fireEvent.click(screen.getByRole('button', { name: 'Caso 12. Abrir.' }));
  const navegador = await screen.findByRole('group', { name: 'Navegar nos casos da fila' });
  expect(within(navegador).getByRole('button', { name: 'Caso anterior' })).toBeDisabled();
  fireEvent.click(within(navegador).getByRole('button', { name: 'Próximo caso' }));
  await screen.findByRole('heading', { name: /Caso 14/ });
  expect(screen.getByRole('button', { name: 'Próximo caso' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
  await screen.findByRole('heading', { name: 'Meu atendimento' });
  expect(screen.getByRole('button', { name: 'Ações vencidas (2)' })).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Caso 14. Abrir.' })).toHaveFocus());
  expect(rolar).toHaveBeenCalledWith({ top: 240, behavior: 'instant' });
  expect(window.location.hash).toBe('#atendimento');
  rolar.mockRestore();
});
