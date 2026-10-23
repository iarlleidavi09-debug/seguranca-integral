import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Conversa from './Conversa';
import type { Item } from './Conversa';

const item = (extra: Partial<Item> = {}): Item => ({ chave: 0, id: 7, autor: 'Marina', texto: 'Texto original', criado_em: '2026-10-14T10:00:00+00:00', lado: 'coordenacao', podeAlterar: true, ...extra });
const montar = (itens: Item[], props: Partial<Parameters<typeof Conversa>[0]> = {}) => render(
  <Conversa titulo="Conversa" campo="c" rotulo="Mensagem" ajuda="ajuda" botao="Enviar" texto="" enviando={false} itens={itens}
    aoMudar={() => {}} aoEnviar={() => {}} {...props} />);

describe('Conversa: editar e excluir', () => {
  it('mostra Editar e Excluir só em itens que podem ser alterados e com as ações', () => {
    montar([item(), item({ chave: 1, id: 8, podeAlterar: false })], { aoEditar: async () => {}, aoExcluir: async () => {} });
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(1);
  });

  it('sem as ações o componente não mostra botões de alteração', () => {
    montar([item()]);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('Editar abre o campo com o texto atual e foco; Salvar chama aoEditar com o texto novo', async () => {
    const user = userEvent.setup();
    const aoEditar = vi.fn().mockResolvedValue(undefined);
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const campo = screen.getByRole('textbox', { name: 'Editar mensagem' });
    expect(campo).toHaveValue('Texto original');
    expect(campo).toHaveFocus();
    await user.clear(campo); await user.type(campo, 'Texto novo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(aoEditar).toHaveBeenCalledExactlyOnceWith(7, 'Texto novo');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Editar mensagem' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveFocus();
  });

  it('Cancelar e Esc restauram sem chamar a API e devolvem o foco', async () => {
    const user = userEvent.setup();
    const aoEditar = vi.fn();
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.type(screen.getByRole('textbox', { name: 'Editar mensagem' }), ' extra');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Editar mensagem' })).toBeNull();
    expect(screen.getByText('Texto original')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Editar mensagem' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveFocus();
    expect(aoEditar).not.toHaveBeenCalled();
  });

  it('texto vazio ou acima de 2000 não chama a API e avisa', async () => {
    const user = userEvent.setup();
    const aoEditar = vi.fn();
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByRole('textbox', { name: 'Editar mensagem' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva de 1 a 2000 caracteres.');
    expect(aoEditar).not.toHaveBeenCalled();
  });

  it('Excluir pede confirmação inline e só chama aoExcluir ao confirmar', async () => {
    const user = userEvent.setup();
    const aoExcluir = vi.fn().mockResolvedValue(undefined);
    montar([item()], { aoEditar: async () => {}, aoExcluir });
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(screen.getByText("Excluir esta mensagem? O aluno verá 'Mensagem apagada'.")).toBeInTheDocument();
    expect(aoExcluir).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(aoExcluir).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(aoExcluir).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('desabilita os botões durante a chamada: duplo clique chama uma vez', async () => {
    const user = userEvent.setup();
    let resolver: () => void = () => {};
    const aoEditar = vi.fn(() => new Promise<void>(r => { resolver = r; }));
    montar([item()], { aoEditar, aoExcluir: async () => {} });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
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
    await user.click(screen.getByRole('button', { name: 'Editar' }));
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
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
  });

  it('item apagado mostra "Mensagem apagada" e não mostra texto nem ações', () => {
    montar([item({ apagada: true, texto: 'segredo', podeAlterar: false })], { aoEditar: async () => {}, aoExcluir: async () => {} });
    expect(screen.getByText('Mensagem apagada')).toBeInTheDocument();
    expect(screen.queryByText('segredo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('item editado mostra "editada" e Ver versões lista as versões', async () => {
    const user = userEvent.setup();
    const aoVerVersoes = vi.fn().mockResolvedValue([
      { id: 2, texto: 'Primeira redação', acao: 'edicao', usuario: 'Marina', criado_em: '2026-10-14T11:00:00+00:00' },
      { id: 3, texto: 'Segunda redação', acao: 'exclusao', usuario: null, criado_em: '2026-10-14T12:00:00+00:00' },
    ]);
    montar([item({ editada: true })], { aoEditar: async () => {}, aoExcluir: async () => {}, aoVerVersoes });
    expect(screen.getByText('editada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver versões' }));
    expect(aoVerVersoes).toHaveBeenCalledWith(7);
    const lista = await screen.findByRole('list', { name: 'Versões anteriores' });
    expect(within(lista).getByText('Primeira redação')).toBeInTheDocument();
    expect(within(lista).getByText('Segunda redação')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ocultar versões' }));
    expect(screen.queryByRole('list', { name: 'Versões anteriores' })).toBeNull();
  });

  it('falha ao carregar versões aparece em role=alert', async () => {
    const user = userEvent.setup();
    montar([item({ editada: true })], { aoVerVersoes: vi.fn().mockRejectedValue(new Error('x')) });
    await user.click(screen.getByRole('button', { name: 'Ver versões' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
  });

  it('mostra a mensagem real do erro recebido, em um único alert', async () => {
    const user = userEvent.setup();
    montar([item()], { aoEditar: vi.fn().mockRejectedValue(new Error('O caso mudou enquanto você trabalhava.')), aoExcluir: async () => {} });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('O caso mudou enquanto você trabalhava.');
  });

  it('depois de excluir com sucesso o foco vai para Ver texto original', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver texto original' })).toHaveFocus());
  });

  it('mensagem apagada oferece Ver texto original e lista as versões', async () => {
    const user = userEvent.setup();
    const aoVerVersoes = vi.fn().mockResolvedValue([{ id: 4, texto: 'Texto que foi apagado', acao: 'exclusao', usuario: 'Marina', criado_em: '2026-10-14T12:00:00+00:00' }]);
    montar([item({ apagada: true, texto: '', podeAlterar: false })], { aoVerVersoes });
    expect(screen.queryByRole('button', { name: 'Ver versões' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ver texto original' }));
    const lista = await screen.findByRole('list', { name: 'Versões anteriores' });
    expect(within(lista).getByText('Texto que foi apagado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar texto original' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver texto original' })).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });
});
