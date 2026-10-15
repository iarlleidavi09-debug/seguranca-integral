import { describe, expect, it, vi } from 'vitest';
import { acompanhar, enviarDenuncia, enviarMensagem, enviarSituacao, ErroApi, listarCasos, mensagemErro, mudarPrioridade, registrarResolucao, revisarRecorrencia } from './api';

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
  describe('situação do aluno (v2 A)', () => {
    it('envia a situação por POST JSON com o código só no corpo', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{"ok":true}', { status: 201 }));
      await enviarSituacao('abcd-1234', 'voltou');
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('/api/acompanhar/situacao');
      expect(String(url)).not.toContain('ABCD');
      expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: 'ABCD1234', situacao: 'voltou' }) });
    });
    it('409 vira mensagem amigável da rota de situação', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 409 }));
      const erro = await enviarSituacao('abcd-1234', 'melhorou').catch(e => e);
      expect(erro.status).toBe(409);
      expect(mensagemErro(erro, 'situacao')).toBe('Esse caso ainda não foi resolvido.');
      expect(mensagemErro(erro)).toBe('Não foi possível concluir agora. Aguarde um pouco e tente de novo.');
    });
  });
  describe('coordenação v2', () => {
    const ok = (corpo: unknown = { ok: true }, status = 200) => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(corpo), { status }));
    it('listarCasos monta a query só com filtros preenchidos e codifica q', async () => {
      ok({ casos: [] });
      await listarCasos({ status: 'novo', prioridade: '', tipo: '', q: '100%' });
      expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/casos?status=novo&q=100%25');
      ok({ casos: [] });
      await listarCasos({ status: '', prioridade: '', tipo: '', q: '' });
      expect(String(vi.mocked(fetch).mock.calls[1][0])).toBe('/api/casos');
    });
    it('mudarPrioridade envia prioridade e justificativa', async () => {
      ok();
      await mudarPrioridade(7, 'critica', 'Novo fato');
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('/api/casos/7/prioridade');
      expect(JSON.parse(String(init?.body))).toEqual({ prioridade: 'critica', justificativa: 'Novo fato' });
    });
    it('registrarResolucao e revisarRecorrencia usam as rotas do contrato', async () => {
      ok({ ok: true }, 201);
      await registrarResolucao(7, { desfecho: 'solucionada', providencias: 'Conversa', resultado: '' });
      ok({ ok: true }, 201);
      await revisarRecorrencia(7);
      const [u1, i1] = vi.mocked(fetch).mock.calls[0];
      const [u2, i2] = vi.mocked(fetch).mock.calls[1];
      expect(u1).toBe('/api/casos/7/resolucao');
      expect(JSON.parse(String(i1?.body))).toEqual({ desfecho: 'solucionada', providencias: 'Conversa', resultado: '' });
      expect(u2).toBe('/api/casos/7/revisao-recorrencia');
      expect(JSON.parse(String(i2?.body))).toEqual({});
    });
  });
});
