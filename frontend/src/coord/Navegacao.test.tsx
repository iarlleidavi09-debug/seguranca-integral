import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import Navegacao from './Navegacao';

const original = Element.prototype.scrollIntoView;
afterEach(() => { Element.prototype.scrollIntoView = original; });

it('mantém três destinos principais e recolhe os destinos secundários por padrão', () => {
  const { container } = render(<Navegacao tela={{ nome: 'geral' }} admin pendencias={3} aoIr={() => {}} />);
  for (const nome of ['Visão geral', 'Meu atendimento', 'Casos']) expect(screen.getByRole('button', { name: nome })).toBeVisible();
  for (const nome of ['Organização', 'Ferramentas']) {
    const grupo = screen.getByText(nome).closest('details');
    expect(grupo).not.toHaveAttribute('open');
  }
  for (const nome of ['Pós-resolução', 'Mapa da escola', 'Relatórios', 'Usuários', 'Ensaio']) {
    expect(screen.getByText(nome).closest('button')).not.toBeVisible();
  }
  const sumario = container.querySelector('summary') as HTMLElement;
  expect(within(sumario).getByText('3 pendências de pós-resolução')).toBeInTheDocument();
  expect(sumario).toBeVisible();
});

it('expande Organização e navega pelo controle normal do destino', async () => {
  const user = userEvent.setup(); const aoIr = vi.fn();
  render(<Navegacao tela={{ nome: 'geral' }} admin={false} pendencias={0} aoIr={aoIr} />);
  await user.click(screen.getByText('Organização'));
  const mapa = screen.getByRole('button', { name: 'Mapa da escola' });
  expect(mapa).toBeVisible();
  await user.click(mapa);
  expect(aoIr).toHaveBeenCalledExactlyOnceWith({ nome: 'mapa' });
  expect(screen.queryByRole('menu')).toBeNull();
});

it('preserva a permissão de Usuários e oferece Ensaio para a coordenação', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Navegacao tela={{ nome: 'geral' }} admin={false} pendencias={0} aoIr={() => {}} />);
  await user.click(screen.getByText('Ferramentas'));
  expect(screen.getByRole('button', { name: 'Ensaio' })).toBeVisible();
  expect(screen.queryByText('Usuários')).toBeNull();
  rerender(<Navegacao tela={{ nome: 'geral' }} admin pendencias={0} aoIr={() => {}} />);
  expect(screen.getByRole('button', { name: 'Usuários' })).toBeVisible();
});

it.each([
  ['pos', 'Pós-resolução', 'Organização'], ['mapa', 'Mapa da escola', 'Organização'],
  ['relatorios', 'Relatórios', 'Organização'], ['usuarios', 'Usuários', 'Ferramentas'], ['ensaio', 'Ensaio', 'Ferramentas'],
] as const)('abre o grupo da rota inicial %s e mantém a seleção acessível', (nome, rotulo, grupo) => {
  render(<Navegacao tela={{ nome }} admin pendencias={0} aoIr={() => {}} />);
  expect(screen.getByText(grupo).closest('details')).toHaveAttribute('open');
  expect(screen.getByRole('button', { name: rotulo })).toHaveAttribute('aria-current', 'page');
  expect(screen.getAllByRole('button').filter(b => b.hasAttribute('aria-current'))).toHaveLength(1);
});

it('mantém o fechamento manual ao atualizar pendências e reabre ao navegar para outro filho', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Navegacao tela={{ nome: 'pos' }} admin={false} pendencias={1} aoIr={() => {}} />);
  await user.click(screen.getByText('Organização'));
  const grupo = screen.getByText('Organização').closest('details');
  expect(grupo).not.toHaveAttribute('open');
  rerender(<Navegacao tela={{ nome: 'pos' }} admin={false} pendencias={2} aoIr={() => {}} />);
  expect(grupo).not.toHaveAttribute('open');
  expect(within(grupo!.querySelector('summary')!).getByText('2 pendências de pós-resolução')).toBeInTheDocument();
  rerender(<Navegacao tela={{ nome: 'relatorios' }} admin={false} pendencias={2} aoIr={() => {}} />);
  expect(grupo).toHaveAttribute('open');
  expect(screen.getByRole('button', { name: 'Relatórios' })).toHaveAttribute('aria-current', 'page');
});

it('mantém o detalhe selecionado em Casos sem abrir grupos secundários', () => {
  render(<Navegacao tela={{ nome: 'caso', id: 12 }} admin={false} pendencias={0} aoIr={() => {}} />);
  expect(screen.getByRole('button', { name: 'Casos' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Organização').closest('details')).not.toHaveAttribute('open');
});

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
