import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { INTERVALO_MS } from './polling';
import { chamadas, chamadasA, servidor } from './testes/servidor';
import type { Resposta, Rota } from './testes/servidor';

const caso = (id: number, extra: Record<string, unknown> = {}) => ({
  id, tipo: 'ameaca', prioridade: 'media', pontos: 3, status: 'novo', em_andamento: false, anonimo: true,
  simulacao: false, resumo: `Resumo do caso ${id}`, criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00', ...extra,
});
const filaMista = [
  caso(1, { prioridade: 'baixa', resumo: 'Caso baixo' }),
  caso(2, { prioridade: 'media', resumo: 'Caso medio' }),
  caso(3, { prioridade: 'alta', resumo: 'Caso alto', em_andamento: true }),
  caso(4, { prioridade: 'baixa', resumo: 'Caso de treino', simulacao: true }),
];
const detalhe = (extra: Record<string, unknown> = {}) => ({
  ...caso(5, { prioridade: 'alta' }), relato: 'Relato completo do aluno.', quando: 'ontem', onde: 'aplicativo da turma',
  nome: null, turma: null, motivos: ['tipo: ameaca', 'ocorrendo agora', 'termos de risco: violencia'],
  anexos: [{ id: 9, tipo: 'png', tamanho: 100 }],
  eventos: [{ id: 1, tipo: 'criado', usuario_id: null, usuario: null, detalhe: 'prioridade alta', criado_em: '2026-10-14T10:00:00+00:00' }],
  mensagens: [{ autor: 'coordenacao', texto: 'Mensagem publica para o aluno', criado_em: '2026-10-14T11:00:00+00:00' }],
  notas: [{ id: 1, usuario_id: 1, usuario: 'Marina', texto: 'Nota reservada da equipe', criado_em: '2026-10-14T11:30:00+00:00' }],
  ...extra,
});
const logado: Rota = () => ({ corpo: { id: 1, nome: 'Marina', papel: 'admin' } });

beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => { vi.useRealTimers(); });

describe('Entrada', () => {
  it('sem sessão mostra só o Login', async () => {
    servidor({ 'GET /api/eu': () => ({ status: 401 }) });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Portal da coordenação' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Casos' })).not.toBeInTheDocument();
    expect(chamadasA('GET', '/api/casos')).toHaveLength(0);
  });

  it('qualquer falha de entrada mostra a mesma mensagem', async () => {
    const user = userEvent.setup();
    const respostas: Resposta[] = [{ status: 401, corpo: { erro: 'nome ou senha invalidos' } }, { status: 400 }, { status: 500 }, { status: 404 }];
    servidor({ 'GET /api/eu': () => ({ status: 401 }), 'POST /api/login': () => respostas.shift()! });
    render(<App />);
    await screen.findByLabelText('Nome');
    const vistos = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      await user.type(screen.getByLabelText('Nome'), 'ana');
      await user.type(screen.getByLabelText('Senha'), 'senha-errada');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      vistos.add((await screen.findByRole('alert')).textContent ?? '');
      await user.clear(screen.getByLabelText('Nome'));
    }
    expect([...vistos]).toEqual(['Nome ou senha incorretos.']);
  });

  it('mostra mensagens próprias para muitas tentativas e servidor ocupado', async () => {
    const user = userEvent.setup();
    const respostas: Resposta[] = [{ status: 429 }, { status: 503 }];
    servidor({ 'GET /api/eu': () => ({ status: 401 }), 'POST /api/login': () => respostas.shift()! });
    render(<App />);
    await screen.findByLabelText('Nome');
    await user.type(screen.getByLabelText('Nome'), 'ana');
    await user.type(screen.getByLabelText('Senha'), 'qualquer-senha');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
    await user.type(screen.getByLabelText('Senha'), 'qualquer-senha');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Servidor ocupado, tente de novo.'));
  });

  it('entra com JSON, mostra a visão geral e sai pelo botão', async () => {
    const user = userEvent.setup();
    let entrou = false;
    servidor({
      'GET /api/eu': () => (entrou ? { corpo: { id: 7, nome: 'Marina', papel: 'admin' } } : { status: 401 }),
      'POST /api/login': () => { entrou = true; return { corpo: { nome: 'Marina' } }; },
      'GET /api/casos': () => ({ corpo: { casos: [] } }), 'GET /api/resumo': () => ({ corpo: { status: { novo: 0, em_investigacao: 0, resolvido: 0 }, prioridade: { critica: 0, alta: 0, media: 0, baixa: 0 }, recorrencia_pendente: 0 } }), 'POST /api/logout': () => ({ corpo: { ok: true } }),
    });
    render(<App />);
    await user.type(await screen.findByLabelText('Nome'), 'Marina');
    await user.type(screen.getByLabelText('Senha'), 'uma-senha-longa');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Cada pedido merece atenção.' })).toBeInTheDocument();
    const login = chamadasA('POST', '/api/login')[0];
    expect(login.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(login.corpo).toEqual({ nome: 'Marina', senha: 'uma-senha-longa' });
    expect(chamadasA('GET', '/api/eu')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
    expect(chamadasA('POST', '/api/logout')[0].init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(chamadasA('POST', '/api/logout')[0].corpo).toEqual({});
  });
});

describe('Casos no App', () => {
  const abrirFila = async (rotas: Record<string, Rota> = {}) => {
    servidor({ 'GET /api/eu': logado, 'GET /api/casos': () => ({ corpo: { casos: filaMista } }), ...rotas });
    window.history.replaceState(null, '', '/#casos');
    render(<App />);
    await screen.findByText('Caso alto');
  };
  // ordem, filtros, busca, polling e avisos da fila ficam em Fila.test.tsx

  it('abre o caso e guarda só o número no endereço', async () => {
    const user = userEvent.setup();
    await abrirFila({ 'GET /api/casos/3': () => ({ corpo: detalhe({ id: 3 }) }) });
    await user.click(screen.getByRole('button', { name: 'Caso 3. Abrir.' }));
    expect(await screen.findByRole('heading', { name: /Caso 3/ })).toHaveFocus();
    expect(window.location.hash).toBe('#caso-3');
    expect(window.location.href).not.toMatch(/Relato|alto|Marina/);
    expect(localStorage.length).toBe(0);
  });

  it('401 em qualquer chamada devolve ao Login', async () => {
    vi.useFakeTimers();
    let rodada = 0;
    servidor({ 'GET /api/eu': logado, 'GET /api/casos': () => (rodada++ === 0 ? { corpo: { casos: filaMista } } : { status: 401 }) });
    window.history.replaceState(null, '', '/#casos');
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('heading', { name: 'Casos' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS); });
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByText(/Sua sessão terminou/)).toBeInTheDocument();
    expect(screen.queryByText('Caso alto')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3); });
    expect(chamadasA('GET', '/api/casos')).toHaveLength(2);
  });
});

describe('Caso', () => {
  let estado: any;
  const abrirCaso = async (rotas: Record<string, Rota> = {}) => {
    estado = detalhe();
    servidor({
      'GET /api/eu': logado, 'GET /api/casos': () => ({ corpo: { casos: filaMista } }),
      'GET /api/casos/5': () => ({ corpo: estado }),
      'POST /api/casos/5/status': c => {
        estado = { ...estado, status: c.status, eventos: [...estado.eventos, { id: 2, tipo: 'status', usuario_id: 1, usuario: 'Marina', detalhe: `status: novo -> ${c.status}`, criado_em: '2026-10-14T12:00:00+00:00' }] };
        return { corpo: { ok: true } };
      },
      'POST /api/casos/5/mensagens': c => { estado = { ...estado, mensagens: [...estado.mensagens, { autor: 'coordenacao', texto: c.texto, criado_em: '2026-10-14T12:10:00+00:00' }] }; return { status: 201, corpo: { ok: true } }; },
      'POST /api/casos/5/notas': c => { estado = { ...estado, notas: [...estado.notas, { id: 2, usuario_id: 1, usuario: 'Marina', texto: c.texto, criado_em: '2026-10-14T12:20:00+00:00' }] }; return { status: 201, corpo: { ok: true } }; },
      ...rotas,
    });
    window.history.replaceState(null, '', '/#caso-5');
    render(<App />);
    return userEvent.setup();
  };

  it('mantém mensagens ao aluno e notas internas separadas', async () => {
    const user = await abrirCaso();
    await user.click(await screen.findByRole('tab', { name: 'Conversa' }));
    await screen.findByText('Mensagem publica para o aluno');
    expect(screen.queryByText('Nota reservada da equipe')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Mensagem ao aluno'), 'Vamos ajudar você');
    await user.click(screen.getByRole('button', { name: 'Enviar ao aluno' }));
    await screen.findByText('Mensagem enviada ao aluno.', { selector: '[role=status]' });
    expect(chamadasA('POST', '/api/casos/5/mensagens')[0].corpo).toEqual({ texto: 'Vamos ajudar você' });
    expect(chamadasA('POST', '/api/casos/5/notas')).toHaveLength(0);
    expect(screen.getByText('Vamos ajudar você')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Notas internas' }));
    const painel = screen.getByRole('tabpanel');
    expect(within(painel).getByText('Nota reservada da equipe')).toBeInTheDocument();
    expect(within(painel).queryByText('Mensagem publica para o aluno')).not.toBeInTheDocument();
    expect(within(painel).queryByText('Vamos ajudar você')).not.toBeInTheDocument();
    expect(within(painel).getByText(/O aluno nunca recebe esta nota/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nota interna'), 'Conversar com a família');
    await user.click(screen.getByRole('button', { name: 'Salvar nota' }));
    expect(await within(screen.getByRole('tabpanel')).findByText('Conversar com a família')).toBeInTheDocument();
    expect(chamadasA('POST', '/api/casos/5/notas')[0].corpo).toEqual({ texto: 'Conversar com a família' });
    expect(chamadasA('POST', '/api/casos/5/mensagens')).toHaveLength(1);
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    expect(screen.queryByText('Conversar com a família')).not.toBeInTheDocument();
  });

  it('as abas respondem às setas, Home e End', async () => {
    const user = await abrirCaso();
    const relato = await screen.findByRole('tab', { name: 'Relato e investigação' });
    expect(relato).toHaveAttribute('aria-selected', 'true');
    relato.focus();
    await user.keyboard('{ArrowRight}');
    const conversa = screen.getByRole('tab', { name: 'Conversa' });
    expect(conversa).toHaveFocus();
    expect(conversa).toHaveAttribute('aria-selected', 'true');
    expect(conversa).toHaveAttribute('tabindex', '0');
    expect(relato).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{End}');
    const historico = screen.getByRole('tab', { name: 'Histórico' });
    expect(historico).toHaveFocus();
    expect(historico).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(relato).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(historico).toHaveFocus();
    await user.keyboard('{Home}');
    expect(relato).toHaveFocus();
    expect(relato).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', relato.id);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('não envia texto vazio', async () => {
    const user = await abrirCaso();
    await user.click(await screen.findByRole('tab', { name: 'Conversa' }));
    await user.click(await screen.findByRole('button', { name: 'Enviar ao aluno' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva de 1 a 2000');
    expect(chamadasA('POST', '/api/casos/5/mensagens')).toHaveLength(0);
  });

});

describe('Usuários e ensaio', () => {
  const usuarios = [{ id: 1, nome: 'Marina', ativo: true }, { id: 2, nome: 'Paulo', ativo: true }, { id: 3, nome: 'Rita', ativo: false }];
  const abrir = async (hash: string, rotas: Record<string, Rota> = {}) => {
    servidor({
      'GET /api/eu': logado, 'GET /api/casos': () => ({ corpo: { casos: [] } }),
      'GET /api/usuarios': () => ({ corpo: { usuarios } }), ...rotas,
    });
    window.history.replaceState(null, '', hash);
    render(<App />);
    return userEvent.setup();
  };

  it('lista usuários, bloqueia a própria conta e pede confirmação para desativar', async () => {
    const enviado: Rota = () => ({ corpo: { ok: true } });
    const user = await abrir('/#usuarios', { 'POST /api/usuarios/2/desativar': enviado });
    expect(await screen.findByText('Paulo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar Marina' })).not.toBeInTheDocument();
    expect(screen.getByText('Você não pode desativar a própria conta.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar Rita' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desativar Paulo' }));
    expect(chamadasA('POST', '/api/usuarios/2/desativar')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(chamadasA('POST', '/api/usuarios/2/desativar')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Desativar Paulo' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar desativação' }));
    await screen.findByText('Usuário Paulo desativado.');
    const envio = chamadasA('POST', '/api/usuarios/2/desativar')[0];
    expect(envio.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(envio.corpo).toEqual({});
  });

  it('cria usuário só com senha de 10 caracteres ou mais', async () => {
    const user = await abrir('/#usuarios', { 'POST /api/usuarios': () => ({ status: 201, corpo: { id: 9, nome: 'Carla' } }) });
    await screen.findByText('Paulo');
    await user.type(screen.getByLabelText('Nome'), 'Carla');
    await user.type(screen.getByLabelText('Senha'), 'curta123');
    await user.click(screen.getByRole('button', { name: 'Criar usuário' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('pelo menos 10');
    expect(chamadasA('POST', '/api/usuarios')).toHaveLength(0);
    await user.type(screen.getByLabelText('Senha'), '45');
    await user.click(screen.getByRole('button', { name: 'Criar usuário' }));
    await screen.findByText('Usuário Carla criado.');
    const envio = chamadasA('POST', '/api/usuarios')[0];
    expect(envio.corpo).toEqual({ nome: 'Carla', senha: 'curta12345' });
    expect(envio.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it('carrega a simulação com corpo JSON e remove só depois de confirmar', async () => {
    const user = await abrir('/#ensaio', {
      'POST /api/simulacao/carregar': () => ({ corpo: { criados: 18 } }),
      'DELETE /api/simulacao': () => ({ corpo: { removidos: 18 } }),
    });
    await user.click(await screen.findByRole('button', { name: 'Carregar casos de simulação' }));
    expect(await screen.findByText('18 casos criados.')).toBeInTheDocument();
    const carga = chamadasA('POST', '/api/simulacao/carregar')[0];
    expect(carga.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(carga.corpo).toEqual({});

    await user.click(screen.getByRole('button', { name: 'Remover simulação' }));
    expect(chamadasA('DELETE', '/api/simulacao')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(chamadasA('DELETE', '/api/simulacao')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Remover simulação' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByText('18 casos removidos.')).toBeInTheDocument();
    const remocao = chamadasA('DELETE', '/api/simulacao')[0];
    expect(remocao.init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('503 vira mensagem amigável', async () => {
    const user = await abrir('/#ensaio', { 'POST /api/simulacao/carregar': () => ({ status: 503 }) });
    await user.click(await screen.findByRole('button', { name: 'Carregar casos de simulação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor ocupado, tente de novo.');
  });
});

describe('Telas principais', () => {
  it.each([['/', 'Cada pedido merece atenção'], ['/#casos', 'Casos'], ['/#caso-5', 'Caso 5'], ['/#usuarios', 'Usuários'], ['/#ensaio', 'Ensaio']])(
    'a tela %s não usa atributo style nem guarda dados no navegador', async (endereco, titulo) => {
      servidor({
        'GET /api/eu': logado, 'GET /api/casos': () => ({ corpo: { casos: filaMista } }), 'GET /api/resumo': () => ({ corpo: { status: { novo: 0, em_investigacao: 0, resolvido: 0 }, prioridade: { critica: 0, alta: 0, media: 0, baixa: 0 }, recorrencia_pendente: 0 } }),
        'GET /api/casos/5': () => ({ corpo: detalhe() }), 'GET /api/usuarios': () => ({ corpo: { usuarios: [{ id: 1, nome: 'Marina', ativo: true }] } }),
      });
      window.history.replaceState(null, '', endereco);
      const { container } = render(<App />);
      await screen.findByRole('heading', { name: new RegExp(titulo) });
      await waitFor(() => expect(container.textContent).not.toMatch(/Carregando/));
      expect(container.querySelectorAll('[style]')).toHaveLength(0);
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });
});

describe('Primeiro acesso', () => {
  const pendente = (local: boolean) => ({ 'GET /api/eu': () => ({ status: 401 }), 'GET /api/setup': () => ({ corpo: { pendente: true, local } }) });

  it('sem contas mostra a criação do administrador e entra ao criar', async () => {
    let criada = false;
    servidor({
      ...pendente(true),
      'GET /api/eu': () => (criada ? { corpo: { id: 1, nome: 'Diretora', papel: 'admin' } } : { status: 401 }),
      'POST /api/setup': () => { criada = true; return { status: 201, corpo: { nome: 'Diretora' } }; },
      'GET /api/casos': () => ({ corpo: { casos: [] } }),
    });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Criar conta de administrador' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nome'), 'Diretora');
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await user.type(screen.getByLabelText('Repita a senha'), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Criar conta e entrar' }));
    expect(await screen.findByRole('button', { name: 'Usuários' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/setup')[0].corpo).toEqual({ nome: 'Diretora', senha: 'senha-forte-123' });
  });

  it('recusa senhas diferentes ou curtas sem chamar o servidor', async () => {
    servidor(pendente(true));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Criar conta de administrador' });
    await user.type(screen.getByLabelText('Nome'), 'Diretora');
    await user.type(screen.getByLabelText('Senha'), 'curta');
    await user.click(screen.getByRole('button', { name: 'Criar conta e entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('pelo menos 10');
    await user.clear(screen.getByLabelText('Senha'));
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await user.type(screen.getByLabelText('Repita a senha'), 'outra-coisa-123');
    await user.click(screen.getByRole('button', { name: 'Criar conta e entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não são iguais');
    expect(chamadasA('POST', '/api/setup')).toHaveLength(0);
  });

  it('fora da máquina do servidor só orienta, sem formulário', async () => {
    servidor(pendente(false));
    render(<App />);
    expect(await screen.findByText(/computador onde o servidor está instalado/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha')).toBeNull();
  });

  it('com contas existentes mostra o Login normal', async () => {
    servidor({ 'GET /api/eu': () => ({ status: 401 }), 'GET /api/setup': () => ({ corpo: { pendente: false, local: true } }) });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Portal da coordenação' })).toBeInTheDocument();
  });

  it('coordenador sem papel de admin não vê a aba Usuários', async () => {
    servidor({ 'GET /api/eu': () => ({ corpo: { id: 2, nome: 'Paulo', papel: 'coordenador' } }), 'GET /api/casos': () => ({ corpo: { casos: [] } }) });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Casos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usuários' })).toBeNull();
  });
});
