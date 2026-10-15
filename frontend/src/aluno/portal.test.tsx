import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

const relato = 'Estão me ameaçando no aplicativo da turma.';
const responder = (body: unknown, status = 200) => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

async function abrirDenuncia() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Preciso de ajuda' }));
  return user;
}
async function provas() {
  const user = await abrirDenuncia();
  await user.click(screen.getByLabelText('Ameaça'));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await user.type(screen.getByLabelText('O que aconteceu?'), relato);
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  return user;
}

describe('Portal do aluno', () => {
  it('bloqueia o avanço sem tipo e com relato menor que 10 caracteres', async () => {
    const user = await abrirDenuncia();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha');
    await user.click(screen.getByLabelText('Ameaça'));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText('O que aconteceu?'), 'curto');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('10');
    expect(screen.queryByText('Provas e identificação', { selector: 'h1' })).not.toBeInTheDocument();
  });
  it('exige nome quando identificado', async () => {
    const user = await provas();
    await user.click(screen.getByLabelText('Quero me identificar'));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(screen.getByRole('alert')).toHaveTextContent('nome');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bloqueia sair enquanto o envio está pendente e preserva a confirmação', async () => {
    const user = await provas();
    let concluir!: (resposta: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { concluir = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(screen.getByRole('button', { name: 'Voltar ao início' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    expect(screen.getByRole('heading', { name: 'Provas e identificação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviando pedido…' })).toBeDisabled();
    concluir(new Response('{"codigo":"K7M2-9QXD"}', { status: 201 }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao início' })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
  });
  it('mantém o texto após falha de rede e restaura o rascunho ao reabrir', async () => {
    const user = await provas();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('tente de novo');
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByLabelText('O que aconteceu?')).toHaveValue(relato);
    await user.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    await user.click(screen.getByRole('button', { name: 'Preciso de ajuda' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText('O que aconteceu?')).toHaveValue(relato);
  });
  it('envia o contrato multipart, mostra o código só na confirmação e limpa o rascunho', async () => {
    const user = await provas();
    responder({ codigo: 'K7M2-9QXD', anexos_recusados: [{ nome: 'print.png', motivo: 'imagem inválida' }] }, 201);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('print.png');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/denuncias');
    const form = init?.body as FormData;
    expect(form.get('tipo')).toBe('ameaca');
    expect(form.get('relato')).toBe(relato);
    expect(form.get('anonimo')).toBe('true');
    expect(form.get('em_andamento')).toBe('false');
    expect(form.get('nome')).toBe('');
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(storage.mock.calls)).not.toContain('K7M2');
    expect(document.querySelector('[style]')).toBeNull();
  });
  it('limita a cinco anexos e a 5 MB por imagem, e revoga miniaturas', async () => {
    const user = await provas();
    const input = screen.getByLabelText('Adicionar imagens');
    const files = Array.from({ length: 6 }, (_, i) => new File(['imagem'], `print${i}.png`, { type: 'image/png' }));
    fireEvent.change(input, { target: { files } });
    expect(screen.getByRole('alert')).toHaveTextContent('5 imagens');
    expect(screen.getAllByRole('img')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Remover print0.png' }));
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('5 MB');
    fireEvent.change(input, { target: { files: [new File(['html'], 'arquivo.html', { type: 'text/html' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('PNG, JPEG, WebP ou GIF');
  });
  it('mostra mensagens, normaliza o código no corpo POST e permite responder', async () => {
    const user = userEvent.setup();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    responder({ status: 'aguardando_aluno', mensagens: [{ autor: 'coordenacao', texto: '<img src=x onerror=alert(1)>', criado_em: '2026-10-14T12:00:00Z' }] });
    await user.type(screen.getByLabelText('Acompanhar meu caso'), ' k7m2 9qxd ');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByText('Aguardando sua resposta')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/acompanhar', expect.objectContaining({ body: JSON.stringify({ codigo: 'K7M29QXD' }) }));
    responder({ ok: true }, 201);
    responder({ status: 'em_analise', mensagens: [{ autor: 'aluno', texto: 'Obrigado pela ajuda', criado_em: '2026-10-14T12:01:00Z' }] });
    await user.type(screen.getByLabelText('Sua resposta'), 'Obrigado pela ajuda');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByText('Obrigado pela ajuda')).toBeInTheDocument();
    expect(storage).not.toHaveBeenCalled();
    expect(document.querySelector('[style]')).toBeNull();
  });
  it('usa o mesmo texto genérico para código inválido ou inexistente (404)', async () => {
    const user = userEvent.setup();
    render(<App />);
    responder({ erro: 'detalhe privado' }, 404);
    await user.type(screen.getByLabelText('Acompanhar meu caso'), 'invalido');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível encontrar o caso. Confira o código e tente de novo.');
    expect(screen.queryByText('detalhe privado')).not.toBeInTheDocument();
  });
  it('funciona com localStorage indisponível e não renderiza estilos inline', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const user = await provas();
    expect(document.querySelector('[style]')).toBeNull();
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
  });
});
