import { describe, expect, it, vi } from 'vitest';
import { acompanhar, enviarDenuncia, enviarMensagem, ErroApi, mensagemErro } from './api';

describe('Cliente da API', () => {
  it.each([400, 404, 413, 429, 500])('mantém status HTTP %i e fornece recuperação', async status => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ erro: 'interno' }), { status }));
    const erro = await acompanhar('invalido').catch(e => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(status);
    expect(mensagemErro(erro)).not.toContain('interno');
    expect(mensagemErro(erro).length).toBeGreaterThan(20);
  });
  it('tipa falhas de rede com status 0', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(enviarDenuncia(new FormData())).rejects.toMatchObject({ status: 0 });
  });
  it('não define content-type no multipart e usa POST em mesma origem', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ codigo: 'K7M2-9QXD' }), { status: 201 }));
    const form = new FormData();
    await enviarDenuncia(form);
    expect(fetch).toHaveBeenCalledWith('/api/denuncias', expect.objectContaining({ method: 'POST', body: form }));
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toBeUndefined();
  });
  it('envia mensagem e código somente no corpo POST', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"ok":true}', { status: 201 }));
    await enviarMensagem(' k7m2-9qxd ', 'Minha resposta');
    expect(fetch).toHaveBeenCalledWith('/api/acompanhar/mensagens', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ codigo: 'K7M29QXD', texto: 'Minha resposta' }),
    }));
  });
});
