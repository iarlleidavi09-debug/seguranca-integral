import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import MenuMensagem from './MenuMensagem';

const original = Element.prototype.getBoundingClientRect;
afterEach(() => { Element.prototype.getBoundingClientRect = original; });
function abrirComGatilhoEm(top: number) {
  Element.prototype.getBoundingClientRect = function () { return { top, bottom: top + 44, left: 0, right: 44, width: 44, height: 44, x: 0, y: top, toJSON() {} } as DOMRect; };
  render(<MenuMensagem itens={[{ rotulo: 'Editar', aoEscolher: () => {} }]} desabilitado={false} gatilhoRef={createRef<HTMLButtonElement>()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ações da mensagem' }));
  return screen.getByRole('menu');
}

it('abre para baixo quando o gatilho está na metade superior da área visível', () => {
  window.innerHeight = 800;
  expect(abrirComGatilhoEm(100)).not.toHaveClass('abre-para-cima');
});

it('abre para cima quando o gatilho está na metade inferior da área visível', () => {
  window.innerHeight = 800;
  expect(abrirComGatilhoEm(600)).toHaveClass('abre-para-cima');
});
