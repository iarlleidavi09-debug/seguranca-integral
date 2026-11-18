import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import Acompanhar from './Acompanhar';
import { limparRespostasRascunho } from './respostaRascunho';

beforeEach(() => {
  limparRespostasRascunho();
  vi.mocked(fetch).mockImplementation(async url => url === '/api/acompanhar/eventos'
    ? new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } })
    : new Response(JSON.stringify({ status: 'novo', mensagens: [], resolucao: null, pos_resolucao: false, ultima_situacao: null })));
});

it('guarda a resposta na memória por código ao sair e voltar sem gravar texto no navegador', async () => {
  const user = userEvent.setup();
  const first = render(<Acompanhar codigoInicial="K7M2-9QXD" />);
  await user.type(await screen.findByLabelText('Sua resposta'), 'Minha resposta ainda não enviada.');
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  first.unmount();
  const unloadAposNavegar = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unloadAposNavegar);
  expect(unloadAposNavegar.defaultPrevented).toBe(true);
  const second = render(<Acompanhar codigoInicial="ABCD-EFGH" />);
  expect(await screen.findByLabelText('Sua resposta')).toHaveValue('');
  second.unmount();
  render(<Acompanhar codigoInicial="k7m2 9qxd" />);
  expect(await screen.findByLabelText('Sua resposta')).toHaveValue('Minha resposta ainda não enviada.');
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('Minha resposta');
});

it('mantém o rascunho quando o envio falha e limpa somente depois do sucesso', async () => {
  const user = userEvent.setup();
  const first = render(<Acompanhar codigoInicial="K7M2-9QXD" />);
  await user.type(await screen.findByLabelText('Sua resposta'), 'Texto preservado.');
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
  await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
  expect(screen.getByLabelText('Sua resposta')).toHaveValue('Texto preservado.');
  await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
  await waitFor(() => expect(screen.getByLabelText('Sua resposta')).toHaveValue(''));
  first.unmount();
  render(<Acompanhar codigoInicial="K7M2-9QXD" />);
  expect(await screen.findByLabelText('Sua resposta')).toHaveValue('');
});

it('uma confirmação que chega após sair não apaga uma resposta nova do mesmo código', async () => {
  const user = userEvent.setup();
  let confirmar!: (resposta: Response) => void;
  const primeiro = render(<Acompanhar codigoInicial="K7M2-9QXD" />);
  await user.type(await screen.findByLabelText('Sua resposta'), 'Primeira mensagem.');
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { confirmar = resolve; }));
  await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
  primeiro.unmount();
  render(<Acompanhar codigoInicial="K7M2-9QXD" />);
  const campo = await screen.findByLabelText('Sua resposta');
  await user.clear(campo);
  await user.type(campo, 'Outra mensagem ainda não enviada.');
  confirmar(new Response(JSON.stringify({ ok: true }), { status: 201 }));
  await waitFor(() => expect(campo).toHaveValue('Outra mensagem ainda não enviada.'));
});
