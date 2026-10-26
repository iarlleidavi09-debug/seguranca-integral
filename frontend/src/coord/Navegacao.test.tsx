import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Navegacao from './Navegacao';

const original = Element.prototype.scrollIntoView;
afterEach(() => { Element.prototype.scrollIntoView = original; });

it('rola o item atual de novo quando a contagem de pendências muda depois do primeiro render', () => {
  const rolar = vi.fn();
  Element.prototype.scrollIntoView = rolar;
  const { rerender } = render(<Navegacao tela={{ nome: 'pos' }} admin={false} pendencias={0} aoIr={() => {}} />);
  const antes = rolar.mock.calls.length;
  expect(antes).toBeGreaterThan(0);
  rerender(<Navegacao tela={{ nome: 'pos' }} admin={false} pendencias={1} aoIr={() => {}} />);
  expect(rolar.mock.calls.length).toBeGreaterThan(antes);
  expect(rolar.mock.contexts.at(-1)).toBe(screen.getByRole('button', { name: /Pós-resolução/ }));
});
