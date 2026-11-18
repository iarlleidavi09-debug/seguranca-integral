import { beforeEach, expect, it, vi } from 'vitest';
import { chaveFavoritos, filtrosParaFavorito, guardarFavoritos, lerFavoritos } from './filtrosFavoritos';

beforeEach(() => localStorage.clear());
it('recupera somente campos válidos e nunca texto de busca do armazenamento', () => {
  localStorage.setItem(chaveFavoritos(7, 'casos'), JSON.stringify([
    { nome: 'Atenção', filtros: { status: 'invalido', prioridade: 'alta', q: 'nome privado', grupo: '<script>', conversa: 'mensagem_nova', injetado: 'fora' } },
    null, { nome: 123, filtros: {} }, { nome: 'x'.repeat(41), filtros: {} },
  ]));
  expect(lerFavoritos(7, 'casos')).toEqual([{ nome: 'Atenção', filtros: { status: '', prioridade: 'alta', tipo: '', q: '', conversa: 'mensagem_nova' } }]);
  expect(lerFavoritos(8, 'casos')).toEqual([]);
  expect(lerFavoritos(7, 'meus')).toEqual([]);
  localStorage.setItem(chaveFavoritos(7, 'casos'), '{invalido');
  expect(lerFavoritos(7, 'casos')).toEqual([]);
});
it('tolera armazenamento indisponível sem interromper a fila', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('indisponível'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('indisponível'); });
  expect(lerFavoritos(7, 'casos')).toEqual([]);
  expect(guardarFavoritos(7, 'casos', [{ nome: 'Hoje', filtros: filtrosParaFavorito({ visao: 'hoje', q: 'privado' }) }])).toBe(false);
});
