import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Pedido from './Pedido';
import { salvarRascunhoV3, lerRascunhoV3, vazioV3 } from './rascunhoV3';
import { questionarioV3 } from '../test/questionarioV3';

const catalogo = { revisao: 2, ambientes: [
  { id: 'ala-a', nome: 'Ala A', tipo: 'ala', pai_id: null },
  { id: 'sala-101', nome: 'Sala 101', tipo: 'sala', pai_id: 'ala-a' },
] };
async function relatoLivre() {
  const user = userEvent.setup();
  render(<Pedido onEnviado={() => {}} />);
  await user.click(await screen.findByRole('button', { name: 'Continuar só com o relato' }));
  fireEvent.change(screen.getByLabelText('O que aconteceu?'), { target: { value: 'Preciso de ajuda com uma situação na escola.' } });
  return user;
}
beforeEach(() => vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify(
  url === '/api/v3/questionario' ? questionarioV3 : url === '/api/locais' ? catalogo : { codigo: 'ABCD-1234' }
), { status: url === '/api/v4/denuncias' ? 201 : 200 })));

describe('Turma e localização no pedido', () => {
  it('envia o local marcado diretamente na planta', async () => {
    vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify(
      url === '/api/v3/questionario' ? questionarioV3 : url === '/api/locais' ? catalogo : url === '/api/planta' ? {
        revisao: 2, ambientes: [{ id: 'sala-101', nome: 'Sala 101', tipo: 'sala', pai_id: null, x: 40, y: 40, largura: 300, altura: 200 }],
      } : { codigo: 'ABCD-1234' }
    ), { status: url === '/api/v4/denuncias' ? 201 : 200 }));
    const user = await relatoLivre();
    await user.click(await screen.findByRole('button', { name: 'Marcar: Sala 101' }));
    expect(screen.getByLabelText('Local no mapa da escola')).toHaveValue('sala-101');
    fireEvent.change(screen.getByLabelText('Seu ano'), { target: { value: '8º ano' } });
    fireEvent.change(screen.getByLabelText('Sua sala'), { target: { value: 'B' } });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/v4/denuncias')).toBe(true));
    const envio = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/v4/denuncias')![1]!.body as FormData;
    expect(envio.get('local_id')).toBe('sala-101');
  });
  it('exige ano e sala de quem relata antes da revisão e dá foco ao campo faltante', async () => {
    const user = await relatoLivre();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu ano');
    expect(screen.getByLabelText('Seu ano')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Seu ano'), { target: { value: '8º ano' } });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe sua sala');
    expect(screen.getByLabelText('Sua sala')).toHaveFocus();
  });
  it('envia v4 sem nome, mas mantém ano e sala e retrata o caminho do local na revisão', async () => {
    const user = await relatoLivre();
    fireEvent.change(screen.getByLabelText('Seu ano'), { target: { value: '8º ano' } });
    fireEvent.change(screen.getByLabelText('Sua sala'), { target: { value: 'B' } });
    await user.selectOptions(await screen.findByLabelText('Local no mapa da escola'), 'sala-101');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('8º ano · sala B')).toBeInTheDocument();
    expect(screen.getByText('Ala A / Sala 101')).toBeInTheDocument();
    expect(screen.getByText(/podem permitir que a equipe reconheça você/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => u === '/api/v4/denuncias')).toBe(true));
    const envio = vi.mocked(fetch).mock.calls.find(([u]) => u === '/api/v4/denuncias')![1]!.body as FormData;
    expect(envio.get('ano_relator')).toBe('8º ano');
    expect(envio.get('sala_relator')).toBe('B');
    expect(envio.get('local_id')).toBe('sala-101');
    expect(envio.get('anonimo')).toBe('true');
    expect(envio.get('nome')).toBe('');
  });
  it('catálogo indisponível permite relato com turma e descrição livre do local', async () => {
    vi.mocked(fetch).mockImplementation(async url => {
      if (url === '/api/locais') throw new Error('offline');
      return new Response(JSON.stringify(url === '/api/v3/questionario' ? questionarioV3 : { codigo: 'ABCD-1234' }));
    });
    const user = await relatoLivre();
    expect(await screen.findByText(/mapa não pôde ser carregado/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Seu ano'), { target: { value: '7º ano' } });
    fireEvent.change(screen.getByLabelText('Sua sala'), { target: { value: 'C' } });
    fireEvent.change(screen.getByLabelText(/Outro local ou mais detalhes/), { target: { value: 'Na saída da escola' } });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => u === '/api/v4/denuncias')).toBe(true));
    const envio = vi.mocked(fetch).mock.calls.find(([u]) => u === '/api/v4/denuncias')![1]!.body as FormData;
    expect(envio.get('local_id')).toBe('');
    expect(envio.get('local_outro')).toBe('Na saída da escola');
  });
  it('restaura turma e local no rascunho anônimo, sem restaurar nome', () => {
    salvarRascunhoV3({ ...vazioV3, nome: 'Não guardar', ano_relator: '8º ano', sala_relator: 'B', local_id: 'sala-101', local_outro: 'Corredor ao lado' } as typeof vazioV3);
    const dados = lerRascunhoV3().dados as unknown as Record<string, unknown>;
    expect(dados).toMatchObject({ nome: '', ano_relator: '8º ano', sala_relator: 'B', local_id: 'sala-101', local_outro: 'Corredor ao lado' });
  });
});
