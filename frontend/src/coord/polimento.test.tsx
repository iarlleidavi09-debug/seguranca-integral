import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { INTERVALO_MS } from './Fila';

type Resposta = { status?: number; corpo?: unknown };
type Rota = (corpo: any, url: URL) => Resposta | Promise<Resposta>;
const chamadas = () => vi.mocked(fetch).mock.calls.map(([url, init]) => ({
  metodo: (init?.method ?? 'GET') as string, url: String(url), corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
}));
const chamadasA = (metodo: string, caminho: string) => chamadas().filter(c => c.metodo === metodo && c.url.split('?')[0] === caminho);
function servidor(rotas: Record<string, Rota>) {
  vi.mocked(fetch).mockImplementation(async (entrada, init) => {
    const url = new URL(String(entrada), 'http://localhost');
    const rota = rotas[`${init?.method ?? 'GET'} ${url.pathname}`];
    const { status = 200, corpo = {} } = rota ? await rota(init?.body ? JSON.parse(String(init.body)) : undefined, url) : { status: 404 };
    return new Response(JSON.stringify(corpo), { status });
  });
}
const caso = (id: number, extra: Record<string, unknown> = {}) => ({
  id, tipo: 'ameaca', gravidade: 'media', pontos: 3, status: 'novo', em_andamento: false, anonimo: true,
  simulacao: false, resumo: `Resumo do caso ${id}`, criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00', ...extra,
});
const fila = [caso(3, { gravidade: 'alta', resumo: 'Caso alto' }), caso(1, { resumo: 'Caso medio' })];
const detalhe = () => ({
  ...caso(5, { gravidade: 'alta' }), relato: 'Relato completo.', quando: null, onde: null, nome: null, turma: null,
  motivos: [], anexos: [], eventos: [], mensagens: [{ autor: 'coordenacao', texto: 'Publica', criado_em: '2026-10-14T11:00:00+00:00' }],
  notas: [{ id: 1, usuario_id: 1, usuario: 'Marina', texto: 'Reservada', criado_em: '2026-10-14T11:30:00+00:00' }],
});
const logado: Rota = () => ({ corpo: { id: 1, nome: 'Marina' } });
const usuarios = [{ id: 1, nome: 'Marina', ativo: true }, { id: 2, nome: 'Paulo', ativo: true }];
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
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Caso alto');
    await user.selectOptions(screen.getByLabelText('Status'), 'em_analise');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'golpe');
    await user.click(await screen.findByRole('button', { name: /Caso alto/ }));
    await screen.findByRole('heading', { name: /Caso 3/ });
    await user.click(screen.getByRole('button', { name: 'Voltar à fila' }));
    await screen.findByRole('heading', { name: 'Fila de casos' });
    expect(screen.getByLabelText('Status')).toHaveValue('em_analise');
    expect(screen.getByLabelText('Tipo')).toHaveValue('golpe');
    await waitFor(() => expect(chamadas().at(-1)?.url).toBe('/api/casos?status=em_analise&tipo=golpe'));
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

  it('a fila ignora o tick de 8 s enquanto há requisição em curso, sem abortar', async () => {
    vi.useFakeTimers();
    let liberar!: () => void;
    let rodada = 0;
    servidor({
      'GET /api/eu': logado,
      'GET /api/casos': () => (rodada++ === 0 ? new Promise<Resposta>(r => { liberar = () => r({ corpo: { casos: fila } }); }) : { corpo: { casos: fila } }),
    });
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(1);
    const sinal = vi.mocked(fetch).mock.calls.find(([u]) => String(u).startsWith('/api/casos'))?.[1]?.signal;
    expect(sinal?.aborted).toBe(false);
    await act(async () => { liberar(); await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('Caso alto')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(2);
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
      'GET /api/eu': () => (++eu === 1 ? { status: 401 } : eu === 2 ? { status: 503 } : { corpo: { id: 1, nome: 'Marina' } }),
      'POST /api/login': () => ({ corpo: { nome: 'Marina' } }),
      'GET /api/casos': () => ({ corpo: { casos: [] } }),
    });
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nome'), 'Marina');
    await user.type(screen.getByLabelText('Senha'), 'uma-senha-longa');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você entrou');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Nome ou senha');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Fila de casos' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/login')).toHaveLength(1);
  });
});
