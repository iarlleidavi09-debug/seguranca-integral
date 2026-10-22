import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Acompanhar from './Acompanhar';

it('atualiza acompanhamento sem apagar texto, mover foco ou transmitir rascunho', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let mensagens: any[] = [];
  vi.mocked(fetch).mockImplementation(async input => {
    if (input === '/api/acompanhar/eventos') return new Response(new ReadableStream({ start(c) { source = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    return new Response(JSON.stringify({ status: 'em_investigacao', mensagens, resolucao: null, pos_resolucao: false, ultima_situacao: null }));
  });
  const view = render(<Acompanhar codigoInicial="ABCD-EFGH" />);
  const input = await screen.findByLabelText('Sua resposta');
  await userEvent.setup().type(input, 'Meu texto ainda não enviado');
  const log = screen.getByRole('log'); log.scrollTop = 42;
  mensagens = [{ autor: 'coordenacao', texto: 'Resposta nova da equipe', criado_em: '2026-10-16T12:00:00Z' }];
  await act(async () => source.enqueue(new TextEncoder().encode('event: atualizar\ndata: {}\n\n')));
  expect(await screen.findByText('Resposta nova da equipe')).toBeInTheDocument();
  expect(input).toHaveValue('Meu texto ainda não enviado');
  expect(input).toHaveFocus();
  expect(log.scrollTop).toBe(42);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/acompanhar/eventos')).toHaveLength(1);
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => String(init?.body).includes('Meu texto ainda não enviado'))).toBe(false);
  view.unmount();
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/acompanhar/eventos')![1]!.signal!.aborted).toBe(true));
});

it('resposta SSE atrasada não remove a mensagem confirmada depois do envio', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let mensagens: any[] = [];
  let atrasar = false;
  let liberar: () => void = () => {};
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (input === '/api/acompanhar/eventos') return new Response(new ReadableStream({ start(c) { source = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (input === '/api/acompanhar/mensagens') {
      mensagens = [{ autor: 'aluno', texto: JSON.parse(String(init?.body)).texto, criado_em: '2026-10-16T12:01:00Z' }];
      return new Response('{}', { status: 201 });
    }
    const snapshot = JSON.stringify({ status: 'em_investigacao', mensagens, resolucao: null, pos_resolucao: false, ultima_situacao: null });
    if (atrasar) { atrasar = false; return new Promise<Response>(resolve => { liberar = () => resolve(new Response(snapshot)); }); }
    return new Response(snapshot);
  });
  const view = render(<Acompanhar codigoInicial="ABCD-EFGH" />);
  const input = await screen.findByLabelText('Sua resposta');
  const user = userEvent.setup();
  await user.type(input, 'Mensagem confirmada');
  atrasar = true;
  await act(async () => source.enqueue(new TextEncoder().encode('event: atualizar\ndata: {}\n\n')));
  await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
  await screen.findByText('Mensagem confirmada');
  await act(async () => liberar());
  expect(screen.getByText('Mensagem confirmada')).toBeInTheDocument();
  view.unmount();
});

it('recarga após informar situação superada por SSE não mostra falso erro de atualização', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let situacao: string | null = null;
  let mensagens: any[] = [];
  let atrasar = false;
  let liberar: (() => void) | undefined;
  vi.mocked(fetch).mockImplementation(async input => {
    if (input === '/api/acompanhar/eventos') return new Response(new ReadableStream({ start(c) { source = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (input === '/api/acompanhar/situacao') {
      situacao = 'voltou'; atrasar = true;
      return new Response('{}', { status: 201 });
    }
    const snapshot = JSON.stringify({ status: 'resolvido', mensagens, pos_resolucao: true, ultima_situacao: situacao,
      resolucao: { desfecho: 'solucionada', providencias: 'Acompanhamento realizado.', resultado: '', criado_em: '2026-10-16T12:00:00Z' } });
    if (atrasar) {
      atrasar = false;
      return new Promise<Response>(resolve => { liberar = () => resolve(new Response(snapshot)); });
    }
    return new Response(snapshot);
  });
  const view = render(<Acompanhar codigoInicial="ABCD-EFGH" />);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Voltou a acontecer' }));
  await waitFor(() => expect(liberar).toBeDefined());
  mensagens = [{ autor: 'coordenacao', texto: 'Atualização posterior da equipe', criado_em: '2026-10-16T12:02:00Z' }];
  await act(async () => source.enqueue(new TextEncoder().encode('event: atualizar\ndata: {}\n\n')));
  await screen.findByText('Atualização posterior da equipe');
  await act(async () => liberar!());
  expect(screen.getByText('Atualização posterior da equipe')).toBeInTheDocument();
  expect(screen.getByText('Obrigado por contar. A equipe vai rever o que foi feito.')).toBeInTheDocument();
  expect(screen.queryByText('Não foi possível atualizar agora. Use Atualizar conversa.')).not.toBeInTheDocument();
  view.unmount();
});
