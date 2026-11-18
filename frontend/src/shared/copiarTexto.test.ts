import { afterEach, describe, expect, it, vi } from 'vitest';
import { copiarTexto } from './copiarTexto';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('copiarTexto', () => {
  it('usa a área de transferência quando disponível', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copiarTexto('K7M2-9QXD')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('K7M2-9QXD');
  });

  it('copia em HTTP da LAN e restaura o foco sem deixar o código no DOM', async () => {
    vi.stubGlobal('navigator', {});
    const botao = document.createElement('button');
    document.body.append(botao); botao.focus();
    const execCommand = vi.fn(() => {
      expect(document.activeElement).toBeInstanceOf(HTMLTextAreaElement);
      expect((document.activeElement as HTMLTextAreaElement).value).toBe('K7M2-9QXD');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    expect(await copiarTexto('K7M2-9QXD')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(botao).toHaveFocus();
    expect(document.querySelector('textarea')).toBeNull();
    botao.remove();
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('retorna falha sem lançar quando os dois métodos estão indisponíveis', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('negado')) } });
    expect(await copiarTexto('K7M2-9QXD')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
