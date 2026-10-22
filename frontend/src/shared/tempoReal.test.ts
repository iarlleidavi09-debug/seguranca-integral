import { afterEach, describe, expect, it, vi } from 'vitest';
import { conectarTempoReal } from './tempoReal';

afterEach(() => { vi.useRealTimers(); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });

const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function stream() {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { source = c; } });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
  return { enviar: (text: string) => source.enqueue(new TextEncoder().encode(text)), fechar: () => source.close() };
}

describe('tempo real', () => {
  it('aluno envia código somente em POST, processa eventos fragmentados e cancela ao sair', async () => {
    const source = stream();
    const invalidar = vi.fn();
    const stop = conectarTempoReal({ portal: 'aluno', codigo: 'ABCD-EFGH', invalidar, estado: vi.fn() });
    await tick();
    expect(fetch).toHaveBeenLastCalledWith('/api/acompanhar/eventos', expect.objectContaining({ method: 'POST', body: JSON.stringify({ codigo: 'ABCD-EFGH' }) }));
    source.enviar('event: atua'); await tick();
    expect(invalidar).toHaveBeenCalledTimes(0);
    source.enviar('lizar\r\ndata: {}\r\n\r\n'); await tick();
    expect(invalidar).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(fetch).mock.calls.at(-1)![1]!.signal!;
    stop();
    expect(signal.aborted).toBe(true);
  });

  it('falha usa fallback8s, reconecta com backoff e suspende na aba oculta', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    const invalidar = vi.fn();
    const stop = conectarTempoReal({ portal: 'coord', invalidar, estado: vi.fn() });
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000); expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000); expect(fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000); expect(invalidar).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60000); expect(fetch).toHaveBeenCalledTimes(4);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(invalidar).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(5);
    stop();
  });

  it('401 encerra conexão e fallback e avisa sessão perdida', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));
    const invalidar = vi.fn(), sessaoPerdida = vi.fn();
    const stop = conectarTempoReal({ portal: 'coord', invalidar, estado: vi.fn(), sessaoPerdida });
    await tick(); await vi.advanceTimersByTimeAsync(60000);
    expect(sessaoPerdida).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(invalidar).not.toHaveBeenCalled();
    stop();
  });

  it('stream conectado dispensa fallback e reconexão recebe invalidação completa', async () => {
    vi.useFakeTimers();
    const first = stream(), invalidar = vi.fn(), estado = vi.fn();
    const stop = conectarTempoReal({ portal: 'coord', invalidar, estado });
    await tick(); first.enviar('event: atualizar\ndata: {}\n\n'); await tick();
    await vi.advanceTimersByTimeAsync(16000);
    expect(invalidar).toHaveBeenCalledTimes(1);
    first.fechar(); await tick();
    const second = stream();
    await vi.advanceTimersByTimeAsync(1000);
    second.enviar('event: atualizar\ndata: {}\n\n'); await tick();
    expect(invalidar).toHaveBeenCalledTimes(2);
    expect(estado).toHaveBeenCalledWith('online');
    stop();
  });
});
