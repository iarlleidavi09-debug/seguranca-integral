import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { INTERVALO_MS } from './polling';
import { chamadas, chamadasA, servidor } from './testes/servidor';
import type { Resposta, Rota } from './testes/servidor';

const caso = (id: number, extra: Record<string, unknown> = {}) => ({
  id, tipo: 'ameaca', prioridade: 'media', pontos: 3, status: 'novo', em_andamento: false, anonimo: true,
  simulacao: false, resumo: `Resumo do caso ${id}`, criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00', ...extra,
});
const fila = [caso(3, { prioridade: 'alta', resumo: 'Caso alto' }), caso(1, { resumo: 'Caso medio' })];
const detalhe = () => ({
  ...caso(5, { prioridade: 'alta' }), relato: 'Relato completo.', quando: null, onde: null, nome: null, turma: null,
  motivos: [], anexos: [], eventos: [], mensagens: [{ autor: 'coordenacao', texto: 'Publica', criado_em: '2026-10-14T11:00:00+00:00' }],
  notas: [{ id: 1, usuario_id: 1, usuario: 'Marina', texto: 'Reservada', criado_em: '2026-10-14T11:30:00+00:00' }],
});
const logado: Rota = () => ({ corpo: { id: 1, nome: 'Marina', papel: 'admin' } });
const usuarios = [{ id: 1, nome: 'Marina', ativo: true, papel: 'admin' }, { id: 2, nome: 'Paulo', ativo: true, papel: 'coordenador' }];
const base = (rotas: Record<string, Rota> = {}) => servidor({
  'GET /api/eu': logado, 'GET /api/casos': () => ({ corpo: { casos: fila } }),
  'GET /api/casos/5': () => ({ corpo: detalhe() }), 'GET /api/usuarios': () => ({ corpo: { usuarios } }), ...rotas,
});

beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => { vi.useRealTimers(); });

describe('Polimento da coordenação', () => {
  it('confirmação de desativar: foco no botão, Cancelar e Esc devolvem o foco ao gatilho', async () => {
    base();
    window.history.replaceState(null, '', '/#usuarios');
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Desativar Paulo' }));
    expect(screen.getByRole('button', { name: 'Confirmar desativação' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Desativar Paulo' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Desativar Paulo' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Confirmar desativação' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Paulo' })).toHaveFocus();
    expect(chamadasA('POST', '/api/usuarios/2/desativar')).toHaveLength(0);
  });

  it('confirmação de remover simulação: foco no botão, Cancelar e Esc devolvem o foco', async () => {
    base();
    window.history.replaceState(null, '', '/#ensaio');
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Remover simulação' }));
    expect(screen.getByRole('button', { name: 'Confirmar remoção' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Remover simulação' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Remover simulação' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Confirmar remoção' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover simulação' })).toHaveFocus();
    expect(chamadasA('DELETE', '/api/simulacao')).toHaveLength(0);
  });

  it('os filtros da fila sobrevivem a abrir e fechar um caso', async () => {
    base();
    window.history.replaceState(null, '', '/#casos');
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Caso alto');
    await user.selectOptions(screen.getByLabelText('Status'), 'em_investigacao');
    await user.selectOptions(screen.getByLabelText('Prioridade'), 'alta');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'golpe');
    await user.click(await screen.findByRole('button', { name: 'Caso 3. Abrir.' }));
    await screen.findByRole('heading', { name: /Caso 3/ });
    await user.click(screen.getByRole('button', { name: 'Voltar aos casos' }));
    await screen.findByRole('heading', { level: 1, name: 'Casos' });
    expect(screen.getByLabelText('Status')).toHaveValue('em_investigacao');
    expect(screen.getByLabelText('Prioridade')).toHaveValue('alta');
    expect(screen.getByLabelText('Tipo')).toHaveValue('golpe');
    await waitFor(() => expect(chamadasA('GET', '/api/casos').at(-1)?.url).toBe('/api/casos?status=em_investigacao&prioridade=alta&tipo=golpe'));
  });

  it('o que foi digitado durante o envio não é apagado', async () => {
    let liberar!: () => void;
    base({ 'POST /api/casos/5/mensagens': () => new Promise<Resposta>(r => { liberar = () => r({ status: 201, corpo: { ok: true } }); }) });
    window.history.replaceState(null, '', '/#caso-5');
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Mensagem ao aluno'), 'Primeira parte');
    await user.click(screen.getByRole('button', { name: 'Enviar ao aluno' }));
    await user.type(screen.getByLabelText('Mensagem ao aluno'), ' e mais um pouco');
    await act(async () => { liberar(); });
    await screen.findByText('Mensagem enviada ao aluno.', { selector: '[role=status]' });
    expect(screen.getByLabelText('Mensagem ao aluno')).toHaveValue('Primeira parte e mais um pouco');
  });

  it('o painel de conversa tem título próprio antes dos autores', async () => {
    base();
    window.history.replaceState(null, '', '/#caso-5');
    render(<App />);
    const painel = await screen.findByRole('tabpanel');
    expect(within(painel).getByRole('heading', { level: 2, name: 'Conversa com o aluno' })).toBeInTheDocument();
    expect(within(painel).getAllByRole('heading')[0].tagName).toBe('H2');
  });

  it('503 em /api/eu depois do login não parece falha de login e permite tentar de novo', async () => {
    let eu = 0;
    servidor({
      'GET /api/eu': () => (++eu === 1 ? { status: 401 } : eu === 2 ? { status: 503 } : { corpo: { id: 1, nome: 'Marina', papel: 'admin' } }),
      'POST /api/login': () => ({ corpo: { nome: 'Marina' } }),
      'GET /api/casos': () => ({ corpo: { casos: [] } }),
      'GET /api/resumo': () => ({ corpo: { status: { novo: 0, em_investigacao: 0, resolvido: 0 }, prioridade: { critica: 0, alta: 0, media: 0, baixa: 0 }, recorrencia_pendente: 0 } }),
    });
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nome'), 'Marina');
    await user.type(screen.getByLabelText('Senha'), 'uma-senha-longa');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você entrou');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Nome ou senha');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Cada pedido merece atenção.' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/login')).toHaveLength(1);
  });
});
