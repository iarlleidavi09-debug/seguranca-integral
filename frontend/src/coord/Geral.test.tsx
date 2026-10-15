import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Geral from './Geral';
import { INTERVALO_MS } from './Fila';
import { chamadasA, servidor } from './testes/servidor';
import type { Resposta } from './testes/servidor';

const caso = (id: number, extra: Record<string, unknown> = {}) => ({
  id, tipo: 'ameaca', prioridade: 'media', pontos: 3, status: 'novo', em_andamento: false, anonimo: true, simulacao: false,
  resumo: `Resumo do caso ${id}`, motivos: [], recorrencia_pendente: false, ultimo_acesso_por: null, ultimo_acesso_em: null,
  criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00', ...extra,
});
const resumo = (extra: Record<string, unknown> = {}) => ({
  status: { novo: 4, em_investigacao: 2, resolvido: 7 }, prioridade: { critica: 1, alta: 2, media: 0, baixa: 5 }, recorrencia_pendente: 0, ...extra,
});
const fila = [
  caso(9, { prioridade: 'critica', resumo: 'Ameaça grave' }), caso(8, { prioridade: 'alta', status: 'em_investigacao' }),
  caso(7, { status: 'resolvido', resumo: 'Já resolvido' }), caso(6), caso(5), caso(4), caso(3), caso(2),
];
const montar = (corpoResumo = resumo(), casos: unknown[] = fila) => {
  servidor({ 'GET /api/resumo': () => ({ corpo: corpoResumo }), 'GET /api/casos': () => ({ corpo: { casos } }) });
  const aoVerCasos = vi.fn(); const aoAbrirCaso = vi.fn();
  render(<Geral aoVerCasos={aoVerCasos} aoAbrirCaso={aoAbrirCaso} />);
  return { aoVerCasos, aoAbrirCaso };
};

afterEach(() => { vi.useRealTimers(); });

describe('Visão geral', () => {
  it('mostra o título com foco gerenciável e o estado de carregamento', async () => {
    montar();
    const titulo = screen.getByRole('heading', { level: 1, name: 'Cada pedido merece atenção.' });
    expect(titulo).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Carregando o panorama.')).toBeInTheDocument();
    await screen.findByRole('button', { name: /Aguardando o primeiro olhar/ });
    expect(screen.queryByText('Carregando o panorama.')).toBeNull();
  });

  it('cartões de status mostram os números e filtram a lista de casos', async () => {
    const { aoVerCasos } = montar();
    const user = userEvent.setup();
    const novos = await screen.findByRole('button', { name: /Aguardando o primeiro olhar/ });
    expect(novos).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: /Investigação em andamento/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Resolvidos/ })).toHaveTextContent('7');
    await user.click(novos);
    expect(aoVerCasos).toHaveBeenLastCalledWith({ status: 'novo' });
    await user.click(screen.getByRole('button', { name: /Investigação em andamento/ }));
    expect(aoVerCasos).toHaveBeenLastCalledWith({ status: 'em_investigacao' });
    await user.click(screen.getByRole('button', { name: /Resolvidos/ }));
    expect(aoVerCasos).toHaveBeenLastCalledWith({ status: 'resolvido' });
  });

  it('contadores por prioridade têm texto e forma, com destaque para Crítica e Alta quando há casos', async () => {
    montar(resumo({ prioridade: { critica: 1, alta: 0, media: 3, baixa: 0 } }));
    const grupo = await screen.findByRole('list', { name: 'Casos por prioridade' });
    const itens = within(grupo).getAllByRole('listitem');
    expect(itens).toHaveLength(4);
    expect(itens.map(i => i.textContent)).toEqual(['Crítica1', 'Alta0', 'Média3', 'Baixa0']);
    expect(itens[0]).toHaveAttribute('data-destaque', 'sim');
    expect(itens[1]).toHaveAttribute('data-destaque', 'nao');
    expect(itens[2]).toHaveAttribute('data-destaque', 'nao');
    expect(itens[0].querySelector('svg')).not.toBeNull();
  });

  it('com recorrência pendente mostra o bloco com o primeiro caso pendente da fila e abre o caso', async () => {
    const casos = [caso(9), caso(6, { recorrencia_pendente: true }), caso(4, { recorrencia_pendente: true })];
    const { aoAbrirCaso } = montar(resumo({ recorrencia_pendente: 2 }), casos);
    const user = userEvent.setup();
    const bloco = await screen.findByRole('alert');
    expect(within(bloco).getByRole('heading', { name: 'Um cuidado precisa ser retomado' })).toBeInTheDocument();
    expect(bloco).toHaveTextContent('Caso 6: a situação voltou a acontecer. Revise a intervenção anterior e avalie medidas mais efetivas.');
    await user.click(within(bloco).getByRole('button', { name: 'Abrir caso 6' }));
    expect(aoAbrirCaso).toHaveBeenCalledWith(6);
  });

  it('se a fila não traz o caso pendente, mostra o bloco sem botão', async () => {
    montar(resumo({ recorrencia_pendente: 1 }), [caso(9)]);
    expect(await screen.findByRole('heading', { name: 'Um cuidado precisa ser retomado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Abrir caso \d+$/ })).toBeNull();
  });

  it('sem pendência o bloco não existe', async () => {
    montar();
    await screen.findByRole('button', { name: /Resolvidos/ });
    expect(screen.queryByRole('heading', { name: 'Um cuidado precisa ser retomado' })).toBeNull();
  });

  it('lista até 5 casos não resolvidos, na ordem da API, e cada linha abre o caso', async () => {
    const { aoAbrirCaso } = montar();
    const user = userEvent.setup();
    const lista = await screen.findByRole('list', { name: 'Onde concentrar a atenção' });
    const linhas = within(lista).getAllByRole('button');
    expect(linhas.map(l => l.textContent?.match(/Caso (\d+)\. Abrir\./)?.[1])).toEqual(['9', '8', '6', '5', '4']);
    expect(within(lista).queryByText('Já resolvido')).toBeNull();
    expect(linhas[0]).toHaveAccessibleName(/Caso 9\. Abrir\./);
    expect(linhas[0]).toHaveTextContent('Ameaça grave');
    expect(linhas[0]).toHaveTextContent('Crítica');
    expect(linhas[0]).toHaveTextContent('Ainda não acessado');
    await user.click(linhas[1]);
    expect(aoAbrirCaso).toHaveBeenCalledWith(8);
  });

  it('fila vazia mostra a mensagem acolhedora', async () => {
    montar(resumo({ status: { novo: 0, em_investigacao: 0, resolvido: 0 } }), []);
    expect(await screen.findByText('Nenhum pedido por enquanto.')).toBeInTheDocument();
  });

  it('erro mostra alerta e tenta de novo sozinha a cada 8 s', async () => {
    vi.useFakeTimers();
    let rodada = 0;
    servidor({
      'GET /api/resumo': () => (rodada++ === 0 ? { status: 500, corpo: { erro: 'falhou' } } : { corpo: resumo() }),
      'GET /api/casos': () => ({ corpo: { casos: fila } }),
    });
    render(<Geral aoVerCasos={vi.fn()} aoAbrirCaso={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('alert')).toHaveTextContent('tenta de novo sozinha');
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /Resolvidos/ })).toBeInTheDocument();
  });

  it('atualiza a cada 8 s, ao voltar à aba (só visível) e ignora tick durante requisição lenta', async () => {
    vi.useFakeTimers();
    let liberar!: () => void; let rodada = 0;
    servidor({
      'GET /api/resumo': () => (rodada++ === 0 ? new Promise<Resposta>(r => { liberar = () => r({ corpo: resumo() }); }) : { corpo: resumo() }),
      'GET /api/casos': () => ({ corpo: { casos: fila } }),
    });
    render(<Geral aoVerCasos={vi.fn()} aoAbrirCaso={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3); });
    expect(chamadasA('GET', '/api/resumo')).toHaveLength(1);
    const sinal = vi.mocked(fetch).mock.calls.find(([u]) => String(u).startsWith('/api/resumo'))?.[1]?.signal;
    expect(sinal?.aborted).toBe(false);
    await act(async () => { liberar(); await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(chamadasA('GET', '/api/resumo')).toHaveLength(2);
    const oculto = vi.spyOn(document, 'hidden', 'get');
    oculto.mockReturnValue(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); document.dispatchEvent(new Event('visibilitychange')); });
    expect(chamadasA('GET', '/api/resumo')).toHaveLength(2);
    oculto.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(1); });
    expect(chamadasA('GET', '/api/resumo')).toHaveLength(3);
    oculto.mockRestore();
  });
});
