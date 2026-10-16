import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFINICAO_TESTE, chamadasDeEnvio, formDoEnvio, simularQuestionario } from '../test/questionario';
import App from './App';
import Denuncia from './Denuncia';
import { salvarRascunho } from './rascunho';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHAVE = 'si-aluno-rascunho-v3';
const relato = 'Estão me ameaçando no aplicativo da turma.';
const opcaoAmeaca = DEFINICAO_TESTE.situacoes.find(s => s.id === 'ameaca')!.opcoes.map(o => o.texto);
const q = (id: string) => DEFINICAO_TESTE.perguntas.find(p => p.id === id)!;
beforeEach(() => { simularQuestionario(); });
const responder = (body: unknown, status = 200) => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

type Usuario = ReturnType<typeof userEvent.setup>;
const situacao = (nome: RegExp) => screen.getByRole('radio', { name: nome });
const continuar = (user: Usuario) => user.click(screen.getByRole('button', { name: 'Continuar' }));

async function abrirApp() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Preciso de ajuda' }));
  return user;
}
/** Avança pelas perguntas sem responder (nenhuma é obrigatória) até chegar ao relato. */
async function passarPerguntas(user: Usuario) {
  while (screen.queryByText(/^Pergunta \d+ de \d+$/)) await continuar(user);
}
async function ateRelato(user: Usuario, nome = /^Ameaças\./, opcoes: string[] = [opcaoAmeaca[0]]) {
  await user.click(situacao(nome));
  await continuar(user);
  if (opcoes.length) {
    await screen.findByRole('checkbox', { name: opcoes[0] });
    for (const o of opcoes) await user.click(screen.getByRole('checkbox', { name: o }));
    await continuar(user);
    await passarPerguntas(user);
  }
}
async function ateProvas(user: Usuario) {
  await ateRelato(user);
  await user.type(screen.getByLabelText('O que aconteceu?'), relato);
  await continuar(user);
}
async function provas() {
  const user = await abrirApp();
  await ateProvas(user);
  return user;
}

describe('Passos e validação', () => {
  it('mostra os quatro passos, marca o atual e conta "Passo N de 4"', async () => {
    const user = await abrirApp();
    const barra = screen.getByRole('list', { name: 'Etapas do pedido' });
    const itens = Array.from(barra.querySelectorAll('li'));
    expect(itens.map(li => li.textContent)).toEqual(['1Situação', '2Detalhes', '3Relato', '4Provas']);
    expect(itens[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
    await user.click(situacao(/^Ameaças\./));
    await continuar(user);
    expect(itens[1]).toHaveAttribute('aria-current', 'step');
    expect(itens[0]).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument();
  });
  it('mostra as sete opções (seis situações e Outros) com nome e descrição, uma escolha por vez', async () => {
    const user = await abrirApp();
    expect(screen.getAllByRole('radio').filter(r => (r as HTMLInputElement).name === 'situacao')).toHaveLength(7);
    expect(situacao(/^Aliciamento\. Alguém está tentando se aproximar/)).toBeInTheDocument();
    await user.click(situacao(/^Golpe\./));
    await user.click(situacao(/^Ameaças\./));
    expect(situacao(/^Ameaças\./)).toBeChecked();
    expect(situacao(/^Golpe\./)).not.toBeChecked();
  });
  it('passo 1 exige uma situação', async () => {
    const user = await abrirApp();
    await continuar(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma situação para continuar.');
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
  });
  it('passo 2 exige pelo menos uma opção e oferece as opções como caixas de seleção', async () => {
    const user = await abrirApp();
    await user.click(situacao(/^Ameaças\./));
    await continuar(user);
    for (const o of opcaoAmeaca) expect(await screen.findByRole('checkbox', { name: o })).toBeInTheDocument();
    await continuar(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha pelo menos uma opção.');
    expect(screen.queryByLabelText('O que aconteceu?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: opcaoAmeaca[2] }));
    await continuar(user);
    expect(screen.getByLabelText('O que aconteceu?')).toBeInTheDocument();
  });
  it.each([[/^Outros\./], [/^Aliciamento\./]])('pula o passo 2 para %s e o Voltar do passo 3 volta ao 1', async nome => {
    const user = await abrirApp();
    await user.click(situacao(nome));
    await continuar(user);
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toBeInTheDocument();
    expect(screen.getByText('Passo 3 de 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
    expect(situacao(nome)).toBeChecked();
  });
  it('relato curto não avança', async () => {
    const user = await abrirApp();
    await ateRelato(user, /^Outros\./, []);
    await user.type(screen.getByLabelText('O que aconteceu?'), 'curto');
    await continuar(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Conte um pouco mais, com pelo menos 10 caracteres.');
    expect(screen.queryByRole('heading', { name: 'Provas e identificação' })).not.toBeInTheDocument();
  });
  it('relato acima de 5000 caracteres diz quantos há a mais e nunca envia; o limite não desconta opções marcadas', async () => {
    const user = await abrirApp();
    await ateRelato(user, /^Ameaças\./, [opcaoAmeaca[0]]);
    expect(screen.getByText(/de 5000 caracteres/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('O que aconteceu?'), { target: { value: 'a'.repeat(5007) } });
    await continuar(user);
    expect(screen.getByRole('alert')).toHaveTextContent('7 caracteres a mais');
    expect(screen.queryByRole('heading', { name: 'Provas e identificação' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('O que aconteceu?'), { target: { value: 'a'.repeat(5000) } });
    await continuar(user);
    expect(screen.getByRole('heading', { name: 'Provas e identificação' })).toBeInTheDocument();
    expect(chamadasDeEnvio()).toHaveLength(0);
  });
  it('o contador mostra 5000 sem opções marcadas', async () => {
    const user = await abrirApp();
    await ateRelato(user, /^Outros\./, []);
    expect(screen.getByText(/0 de 5000 caracteres/)).toBeInTheDocument();
  });
  it('exige nome quando identificado', async () => {
    const user = await provas();
    await user.click(screen.getByLabelText('Quero me identificar'));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(screen.getByRole('alert')).toHaveTextContent('nome');
    expect(chamadasDeEnvio()).toHaveLength(0);
  });
});

describe('Voltar e avançar', () => {
  it('mantém as escolhas ao voltar do relato e envia o relato só com o texto do aluno', async () => {
    const user = await abrirApp();
    await ateRelato(user, /^Ameaças\./, [opcaoAmeaca[0], opcaoAmeaca[3]]);
    await user.type(screen.getByLabelText('O que aconteceu?'), relato);
    await continuar(user);
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByLabelText('O que aconteceu?')).toHaveValue(relato);
    // do relato volta à última pergunta; daí até as opções
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    while (!screen.queryByRole('checkbox', { name: opcaoAmeaca[0] })) await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('checkbox', { name: opcaoAmeaca[0] })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: opcaoAmeaca[3] })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: opcaoAmeaca[1] })).not.toBeChecked();
    await continuar(user);
    await passarPerguntas(user);
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    expect(formDoEnvio().get('relato')).toBe(relato);
  });
  it('trocar de situação limpa as opções marcadas da anterior', async () => {
    const user = await abrirApp();
    await ateRelato(user, /^Ameaças\./, [opcaoAmeaca[0]]);
    while (!screen.queryByRole('heading', { name: 'Qual é a situação?' })) await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await user.click(situacao(/^Golpe\./));
    await continuar(user);
    await screen.findByRole('checkbox', { name: /Pediram minha senha/ });
    expect(screen.getAllByRole('checkbox').some(c => (c as HTMLInputElement).checked)).toBe(false);
  });
});

describe('Envio', () => {
  it('envia o contrato multipart com tipo, relato composto e anônimo, e limpa o rascunho', async () => {
    const user = await provas();
    responder({ codigo: 'K7M2-9QXD', anexos_recusados: [{ nome: 'print.png', motivo: 'imagem inválida' }] }, 201);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('print.png');
    const [url, init] = chamadasDeEnvio()[0];
    expect(url).toBe('/api/denuncias');
    const form = init?.body as FormData;
    expect(form.get('tipo')).toBe('ameaca');
    expect(form.get('relato')).toBe(relato);
    expect(form.get('anonimo')).toBe('true');
    expect(form.get('em_andamento')).toBe('false');
    expect(form.get('nome')).toBe('');
    expect(form.get('turma')).toBe('');
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(storage.mock.calls)).not.toContain('K7M2');
    expect(document.querySelector('[style]')).toBeNull();
  });
  it.each([[/^Aliciamento\./, 'aliciamento'], [/^Outros\./, 'outro']])('envia o tipo certo para %s, sem bloco', async (nome, tipo) => {
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    await user.click(situacao(nome));
    await continuar(user);
    await user.type(screen.getByLabelText('O que aconteceu?'), relato);
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    await vi.waitFor(() => expect(chamadasDeEnvio()).toHaveLength(1));
    const form = formDoEnvio();
    expect(form.get('tipo')).toBe(tipo);
    expect(form.get('relato')).toBe(relato);
    expect(form.has('respostas')).toBe(false);
  });
  it('identificado envia nome e turma', async () => {
    const user = await provas();
    await user.click(screen.getByLabelText('Quero me identificar'));
    await user.type(screen.getByLabelText('Seu nome'), 'Ana');
    await user.type(screen.getByLabelText(/Sua turma/), '2A');
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    const form = formDoEnvio();
    expect(form.get('anonimo')).toBe('false');
    expect(form.get('nome')).toBe('Ana');
    expect(form.get('turma')).toBe('2A');
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
    expect(chamadasDeEnvio()).toHaveLength(1);
    expect(localStorage.length).toBe(0);
  });
  it('avisa o pai com onEnviando(true) e depois onEnviando(false)', async () => {
    const user = userEvent.setup();
    const onEnviando = vi.fn();
    render(<Denuncia onEnviado={() => {}} onEnviando={onEnviando} />);
    await ateProvas(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    await vi.waitFor(() => expect(onEnviando).toHaveBeenLastCalledWith(false));
    expect(onEnviando.mock.calls.map(c => c[0])).toEqual([true, false]);
  });
  it('mantém o texto após falha de rede e restaura o rascunho ao reabrir', async () => {
    const user = await provas();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('tente de novo');
    expect(screen.getByRole('alert')).toHaveTextContent('Seu relato continua nesta tela.');
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByLabelText('O que aconteceu?')).toHaveValue(relato);
    await user.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    await user.click(screen.getByRole('button', { name: 'Preciso de ajuda' }));
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
    expect(situacao(/^Ameaças\./)).toBeChecked();
    await continuar(user);
    expect(await screen.findByRole('checkbox', { name: opcaoAmeaca[0] })).toBeChecked();
    await continuar(user);
    await passarPerguntas(user);
    expect(screen.getByLabelText('O que aconteceu?')).toHaveValue(relato);
  });
  it('funciona com localStorage indisponível', async () => {
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

describe('Anexos', () => {
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
  it('revoga as URLs das miniaturas ao desmontar', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Denuncia onEnviado={() => {}} />);
    await ateProvas(user);
    await user.upload(screen.getByLabelText('Adicionar imagens'), new File(['x'], 'a.png', { type: 'image/png' }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:miniatura');
  });
});

describe('Girar imagem', () => {
  let ultimo: { width: number; height: number };
  const MSG_FALHA = 'Não foi possível girar esta imagem. Ela continua anexada como estava.';
  let liberar: (() => void) | null;
  let tamanhoBlob: number;
  let falhar: boolean;
  let contador: number;
  beforeEach(() => {
    liberar = null; tamanhoBlob = 8; falhar = false; contador = 0;
    ultimo = { width: 0, height: 0 };
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:miniatura-${++contador}`);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      if (falhar) throw new Error('ruim');
      await new Promise<void>(r => { liberar = r; });
      return { width: 200, height: 100, close: () => {} };
    }));
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, op?: ElementCreationOptions) => {
      if (tag !== 'canvas') return original(tag, op);
      return Object.assign(ultimo, {
        getContext: () => ({ translate() {}, rotate() {}, drawImage() {} }),
        toBlob: (cb: (b: Blob | null) => void, tipo?: string) => cb(new Blob([new Uint8Array(tamanhoBlob)], { type: tipo })),
      });
    }) as typeof document.createElement);
  });
  const arquivo = (nome: string, tipo: string) => new File(['original'], nome, { type: tipo });
  async function comAnexo(nome = 'foto.png', tipo = 'image/png') {
    const user = await provas();
    fireEvent.change(screen.getByLabelText('Adicionar imagens'), { target: { files: [arquivo(nome, tipo)] } });
    return user;
  }
  const terminar = () => act(async () => { liberar?.(); await new Promise(r => setTimeout(r, 0)); });

  it.each([['foto.png', 'image/png'], ['foto.jpg', 'image/jpeg'], ['foto.webp', 'image/webp']])('mostra o botão Girar para %s', async (nome, tipo) => {
    await comAnexo(nome, tipo);
    expect(screen.getByRole('button', { name: `Girar ${nome}` })).toBeInTheDocument();
  });
  it('não mostra o botão para GIF', async () => {
    await comAnexo('anim.gif', 'image/gif');
    expect(screen.queryByRole('button', { name: /^Girar/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover anim.gif' })).toBeInTheDocument();
  });
  it('gira, troca a prévia, revoga a URL antiga e envia o arquivo girado', async () => {
    const user = await comAnexo();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:miniatura-1');
    await user.click(screen.getByRole('button', { name: 'Girar foto.png' }));
    await terminar();
    await vi.waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:miniatura-2'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:miniatura-1');
    expect(ultimo).toMatchObject({ width: 100, height: 200 });
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    await vi.waitFor(() => expect(chamadasDeEnvio()).toHaveLength(1));
    const enviados = formDoEnvio().getAll('anexos[]') as File[];
    expect(enviados).toHaveLength(1);
    expect(enviados[0].name).toBe('foto.png');
    expect(enviados[0].size).toBe(8);
  });
  it('mantém a posição do anexo girado', async () => {
    const user = await provas();
    fireEvent.change(screen.getByLabelText('Adicionar imagens'), { target: { files: [arquivo('a.png', 'image/png'), arquivo('b.png', 'image/png')] } });
    await user.click(screen.getByRole('button', { name: 'Girar a.png' }));
    await terminar();
    await vi.waitFor(() => expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'blob:miniatura-3'));
    expect(screen.getAllByRole('img')[1]).toHaveAttribute('src', 'blob:miniatura-2');
    expect(screen.getAllByRole('img').map(i => i.getAttribute('alt'))).toEqual(['Prévia de a.png', 'Prévia de b.png']);
  });
  it('desabilita o botão enquanto gira', async () => {
    const user = await comAnexo();
    await user.click(screen.getByRole('button', { name: 'Girar foto.png' }));
    expect(screen.getByRole('button', { name: 'Girar foto.png' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover foto.png' })).toBeEnabled();
    await terminar();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Girar foto.png' })).toBeEnabled());
  });
  it('não envia nem avança enquanto houver rotação em andamento', async () => {
    const user = await comAnexo();
    await user.click(screen.getByRole('button', { name: 'Girar foto.png' }));
    expect(screen.getByRole('button', { name: 'Enviar pedido de ajuda' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(chamadasDeEnvio()).toHaveLength(0);
    await terminar();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Enviar pedido de ajuda' })).toBeEnabled());
  });
  it('falha mostra a mensagem e mantém o original', async () => {
    falhar = true;
    const user = await comAnexo();
    await user.click(screen.getByRole('button', { name: 'Girar foto.png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_FALHA);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:miniatura-1');
    expect(screen.getByRole('button', { name: 'Girar foto.png' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Enviar pedido de ajuda' })).toBeEnabled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
  it('resultado acima de 5 MB mostra a mensagem própria e mantém o original', async () => {
    tamanhoBlob = 5 * 1024 * 1024 + 1;
    const user = await comAnexo();
    await user.click(screen.getByRole('button', { name: 'Girar foto.png' }));
    await terminar();
    expect(await screen.findByRole('alert')).toHaveTextContent('A imagem girada passa de 5 MB. Ela continua anexada como estava.');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:miniatura-1');
  });
  it('remover durante a rotação não ressuscita o anexo nem lança erro', async () => {
    const user = await comAnexo();
    await user.click(screen.getByRole('button', { name: 'Girar foto.png' }));
    await user.click(screen.getByRole('button', { name: 'Remover foto.png' }));
    await terminar();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(contador).toBe(1);
  });
  it('desmontar durante a rotação não cria URL nem lança erro', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Denuncia onEnviado={() => {}} />);
    await ateProvas(user);
    fireEvent.change(screen.getByLabelText('Adicionar imagens'), { target: { files: [arquivo('foto.png', 'image/png')] } });
    await user.click(screen.getByRole('button', { name: 'Girar foto.png' }));
    unmount();
    await terminar();
    expect(contador).toBe(1);
  });
});

describe('Foco', () => {
  it('ao entrar na denúncia e a cada passo, o título fica focado; em cada pergunta, a legenda', async () => {
    const user = await abrirApp();
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toHaveFocus();
    await user.click(situacao(/^Ameaças\./));
    await continuar(user);
    expect(screen.getByRole('heading', { name: 'O que está acontecendo?' })).toHaveFocus();
    await user.click(await screen.findByRole('checkbox', { name: opcaoAmeaca[0] }));
    await continuar(user);
    expect(screen.getByText(q('q1').texto)).toHaveFocus();
    await continuar(user);
    expect(screen.getByText(q('q6').texto)).toHaveFocus();
    await continuar(user);
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toHaveFocus();
    await user.type(screen.getByLabelText('O que aconteceu?'), relato);
    await continuar(user);
    expect(screen.getByRole('heading', { name: 'Provas e identificação' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toHaveFocus();
  });
});

describe('Rascunho', () => {
  it('não grava nada enquanto não há escolha nem texto e grava depois de escolher', async () => {
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    expect(localStorage.getItem(CHAVE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpar rascunho' })).not.toBeInTheDocument();
    await user.click(situacao(/^Golpe\./));
    expect(localStorage.getItem(CHAVE)).toContain('golpe');
    expect(screen.getByRole('button', { name: 'Limpar rascunho' })).toBeInTheDocument();
  });
  it('Limpar rascunho apaga o armazenamento e volta ao primeiro passo vazio', async () => {
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    await ateRelato(user);
    await user.type(screen.getByLabelText('O que aconteceu?'), 'Texto que será apagado.');
    await user.click(screen.getByRole('button', { name: 'Limpar rascunho' }));
    expect(localStorage.getItem(CHAVE)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toHaveFocus();
    expect(situacao(/^Ameaças\./)).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Limpar rascunho' })).not.toBeInTheDocument();
  });
  it('avisa quando o armazenamento está bloqueado e segue funcionando', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    await user.click(situacao(/^Golpe\./));
    expect(screen.getByRole('status')).toHaveTextContent('Este navegador não permite salvar o rascunho.');
    await continuar(user);
    expect(screen.getByRole('heading', { name: 'O que está acontecendo?' })).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /Pediram minha senha/ })).toBeInTheDocument();
  });
  it('restaura situação, opções e relato ao abrir, no passo 1', async () => {
    salvarRascunho({ situacaoId: 'ameaca', marcadas: ['a2'], respostas: {}, relato, quando: 'ontem', onde: 'grupo', em_andamento: true, anonimo: true, nome: '', turma: '' });
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
    expect(situacao(/^Ameaças\./)).toBeChecked();
    await continuar(user);
    expect(await screen.findByRole('checkbox', { name: opcaoAmeaca[1] })).toBeChecked();
    await continuar(user);
    await passarPerguntas(user);
    expect(screen.getByLabelText('O que aconteceu?')).toHaveValue(relato);
    expect(screen.getByLabelText(/Quando aconteceu/)).toHaveValue('ontem');
    expect(screen.getByLabelText('Está acontecendo agora?')).toBeChecked();
  });
  it('não restaura rascunho expirado nem o da versão antiga', () => {
    salvarRascunho({ situacaoId: 'ameaca', marcadas: [], respostas: {}, relato, quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '' }, Date.now() - 24 * 60 * 60 * 1000 - 5000);
    localStorage.setItem('si-aluno-rascunho-v1', JSON.stringify({ tipo: 'ameaca', relato }));
    render(<Denuncia onEnviado={() => {}} />);
    expect(situacao(/^Ameaças\./)).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Limpar rascunho' })).not.toBeInTheDocument();
    expect(localStorage.getItem('si-aluno-rascunho-v1')).toBeNull();
  });
  it('reabrir sem editar não renova o prazo; editar renova', async () => {
    const hora = 60 * 60 * 1000;
    const antes = Date.now() - 23 * hora;
    salvarRascunho({ situacaoId: 'ameaca', marcadas: ['a1'], respostas: {}, relato, quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '' }, antes);
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    expect(situacao(/^Ameaças\./)).toBeChecked();
    expect(JSON.parse(localStorage.getItem(CHAVE)!).salvoEm).toBe(antes);
    await user.click(situacao(/^Golpe\./));
    expect(JSON.parse(localStorage.getItem(CHAVE)!).salvoEm).toBeGreaterThan(antes);
  });
  it('rascunho de 25 horas não é restaurado nem regravado', () => {
    const hora = 60 * 60 * 1000;
    salvarRascunho({ situacaoId: 'ameaca', marcadas: [], respostas: {}, relato, quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '' }, Date.now() - 25 * hora);
    render(<Denuncia onEnviado={() => {}} />);
    expect(situacao(/^Ameaças\./)).not.toBeChecked();
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });
  it('rascunho adulterado (situação inexistente) abre vazio sem erro', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ situacaoId: 'inventada', marcadas: ['x'], relato, salvoEm: Date.now() }));
    render(<Denuncia onEnviado={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked();
  });
  it('opções que não pertencem à situação são descartadas ao restaurar', async () => {
    localStorage.setItem(CHAVE, JSON.stringify({ situacaoId: 'ameaca', marcadas: ['texto inventado', 'a2'], relato, anonimo: true, salvoEm: Date.now() }));
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    await continuar(user);
    expect(await screen.findByRole('checkbox', { name: opcaoAmeaca[1] })).toBeChecked();
    expect(screen.getAllByRole('checkbox').filter(c => (c as HTMLInputElement).checked)).toHaveLength(1);
  });
});

describe('Texto próprio do relato', () => {
  it.each([['', 'vazio'], ['12345', 'de 5 caracteres'], ['         x         ', 'só espaços em volta']])('com opções marcadas e relato %s (%s) não avança', async valor => {
    const user = await abrirApp();
    await ateRelato(user);
    if (valor) fireEvent.change(screen.getByLabelText('O que aconteceu?'), { target: { value: valor } });
    await continuar(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Conte um pouco mais, com pelo menos 10 caracteres.');
    expect(screen.queryByRole('heading', { name: 'Provas e identificação' })).not.toBeInTheDocument();
  });
  it('o contador usa o texto aparado e avisa quando passa do limite', async () => {
    const user = await abrirApp();
    await ateRelato(user, /^Outros\./, []);
    fireEvent.change(screen.getByLabelText('O que aconteceu?'), { target: { value: '  ' + 'a'.repeat(5003) + '  ' } });
    const contador = document.getElementById('tamanho-relato')!;
    expect(contador).toHaveTextContent('5003 de 5000 caracteres');
    expect(contador).toHaveTextContent('3 caracteres a mais');
    expect(contador).toHaveClass('excedido');
  });
});

const AVISO_FALHA = 'Não foi possível carregar as perguntas agora. Você pode continuar só com o relato.';
const ORIENTACAO = 'Se você sente que corre perigo agora, procure um adulto de confiança ou a coordenação da escola hoje. Seu pedido continua sendo enviado.';
const resposta = (nome: string) => screen.getByRole('radio', { name: nome });
const marcarOpcoes = async (user: Usuario, textos: string[], situacaoNome = /^Ameaças\./) => {
  await user.click(situacao(situacaoNome));
  await continuar(user);
  await screen.findByRole('checkbox', { name: textos[0] });
  for (const t of textos) await user.click(screen.getByRole('checkbox', { name: t }));
  await continuar(user);
};
const jsonEnviado = (n = 0) => JSON.parse(formDoEnvio(n).get('respostas') as string);
async function enviar(user: Usuario) {
  await user.type(screen.getByLabelText('O que aconteceu?'), relato);
  await continuar(user);
  await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
}

describe('Passo 2: opções e perguntas encadeadas', () => {
  it('(a) mostra as opções vindas do servidor com o texto literal e exige pelo menos uma', async () => {
    const user = await abrirApp();
    await user.click(situacao(/^Ameaças\./));
    await continuar(user);
    for (const o of DEFINICAO_TESTE.situacoes[0].opcoes) expect(await screen.findByRole('checkbox', { name: o.texto })).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    await continuar(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha pelo menos uma opção.');
    expect(screen.getByRole('heading', { name: 'O que está acontecendo?' })).toBeInTheDocument();
  });
  it('(b) a primeira pergunta aberta aparece com foco, Passo 2 de 4 e "Pergunta N de M" que acompanha as respostas', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    expect(screen.getByText(q('q1').texto)).toHaveFocus();
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument();
    expect(screen.getByText('Pergunta 1 de 2')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await user.click(resposta('Sim, agora'));
    expect(screen.getByText('Pergunta 1 de 3')).toBeInTheDocument();
    await continuar(user);
    expect(screen.getByText(q('q2').texto)).toHaveFocus();
    expect(screen.getByText('Pergunta 2 de 3')).toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });
  it('(c) a pergunta dependente vem logo depois; mudar a resposta remove ela e suas respostas do envio', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await user.click(resposta('Sim, agora'));
    await continuar(user);
    expect(screen.getByText(q('q2').texto)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Amigos' }));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText(q('q1').texto)).toHaveFocus();
    expect(resposta('Sim, agora')).toBeChecked();
    await user.click(resposta('Aconteceu e parou'));
    expect(screen.getByText('Pergunta 1 de 2')).toBeInTheDocument();
    await continuar(user);
    expect(screen.getByText(q('q6').texto)).toBeInTheDocument();
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    expect(jsonEnviado()).toEqual({ situacao: 'ameaca', marcadas: ['a1'], respostas: { q1: ['q1.parou'] } });
  });
  it('(d) Voltar na primeira pergunta volta às opções com as marcações; mudar de situação descarta opções e respostas', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0], opcaoAmeaca[1]]);
    await user.click(resposta('Aconteceu e parou'));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'O que está acontecendo?' })).toHaveFocus();
    expect(screen.getByRole('checkbox', { name: opcaoAmeaca[0] })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: opcaoAmeaca[1] })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
    await user.click(situacao(/^Golpe\./));
    await continuar(user);
    await user.click(await screen.findByRole('checkbox', { name: /Pediram minha senha/ }));
    await continuar(user);
    expect(screen.getByText(q('q1').texto)).toBeInTheDocument();
    expect(resposta('Aconteceu e parou')).not.toBeChecked();
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    expect(formDoEnvio().get('tipo')).toBe('golpe');
    expect(jsonEnviado()).toEqual({ situacao: 'golpe', marcadas: ['g1'], respostas: {} });
  });
  it('(d) Voltar nas perguntas seguintes volta à pergunta visitada anterior', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await continuar(user);
    expect(screen.getByText(q('q6').texto)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText(q('q1').texto)).toBeInTheDocument();
    await continuar(user);
    expect(screen.getByText(q('q6').texto)).toBeInTheDocument();
  });
  it('(e) avançar sem responder é permitido em todas as perguntas', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0], opcaoAmeaca[1]]);
    await passarPerguntas(user);
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    expect(jsonEnviado()).toEqual({ situacao: 'ameaca', marcadas: ['a1', 'a2'], respostas: {} });
  });
  it('(f) o envio leva respostas com o JSON esperado e o relato só com o texto do aluno', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[1], opcaoAmeaca[0]]);
    await user.click(resposta('Sim, agora'));
    await continuar(user);
    await user.click(screen.getByRole('checkbox', { name: 'Amigos' }));
    await user.click(screen.getByRole('checkbox', { name: 'Minha família' }));
    await continuar(user);
    await user.click(screen.getByRole('checkbox', { name: 'Em redes sociais' }));
    await continuar(user);
    await user.click(resposta('Sim'));
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    const form = formDoEnvio();
    expect(jsonEnviado()).toEqual({ situacao: 'ameaca', marcadas: ['a1', 'a2'], respostas: { q1: ['q1.agora'], q2: ['q2.amigos', 'q2.familia'], q3: ['q3.rede'], q6: ['q6.sim'] } });
    expect(form.get('relato')).toBe(relato);
    expect(form.get('relato')).not.toContain('Situações marcadas');
    expect(form.get('tipo')).toBe('ameaca');
  });
  it('troca a resposta de uma pergunta única em vez de acumular', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await user.click(resposta('Aconteceu e parou'));
    await user.click(resposta('Não sei'));
    expect(resposta('Aconteceu e parou')).not.toBeChecked();
    expect(resposta('Não sei')).toBeChecked();
  });
});

describe('Definição indisponível e respostas recusadas', () => {
  it.each([['rede', 'falha de rede'], [503, 'servidor com a definição quebrada']] as const)('(g) %s (%s): pula o passo 2, avisa e envia sem respostas', async (definicao, _motivo) => {
    simularQuestionario(definicao);
    const user = await abrirApp();
    await user.click(situacao(/^Ameaças\./));
    await continuar(user);
    expect(await screen.findByRole('heading', { name: 'O que aconteceu?' })).toBeInTheDocument();
    expect(screen.getByText('Passo 3 de 4')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(AVISO_FALHA);
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    expect(formDoEnvio().has('respostas')).toBe(false);
    expect(formDoEnvio().get('relato')).toBe(relato);
    expect(formDoEnvio().get('tipo')).toBe('ameaca');
  });
  it('(h) 400 "respostas invalidas": reenvia uma vez sem respostas, com os mesmos dados, e avisa na confirmação', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await passarPerguntas(user);
    await user.type(screen.getByLabelText('O que aconteceu?'), relato);
    await user.type(screen.getByLabelText(/Onde aconteceu/), 'grupo da turma');
    await continuar(user);
    await user.upload(screen.getByLabelText('Adicionar imagens'), new File(['x'], 'print.png', { type: 'image/png' }));
    await user.click(screen.getByLabelText('Quero me identificar'));
    await user.type(screen.getByLabelText('Seu nome'), 'Ana');
    responder({ erro: 'respostas invalidas' }, 400);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    expect(await screen.findByText('K7M2-9QXD')).toBeInTheDocument();
    expect(chamadasDeEnvio()).toHaveLength(2);
    const [primeira, segunda] = [formDoEnvio(0), formDoEnvio(1)];
    expect(primeira.has('respostas')).toBe(true);
    expect(segunda.has('respostas')).toBe(false);
    for (const campo of ['tipo', 'relato', 'onde', 'quando', 'anonimo', 'nome', 'turma', 'em_andamento']) expect(segunda.get(campo)).toBe(primeira.get(campo));
    expect((segunda.getAll('anexos[]') as File[]).map(a => a.name)).toEqual(['print.png']);
    expect(screen.getByText(/As respostas às perguntas não foram enviadas/)).toBeInTheDocument();
  });
  it.each([[{ erro: 'campos invalidos' }, 400], [{ erro: 'respostas invalidas' }, 500], [{ erro: 'x' }, 429]] as const)('(h) outro erro (%j, %i) não reenvia e mantém o relato na tela', async (corpo, status) => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await passarPerguntas(user);
    responder(corpo, status);
    await enviar(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu relato continua nesta tela.');
    expect(chamadasDeEnvio()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Enviar pedido de ajuda' })).toBeEnabled();
  });
  it('(h) se o reenvio também falhar, mostra o erro e mantém o relato', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await passarPerguntas(user);
    responder({ erro: 'respostas invalidas' }, 400);
    responder({ erro: 'x' }, 500);
    await enviar(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu relato continua nesta tela.');
    expect(chamadasDeEnvio()).toHaveLength(2);
  });
});

describe('Orientação de risco', () => {
  it.each([['Não'], ['Quero falar com alguém hoje']])('(i) a resposta "%s" mostra a orientação na tela, sem bloquear o Continuar', async nome => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await continuar(user);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await user.click(resposta(nome));
    expect(screen.getByRole('status')).toHaveTextContent(ORIENTACAO);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
    await continuar(user);
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toBeInTheDocument();
  });
  it.each([['Sim'], ['Mais ou menos']])('(i) a resposta "%s" não mostra a orientação', async nome => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await continuar(user);
    await user.click(resposta(nome));
    expect(screen.queryByText(ORIENTACAO)).not.toBeInTheDocument();
    await user.click(resposta('Não'));
    await user.click(resposta(nome));
    expect(screen.queryByText(ORIENTACAO)).not.toBeInTheDocument();
  });
  it('(i) a confirmação mostra o mesmo cuidado quando uma resposta de risco foi marcada', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await continuar(user);
    await user.click(resposta('Quero falar com alguém hoje'));
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    expect(screen.getByText(ORIENTACAO)).toBeInTheDocument();
  });
  it('(i) sem resposta de risco a confirmação não mostra a orientação', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await continuar(user);
    await user.click(resposta('Sim'));
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    expect(screen.queryByText(ORIENTACAO)).not.toBeInTheDocument();
  });
  it('(i) risco marcado em pergunta que deixou de valer não gera orientação', async () => {
    const user = await abrirApp();
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await continuar(user);
    await user.click(resposta('Quero falar com alguém hoje'));
    // volta às opções e troca para uma opção que não abre a pergunta de segurança
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await user.click(screen.getByRole('checkbox', { name: opcaoAmeaca[0] }));
    await user.click(screen.getByRole('checkbox', { name: opcaoAmeaca[2] }));
    await continuar(user);
    await passarPerguntas(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    expect(jsonEnviado().respostas).toEqual({});
    expect(screen.queryByText(ORIENTACAO)).not.toBeInTheDocument();
  });
});

describe('Rascunho com respostas', () => {
  it('(j) sair e reabrir restaura situação, opções e respostas (ids) e volta ao passo 1', async () => {
    const user = userEvent.setup();
    const primeira = render(<Denuncia onEnviado={() => {}} />);
    await marcarOpcoes(user, [opcaoAmeaca[0]]);
    await user.click(resposta('Sim, agora'));
    await continuar(user);
    await user.click(screen.getByRole('checkbox', { name: 'Amigos' }));
    const guardado = JSON.parse(localStorage.getItem(CHAVE)!);
    expect(guardado.marcadas).toEqual(['a1']);
    expect(guardado.respostas).toEqual({ q1: ['q1.agora'], q2: ['q2.amigos'] });
    primeira.unmount();
    render(<Denuncia onEnviado={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Qual é a situação?' })).toBeInTheDocument();
    expect(situacao(/^Ameaças\./)).toBeChecked();
    await continuar(user);
    expect(await screen.findByRole('checkbox', { name: opcaoAmeaca[0] })).toBeChecked();
    await continuar(user);
    expect(resposta('Sim, agora')).toBeChecked();
    await continuar(user);
    expect(screen.getByRole('checkbox', { name: 'Amigos' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Minha família' })).not.toBeChecked();
  });
  it('(j) rascunho com ids que não existem mais abre sem erro e não os envia', async () => {
    salvarRascunho({
      situacaoId: 'ameaca', marcadas: ['a1', 'a_antiga'], respostas: { q1: ['q1.agora', 'q1.velha'], q2: ['q2.amigos', 'q2.fantasma'], q99: ['x'], q3: ['q3.rede'] },
      relato, quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '',
    });
    const user = userEvent.setup();
    render(<Denuncia onEnviado={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await continuar(user);
    expect(await screen.findByRole('checkbox', { name: opcaoAmeaca[0] })).toBeChecked();
    expect(screen.getAllByRole('checkbox').filter(c => (c as HTMLInputElement).checked)).toHaveLength(1);
    await continuar(user);
    await passarPerguntas(user);
    await continuar(user);
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido de ajuda' }));
    await vi.waitFor(() => expect(chamadasDeEnvio()).toHaveLength(1));
    expect(jsonEnviado()).toEqual({ situacao: 'ameaca', marcadas: ['a1'], respostas: { q1: ['q1.agora'], q2: ['q2.amigos'] } });
  });
  it('(j) rascunho de opções em texto da versão anterior (v2) é descartado', () => {
    localStorage.setItem('si-aluno-rascunho-v2', JSON.stringify({ situacaoId: 'ameaca', marcadas: [opcaoAmeaca[0]], relato, salvoEm: Date.now() }));
    render(<Denuncia onEnviado={() => {}} />);
    expect(situacao(/^Ameaças\./)).not.toBeChecked();
  });
});

describe('Definição real do servidor', () => {
  it('percorre o fluxo com questionario.json: gatilhos, risco e JSON válido', async () => {
    const real = JSON.parse(readFileSync(resolve(__dirname, '../../../backend/app/questionario.json'), 'utf-8'));
    simularQuestionario({ dimensoes: real.dimensoes, situacoes: real.situacoes, perguntas: real.perguntas });
    const ameaca = real.situacoes.find((s: { id: string }) => s.id === 'ameaca');
    const opcao = ameaca.opcoes[0];
    const user = await abrirApp();
    await marcarOpcoes(user, [opcao.texto]);
    expect(screen.getByText(/^Pergunta 1 de \d+$/)).toBeInTheDocument();
    // responde sempre a primeira resposta de cada pergunta
    let guarda = 0;
    while (screen.queryByText(/^Pergunta \d+ de \d+$/) && guarda++ < 60) {
      await user.click([...screen.queryAllByRole('radio'), ...screen.queryAllByRole('checkbox')][0]);
      await continuar(user);
    }
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toBeInTheDocument();
    responder({ codigo: 'K7M2-9QXD' }, 201);
    await enviar(user);
    await screen.findByText('K7M2-9QXD');
    const envio = jsonEnviado();
    expect(envio.situacao).toBe('ameaca');
    expect(envio.marcadas).toEqual([opcao.id]);
    const porId = new Map(real.perguntas.map((p: { id: string }) => [p.id, p]));
    for (const [pergunta, lista] of Object.entries(envio.respostas) as [string, string[]][]) {
      expect(porId.has(pergunta)).toBe(true);
      expect(lista.length).toBeGreaterThan(0);
    }
    expect(Object.keys(envio.respostas).length).toBeGreaterThan(0);
  });
});
