import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fila from './Fila';
import { INTERVALO_MS } from './polling';
import { chamadasA, servidor } from './testes/servidor';
import type { Resposta, Rota } from './testes/servidor';
import type { FiltrosFila } from '../shared/api';
import { questionarioV3 } from '../test/questionarioV3';

const VAZIOS: FiltrosFila = { status: '', prioridade: '', tipo: '', q: '' };
const caso = (id: number, extra: Record<string, unknown> = {}) => ({
  id, tipo: 'ameaca', prioridade: 'media', pontos: 3, status: 'novo', em_andamento: false, anonimo: true, simulacao: false,
  resumo: `Resumo do caso ${id}`, motivos: [], recorrencia_pendente: false, ultimo_acesso_por: null, ultimo_acesso_em: null,
  criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00', ...extra,
});
const filaMista = [
  caso(1, { prioridade: 'baixa', resumo: 'Caso baixo' }),
  caso(2, { prioridade: 'media', resumo: 'Caso medio', motivos: ['tipo: ameaca', 'ocorrendo agora'] }),
  caso(3, { prioridade: 'alta', resumo: 'Caso alto', em_andamento: true, ultimo_acesso_por: 'Marina', ultimo_acesso_em: '2026-10-14T12:00:00+00:00' }),
  caso(4, { prioridade: 'baixa', resumo: 'Caso de treino', simulacao: true }),
  caso(5, { prioridade: 'critica', resumo: 'Caso critico' }),
];

type PropsHarness = { modo?: 'casos' | 'pos'; inicial?: FiltrosFila; aoAbrir?: (id: number) => void; meuId?: number };
/** Guarda os filtros como o App faz, para os testes poderem digitar e escolher. */
function Harness({ modo = 'casos', inicial = VAZIOS, aoAbrir = () => {}, meuId }: PropsHarness) {
  const [filtros, setFiltros] = useState(inicial);
  return <Fila modo={modo} meuId={meuId} filtros={filtros} aoFiltrar={setFiltros} aoAbrir={aoAbrir} />;
}
const consultas = () => chamadasA('GET', '/api/casos').map(c => c.url);
const montar = async (rotas: Record<string, Rota> = {}, props: PropsHarness = {}) => {
  servidor({ 'GET /api/casos': () => ({ corpo: { casos: filaMista } }), ...rotas });
  render(<Harness {...props} />);
  await screen.findByText('Caso alto');
};
// com timers falsos o user-event do Testing Library trava; fireEvent.change faz o mesmo sem esperar
const digitar = (campo: HTMLElement, texto: string) => { fireEvent.change(campo, { target: { value: texto } }); };
const linhas = () => screen.getAllByRole('row').slice(1);

it('filtra conversas com mensagem nova, mostra prévia e limpa o filtro', async () => {
  servidor({ 'GET /api/casos': () => ({ corpo: { casos: [
    caso(1, { conversa_estado: 'sem_mensagem' }),
    caso(2, { canal: 'acolhimento', conversa_estado: 'mensagem_nova', mensagens_novas: 2, ultima_mensagem: { id: 8, autor: 'aluno', texto: 'Preciso conversar hoje', criado_em: '2026-10-14T12:00:00+00:00' } }),
    caso(3, { conversa_estado: 'aguardando_aluno' }),
  ] } }) });
  render(<Harness />);
  await screen.findByText('Preciso conversar hoje');
  expect(screen.getByText('Acolhimento anônimo')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Conversa'), { target: { value: 'mensagem_nova' } });
  expect(screen.getByText('Resumo do caso 2')).toBeInTheDocument();
  expect(screen.queryByText('Resumo do caso 1')).not.toBeInTheDocument();
  expect(screen.getByText('2 mensagens novas')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  expect(screen.getByText('Resumo do caso 1')).toBeInTheDocument();
});

afterEach(() => { vi.useRealTimers(); });

describe('Fila de Casos', () => {
  it('Meu atendimento mostra apenas os casos atribuídos e separa ações vencidas', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [
      caso(1, { resumo: 'Minha ação vencida', responsavel: { id: 7, nome: 'Ana', ativo: true }, proxima_acao: 'Conversar', prazo_acao: '2000-01-01' }),
      caso(2, { resumo: 'Meu caso sem ação', responsavel: { id: 7, nome: 'Ana', ativo: true } }),
      caso(3, { resumo: 'Caso de outra pessoa', responsavel: { id: 8, nome: 'Bia', ativo: true } }),
    ] } }) });
    render(<Harness meuId={7} />);
    await screen.findByText('Minha ação vencida');
    expect(screen.queryByText('Caso de outra pessoa')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ações vencidas (1)' }));
    expect(screen.queryByText('Meu caso sem ação')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sem ação planejada (1)' }));
    expect(screen.getByText('Meu caso sem ação')).toBeInTheDocument();
    expect(screen.queryByText('Minha ação vencida')).toBeNull();
    expect(screen.getByText('Sem primeiro acesso há mais de 24 horas')).toBeInTheDocument();
  });
  it('separa não abertos, atenção e resolvidos sem esconder resolvido com pendência', async () => {
    const user = userEvent.setup();
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [
      caso(1, { resumo: 'Ainda por abrir', nao_aberto: true, atencao: ['sem_resposta'] }),
      caso(2, { resumo: 'Resolvido tranquilo', status: 'resolvido', nao_aberto: false, atencao: [] }),
      caso(3, { resumo: 'Resolvido precisa retorno', status: 'resolvido', nao_aberto: false, atencao: ['mensagem_pendente'] }),
    ] } }) });
    render(<Harness />);
    await screen.findByText('Ainda por abrir');
    await user.click(screen.getByRole('button', { name: 'Precisam de atenção (2)' }));
    expect(screen.queryByText('Resolvido tranquilo')).not.toBeInTheDocument();
    expect(screen.getByText('Resolvido precisa retorno')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ainda não abertos (1)' }));
    expect(screen.getByText('Ainda por abrir')).toBeInTheDocument();
    expect(screen.queryByText('Resolvido precisa retorno')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resolvidos (2)' }));
    expect(screen.getByText('Resolvido tranquilo')).toBeInTheDocument();
    expect(screen.getByText('Resolvido precisa retorno')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Motivo de atenção'), 'mensagem_pendente');
    expect(screen.getByRole('button', { name: 'Todos (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Precisam de atenção (1)' })).toBeInTheDocument();
  });
  it('mostra assuntos v3 e filtra por grupo e opção com IDs canônicos', async () => {
    const user = userEvent.setup();
    servidor({
      'GET /api/v3/questionario': () => ({ corpo: { ...questionarioV3, perguntas: questionarioV3.perguntas.filter(p => questionarioV3.comuns.includes(p.id)), grupos: [{ id: 'customizado', nome: 'Grupo customizado', opcoes: [{ id: 'nova-opcao', texto: 'Situação customizada', perguntas: [] }] }] } }),
      'GET /api/casos': () => ({ corpo: { casos: [caso(9, { categorias: ['customizado'], opcoes: ['nova-opcao'], assuntos: ['Texto histórico do pedido'] })] } }),
    });
    render(<Harness />);
    expect(await screen.findByText('Texto histórico do pedido', { selector: 'button' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Grupo customizado' });
    await user.selectOptions(screen.getByLabelText('Grupo de situações'), 'customizado');
    await user.selectOptions(screen.getByLabelText('Situação relatada'), 'nova-opcao');
    await waitFor(() => expect(consultas().at(-1)).toContain('grupo=customizado'));
    expect(consultas().at(-1)).toContain('opcao=nova-opcao');
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(consultas().at(-1)).toBe('/api/casos'));
  });
  it('mostra o título Casos e a tabela com as quatro colunas, sem coluna de botão', async () => {
    await montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Casos' })).toHaveAttribute('tabindex', '-1');
    const cabecalho = screen.getAllByRole('columnheader').map(c => c.textContent);
    expect(cabecalho).toEqual(['Caso e situação', 'Prioridade', 'Status', 'Último acesso']);
  });

  it('ordena crítica, alta, média e baixa sem reordenar dentro da mesma prioridade, com forma e texto', async () => {
    await montar();
    expect(linhas().map(l => l.textContent)).toEqual([
      expect.stringContaining('Caso critico'), expect.stringContaining('Caso alto'), expect.stringContaining('Caso medio'),
      expect.stringContaining('Caso baixo'), expect.stringContaining('Caso de treino'),
    ]);
    expect(linhas()[0]).toHaveAttribute('data-gravidade', 'critica');
    expect(within(linhas()[1]).getByText('Alta').querySelector('svg')).not.toBeNull();
    expect(within(linhas()[2]).getByText('Média').querySelector('svg')).not.toBeNull();
    expect(within(linhas()[3]).getByText('Baixa').querySelector('svg')).not.toBeNull();
  });

  it('mostra tipo, resumo, o primeiro motivo e o último acesso', async () => {
    await montar();
    const alto = linhas()[1];
    expect(within(alto).getByText('Ameaça')).toBeInTheDocument();
    expect(within(alto).getByText('Caso alto')).toBeInTheDocument();
    expect(alto).not.toHaveTextContent('Por que');
    expect(within(alto).getByText(/Marina, /)).toBeInTheDocument();
    expect(within(alto).getByText('Ocorrendo agora')).toBeInTheDocument();
    const medio = linhas()[2];
    expect(within(medio).getByText(/Por que:.*(agora|andamento)/i)).toBeInTheDocument();
    expect(within(medio).getByText('Ainda não acessado')).toBeInTheDocument();
  });

  it('mostra o selo simulação só nos casos simulados', async () => {
    await montar();
    expect(within(linhas()[4]).getByText('simulação')).toBeInTheDocument();
    expect(screen.getAllByText('simulação')).toHaveLength(1);
  });

  it('marca "Voltou a acontecer" com ícone e texto só nos casos com recorrência pendente', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [caso(7, { resumo: 'Voltou', recorrencia_pendente: true }), caso(8)] } }) });
    render(<Harness />);
    const chip = await screen.findByText('Voltou a acontecer');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(screen.getAllByText('Voltou a acontecer')).toHaveLength(1);
    expect(linhas()[0]).toContainElement(chip);
  });

  it('a linha é um botão acessível "Caso N. Abrir." e abre o caso pelo teclado', async () => {
    const aoAbrir = vi.fn();
    await montar({}, { aoAbrir });
    const user = userEvent.setup();
    const botao = screen.getByRole('button', { name: 'Caso 3. Abrir.' });
    botao.focus();
    await user.keyboard('{Enter}');
    expect(aoAbrir).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Caso 1. Abrir.' }));
    expect(aoAbrir).toHaveBeenLastCalledWith(1);
  });

  it('busca só consulta 300 ms depois de parar de digitar, com o texto completo e codificado', async () => {
    vi.useFakeTimers();
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: filaMista } }) });
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(consultas()).toEqual(['/api/casos']);
    const campo = screen.getByLabelText('Buscar por assunto ou número do caso');
    expect(campo).toHaveAttribute('maxlength', '100');
    digitar(campo, '1'); digitar(campo, '10');
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(consultas()).toEqual(['/api/casos']);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(consultas()).toEqual(['/api/casos', '/api/casos?q=10']);
    digitar(campo, ''); digitar(campo, '100%');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(consultas().at(-1)).toBe('/api/casos?q=100%25');
  });

  it('busca só com espaços equivale a sem busca e o texto enviado é aparado', async () => {
    vi.useFakeTimers();
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: filaMista } }) });
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const campo = screen.getByLabelText('Buscar por assunto ou número do caso');
    digitar(campo, '   ');
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(consultas()).toEqual(['/api/casos']);
    digitar(campo, 'golpe  ');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(consultas().at(-1)).toBe('/api/casos?q=golpe');
  });

  it('filtros de status, prioridade e tipo enviam a query certa e Limpar filtros restaura tudo', async () => {
    const user = userEvent.setup();
    await montar({ 'GET /api/casos': (_c, url) => ({ corpo: { casos: url.searchParams.get('status') === 'resolvido' ? [] : filaMista } }) });
    await user.selectOptions(screen.getByLabelText('Status'), 'resolvido');
    expect(await screen.findByText('Nenhum caso com esses filtros.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Prioridade'), 'alta');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'golpe');
    await waitFor(() => expect(consultas()).toContain('/api/casos?status=resolvido&prioridade=alta&tipo=golpe'));
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByText('Caso alto')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByLabelText('Prioridade')).toHaveValue('');
    expect(screen.getByLabelText('Tipo')).toHaveValue('');
    expect(screen.getByLabelText('Buscar por assunto ou número do caso')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('estado vazio sem filtros', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [] } }) });
    render(<Harness />);
    expect(screen.getByText('Carregando a fila.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum caso na fila.')).toBeInTheDocument();
  });

  it('erro mostra alerta e tenta de novo em 8 s', async () => {
    vi.useFakeTimers();
    let rodada = 0;
    servidor({ 'GET /api/casos': () => (rodada++ === 0 ? { status: 503 } : { corpo: { casos: filaMista } }) });
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Carregando a fila.')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Caso alto')).toBeInTheDocument();
  });

  it('atualiza a cada 8 segundos, pausa com a aba oculta e para ao desmontar', async () => {
    vi.useFakeTimers();
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: filaMista } }) });
    const { unmount } = render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(2);
    const oculto = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(2);
    oculto.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(1); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(3);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignora o tick de 8 s enquanto há requisição em curso, sem abortar', async () => {
    vi.useFakeTimers();
    let liberar!: () => void;
    let rodada = 0;
    servidor({ 'GET /api/casos': () => (rodada++ === 0 ? new Promise<Resposta>(r => { liberar = () => r({ corpo: { casos: filaMista } }); }) : { corpo: { casos: filaMista } }) });
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(1);
    const sinal = vi.mocked(fetch).mock.calls.find(([u]) => String(u).startsWith('/api/casos'))?.[1]?.signal;
    expect(sinal?.aborted).toBe(false);
    await act(async () => { liberar(); await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('Caso alto')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(2);
  });

  it('avisa em região aria-live quando chega caso novo', async () => {
    vi.useFakeTimers();
    let rodada = 0;
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: rodada++ === 0 ? filaMista.slice(0, 2) : filaMista } }) });
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('2 casos na fila.')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    const aviso = screen.getByText('Chegaram 3 casos novos.');
    expect(aviso).toHaveAttribute('aria-live', 'polite');
  });

  it('401 não mostra erro na fila (o App devolve ao Login)', async () => {
    vi.useFakeTimers();
    let rodada = 0;
    servidor({ 'GET /api/casos': () => (rodada++ === 0 ? { corpo: { casos: filaMista } } : { status: 401 }) });
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Fila compacta', () => {
  it('não há botão chamado Abrir; o assunto é o botão do caso e abre uma vez só', async () => {
    const aoAbrir = vi.fn();
    await montar({}, { aoAbrir });
    expect(screen.queryByRole('button', { name: /^Abrir$/ })).toBeNull();
    const botao = screen.getByRole('button', { name: 'Caso 3. Abrir.' });
    expect(botao).toHaveClass('casos-assunto');
    expect(botao).toHaveTextContent('Ameaça');
    await userEvent.setup().click(botao);
    expect(aoAbrir).toHaveBeenCalledTimes(1);
    expect(aoAbrir).toHaveBeenCalledWith(3);
    expect(screen.getAllByRole('button', { name: /^Caso \d+\. Abrir\.$/ })).toHaveLength(5);
  });

  it('clicar na linha abre o caso, mas não quando o clique vem de um botão ou de seleção de texto', async () => {
    const aoAbrir = vi.fn();
    await montar({}, { aoAbrir });
    fireEvent.click(within(linhas()[1]).getByText('Caso alto'));
    expect(aoAbrir).toHaveBeenCalledTimes(1);
    expect(aoAbrir).toHaveBeenLastCalledWith(3);
    const selecao = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Caso' } as Selection);
    fireEvent.click(within(linhas()[1]).getByText('Caso alto'));
    expect(aoAbrir).toHaveBeenCalledTimes(1);
    selecao.mockRestore();
    fireEvent.click(within(linhas()[1]).getByRole('button', { name: 'Caso 3. Abrir.' }));
    expect(aoAbrir).toHaveBeenCalledTimes(2);
  });

  it('mostra "N mensagens novas" na primeira linha, com o resumo e o texto de apoio uma vez cada', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [
      caso(2, { canal: 'acolhimento', conversa_estado: 'mensagem_nova', mensagens_novas: 2, motivos: ['ocorrendo agora'], ultima_mensagem: { id: 8, autor: 'aluno', texto: 'Preciso conversar hoje', criado_em: '2026-10-14T12:00:00+00:00' } }),
    ] } }) });
    render(<Harness />);
    const selo = await screen.findByText('2 mensagens novas');
    expect(selo.closest('.casos-linha1')).toContainElement(screen.getByRole('button', { name: 'Caso 2. Abrir.' }));
    expect(screen.getAllByText('Resumo do caso 2')).toHaveLength(1);
    const meta = linhas()[0].querySelector('.casos-meta')!;
    expect(meta).toHaveTextContent('Responsável: Não atribuído');
    expect(meta).toHaveTextContent(/Por que:/);
    expect(within(linhas()[0]).getByText('Preciso conversar hoje')).toBeInTheDocument();
  });

  it('mostra no máximo dois motivos de atenção e "+N" para o resto', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [
      caso(1, { atencao: ['sem_resposta', 'mensagem_pendente', 'acao_vencida'] }),
    ] } }) });
    render(<Harness />);
    await screen.findByText('Resumo do caso 1');
    const motivos = linhas()[0].querySelector('.casos-motivos')!;
    expect(motivos.querySelectorAll('.casos-motivo')).toHaveLength(2);
    const mais = motivos.querySelector('.casos-mais') as HTMLElement;
    expect(mais).toHaveTextContent('+1');
    expect(mais.querySelector('.so-leitor')).toHaveTextContent('e mais: Ação vencida');
  });

  it('clicar em select, link ou label dentro da linha não abre o caso', async () => {
    const aoAbrir = vi.fn();
    await montar({}, { aoAbrir });
    const linha = linhas()[1];
    for (const tag of ['select', 'a', 'label']) {
      const el = document.createElement(tag); el.textContent = 'x'; linha.querySelector('td')!.appendChild(el);
      fireEvent.click(el);
    }
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it('o texto de ajuda dos filtros fica dentro dos filtros detalhados e o resumo conta os ativos', async () => {
    await montar();
    const detalhes = document.querySelector('details.filtros-detalhados')!;
    expect(detalhes).toContainElement(document.querySelector('.filtros-ajuda') as HTMLElement);
    expect(detalhes.querySelector('summary')).toHaveTextContent('Filtros detalhados');
    fireEvent.change(screen.getByLabelText('Prioridade'), { target: { value: 'alta' } });
    expect(detalhes.querySelector('summary')).toHaveTextContent('Filtros detalhados (1 ativos)');
  });

  it('as visões ficam em uma linha rolável e a região de status continua', async () => {
    await montar();
    const visoes = document.querySelector('.fila-visoes')!;
    expect(within(visoes as HTMLElement).getAllByRole('button').map(b => b.textContent)).toEqual([
      'Todos (5)', 'Ainda não abertos (4)', 'Precisam de atenção (0)', 'Resolvidos (0)',
    ]);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});

describe('Fila de Pós-resolução', () => {
  const resolvidos = [
    caso(10, { status: 'resolvido', prioridade: 'alta', resumo: 'Resolvido alto' }),
    caso(11, { status: 'resolvido', prioridade: 'media', resumo: 'Resolvido com retorno', recorrencia_pendente: true }),
    caso(12, { status: 'resolvido', prioridade: 'baixa', resumo: 'Resolvido baixo' }),
    caso(13, { status: 'resolvido', prioridade: 'baixa', resumo: 'Outro com retorno', recorrencia_pendente: true }),
  ];

  it('mostra o título, consulta sem status, esconde o seletor de status e põe a recorrência primeiro', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: resolvidos } }) });
    render(<Harness modo="pos" />);
    await screen.findByText('Resolvido alto');
    expect(screen.getByRole('heading', { level: 1, name: 'O cuidado continua.' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(consultas()[0]).toBe('/api/casos');
    expect(linhas().map(l => l.textContent)).toEqual([
      expect.stringContaining('Resolvido com retorno'), expect.stringContaining('Outro com retorno'),
      expect.stringContaining('Resolvido alto'), expect.stringContaining('Resolvido baixo'),
    ]);
  });

  it('não envia status ao filtrar nem ao limpar', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: resolvidos } }) });
    render(<Harness modo="pos" />);
    await screen.findByText('Resolvido alto');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Prioridade'), 'alta');
    await waitFor(() => expect(consultas()).toContain('/api/casos?prioridade=alta'));
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(consultas().at(-1)).toBe('/api/casos'));
  });

  it('inclui o caso reaberto com recorrência pendente e deixa de fora o que não é resolvido nem pendente', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [
      caso(20, { status: 'em_investigacao', resumo: 'Reaberto sem retorno' }),
      caso(21, { status: 'em_investigacao', resumo: 'Reaberto com retorno', recorrencia_pendente: true }),
      caso(22, { status: 'resolvido', resumo: 'Resolvido simples' }),
      caso(23, { status: 'novo', resumo: 'Novo qualquer' }),
    ] } }) });
    render(<Harness modo="pos" />);
    await screen.findByText('Resolvido simples');
    expect(linhas().map(l => l.textContent)).toEqual([
      expect.stringContaining('Reaberto com retorno'), expect.stringContaining('Resolvido simples'),
    ]);
    expect(screen.queryByText('Reaberto sem retorno')).toBeNull();
    expect(screen.queryByText('Novo qualquer')).toBeNull();
    expect(screen.getByText('2 casos resolvidos ou com recorrência.', { selector: '[role=status]' })).toBeInTheDocument();
  });

  it('estado vazio próprio', async () => {
    servidor({ 'GET /api/casos': () => ({ corpo: { casos: [] } }) });
    render(<Harness modo="pos" />);
    expect(await screen.findByText('Nenhum caso resolvido ou com recorrência ainda.')).toBeInTheDocument();
  });
});
