import { beforeEach, expect, it } from 'vitest';
import { guardarAcesso, lerAcessos, removerAcesso } from './acessos';
beforeEach(() => localStorage.clear());
it('normaliza e deduplica sem armazenar mensagens', () => {
 guardarAcesso(' k7m2 9qxd '); guardarAcesso('K7M2-9QXD', 8);
 expect(lerAcessos()).toEqual([{ codigo: 'K7M2-9QXD', lastRead: 8 }]);
 removerAcesso('K7M2-9QXD'); expect(lerAcessos()).toEqual([]);
});
