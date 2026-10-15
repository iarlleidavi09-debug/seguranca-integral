import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import Confirmacao from './Confirmacao';
import Denuncia from './Denuncia';
import Acompanhar from './Acompanhar';

const chave = 'si-aluno-rascunho-v1';
const responder = (body: unknown, status = 200) => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

describe('Foco', () => {
  it('ao entrar na denúncia e a cada passo, o título fica focado', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Preciso de ajuda' }));
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toHaveFocus();
    await user.click(screen.getByLabelText('Ameaça'));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toHaveFocus();
    await user.type(screen.getByLabelText('O que aconteceu?'), 'Estão me ameaçando no grupo.');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Provas e identificação' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toHaveFocus();
  });
});

describe('Rascunho', () => {
  it('não grava nada enquanto não há texto e grava depois de digitar', async () => {
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    expect(localStorage.getItem(chave)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpar rascunho' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Golpe ou extorsão'));
    expect(localStorage.getItem(chave)).toContain('golpe');
    expect(screen.getByRole('button', { name: 'Limpar rascunho' })).toBeInTheDocument();
  });

  it('Limpar rascunho apaga o armazenamento e volta ao primeiro passo vazio', async () => {
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    await user.click(screen.getByLabelText('Ameaça'));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText('O que aconteceu?'), 'Texto que será apagado.');
    await user.click(screen.getByRole('button', { name: 'Limpar rascunho' }));
    expect(localStorage.getItem(chave)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toHaveFocus();
    expect(screen.getByLabelText('Ameaça')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Limpar rascunho' })).not.toBeInTheDocument();
  });
});

describe('Miniaturas', () => {
  it('revoga as URLs das miniaturas ao desmontar', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Denuncia onEnviado={() => {}} />);
    await user.click(screen.getByLabelText('Ameaça'));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText('O que aconteceu?'), 'Estão me ameaçando no grupo.');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.upload(screen.getByLabelText('Adicionar imagens'), new File(['x'], 'a.png', { type: 'image/png' }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:miniatura');
  });
});

describe('Confirmação', () => {
  it('copia o código e avisa; avisa também quando a cópia falha', async () => {
    const user = userEvent.setup();
    const gravar = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('negado'));
    vi.stubGlobal('navigator', { clipboard: { writeText: gravar } });
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(gravar).toHaveBeenCalledWith('K7M2-9QXD');
    expect(await screen.findByText(/Código copiado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(await screen.findByText(/Não foi possível copiar/)).toBeInTheDocument();
  });
});

describe('Início', () => {
  it('pede o código quando o campo está vazio e não consulta', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Digite seu código');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Acompanhar em StrictMode', () => {
  it('consulta o caso uma única vez e mostra o resultado', async () => {
    responder({ status: 'em_analise', mensagens: [{ autor: 'coordenacao', texto: 'Olá, aluno', criado_em: '2026-10-14T12:00:00Z' }] });
    render(<StrictMode><Acompanhar codigoInicial="K7M2-9QXD" /></StrictMode>);
    expect(await screen.findByText('Olá, aluno')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
