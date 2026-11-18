import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Confirmacao from './Confirmacao';

describe('Confirmação', () => {
  it('oferece comprovante para impressão contendo apenas código e instruções de retorno', async () => {
    const user = userEvent.setup();
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    const comprovante = screen.getByRole('region', { name: 'Comprovante de acompanhamento' });
    expect(comprovante).toHaveTextContent('K7M2-9QXD');
    expect(comprovante).toHaveTextContent('Abra o portal TETRAGUARD da sua escola');
    await user.click(screen.getByRole('button', { name: 'Imprimir ou salvar comprovante' }));
    expect(imprimir).toHaveBeenCalledOnce();
  });
  it('acolhe, mostra o código em destaque e explica acesso salvo e cuidado em aparelho compartilhado', () => {
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Você deu o primeiro passo.' })).toBeInTheDocument();
    expect(screen.getByText('K7M2-9QXD')).toHaveClass('codigo');
    expect(screen.getByText(/Tentamos salvar o acesso neste navegador/)).toBeInTheDocument();
  });
  it('copia o código e avisa em role=status; avisa também quando a cópia falha', async () => {
    const user = userEvent.setup();
    const gravar = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('negado'));
    vi.stubGlobal('navigator', { clipboard: { writeText: gravar } });
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(gravar).toHaveBeenCalledWith('K7M2-9QXD');
    expect(await screen.findByText(/Código copiado/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Código copiado');
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(await screen.findByText(/Não foi possível copiar/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível copiar');
  });
  it('lista as imagens recusadas em role=alert', () => {
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD', anexos_recusados: [{ nome: 'a.png', motivo: 'tipo inválido' }] }} onAcompanhar={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('a.png: tipo inválido');
  });
  it('não mostra o alerta sem imagens recusadas', () => {
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('"Acompanhar meu caso" chama onAcompanhar', async () => {
    const user = userEvent.setup();
    const aoAcompanhar = vi.fn();
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={aoAcompanhar} />);
    await user.click(screen.getByRole('button', { name: 'Acompanhar meu caso' }));
    expect(aoAcompanhar).toHaveBeenCalledTimes(1);
  });
  it('com orientacao mostra o cuidado e sem ela não mostra', () => {
    const texto = 'Se você sente que corre perigo agora, procure um adulto de confiança ou a coordenação da escola hoje. Seu pedido continua sendo enviado.';
    const { rerender } = render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} orientacao />);
    expect(screen.getAllByRole('status').some(e => e.textContent === texto)).toBe(true);
    rerender(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} orientacao={false} />);
    expect(screen.queryByText(texto)).toBeNull();
    rerender(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    expect(screen.queryByText(texto)).toBeNull();
  });
  it('avisa com discrição quando as respostas do questionário não foram enviadas', () => {
    const { rerender } = render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} respostasNaoEnviadas />);
    expect(screen.getByText(/As respostas às perguntas não foram enviadas/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    expect(screen.queryByText(/respostas às perguntas/)).toBeNull();
  });
});

describe('Confirmação: Enquanto você espera', () => {
  const resposta = (contatos: { nome: string; contato: string }[] = []) => ({
    geral: { titulo: 'Enquanto você espera', passos: ['Guarde prints, sem apagar as conversas.', 'Fale com um adulto de confiança.'] },
    situacoes: [{ id: 'cyber', titulo: 'Se estão te atacando na internet', passos: ['Bloqueie e não responda.'] }],
    contatos,
  });
  const servir = (corpo: unknown) => vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify(corpo), { status: 200 }));

  it('mostra os passos gerais e os da situação marcada, pedindo só os ids', async () => {
    servir(resposta());
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} situacoes={['cyber', 'golpe']} />);
    const bloco = await screen.findByRole('region', { name: 'Enquanto você espera' });
    expect(bloco).toHaveTextContent('Guarde prints, sem apagar as conversas.');
    expect(bloco).toHaveTextContent('Se estão te atacando na internet');
    expect(bloco).toHaveTextContent('Bloqueie e não responda.');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/orientacoes?situacoes=cyber,golpe');
  });
  it('com risco mantém o aviso de risco antes do bloco, e sem risco não o mostra', async () => {
    servir(resposta());
    const { rerender } = render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} situacoes={['cyber']} orientacao />);
    const bloco = await screen.findByRole('region', { name: 'Enquanto você espera' });
    const risco = screen.getByText(/Se você sente que corre perigo agora/);
    expect(risco.compareDocumentPosition(bloco) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} situacoes={['cyber']} />);
    expect(screen.queryByText(/Se você sente que corre perigo agora/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Enquanto você espera' })).toBeInTheDocument();
  });
  it('mostra contatos de apoio quando configurados e omite a seção quando vazios', async () => {
    servir(resposta([{ nome: 'Psicologia da escola', contato: 'Sala 12' }]));
    const { unmount } = render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    expect(await screen.findByText('Psicologia da escola')).toBeInTheDocument();
    expect(screen.getByText('Sala 12')).toBeInTheDocument();
    unmount();
    servir(resposta());
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    await screen.findByRole('region', { name: 'Enquanto você espera' });
    expect(screen.queryByText(/Onde pedir apoio/)).toBeNull();
  });
  it('se as orientações não carregam, a confirmação segue intacta e sem erro', async () => {
    vi.mocked(fetch).mockImplementation(async () => { throw new TypeError('rede'); });
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} situacoes={['cyber']} />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Enquanto você espera' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('K7M2-9QXD')).toBeInTheDocument();
  });
});
