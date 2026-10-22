import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import Inicio from './Inicio';
import { guardarAcesso, lerAcessos } from './acessos';
beforeEach(() => localStorage.clear());
it('abre e apaga acessos salvos sem apagar outros casos', async () => {
 guardarAcesso('K7M2-9QXD'); guardarAcesso('ABCD-2345'); const abrir=vi.fn(); const user=userEvent.setup();
 render(<Inicio onAjuda={() => {}} onAcompanhar={abrir} />);
 await user.click(screen.getByRole('button',{name:'Abrir caso K7M2-9QXD'})); expect(abrir).toHaveBeenCalledWith('K7M2-9QXD');
 await user.click(screen.getByRole('button',{name:'Apagar acesso K7M2-9QXD'})); expect(lerAcessos()).toEqual([{codigo:'ABCD-2345',lastRead:0}]);
 await user.click(screen.getByRole('button',{name:'Apagar todos os acessos'})); expect(lerAcessos()).toEqual([]);
});
it('falha de armazenamento não impede acesso', () => {
 const falhar=vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => {throw new Error('bloqueado');});
 expect(guardarAcesso('K7M2-9QXD')).toBe(false); expect(() => render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />)).not.toThrow(); falhar.mockRestore();
});
