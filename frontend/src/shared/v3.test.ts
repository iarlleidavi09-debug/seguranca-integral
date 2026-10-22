import { describe, expect, it, vi } from 'vitest';
import { obterQuestionarioV3, enviarPedidoV3, ErroApi } from './api';
import { questionarioV3 } from '../test/questionarioV3';
describe('API v3', () => {
  it('trata definição com grupos malformados como falha recuperável', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...questionarioV3, grupos: [{ id: 'x', nome: 'x', opcoes: null }] })));
    await expect(obterQuestionarioV3()).rejects.toBeInstanceOf(ErroApi);
  });
  it('carrega definição pública na rota própria sem cache', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(questionarioV3)));
    expect(await obterQuestionarioV3()).toEqual(questionarioV3);
    expect(fetch).toHaveBeenCalledWith('/api/v3/questionario', expect.objectContaining({ method: 'GET', cache: 'no-store' }));
  });
  it('não faz fallback silencioso ao rejeitar respostas', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"erro":"respostas invalidas"}', { status: 400 }));
    await expect(enviarPedidoV3(new FormData())).rejects.toMatchObject({ status: 400, erroServidor: 'respostas invalidas' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('desiste em 8s mesmo se fetch ignora abort', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const pedido = obterQuestionarioV3();
      const rejeitado = expect(pedido).rejects.toBeInstanceOf(ErroApi);
      await vi.advanceTimersByTimeAsync(8000); await rejeitado;
    } finally { vi.useRealTimers(); }
  });
});
