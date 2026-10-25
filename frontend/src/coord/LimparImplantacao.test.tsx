import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LimparImplantacao from './LimparImplantacao';
import * as rascunhos from './rascunhosAtendimento';
import { chamadasA, servidor } from './testes/servidor';
import type { Rota } from './testes/servidor';

const resumo = { secundaria: true, resumo: { casos: 12, mensagens: 48, anexos: 5, arquivos: 7, backups: 3 }, ultima_limpeza: null };
const removidos = { casos: 12, mensagens: 48, anexos: 5, arquivos: 7, backups: 3 };
const ok: Rota = () => ({ corpo: { ok: true, removidos } });
const TITULO = 'Implantação secundária: apagar todos os dados';

async function abrir(aoLimpar = vi.fn()) {
  const u = userEvent.setup();
  render(<LimparImplantacao aoLimpar={aoLimpar} />);
  const botao = await screen.findByRole('button', { name: /Apagar todos os dados/ });
  await u.click(botao);
  return { u, botao, aoLimpar };
}
const preencher = async (u: ReturnType<typeof userEvent.setup>, senha = 'segredo', frase = 'APAGAR TUDO') => {
  await u.type(screen.getByLabelText('Senha'), senha);
  await u.type(screen.getByLabelText(/Digite APAGAR TUDO/), frase);
};

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('LimparImplantacao', () => {
  it.each([404, 403])('não renderiza nada em %i', async status => {
    servidor({ 'GET /api/implantacao': () => ({ status }) });
    const { container } = render(<LimparImplantacao aoLimpar={vi.fn()} />);
    await waitFor(() => expect(chamadasA('GET', '/api/implantacao')).toHaveLength(1));
    await new Promise(r => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra título, contagens e última limpeza', async () => {
    servidor({ 'GET /api/implantacao': () => ({ corpo: { ...resumo, ultima_limpeza: { em: '2026-10-20T10:00:00+00:00', por: 'Marina', casos: 4 } } }) });
    render(<LimparImplantacao aoLimpar={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: TITULO })).toBeInTheDocument();
    expect(screen.getByText(/12 casos, 48 mensagens, 5 anexos, 3 cópias de segurança/)).toBeInTheDocument();
    expect(screen.getByText(/Última limpeza:.*Marina/)).toBeInTheDocument();
  });

  it('abre o painel com foco na senha, exige frase e senha, e fecha com Esc e Cancelar devolvendo o foco', async () => {
    servidor({ 'GET /api/implantacao': () => ({ corpo: resumo }) });
    const confirmar = vi.spyOn(window, 'confirm');
    const { u, botao } = await abrir();
    expect(screen.getByLabelText('Senha')).toHaveFocus();
    const apagar = screen.getByRole('button', { name: 'Apagar tudo' });
    expect(apagar).toBeDisabled();
    expect(screen.getByLabelText('Apagar também as cópias de segurança')).toBeChecked();
    await u.type(screen.getByLabelText(/Digite APAGAR TUDO/), 'apagar tudo');
    await u.type(screen.getByLabelText('Senha'), 'x');
    expect(apagar).toBeDisabled();
    await u.clear(screen.getByLabelText(/Digite APAGAR TUDO/));
    await u.type(screen.getByLabelText(/Digite APAGAR TUDO/), 'APAGAR TUDO');
    expect(apagar).toBeEnabled();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Apagar tudo' })).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
    await u.click(botao);
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('durante a chamada desabilita botões, mostra Apagando e chama uma vez no duplo clique', async () => {
    let solta: () => void = () => {};
    const segura = new Promise<void>(r => { solta = r; });
    servidor({
      'GET /api/implantacao': () => ({ corpo: resumo }),
      'POST /api/implantacao/limpar': async () => { await segura; return { corpo: { ok: true, removidos } }; },
    });
    const { u } = await abrir();
    await preencher(u);
    await u.click(screen.getByLabelText('Apagar também as cópias de segurança'));
    await u.dblClick(screen.getByRole('button', { name: 'Apagar tudo' }));
    expect(await screen.findByText('Apagando…')).toBeInTheDocument();
    expect(screen.getByText('Apagando…')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(chamadasA('POST', '/api/implantacao/limpar')).toHaveLength(1);
    expect(chamadasA('POST', '/api/implantacao/limpar')[0].corpo).toEqual({ senha: 'segredo', confirmacao: 'APAGAR TUDO', apagar_backups: false });
    solta();
    await screen.findByText(/Dados apagados/);
  });

  it('envia apagar_backups true por padrão', async () => {
    servidor({ 'GET /api/implantacao': () => ({ corpo: resumo }), 'POST /api/implantacao/limpar': ok });
    const { u } = await abrir();
    await preencher(u);
    await u.click(screen.getByRole('button', { name: 'Apagar tudo' }));
    await screen.findByText(/Dados apagados/);
    expect(chamadasA('POST', '/api/implantacao/limpar')[0].corpo).toEqual({ senha: 'segredo', confirmacao: 'APAGAR TUDO', apagar_backups: true });
  });

  it.each([
    [403, { erro: 'senha incorreta' }, 'A senha está incorreta.'],
    [400, { erro: 'confirmacao invalida' }, 'Confirme digitando exatamente APAGAR TUDO.'],
  ])('erro %i mostra mensagem, limpa a senha e mantém o painel', async (status, corpo, texto) => {
    servidor({ 'GET /api/implantacao': () => ({ corpo: resumo }), 'POST /api/implantacao/limpar': () => ({ status, corpo }) });
    const { u } = await abrir();
    await preencher(u);
    await u.click(screen.getByRole('button', { name: 'Apagar tudo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('Senha')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Apagar tudo' })).toBeDisabled();
  });

  it('sucesso: avisa, zera contagens, limpa rascunhos, fecha o painel e foca o título', async () => {
    servidor({ 'GET /api/implantacao': () => ({ corpo: resumo }), 'POST /api/implantacao/limpar': ok });
    const limpar = vi.spyOn(rascunhos, 'limparRascunhosAtendimento');
    const { u, aoLimpar } = await abrir();
    await preencher(u);
    await u.click(screen.getByRole('button', { name: 'Apagar tudo' }));
    const aviso = await screen.findByText('Dados apagados: 12 casos, 48 mensagens, 5 anexos, 3 cópias de segurança.');
    expect(aviso).toHaveAttribute('role', 'status');
    expect(screen.getByText(/Hoje: 0 casos, 0 mensagens, 0 anexos, 0 cópias de segurança/)).toBeInTheDocument();
    expect(limpar).toHaveBeenCalled();
    expect(aoLimpar).toHaveBeenCalled();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TITULO })).toHaveFocus();
  });
});
