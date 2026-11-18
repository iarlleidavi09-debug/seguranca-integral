import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { limparRascunhosAtendimento } from './rascunhosAtendimento';
import { guardarRascunhoConversa, obterRascunhoConversa, obterSessaoRascunhosConversa, removerRascunhoConversa } from './rascunhosConversa';
import { useRascunhoConversa } from './useRascunhoConversa';

afterEach(limparRascunhosAtendimento);

function Editor({ id }: { id: number }) {
  const [rascunho, setRascunho] = useRascunhoConversa(id);
  return <><input aria-label="Mensagem" value={rascunho.mensagens} onChange={e => setRascunho(r => ({ ...r, mensagens: e.target.value }))} />
    <input aria-label="Nota" value={rascunho.notas} onChange={e => setRascunho(r => ({ ...r, notas: e.target.value }))} /></>;
}

describe('Rascunhos da conversa na sessão', () => {
  it('uma resposta da sessão anterior não limpa o mesmo texto escrito na nova sessão', () => {
    guardarRascunhoConversa(1, 'mensagens', 'Obrigado por compartilhar.');
    const sessaoEnvio = obterSessaoRascunhosConversa();
    limparRascunhosAtendimento();
    guardarRascunhoConversa(1, 'mensagens', 'Obrigado por compartilhar.');
    removerRascunhoConversa(1, 'mensagens', 'Obrigado por compartilhar.', sessaoEnvio);
    expect(obterRascunhoConversa(1).mensagens).toBe('Obrigado por compartilhar.');
    removerRascunhoConversa(1, 'mensagens', 'Obrigado por compartilhar.', obterSessaoRascunhosConversa());
    expect(obterRascunhoConversa(1).mensagens).toBe('');
  });

  it('preserva mensagem e nota ao sair, voltar e trocar de caso sem misturá-las', () => {
    const { rerender, unmount } = render(<Editor id={1} />);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá, vamos conversar' } });
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'Conversar com a família' } });
    rerender(<Editor id={2} />);
    expect(screen.getByLabelText('Mensagem')).toHaveValue('');
    expect(screen.getByLabelText('Nota')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Outro caso' } });
    rerender(<Editor id={1} />);
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Olá, vamos conversar');
    expect(screen.getByLabelText('Nota')).toHaveValue('Conversar com a família');
    unmount();
    render(<Editor id={2} />);
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Outro caso');
  });

  it('limpa apenas o campo enviado se o texto não mudou desde o início do envio', () => {
    guardarRascunhoConversa(1, 'mensagens', 'Primeiro texto');
    guardarRascunhoConversa(1, 'notas', 'Nota preservada');
    guardarRascunhoConversa(2, 'mensagens', 'Outro caso');
    guardarRascunhoConversa(1, 'mensagens', 'Complemento escrito durante o envio');
    removerRascunhoConversa(1, 'mensagens', 'Primeiro texto');
    expect(obterRascunhoConversa(1).mensagens).toBe('Complemento escrito durante o envio');
    removerRascunhoConversa(1, 'mensagens', 'Complemento escrito durante o envio');
    expect(obterRascunhoConversa(1)).toEqual({ mensagens: '', notas: 'Nota preservada' });
    expect(obterRascunhoConversa(2).mensagens).toBe('Outro caso');
  });

  it('logout ou sessão perdida apaga também os rascunhos visíveis sem persistência no navegador', () => {
    const gravar = vi.spyOn(Storage.prototype, 'setItem');
    render(<Editor id={1} />);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Conteúdo sensível' } });
    act(limparRascunhosAtendimento);
    expect(screen.getByLabelText('Mensagem')).toHaveValue('');
    expect(obterRascunhoConversa(1)).toEqual({ mensagens: '', notas: '' });
    expect(gravar).not.toHaveBeenCalled();
    gravar.mockRestore();
  });

  it('avisa ao fechar ou atualizar mesmo depois de voltar à fila e deixa de avisar após limpar', () => {
    const { unmount } = render(<Editor id={1} />);
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'Pendente' } });
    unmount();
    const pendente = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pendente);
    expect(pendente.defaultPrevented).toBe(true);
    limparRascunhosAtendimento();
    const vazio = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(vazio);
    expect(vazio.defaultPrevented).toBe(false);
  });

  it('uma conclusão antiga não apaga o rascunho do caso recém-aberto', () => {
    let concluirEnvio = () => {};
    function Envio({ id }: { id: number }) {
      const [rascunho, setRascunho] = useRascunhoConversa(id);
      return <button onClick={() => { concluirEnvio = () => setRascunho(r => ({ ...r, mensagens: '' })); }}>{rascunho.mensagens || 'Enviar'}</button>;
    }
    guardarRascunhoConversa(1, 'mensagens', 'Caso um');
    guardarRascunhoConversa(2, 'mensagens', 'Caso dois');
    const { rerender } = render(<Envio id={1} />);
    fireEvent.click(screen.getByText('Caso um'));
    rerender(<Envio id={2} />);
    act(concluirEnvio);
    expect(screen.getByText('Caso dois')).toBeInTheDocument();
    expect(obterRascunhoConversa(1).mensagens).toBe('');
  });
});
