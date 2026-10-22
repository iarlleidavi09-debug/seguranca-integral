import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import App from './App';

function ambiente() {
  let caso = { id: 1, tipo: 'outro', prioridade: 'baixa', prioridade_original: 'baixa', status: 'novo', revisao_estado: 0,
    relato: 'Relato fictício completo.', anonimo: true, criado_em: '2026-10-16T12:00:00Z', atualizado_em: '2026-10-16T12:00:00Z',
    em_andamento: false, simulacao: false, recorrencia_pendente: false, pontos: 1, motivos: [], assuntos: [],
    nome: null, turma: null, onde: null, quando: null, ultimo_acesso: null, questionario: null,
    anexos: [], eventos: [], mensagens: [] as any[], notas: [], resolucoes: [], situacoes: [], revisoes_recorrencia: [] };
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let atrasar = false;
  let liberar: () => void = () => {};
  const requests: { url: string; body: any }[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, body });
    if (url === '/api/eventos') return new Response(new ReadableStream({ start(c) { source = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    let result: unknown = {};
    if (url === '/api/eu') result = { id: 1, nome: 'Equipe', papel: 'admin' };
    if (url === '/api/resumo') result = { recorrencia_pendente: 0 };
    if (url === '/api/casos/1') {
      result = caso;
      if (atrasar) {
        atrasar = false;
        const snapshot = JSON.stringify(caso);
        return new Promise<Response>(resolve => { liberar = () => resolve(new Response(snapshot)); });
      }
    }
    if (url.endsWith('/presenca')) result = { pessoas: [{ id: 2, nome: 'Outra colega', atividade: 'vendo' }] };
    if (url === '/api/v3/casos/1/prioridade') {
      if (body.revisao_estado !== caso.revisao_estado) return new Response('{}', { status: 409 });
      caso = { ...caso, prioridade: body.prioridade, revisao_estado: caso.revisao_estado + 1 };
      result = { ok: true };
    }
    return new Response(JSON.stringify(result));
  });
  window.history.replaceState(null, '', '/#caso-1');
  const view = render(<App />);
  return { requests, view, atrasar: () => { atrasar = true; }, liberar: () => liberar(), mudar: (extra: Record<string, unknown>) => { caso = { ...caso, ...extra }; },
    invalidar: async () => { await act(async () => { source.enqueue(new TextEncoder().encode('event: atualizar\ndata: {}\n\n')); }); } };
}

it('uma conexão atualiza detalhe e presença sem apagar draft ou tirar foco', async () => {
  const a = ambiente(), user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Conversa' }));
  const input = screen.getByLabelText('Mensagem ao aluno');
  await user.type(input, 'Ainda estou escrevendo');
  a.mudar({ mensagens: [{ autor: 'aluno', texto: 'Nova mensagem recebida', criado_em: '2026-10-16T13:00:00Z' }] });
  await a.invalidar();
  expect(await screen.findByText('Nova mensagem recebida')).toBeInTheDocument();
  expect(input).toHaveValue('Ainda estou escrevendo');
  expect(input).toHaveFocus();
  expect(await screen.findByText(/Outra colega/)).toBeInTheDocument();
  expect(a.requests.filter(r => r.url === '/api/eventos')).toHaveLength(1);
  expect(a.requests.filter(r => r.url.endsWith('/presenca') && r.body).some(r => r.body.atividade === 'mensagem')).toBe(true);
  expect(a.requests.some(r => JSON.stringify(r.body).includes('Ainda estou escrevendo'))).toBe(false);
  a.view.unmount();
});

it('uma leitura antiga não desfaz a confirmação de uma ação mais recente', async () => {
  const a = ambiente(), user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
  await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'alta');
  await user.type(screen.getByLabelText('Justificativa'), 'Ação gravada depois da leitura');
  a.atrasar(); await a.invalidar();
  await user.click(screen.getByRole('button', { name: 'Confirmar' }));
  await screen.findByText('Prioridade alterada para Alta.');
  await act(async () => a.liberar());
  expect(screen.getByText(/Prioridade atual:/)).toHaveTextContent('Alta');
  a.view.unmount();
});

it('mantém revisão do começo da edição; conflito preserva justificativa e exige confirmar de novo', async () => {
  const a = ambiente(), user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
  await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'alta');
  await user.type(screen.getByLabelText('Justificativa'), 'Minha avaliação ainda precisa ser revisada');
  a.mudar({ status: 'em_investigacao', revisao_estado: 1 });
  await a.invalidar();
  await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('em_investigacao'));
  await user.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('O caso mudou');
  expect(screen.getByLabelText('Justificativa')).toHaveValue('Minha avaliação ainda precisa ser revisada');
  expect(a.requests.find(r => r.url === '/api/v3/casos/1/prioridade')?.body.revisao_estado).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Confirmar' }));
  await screen.findByText('Prioridade alterada para Alta.');
  expect(a.requests.filter(r => r.url === '/api/v3/casos/1/prioridade').map(r => r.body.revisao_estado)).toEqual([0, 1]);
  a.view.unmount();
});
