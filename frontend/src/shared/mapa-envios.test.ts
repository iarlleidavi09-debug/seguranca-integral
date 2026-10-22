import { describe, expect, it, vi } from 'vitest';
import { registrarResolucao, ouvirSessaoPerdida } from './api';

describe('Finalização interna multipart', () => {
  it('envia autores no contrato v4 e fotos em campos separados sem definir Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"ok":true}'));
    const foto = new File(['imagem'], 'aluno.png', { type: 'image/png' });
    await registrarResolucao(12, { desfecho: 'solucionada', providencias: 'Conversa realizada.', resultado: '', autoria: 'identificada', justificativa_autoria: '', autores: [{ nome: 'Aluno fictício', ano: '8º ano', sala: 'B', foto }] } as any, 3);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/v4/casos/12/resolucao');
    expect(options?.headers).toEqual({ 'X-SI-Coord': '1' });
    const form = options?.body as FormData;
    const dados = JSON.parse(form.get('dados') as string);
    expect(dados.revisao_estado).toBe(3);
    expect(dados.autores).toEqual([{ nome: 'Aluno fictício', ano: '8º ano', sala: 'B', foto_campo: 'foto_0' }]);
    expect(form.get('foto_0')).toBe(foto);
  });
  it('sinaliza perda de sessão na nova finalização', async () => {
    const perdida = vi.fn(); ouvirSessaoPerdida(perdida);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"erro":"sessao"}', { status: 401 }));
    await expect(registrarResolucao(1, { desfecho: 'solucionada', providencias: 'Conversa', resultado: '', autoria: 'nao_identificada', justificativa_autoria: 'Não identificado', autores: [] } as any, 0)).rejects.toMatchObject({ status: 401 });
    expect(perdida).toHaveBeenCalledOnce(); ouvirSessaoPerdida(null);
  });
});
