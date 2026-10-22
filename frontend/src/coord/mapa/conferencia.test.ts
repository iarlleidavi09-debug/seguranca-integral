import { expect, it } from 'vitest';
import { conferirPlanta } from './conferencia';
import type { Ambiente } from '../../shared/mapa';
it('confere destino de escada, nomes repetidos no mesmo nível e sobreposições', () => {
 const a: Ambiente = { id: 'a', nome: 'Sala', tipo: 'sala', pai_id: null, x: 0, y: 0, largura: 100, altura: 100 };
 expect(conferirPlanta([a, { ...a, id: 'b', x: 50 }, { ...a, id: 'e', nome: 'Escada', tipo: 'escadaria', x: 300 }]).map(a => a.tipo)).toEqual(expect.arrayContaining(['sobreposicao', 'nome', 'escada']));
 expect(conferirPlanta([a, { ...a, id: 'b', x: 100, nome: 'Outra' }])).toEqual([]);
});
it('não acusa a parte vazia de um L como sobreposição', () => {
 const a: Ambiente = { id: 'l', nome: 'Ala L', tipo: 'area', pai_id: null, x: 0, y: 0, largura: 100, altura: 100, formato: 'l', espessura: .3 };
 const b: Ambiente = { id: 's', nome: 'Jardim', tipo: 'area', pai_id: null, x: 40, y: 40, largura: 40, altura: 40 };
 expect(conferirPlanta([a,b])).toEqual([]);
});
