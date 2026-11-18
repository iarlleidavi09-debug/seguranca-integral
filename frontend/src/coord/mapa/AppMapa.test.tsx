import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { notificarSessaoPerdida } from '../../shared/api';
import { servidor } from '../testes/servidor';

beforeEach(() => window.history.replaceState(null, '', '/#mapa'));
function montar() {
 servidor({
  'GET /api/eu': () => ({ corpo: { id: 1, nome: 'Marina', papel: 'admin' } }),
  'GET /api/mapa': () => ({ corpo: { revisao: 0, ambientes: [] } }),
  'GET /api/mapa/resumo': () => ({ corpo: { total: 0, sem_local: 0, sem_turma: 0, sem_autoria: 0, ambientes: [] } }),
  'GET /api/resumo': () => ({ corpo: { status: { novo: 0, em_investigacao: 0, resolvido: 0 }, prioridade: { critica: 0, alta: 0, media: 0, baixa: 0 }, recorrencia_pendente: 0 } }),
  'GET /api/casos': () => ({ corpo: { casos: [] } }),
  'POST /api/logout': () => ({ corpo: { ok: true } }),
  'POST /api/login': () => ({ corpo: { nome: 'Marina' } }),
 });
 render(<App />);
}
async function rascunho() {
 const user = userEvent.setup();
 await user.click(await screen.findByRole('button', { name: 'Editar planta' }));
 await user.type(screen.getByLabelText('Nome do novo ambiente'), 'Ala não salva');
 await user.click(screen.getByRole('button', { name: 'Adicionar ambiente' }));
 await user.clear(screen.getByLabelText('Posição X')); await user.type(screen.getByLabelText('Posição X'), '280');
 await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
 return user;
}
describe('Rascunho do mapa na sessão', () => {
 it('preserva geometria e desfazer quando navega Casos e volta ao mapa', async () => {
  montar(); const user = await rascunho();
  await user.click(screen.getByRole('button', { name: 'Casos' }));
  expect(screen.queryByRole('heading', { name: 'Mapa da escola' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Mapa da escola' }));
  expect(screen.getByLabelText('Nome do ambiente')).toHaveValue('Ala não salva');
  expect(screen.getByLabelText('Posição X')).toHaveValue(280);
  await user.click(screen.getByRole('button', { name: 'Desfazer' }));
  await user.click(screen.getByRole('button', { name: 'Ala não salva, Ala, 0 casos' }));
  expect(screen.getByLabelText('Posição X')).toHaveValue(80);
 });
 it.each(['sair', 'sessao'] as const)('limpa o rascunho depois de %s e nova entrada', async modo => {
  montar(); const user = await rascunho();
  if (modo === 'sair') await user.click(screen.getByRole('button', { name: 'Sair' }));
  else act(() => notificarSessaoPerdida());
  await user.type(await screen.findByLabelText('Nome'), 'Marina');
  await user.type(screen.getByLabelText('Senha'), 'uma-senha-longa');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  await user.click(await screen.findByText('Organização'));
  await user.click(await screen.findByRole('button', { name: 'Mapa da escola' }));
  expect(await screen.findByRole('button', { name: 'Editar planta' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Nome do ambiente')).toBeNull();
  expect(screen.queryByText('Ala não salva')).toBeNull();
 });
});
