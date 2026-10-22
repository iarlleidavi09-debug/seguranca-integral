import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useTempoReal } from '../shared/tempoReal';
import { usePolling } from './polling';
import * as tempoReal from '../shared/tempoReal';

it('atualiza os prazos na virada do dia de Brasília mesmo com SSE gerenciado', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T02:59:58Z'));
  const gerenciado = vi.spyOn(tempoReal, 'coordenacaoGerenciada').mockReturnValue(true);
  const ler = vi.fn(async () => {});
  function Tela() { usePolling(ler, []); return null; }
  const view = render(<Tela />);
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(ler).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(ler).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); gerenciado.mockRestore(); vi.useRealTimers(); }
});

it('a conexão compartilhada agenda uma única leitura a cada fallback de 8s', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
  const ler = vi.fn(async () => {});
  function Tela() {
    usePolling(ler, []);
    useTempoReal('coord', true);
    return null;
  }
  const view = render(<Tela />);
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(ler).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); vi.useRealTimers(); }
});
