import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

async function expandir(user: ReturnType<typeof userEvent.setup>, nome: 'Organização' | 'Ferramentas') {
  const rotulo = await screen.findByText(nome);
  if (!rotulo.closest('details')?.open) await user.click(rotulo);
}

beforeEach(() => { window.history.replaceState(null, '', '/'); });

describe('Casca da coordenação', () => {
  it('sem sessão mostra o Login dentro do tema', async () => {
    const { container } = abrir(() => ({ status: 401 }));
    expect(await screen.findByRole('heading', { name: 'Portal da coordenação' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('coord-app');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('administrador vê todas as telas, o nome e Sair', async () => {
    const user = userEvent.setup();
    const { container } = abrir(admin);
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    await expandir(user, 'Organização');
    await expandir(user, 'Ferramentas');
    for (const nome of [/Visão geral/, /Casos/, /Pós-resolução/, /Usuários/, /Ensaio/]) {
      expect(await screen.findByRole('button', { name: nome })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('navigation')).toEqual([nav]);
    expect(nav).toHaveAccessibleName('Principal');
    expect(await screen.findByRole('complementary', { name: 'Organização dos casos' })).toBeInTheDocument();
    expect(screen.getByText('Marina')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('coord-app');
    expect(screen.queryByText('Responsabilidade compartilhada')).not.toBeInTheDocument();
  });

  it('coordenador não vê Usuários', async () => {
    const user = userEvent.setup();
    abrir(coordenador);
    await screen.findByRole('button', { name: /Casos/ });
    await expandir(user, 'Ferramentas');
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
    await expandir(user, 'Organização');
    await user.click(await screen.findByRole('button', { name: /Pós-resolução/ }));
    expect(window.location.hash).toBe('#pos-resolucao');
    expect(screen.getByRole('button', { name: /Pós-resolução/ })).toHaveAttribute('aria-current', 'page');
    await expandir(user, 'Ferramentas');
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
    const user = userEvent.setup();
    abrir(admin);
    const sumario = (await screen.findByText('Organização')).closest('summary') as HTMLElement;
    expect(await within(sumario).findByText('2 pendências de pós-resolução')).toBeInTheDocument();
    expect(sumario).toBeVisible();
    expect(sumario.closest('details')).not.toHaveAttribute('open');
    await expandir(user, 'Organização');
    expect(screen.getByRole('button', { name: 'Pós-resolução 2 pendentes' })).toBeInTheDocument();
  });

  it('uma pendência fala no singular e zero some', async () => {
    abrir(admin, '/', { 'GET /api/resumo': resumo(1) });
    expect(await screen.findByText('1 pendência de pós-resolução')).toBeInTheDocument();
  });

  it('falha no resumo não quebra a casca nem mostra contador', async () => {
    const user = userEvent.setup();
    abrir(admin, '/', { 'GET /api/resumo': () => ({ status: 500 }) });
    await expandir(user, 'Organização');
    expect(await screen.findByRole('button', { name: 'Pós-resolução' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/pendente/)).toBeNull());
  });
});

describe('Casca: barra lateral e cabeçalho', () => {
  it('a barra lateral tem, nesta ordem, marca, navegação e rodapé com a sessão', async () => {
    const { container } = abrir(admin);
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    const lateral = container.querySelector('.coord-lateral') as HTMLElement;
    const filhos = Array.from(lateral.children);
    const marca = filhos.findIndex(f => f.textContent?.includes('TETRAGUARD'));
    const iNav = filhos.indexOf(nav);
    const rodape = lateral.querySelector('.coord-lateral-rodape') as HTMLElement;
    const iRodape = filhos.indexOf(rodape);
    expect(marca).toBeGreaterThanOrEqual(0);
    expect(marca).toBeLessThan(iNav);
    expect(iNav).toBeLessThan(iRodape);
    expect(within(rodape).getByText('Marina')).toBeInTheDocument();
    expect(within(rodape).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('o item atual é rolado para a vista ao montar e ao trocar de tela', async () => {
    const rolar = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = rolar;
    try {
      const user = userEvent.setup();
      abrir(admin);
      const geral = await screen.findByRole('button', { name: /Visão geral/ });
      await waitFor(() => expect(rolar).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' }));
      expect(rolar.mock.contexts.at(-1)).toBe(geral);
      rolar.mockClear();
      await expandir(user, 'Organização');
      await user.click(screen.getByRole('button', { name: /Pós-resolução/ }));
      await waitFor(() => expect(rolar).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' }));
      expect(rolar.mock.contexts.at(-1)).toBe(screen.getByRole('button', { name: /Pós-resolução/ }));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('o estado das atualizações ao vivo fica na coluna principal, fora da barra lateral', async () => {
    const { container } = abrir(admin);
    await screen.findByRole('navigation', { name: 'Principal' });
    const estado = await screen.findByText(/Atualizações ao vivo|Conectando às atualizações|Reconectando/);
    expect(container.querySelector('.coord-coluna')).toContainElement(estado);
    expect(container.querySelector('.coord-lateral')).not.toContainElement(estado);
  });

  it('a contagem de pós-resolução fica no item da navegação', async () => {
    const user = userEvent.setup();
    abrir(admin);
    await expandir(user, 'Organização');
    const item = await screen.findByRole('button', { name: 'Pós-resolução 2 pendentes' });
    const contagem = item.querySelector('.nav-contagem') as HTMLElement;
    expect(contagem).toHaveTextContent('2');
    expect(contagem.closest('nav')).not.toBeNull();
  });

  it('mantém a navegação, a identificação e o efeito de metal líquido, que o usuário pode pausar', async () => {
    const { container } = abrir(admin);
    expect(await screen.findByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.getByText('Cuidado e convivência escolar')).toBeInTheDocument();
    expect(container.querySelector('.metal-liquido')).not.toBeNull();
    const pausa = screen.getByRole('button', { name: 'Pausar efeito' });
    expect(pausa).toHaveAttribute('aria-pressed', 'false');
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
    expect(await screen.findByText('1 pendência de pós-resolução')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Registrar revisão' }));
    await waitFor(() => expect(screen.queryByText('1 pendência de pós-resolução')).toBeNull());
    expect(window.location.hash).toBe('#caso-12');
  });

  it('#usuarios aberto por quem não é admin cai na Visão geral', async () => {
    abrir(coordenador, '/#usuarios');
    expect(await screen.findByRole('heading', { name: 'Cada pedido merece atenção.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visão geral' })).toHaveAttribute('aria-current', 'page');
  });
});
