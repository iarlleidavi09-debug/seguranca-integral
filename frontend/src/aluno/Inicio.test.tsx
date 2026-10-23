import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Inicio from './Inicio';

describe('Início do aluno', () => {
  it('acolhe com o título e o bilhete', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Você não precisa lidar com isso sozinho.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Não precisa ter as palavras certas.' })).toBeInTheDocument();
  });
  it('"Preciso de ajuda" chama onAjuda', async () => {
    const user = userEvent.setup();
    const onAjuda = vi.fn();
    render(<Inicio onAjuda={onAjuda} onAcompanhar={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Preciso de ajuda' }));
    expect(onAjuda).toHaveBeenCalledTimes(1);
  });
  it('mostra as três ações com os rótulos novos', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} onAcolhimento={() => {}} />);
    expect(screen.getByRole('button', { name: 'Preciso de ajuda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conversar sem me identificar' })).toBeInTheDocument();
    const cartao = screen.getByRole('heading', { name: 'Ver meu caso' }).closest('.acao-cartao') as HTMLElement;
    expect(within(cartao).getByLabelText('Código de acompanhamento')).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: 'Acompanhar' })).toBeInTheDocument();
  });
  it('"Conversar sem me identificar" chama onAcolhimento', async () => {
    const user = userEvent.setup();
    const onAcolhimento = vi.fn();
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} onAcolhimento={onAcolhimento} />);
    await user.click(screen.getByRole('button', { name: 'Conversar sem me identificar' }));
    expect(onAcolhimento).toHaveBeenCalledTimes(1);
  });
  it('não exibe os rótulos antigos', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} onAcolhimento={() => {}} />);
    expect(screen.queryByText(/Quero acolhimento anônimo/)).not.toBeInTheDocument();
    expect(screen.queryByText('Como usar este canal')).not.toBeInTheDocument();
    expect(screen.queryByText('Já conversou com a gente?')).not.toBeInTheDocument();
  });
  it('abertura tem uma frase só', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    expect(screen.getByText('Se algo está te preocupando, na escola, na internet ou em casa, conte para a coordenação. No seu tempo e sem precisar dizer seu nome.')).toBeInTheDocument();
    expect(screen.queryByText(/Para iniciar uma denúncia, toque em/)).not.toBeInTheDocument();
  });
  it('linha de privacidade sempre visível', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    const linha = screen.getByText('A escola guarda o que você enviar para cuidar do caso. O nome é opcional.');
    expect(linha.closest('details')).toBeNull();
  });
  it('blocos recolhíveis ficam fechados por padrão e abrem ao clicar', async () => {
    const user = userEvent.setup();
    const { container } = render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    const blocos = Array.from(container.querySelectorAll('details.recolhivel'));
    expect(blocos.map(b => b.querySelector('summary')?.textContent)).toEqual(['Como funciona', 'Seus dados e privacidade']);
    for (const b of blocos) expect(b).not.toHaveAttribute('open');
    await user.click(screen.getByText('Como funciona'));
    expect(blocos[0]).toHaveAttribute('open');
    await user.click(screen.getByText('Seus dados e privacidade'));
    expect(blocos[1]).toHaveAttribute('open');
  });
  it('código vazio mostra erro e código preenchido chama onAcompanhar', async () => {
    const user = userEvent.setup();
    const onAcompanhar = vi.fn();
    render(<Inicio onAjuda={() => {}} onAcompanhar={onAcompanhar} />);
    await user.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Digite seu código para acompanhar.');
    expect(onAcompanhar).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Código de acompanhamento'), 'k7m2 9qxd');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(onAcompanhar).toHaveBeenCalledWith('k7m2 9qxd');
  });
  it('o consentimento explica uso na LAN, registros de rede e prazo do rascunho', () => {
    const { container } = render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    const bloco = container.querySelectorAll('details.recolhivel')[1] as HTMLElement;
    expect(bloco).toHaveTextContent('Ao enviar, a escola guarda seu relato, as imagens e as mensagens para cuidar do caso. Seu nome é opcional. Na denúncia, ano e sala são obrigatórios; no acolhimento anônimo, não pedimos nome, ano ou turma.');
    expect(bloco).toHaveTextContent('Este canal funciona na rede local da escola. Mesmo sem informar seu nome, horários de acesso podem aparecer nos registros da rede.');
    expect(bloco).not.toHaveTextContent('anonimato total');
    expect(bloco).toHaveTextContent('O texto do rascunho fica neste navegador por até 24 horas ou até o envio. As imagens não ficam no rascunho. Evite usar um aparelho compartilhado.');
  });
  it('não usa travessão longo', () => {
    const { container } = render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    expect(container.textContent).not.toMatch(/[—–]/);
  });
  it('Como funciona orienta anotar o código se o navegador não salvar', () => {
    const { container } = render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    expect(container.querySelectorAll('details.recolhivel')[0]).toHaveTextContent('Se o navegador não conseguir salvar, anote o código que aparece na conversa.');
  });
  it('Como funciona cita o separador "Novas mensagens"', () => {
    const { container } = render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    const bloco = container.querySelectorAll('details.recolhivel')[0] as HTMLElement;
    expect(bloco).toHaveTextContent('Novas mensagens');
    expect(bloco).not.toHaveTextContent('Mensagem nova');
  });
  it('o cartão de conversa se chama "Conversar com a coordenação"', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} onAcolhimento={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Conversar com a coordenação' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Só conversar' })).not.toBeInTheDocument();
  });
  it('ordem no DOM: abertura, ações, privacidade e depois o bilhete', () => {
    const { container } = render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} onAcolhimento={() => {}} />);
    const q = (c: string) => container.querySelector(c) as Element;
    const antes = (a: Element, b: Element) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    antes(q('.abertura'), q('.inicio-acoes'));
    antes(q('.inicio-acoes'), q('.privacidade-linha'));
    antes(q('.privacidade-linha'), q('.bilhete'));
    antes(q('.bilhete'), q('details.recolhivel'));
  });
});
