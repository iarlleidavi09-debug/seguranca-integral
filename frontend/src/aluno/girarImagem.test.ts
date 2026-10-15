import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { girarImagem } from './girarImagem';

type Canvas = { width: number; height: number };
let canvas: Canvas;
let ctx: { translate: ReturnType<typeof vi.fn>; rotate: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
let fechar: ReturnType<typeof vi.fn>;
let tamanhoBlob: number;
let blobNulo: boolean;

beforeEach(() => {
  canvas = { width: 0, height: 0 };
  ctx = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
  fechar = vi.fn();
  tamanhoBlob = 10;
  blobNulo = false;
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 200, height: 100, close: fechar })));
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') throw new Error('só canvas');
    return Object.assign(canvas, {
      getContext: () => ctx,
      toBlob: (cb: (b: Blob | null) => void, tipo?: string) => cb(blobNulo ? null : new Blob([new Uint8Array(tamanhoBlob)], { type: tipo })),
    });
  }) as unknown as typeof document.createElement);
});
afterEach(() => vi.restoreAllMocks());

const png = () => new File(['x'], 'foto.png', { type: 'image/png' });

describe('girarImagem', () => {
  it('90 graus troca largura e altura do canvas', async () => {
    await girarImagem(png(), 90);
    expect(canvas).toMatchObject({ width: 100, height: 200 });
  });
  it('270 graus também troca; 180 mantém', async () => {
    await girarImagem(png(), 270);
    expect(canvas).toMatchObject({ width: 100, height: 200 });
    await girarImagem(png(), 180);
    expect(canvas).toMatchObject({ width: 200, height: 100 });
  });
  it('devolve File com o mesmo nome e tipo e libera o bitmap', async () => {
    const saida = await girarImagem(new File(['x'], 'foto.webp', { type: 'image/webp' }), 90);
    expect(saida).toBeInstanceOf(File);
    expect(saida.name).toBe('foto.webp');
    expect(saida.type).toBe('image/webp');
    expect(fechar).toHaveBeenCalled();
  });
  it('GIF rejeita girar-indisponivel sem tocar no canvas', async () => {
    await expect(girarImagem(new File(['x'], 'a.gif', { type: 'image/gif' }), 90)).rejects.toThrow('girar-indisponivel');
    expect(document.createElement).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it('sem createImageBitmap rejeita girar-indisponivel', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(girarImagem(png(), 90)).rejects.toThrow('girar-indisponivel');
  });
  it('falha de decodificação rejeita girar-indisponivel', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('ruim'); }));
    await expect(girarImagem(png(), 90)).rejects.toThrow('girar-indisponivel');
  });
  it('toBlob nulo rejeita girar-indisponivel e libera o bitmap', async () => {
    blobNulo = true;
    await expect(girarImagem(png(), 90)).rejects.toThrow('girar-indisponivel');
    expect(fechar).toHaveBeenCalled();
  });
  it('resultado acima de 5 MB rejeita girar-grande', async () => {
    tamanhoBlob = 5 * 1024 * 1024 + 1;
    await expect(girarImagem(png(), 90)).rejects.toThrow('girar-grande');
  });
});
