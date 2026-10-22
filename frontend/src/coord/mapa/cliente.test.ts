import { afterEach, describe, expect, it, vi } from 'vitest';
import { obterLocais } from '../../shared/mapa';
import { ErroApi } from '../../shared/api';
import { servidor } from '../testes/servidor';
afterEach(() => vi.useRealTimers());
describe('Catálogo de locais', () => {
 it('rejeita catálogo malformado para permitir fallback do aluno', async () => {
  servidor({ 'GET /api/locais': () => ({ corpo: { revisao: 1, ambientes: [{ id: 42, nome: 'Sala' }] } }) });
  await expect(obterLocais()).rejects.toBeInstanceOf(ErroApi);
 });
 it('rejeita depois de oito segundos mesmo se transporte ignora cancelamento', async () => {
  vi.useFakeTimers(); vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
  const resultado = expect(obterLocais()).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(8000); await resultado;
 });
});
