import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Mapa from './Mapa';
import { agregarAmbiente, ajustar, distribuicaoAmbiente, pontosL } from './modelo';
import { servidor } from '../testes/servidor';

const vazio = { revisao: 0, ambientes: [] };
const resumo = { total: 0, sem_local: 0, sem_turma: 0, sem_autoria: 0, ambientes: [] };
function montar(conflito = false) {
 let salvo: unknown;
 servidor({ 'GET /api/mapa': () => ({ corpo: vazio }), 'GET /api/mapa/resumo': () => ({ corpo: resumo }),
 'POST /api/mapa': init => { salvo = init; return conflito ? { status: 409, corpo: { erro: 'Revisão antiga' } } : { corpo: { ...(salvo as object), revisao: 1 } }; } });
 render(<Mapa />); return () => salvo;
}
async function criar(nome = 'Ala norte') {
 const user = userEvent.setup();
 await user.click(await screen.findByRole('button', { name: 'Editar planta' }));
 await user.type(screen.getByLabelText('Nome do novo ambiente'), nome);
 await user.click(screen.getByRole('button', { name: 'Adicionar ambiente' }));
 return user;
}
describe('Mapa escolar', () => {
 it('confere escadaria sem destino antes de enviar a planta e permite revisar', async () => {
  const salvo = montar(); const user = await criar('Escada');
  await user.selectOptions(screen.getByLabelText('Tipo do ambiente'), 'escadaria');
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  expect(salvo()).toBeUndefined();
  expect(screen.getByText(/escadaria sem ambientes de destino/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continuar editando' }));
  expect(screen.queryByRole('button', { name: 'Salvar mesmo assim' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  await user.click(screen.getByRole('button', { name: 'Salvar mesmo assim' }));
  await screen.findByText('Planta salva.');
  expect(salvo()).toBeDefined();
 });
 it('amplia a área de trabalho em duas direções e reduz a superfície com o zoom', async () => {
  montar(); const user = await criar();
  const planta = screen.getByRole('group', { name: 'Planta esquemática do nível atual' });
  await user.click(screen.getByRole('button', { name: 'Ampliar para a direita' }));
  await user.click(screen.getByRole('button', { name: 'Ampliar para baixo' }));
  expect(planta).toHaveAttribute('viewBox', '0 0 1600 1200');
  expect(screen.getByRole('region', { name: 'Área rolável da planta' })).toHaveAttribute('tabindex', '0');
  await user.selectOptions(screen.getByLabelText('Zoom'), '50');
  expect(parseFloat(planta.getAttribute('width')!)).toBeCloseTo(1600 / 1200 * 50);
 });
 it('permite posicionar e salvar blocos além da área inicial', async () => {
  const salvo = montar(); const user = await criar();
  fireEvent.change(screen.getByLabelText('Posição X'), { target: { value: '1400' } });
  fireEvent.change(screen.getByLabelText('Posição Y'), { target: { value: '1000' } });
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  expect(screen.getByRole('group', { name: 'Planta esquemática do nível atual' }).getAttribute('viewBox')).not.toBe('0 0 1200 800');
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  await screen.findByText('Planta salva.');
  expect(salvo()).toMatchObject({ ambientes: [{ x: 1400, y: 1000 }] });
 });
 it('calcula os seis vértices de um L com rotação e espessura', () => {
  const a = { id: 'l', nome: 'Ala L', tipo: 'ala' as const, pai_id: null, x: 10, y: 20, largura: 200, altura: 100, formato: 'l' as const, espessura: .4, rotacao: 90 as const };
  expect(pontosL(a)).toBe('210,20 210,120 130,120 130,60 10,60 10,20');
 });
 it('desenha em L, gira e ajusta braços preservando identidade e payload', async () => {
  const salvo = montar(); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Editar planta' }));
  await user.selectOptions(screen.getByLabelText('Formato do novo ambiente'), 'l');
  await user.click(screen.getByRole('button', { name: 'Desenhar em L' }));
  const planta = screen.getByRole('group', { name: 'Planta esquemática do nível atual' });
  Object.defineProperty(planta, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 1200, height: 800 }) });
  fireEvent.pointerDown(planta, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(planta, { pointerId: 1, clientX: 500, clientY: 300 });
  fireEvent.pointerUp(planta, { pointerId: 1, clientX: 500, clientY: 300 });
  await user.selectOptions(screen.getByLabelText('Rotação do ambiente'), '180');
  await user.clear(screen.getByLabelText('Espessura dos braços (%)')); await user.type(screen.getByLabelText('Espessura dos braços (%)'), '50');
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  expect(planta.querySelectorAll('polygon')).toHaveLength(1);
  fireEvent.pointerDown(planta.querySelector('polygon')!, { button: 0, pointerId: 2, clientX: 150, clientY: 150 });
  fireEvent.pointerMove(planta, { pointerId: 2, clientX: 170, clientY: 180 });
  fireEvent.pointerUp(planta, { pointerId: 2, clientX: 170, clientY: 180 });
  fireEvent.pointerDown(planta.querySelector('[data-tamanho]')!, { button: 0, pointerId: 3, clientX: 500, clientY: 300 });
  fireEvent.pointerMove(planta, { pointerId: 3, clientX: 540, clientY: 330 });
  fireEvent.pointerUp(planta, { pointerId: 3, clientX: 540, clientY: 330 });
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  await screen.findByText('Planta salva.');
  expect(salvo()).toMatchObject({ ambientes: [{ formato: 'l', rotacao: 180, espessura: .5, x: 120, y: 130, largura: 440, altura: 230 }] });
 });
 it('quantiza geometria fracionária para não bloquear formulários numéricos', () => {
  expect(ajustar({ id: 'a', nome: 'Ala', tipo: 'ala', pai_id: null, x: 100.3, y: 80.7, largura: 300.2, altura: 200.9 })).toMatchObject({ x: 100, y: 81, largura: 300, altura: 201 });
 });
 it('começa vazio, cria pelo formulário e salva geometria e identidade', async () => {
  const salvo = montar(); const user = await criar();
  expect(screen.getByLabelText('Nome do ambiente')).toHaveValue('Ala norte');
  await user.clear(screen.getByLabelText('Largura')); await user.type(screen.getByLabelText('Largura'), '300');
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  await screen.findByText('Planta salva.');
  expect(salvo()).toMatchObject({ revisao: 0, ambientes: [{ nome: 'Ala norte', largura: 300, pai_id: null }] });
 });
 it('desfaz criação e cancela o rascunho', async () => {
  montar(); const user = await criar();
  await user.click(screen.getByRole('button', { name: 'Desfazer' }));
  expect(screen.queryByLabelText('Nome do ambiente')).toBeNull();
  await user.type(screen.getByLabelText('Nome do novo ambiente'), 'Outra ala');
  await user.click(screen.getByRole('button', { name: 'Adicionar ambiente' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
  expect(screen.getByText('A planta ainda está vazia')).toBeInTheDocument();
 });
 it('planta vazia mostra um cartão explicativo com o botão para começar e foca o primeiro campo', async () => {
  montar(); const user = userEvent.setup();
  const cartao = (await screen.findByText('A planta ainda está vazia')).closest('section')!;
  expect(cartao).toHaveClass('mapa-vazio-cartao');
  expect(within(cartao).getByText('Adicione uma ala ou um ambiente para começar.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Editar planta' })).toHaveLength(1);
  await user.click(within(cartao).getByRole('button', { name: 'Editar planta' }));
  expect(screen.getByLabelText('Nome do novo ambiente')).toHaveFocus();
 });
 it('nível sem ambientes explica e destaca o seletor de nível', async () => {
  montar(); const user = await criar('Escada');
  await user.selectOptions(screen.getByLabelText('Tipo do ambiente'), 'escadaria');
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  await user.click(screen.getByRole('button', { name: 'Abrir este nível' }));
  expect(screen.getByText('Este nível ainda não tem ambientes.')).toBeInTheDocument();
  expect(screen.queryByText('A planta ainda está vazia')).toBeNull();
  expect(screen.getByRole('navigation', { name: 'Níveis da planta' })).toHaveClass('mapa-niveis-destaque');
 });
 it('preserva o rascunho quando há conflito de revisão', async () => {
  montar(true); const user = await criar();
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Nome do ambiente')).toHaveValue('Ala norte');
  expect(screen.getByRole('alert')).toHaveTextContent('rascunho');
 });
 it('navega para filhos e mantém pai estável', async () => {
  const salvo = montar(); const user = await criar();
  await user.selectOptions(screen.getByLabelText('Tipo do ambiente'), 'escadaria');
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  await user.click(screen.getByRole('button', { name: 'Abrir este nível' }));
  await user.type(screen.getByLabelText('Nome do novo ambiente'), 'Sala 1');
  await user.click(screen.getByRole('button', { name: 'Adicionar ambiente' }));
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  await waitFor(() => expect(salvo()).toBeDefined());
  const dados = salvo() as { ambientes: { id: string; pai_id: string | null }[] };
  expect(dados.ambientes[1].pai_id).toBe(dados.ambientes[0].id);
 });
 it('desenha sem exigir nome antecipado e permite renomear e mover pelos campos', async () => {
  const salvo = montar(); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Editar planta' }));
  await user.click(screen.getByRole('button', { name: 'Desenhar retângulo' }));
  const planta = screen.getByRole('group', { name: 'Planta esquemática do nível atual' });
  Object.defineProperty(planta, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 1200, height: 800 }) });
  fireEvent.pointerDown(planta, { button: 0, pointerId: 1, clientX: 100.1, clientY: 100.1 });
  fireEvent.pointerMove(planta, { pointerId: 1, clientX: 500.2, clientY: 300.2 });
  fireEvent.pointerUp(planta, { pointerId: 1, clientX: 500.2, clientY: 300.2 });
  expect(screen.getByLabelText('Nome do ambiente')).toHaveValue('Nova ala');
  expect((screen.getByLabelText('Largura') as HTMLInputElement).checkValidity()).toBe(true);
  expect((screen.getByLabelText('Posição X') as HTMLInputElement).checkValidity()).toBe(true);
  await user.clear(screen.getByLabelText('Nome do ambiente')); await user.type(screen.getByLabelText('Nome do ambiente'), 'Ala leste');
  await user.clear(screen.getByLabelText('Posição X')); await user.type(screen.getByLabelText('Posição X'), '200');
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  await user.click(screen.getByRole('button', { name: 'Salvar planta' }));
  await screen.findByText('Planta salva.');
  expect(salvo()).toMatchObject({ ambientes: [{ nome: 'Ala leste', x: 200, largura: 400, altura: 200 }] });
 });
 it('soma distribuição dos descendentes por ano e sala', () => {
  const ambientes = [{ id: 'a', pai_id: null }, { id: 's', pai_id: 'a' }];
  const dados = [{ id: 'a', total: 1, anos: [{ ano: '7º', total: 1 }], salas: [{ ano: '7º', sala: 'A', total: 1 }] }, { id: 's', total: 3, anos: [{ ano: '7º', total: 2 }, { ano: '8º', total: 1 }], salas: [{ ano: '7º', sala: 'A', total: 2 }, { ano: '8º', sala: 'B', total: 1 }] }];
  expect(distribuicaoAmbiente('a', ambientes, dados)).toEqual({ anos: [{ ano: '7º', total: 3 }, { ano: '8º', total: 1 }], salas: [{ ano: '7º', sala: 'A', total: 3 }, { ano: '8º', sala: 'B', total: 1 }] });
 });
 it('soma registros diretos dos descendentes sem somar o mesmo ramo duas vezes', () => {
  const ambientes = [{ id: 'a', pai_id: null }, { id: 's', pai_id: 'a' }];
  expect(agregarAmbiente('a', ambientes, [{ id: 'a', total: 2 }, { id: 's', total: 3 }])).toBe(5);
 });
});








