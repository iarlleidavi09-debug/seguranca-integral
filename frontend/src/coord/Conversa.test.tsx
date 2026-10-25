import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Conversa from './Conversa';
import type { Item } from './Conversa';

const item = (extra: Partial<Item> = {}): Item => ({ chave: 0, id: 7, autor: 'Marina', texto: 'Texto original', criado_em: '2026-10-14T10:00:00+00:00', lado: 'coordenacao', podeAlterar: true, ...extra });
const montar = (itens: Item[], props: Partial<Parameters<typeof Conversa>[0]> = {}) => render(
  <Conversa titulo="Conversa" campo="c" rotulo="Mensagem" ajuda="ajuda" botao="Enviar" texto="" enviando={false} itens={itens}
    aoMudar={() => {}} aoEnviar={() => {}} {...props} />);

type Usuario = ReturnType<typeof userEvent.setup>;
const gatilho = () => screen.getByRole('button', { name: 'Ações da mensagem' });
const escolher = async (user: Usuario, nome: string) => {
  await user.click(gatilho());
  await user.click(screen.getByRole('menuitem', { name: nome }));
};

describe('Conversa: editar e excluir', () => {
  it('mostra o gatilho do menu só em itens que podem ser alterados e com as ações', async () => {
    const user = userEvent.setup();
    montar([item(), item({ chave: 1, id: 8, podeAlterar: false })], { aoEditar: async () => {}, aoExcluir: async () => {} });
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Ações da mensagem' })).toHaveLength(1);
    await user.click(gatilho());
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('sem as ações o componente não mostra gatilho nem botões de alteração', () => {
    montar([item()]);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ações da mensagem' })).toBeNull();
  });

  it('Editar abre o campo com o texto atual e foco; Salvar chama aoEditar com o texto novo', async () => {
    const user = userEvent.setup();
    const aoEditar = vi.fn().mockResolvedValue(undefined);
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await escolher(user, 'Editar');
    const campo = screen.getByRole('textbox', { name: 'Editar mensagem' });
    expect(campo).toHaveValue('Texto original');
    expect(campo).toHaveFocus();
    await user.clear(campo); await user.type(campo, 'Texto novo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(aoEditar).toHaveBeenCalledExactlyOnceWith(7, 'Texto novo');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Editar mensagem' })).toBeNull());
    expect(gatilho()).toHaveFocus();
  });

  it('Cancelar e Esc restauram sem chamar a API e devolvem o foco ao gatilho', async () => {
    const user = userEvent.setup();
    const aoEditar = vi.fn();
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await escolher(user, 'Editar');
    await user.type(screen.getByRole('textbox', { name: 'Editar mensagem' }), ' extra');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Editar mensagem' })).toBeNull();
    expect(screen.getByText('Texto original')).toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
    await escolher(user, 'Editar');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Editar mensagem' })).toBeNull();
    expect(gatilho()).toHaveFocus();
    expect(aoEditar).not.toHaveBeenCalled();
  });

  it('texto vazio ou acima de 2000 não chama a API e avisa', async () => {
    const user = userEvent.setup();
    const aoEditar = vi.fn();
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await escolher(user, 'Editar');
    await user.clear(screen.getByRole('textbox', { name: 'Editar mensagem' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva de 1 a 2000 caracteres.');
    expect(aoEditar).not.toHaveBeenCalled();
  });

  it('Excluir pede confirmação inline e só chama aoExcluir ao confirmar', async () => {
    const user = userEvent.setup();
    const aoExcluir = vi.fn().mockResolvedValue(undefined);
    montar([item()], { aoEditar: async () => {}, aoExcluir });
    await escolher(user, 'Excluir');
    expect(screen.getByText("Excluir esta mensagem? O aluno verá 'Mensagem apagada'.")).toBeInTheDocument();
    expect(aoExcluir).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(aoExcluir).not.toHaveBeenCalled();
    expect(gatilho()).toHaveFocus();
    await escolher(user, 'Excluir');
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(aoExcluir).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('desabilita os botões durante a chamada: duplo clique chama uma vez', async () => {
    const user = userEvent.setup();
    let resolver: () => void = () => {};
    const aoEditar = vi.fn(() => new Promise<void>(r => { resolver = r; }));
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await escolher(user, 'Editar');
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    await user.dblClick(salvar);
    expect(aoEditar).toHaveBeenCalledTimes(1);
    expect(salvar).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    resolver();
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Editar mensagem' })).toBeNull());
  });

  it('erro rejeitado aparece em role=alert e o texto digitado permanece', async () => {
    const user = userEvent.setup();
    const aoEditar = vi.fn().mockRejectedValue(new Error('Não foi possível concluir agora. Tente de novo.'));
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await escolher(user, 'Editar');
    const campo = screen.getByRole('textbox', { name: 'Editar mensagem' });
    await user.clear(campo); await user.type(campo, 'Meu texto');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
    expect(screen.getByRole('textbox', { name: 'Editar mensagem' })).toHaveValue('Meu texto');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('erro ao excluir aparece em role=alert', async () => {
    const user = userEvent.setup();
    montar([item()], { aoEditar: async () => {}, aoExcluir: vi.fn().mockRejectedValue(new Error('Não foi possível concluir agora. Tente de novo.')) });
    await escolher(user, 'Excluir');
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
  });

  it('item apagado mostra "Mensagem apagada" e não mostra texto nem ações', () => {
    montar([item({ apagada: true, texto: 'segredo', podeAlterar: false })], { aoEditar: async () => {}, aoExcluir: async () => {} });
    expect(screen.getByText('Mensagem apagada')).toBeInTheDocument();
    expect(screen.queryByText('segredo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ações da mensagem' })).toBeNull();
  });

  it('item editado mostra "editada" e Ver versões lista as versões', async () => {
    const user = userEvent.setup();
    const aoVerVersoes = vi.fn().mockResolvedValue([
      { id: 2, texto: 'Primeira redação', acao: 'edicao', usuario: 'Marina', criado_em: '2026-10-14T11:00:00+00:00' },
      { id: 3, texto: 'Segunda redação', acao: 'exclusao', usuario: null, criado_em: '2026-10-14T12:00:00+00:00' },
    ]);
    montar([item({ editada: true })], { aoEditar: async () => {}, aoExcluir: async () => {}, aoVerVersoes });
    expect(screen.getByText('editada')).toBeInTheDocument();
    await escolher(user, 'Ver versões');
    expect(aoVerVersoes).toHaveBeenCalledWith(7);
    const lista = await screen.findByRole('list', { name: 'Versões anteriores' });
    expect(within(lista).getByText('Primeira redação')).toBeInTheDocument();
    expect(within(lista).getByText('Segunda redação')).toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
    await escolher(user, 'Ocultar versões');
    expect(screen.queryByRole('list', { name: 'Versões anteriores' })).toBeNull();
  });

  it('falha ao carregar versões aparece em role=alert', async () => {
    const user = userEvent.setup();
    montar([item({ editada: true })], { aoVerVersoes: vi.fn().mockRejectedValue(new Error('x')) });
    await escolher(user, 'Ver versões');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
  });

  it('mostra a mensagem real do erro recebido, em um único alert', async () => {
    const user = userEvent.setup();
    montar([item()], { aoEditar: vi.fn().mockRejectedValue(new Error('O caso mudou enquanto você trabalhava.')), aoExcluir: async () => {} });
    await escolher(user, 'Editar');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('O caso mudou enquanto você trabalhava.');
  });

  it('depois de excluir com sucesso o foco vai para o gatilho do menu', async () => {
    const user = userEvent.setup();
    const aoVerVersoes = vi.fn().mockResolvedValue([]);
    let apagar: () => void = () => {};
    const Quadro = () => {
      const [apagada, setApagada] = useState(false);
      apagar = () => setApagada(true);
      return <Conversa titulo="C" campo="c" rotulo="M" ajuda="a" botao="E" texto="" enviando={false} aoMudar={() => {}} aoEnviar={() => {}}
        itens={[item({ apagada, podeAlterar: !apagada, texto: apagada ? '' : 'Texto original' })]} aoVerVersoes={aoVerVersoes}
        aoEditar={async () => {}} aoExcluir={async () => { apagar(); }} />;
    };
    render(<Quadro />);
    await escolher(user, 'Excluir');
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(gatilho()).toHaveFocus());
    await user.click(gatilho());
    expect(screen.getByRole('menuitem', { name: 'Ver texto original' })).toBeInTheDocument();
  });

  it('mensagem apagada oferece Ver texto original e lista as versões', async () => {
    const user = userEvent.setup();
    const aoVerVersoes = vi.fn().mockResolvedValue([{ id: 4, texto: 'Texto que foi apagado', acao: 'exclusao', usuario: 'Marina', criado_em: '2026-10-14T12:00:00+00:00' }]);
    montar([item({ apagada: true, texto: '', podeAlterar: false })], { aoVerVersoes });
    await user.click(gatilho());
    expect(screen.queryByRole('menuitem', { name: 'Ver versões' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Ver texto original' }));
    const lista = await screen.findByRole('list', { name: 'Versões anteriores' });
    expect(within(lista).getByText('Texto que foi apagado')).toBeInTheDocument();
    await user.click(gatilho());
    expect(screen.getByRole('menuitem', { name: 'Ocultar texto original' })).toBeInTheDocument();
  });

  it('foco pós-exclusão vale mesmo quando o pai troca apagada só depois de aoExcluir resolver', async () => {
    const user = userEvent.setup();
    const Quadro = () => {
      const [apagada, setApagada] = useState(false);
      return <Conversa titulo="C" campo="c" rotulo="M" ajuda="a" botao="E" texto="" enviando={false} aoMudar={() => {}} aoEnviar={() => {}}
        itens={[item({ apagada, podeAlterar: !apagada, texto: apagada ? '' : 'Texto original' })]} aoVerVersoes={async () => []}
        aoEditar={async () => {}} aoExcluir={async () => { setTimeout(() => setApagada(true), 30); }} />;
    };
    render(<Quadro />);
    await escolher(user, 'Excluir');
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.getByText('Mensagem apagada')).toBeInTheDocument());
    await waitFor(() => expect(gatilho()).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });
});

describe('Conversa: menu de ações da mensagem', () => {
  const acoes = { aoEditar: async () => {}, aoExcluir: async () => {} };

  it('mostra só o gatilho e esconde os itens até abrir', () => {
    montar([item()], acoes);
    expect(gatilho()).toHaveAttribute('aria-haspopup', 'menu');
    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clique, Enter e Espaço abrem o menu com foco no primeiro item', async () => {
    const user = userEvent.setup();
    montar([item()], acoes);
    await user.click(gatilho());
    expect(gatilho()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.keyboard(' ');
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();
  });

  it('setas, Home e End navegam pelos itens', async () => {
    const user = userEvent.setup();
    montar([item({ editada: true })], { ...acoes, aoVerVersoes: async () => [] });
    await user.click(gatilho());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Ver versões' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Ver versões' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();
  });

  it('Esc fecha e devolve o foco ao gatilho; clique fora e Tab também fecham', async () => {
    const user = userEvent.setup();
    montar([item()], acoes);
    await user.click(gatilho());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(gatilho()).toHaveFocus();
    await user.click(gatilho());
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(gatilho());
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Editar pelo menu fecha o menu e abre a edição com foco no campo', async () => {
    const user = userEvent.setup();
    montar([item()], acoes);
    await escolher(user, 'Editar');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Editar mensagem' })).toHaveFocus();
  });

  it('mensagem apagada oferece só Ver texto original no menu', async () => {
    const user = userEvent.setup();
    montar([item({ apagada: true, podeAlterar: false })], { aoVerVersoes: async () => [] });
    await user.click(gatilho());
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Ver texto original']);
  });

  it('sem permissão e sem versões não há gatilho; editada sem permissão tem só Ver versões', async () => {
    const user = userEvent.setup();
    const { unmount } = montar([item({ podeAlterar: false })], { ...acoes, aoVerVersoes: async () => [] });
    expect(screen.queryByRole('button', { name: 'Ações da mensagem' })).toBeNull();
    unmount();
    montar([item({ podeAlterar: false, editada: true })], { ...acoes, aoVerVersoes: async () => [] });
    await user.click(gatilho());
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Ver versões']);
  });
});

describe('Conversa: campo de nova mensagem no celular', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const largura = (estreito: boolean) => vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: estreito, media: consulta, addEventListener: () => {}, removeEventListener: () => {} }));
  const campoMensagem = () => screen.getByRole('textbox', { name: 'Mensagem' });

  it('em até 760 px o formulário recebe resposta-fixa-coord e a ajuda vira descrição', () => {
    largura(true);
    montar([]);
    expect(campoMensagem().closest('form')).toHaveClass('resposta-fixa-coord');
    expect(campoMensagem()).toHaveAccessibleDescription(/ajuda/);
    expect(campoMensagem()).toHaveAttribute('rows', '2');
  });

  it('em telas largas ou sem matchMedia não recebe a classe', () => {
    largura(false);
    const { unmount } = montar([]);
    expect(campoMensagem().closest('form')).not.toHaveClass('resposta-fixa-coord');
    unmount();
    vi.unstubAllGlobals();
    montar([]);
    expect(campoMensagem().closest('form')).not.toHaveClass('resposta-fixa-coord');
  });
});
