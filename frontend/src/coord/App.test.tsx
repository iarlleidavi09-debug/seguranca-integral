import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { servidor } from './testes/servidor';
import type { Rota } from './testes/servidor';

const admin: Rota = () => ({ corpo: { id: 1, nome: 'Marina', papel: 'admin' } });
const coordenador: Rota = () => ({ corpo: { id: 2, nome: 'Paulo', papel: 'coordenador' } });
const resumo = (pendente = 2): Rota => () => ({
  corpo: { status: { novo: 1, em_investigacao: 0, resolvido: 0 }, prioridade: { critica: 0, alta: 1, media: 0, baixa: 0 }, recorrencia_pendente: pendente },
});
const detalhe = () => ({
  id: 12, tipo: 'ameaca', prioridade: 'alta', pontos: 3, status: 'novo', em_andamento: false, anonimo: true, simulacao: false,
  criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00', relato: 'Relato.', quando: null, onde: null,
  nome: null, turma: null, motivos: [], anexos: [], eventos: [], mensagens: [], notas: [],
});
const abrir = (eu: Rota, endereco = '/', extra: Record<string, Rota> = {}) => {
  servidor({
    'GET /api/eu': eu, 'GET /api/casos': () => ({ corpo: { casos: [] } }), 'GET /api/resumo': resumo(),
    'GET /api/casos/12': () => ({ corpo: detalhe() }), 'GET /api/usuarios': () => ({ corpo: { usuarios: [] } }), ...extra,
  });
  window.history.replaceState(null, '', endereco);
  return render(<App />);
};

beforeEach(() => { window.history.replaceState(null, '', '/'); });

describe('Casca da coordenação', () => {
  it('sem sessão mostra o Login dentro do tema', async () => {
    const { container } = abrir(() => ({ status: 401 }));
    expect(await screen.findByRole('heading', { name: 'Portal da coordenação' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('coord-app');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('administrador vê todas as telas, o nome e Sair', async () => {
    const { container } = abrir(admin);
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    for (const nome of [/Visão geral/, /Casos/, /Pós-resolução/, /Usuários/, /Ensaio/]) {
      expect(await screen.findByRole('button', { name: nome })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('navigation')).toEqual([nav]);
    expect(nav).toHaveAccessibleName('Principal');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByText('Marina')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('coord-app');
    expect(screen.queryByText('Responsabilidade compartilhada')).not.toBeInTheDocument();
  });

  it('coordenador não vê Usuários', async () => {
    abrir(coordenador);
    await screen.findByRole('button', { name: /Casos/ });
    expect(screen.queryByRole('button', { name: /Usuários/ })).toBeNull();
  });

  it.each([
    ['/#casos', /Casos/], ['/#pos-resolucao', /Pós-resolução/], ['/#usuarios', /Usuários/], ['/#ensaio', /Ensaio/],
    ['/', /Visão geral/], ['/#qualquer-coisa', /Visão geral/], ['/#caso-12', /Casos/],
  ])('o endereço %s marca o item atual', async (endereco, item) => {
    abrir(admin, endereco);
    const botao = await screen.findByRole('button', { name: item });
    expect(botao).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('button').filter(b => b.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });

  it('#caso-12 abre o detalhe 12', async () => {
    abrir(admin, '/#caso-12');
    expect(await screen.findByRole('heading', { name: /Caso 12/ })).toBeInTheDocument();
  });

  it('navegar muda o endereço e o item atual', async () => {
    const user = userEvent.setup();
    abrir(admin);
    await user.click(await screen.findByRole('button', { name: /Pós-resolução/ }));
    expect(window.location.hash).toBe('#pos-resolucao');
    expect(screen.getByRole('button', { name: /Pós-resolução/ })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: /Usuários/ }));
    expect(window.location.hash).toBe('#usuarios');
  });

  it('Pular para o conteúdo leva o foco ao main', async () => {
    const user = userEvent.setup();
    abrir(admin);
    await user.click(await screen.findByText('Pular para o conteúdo'));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('mostra o contador de pendências com texto acessível', async () => {
    abrir(admin);
    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pós-resolução 2 pendentes' })).toBeInTheDocument();
  });

  it('uma pendência fala no singular e zero some', async () => {
    abrir(admin, '/', { 'GET /api/resumo': resumo(1) });
    expect(await screen.findByText('1 pendente')).toBeInTheDocument();
  });

  it('falha no resumo não quebra a casca nem mostra contador', async () => {
    abrir(admin, '/', { 'GET /api/resumo': () => ({ status: 500 }) });
    expect(await screen.findByRole('button', { name: 'Pós-resolução' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/pendente/)).toBeNull());
  });
});

describe('Casca: contador e acesso', () => {
  it('depois de Registrar revisão o contador some sem trocar de tela', async () => {
    let pendente = 1;
    const user = userEvent.setup();
    abrir(admin, '/#caso-12', {
      'GET /api/resumo': () => resumo(pendente)(null, new URL('http://x')),
      'GET /api/casos/12': () => ({ corpo: { ...detalhe(), status: 'resolvido', recorrencia_pendente: pendente > 0, resolucoes: [], situacoes: [], revisoes_recorrencia: [] } }),
      'POST /api/v3/casos/12/revisao-recorrencia': () => { pendente = 0; return { status: 201, corpo: { ok: true } }; },
    });
    expect(await screen.findByText('1 pendente')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Registrar revisão' }));
    await waitFor(() => expect(screen.queryByText('1 pendente')).toBeNull());
    expect(window.location.hash).toBe('#caso-12');
  });

  it('#usuarios aberto por quem não é admin cai na Visão geral', async () => {
    abrir(coordenador, '/#usuarios');
    expect(await screen.findByRole('heading', { name: 'Cada pedido merece atenção.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visão geral' })).toHaveAttribute('aria-current', 'page');
  });
});
