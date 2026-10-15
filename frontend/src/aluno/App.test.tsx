import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

const navegacao = () => within(screen.getByRole('navigation', { name: 'Principal' }));

describe('Casca do portal do aluno', () => {
  it('tem a raiz aluno-app, o cabeçalho com a marca e o rodapé', () => {
    const { container } = render(<App />);
    expect(container.firstElementChild).toHaveClass('aluno-app');
    const cabecalho = screen.getByRole('banner');
    expect(within(cabecalho).getByRole('button', { name: 'Segurança Integral' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Um canal da escola para ouvir e cuidar.');
  });
  it('a navegação tem os três itens e marca o atual com aria-current', async () => {
    const user = userEvent.setup();
    render(<App />);
    const itens = navegacao().getAllByRole('button').map(b => b.textContent);
    expect(itens).toEqual(['Início', 'Pedir ajuda', 'Acompanhar']);
    expect(navegacao().getByRole('button', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
    expect(navegacao().getByRole('button', { name: 'Pedir ajuda' })).not.toHaveAttribute('aria-current');
    await user.click(navegacao().getByRole('button', { name: 'Pedir ajuda' }));
    expect(navegacao().getByRole('button', { name: 'Pedir ajuda' })).toHaveAttribute('aria-current', 'page');
    expect(navegacao().getByRole('button', { name: 'Início' })).not.toHaveAttribute('aria-current');
  });
  it('"Pedir ajuda" abre o pedido, "Acompanhar" abre a consulta de código e "Início" volta', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(navegacao().getByRole('button', { name: 'Pedir ajuda' }));
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
    await user.click(navegacao().getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('heading', { name: 'Acompanhar meu caso' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código de acompanhamento')).toBeInTheDocument();
    expect(navegacao().getByRole('button', { name: 'Acompanhar' })).toHaveAttribute('aria-current', 'page');
    expect(fetch).not.toHaveBeenCalled();
    await user.click(navegacao().getByRole('button', { name: 'Início' }));
    expect(screen.getByRole('heading', { name: 'Você não precisa lidar com isso sozinho.' })).toBeInTheDocument();
  });
  it('a marca leva ao início', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(navegacao().getByRole('button', { name: 'Acompanhar' }));
    await user.click(screen.getByRole('button', { name: 'Segurança Integral' }));
    expect(screen.getByRole('heading', { name: 'Você não precisa lidar com isso sozinho.' })).toBeInTheDocument();
  });
  it('desabilita a navegação enquanto o pedido é enviado e a reabilita depois', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(navegacao().getByRole('button', { name: 'Pedir ajuda' }));
    await user.click(screen.getByLabelText('Ameaça'));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText('O que aconteceu?'), 'Estão me ameaçando no aplicativo da turma.');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    let concluir!: (resposta: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { concluir = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    for (const nome of ['Início', 'Pedir ajuda', 'Acompanhar']) expect(navegacao().getByRole('button', { name: nome })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Segurança Integral' })).toBeDisabled();
    concluir(new Response('{"codigo":"K7M2-9QXD"}', { status: 201 }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    for (const nome of ['Início', 'Pedir ajuda', 'Acompanhar']) expect(navegacao().getByRole('button', { name: nome })).toBeEnabled();
  });
  it('"Pular para o conteúdo" leva o foco ao main', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Pular para o conteúdo' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });
  it('clicar em Acompanhar já em Acompanhar recomeça a consulta, sem deixar resultado antigo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(navegacao().getByRole('button', { name: 'Acompanhar' }));
    await user.type(screen.getByLabelText('Código de acompanhamento'), 'invalido');
    expect(screen.getByLabelText('Código de acompanhamento')).toHaveValue('invalido');
    await user.click(navegacao().getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByLabelText('Código de acompanhamento')).toHaveValue('');
  });
  it('clicar na navegação da tela atual não refoca o conteúdo', async () => {
    const user = userEvent.setup();
    render(<App />);
    const inicio = navegacao().getByRole('button', { name: 'Início' });
    await user.click(inicio);
    expect(screen.getByRole('main')).not.toHaveFocus();
    await user.click(navegacao().getByRole('button', { name: 'Pedir ajuda' }));
    await user.click(screen.getByLabelText('Ameaça'));
    expect(screen.getByLabelText('Ameaça')).toHaveFocus();
    await user.click(navegacao().getByRole('button', { name: 'Pedir ajuda' }));
    expect(screen.getByLabelText('Ameaça')).toBeChecked();
    expect(screen.getByRole('main')).not.toHaveFocus();
    await user.click(navegacao().getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
