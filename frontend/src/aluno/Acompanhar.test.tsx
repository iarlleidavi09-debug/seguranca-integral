import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import Acompanhar from './Acompanhar';

let respostas: Array<() => Promise<Response>> = [];
beforeEach(() => {
  respostas = [];
  localStorage.clear();
  vi.mocked(fetch).mockImplementation(async url => {
    if (url === '/api/acompanhar/eventos') return new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } });
    const proxima = respostas.shift();
    if (!proxima) throw new Error('Resposta HTTP não preparada no teste');
    return proxima();
  });
});
const responder = (body: unknown, status = 200) => respostas.push(async () => new Response(JSON.stringify(body), { status }));
const consultas = () => vi.mocked(fetch).mock.calls.filter(([url]) => url !== '/api/acompanhar/eventos');
const base = { resolucao: null, pos_resolucao: false, ultima_situacao: null };
const resolvido = { status: 'resolvido', mensagens: [], pos_resolucao: true, ultima_situacao: null, resolucao: { desfecho: 'solucionada', providencias: 'Conversamos.', resultado: 'Ok', criado_em: '2026-10-14T12:00:00Z' } };

describe('Acompanhar', () => {
  it('mostra mensagens, normaliza o código no corpo POST e permite responder', async () => {
    const user = userEvent.setup();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    responder({ ...base, status: 'em_investigacao', mensagens: [{ autor: 'coordenacao', texto: '<img src=x onerror=alert(1)>', criado_em: '2026-10-14T12:00:00Z' }] });
    await user.type(screen.getByLabelText('Acompanhar meu caso'), ' k7m2 9qxd ');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Coordenação')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/acompanhar', expect.objectContaining({ body: JSON.stringify({ codigo: 'K7M29QXD' }) }));
    responder({ ok: true }, 201);
    responder({ ...base, status: 'em_investigacao', mensagens: [{ autor: 'aluno', texto: 'Obrigado pela ajuda', criado_em: '2026-10-14T12:01:00Z' }] });
    await user.type(screen.getByLabelText('Sua resposta'), 'Obrigado pela ajuda');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByText('Obrigado pela ajuda')).toBeInTheDocument();
    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(storage).toHaveBeenCalled();
    expect(document.querySelector('[style]')).toBeNull();
    expect(window.location.search + window.location.hash).not.toContain('K7M2');
  });
  it('usa o texto de 404 de mensagemErro para código inexistente', async () => {
    const user = userEvent.setup();
    render(<App />);
    responder({ erro: 'detalhe privado' }, 404);
    await user.type(screen.getByLabelText('Acompanhar meu caso'), 'invalido');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível encontrar o caso. Confira o código e tente de novo.');
    expect(screen.queryByText('detalhe privado')).not.toBeInTheDocument();
  });
  it('pede o código quando o campo está vazio e não consulta', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Digite seu código');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('consulta o caso uma única vez em StrictMode e mostra o resultado', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [{ autor: 'coordenacao', texto: 'Olá, aluno', criado_em: '2026-10-14T12:00:00Z' }] });
    render(<StrictMode><Acompanhar codigoInicial="K7M2-9QXD" /></StrictMode>);
    expect(await screen.findByText('Olá, aluno')).toBeInTheDocument();
    await waitFor(() => expect(consultas()).toHaveLength(1));
  });
  it.each([
    ['novo', 'Recebido'], ['em_investigacao', 'Em investigação'], ['resolvido', 'Resolvido'],
    ['em_analise', 'Em investigação'], ['aguardando_aluno', 'Em investigação'], ['encaminhado', 'Em investigação'],
  ])('linha do tempo para %s marca "%s" como etapa atual', async (status, atual) => {
    responder({ ...base, status, mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const lista = await screen.findByRole('list', { name: 'Etapas do caso' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens.map(i => i.querySelector('.etapa-nome')?.textContent)).toEqual(['Recebido', 'Em investigação', 'Resolvido']);
    const correntes = itens.filter(i => i.getAttribute('aria-current') === 'step');
    expect(correntes).toHaveLength(1);
    expect(correntes[0]).toHaveTextContent(atual);
    expect(correntes[0]).toHaveTextContent('Etapa atual');
  });
  it('status desconhecido não marca etapa nem quebra', async () => {
    responder({ ...base, status: 'inventado', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const lista = await screen.findByRole('list', { name: 'Etapas do caso' });
    expect(lista.querySelector('[aria-current]')).toBeNull();
  });
  it('Atualizar conversa recarrega as mensagens', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByText(/Ainda não há mensagens/);
    responder({ ...base, status: 'novo', mensagens: [{ autor: 'coordenacao', texto: 'Chegou', criado_em: '2026-10-14T12:00:00Z' }] });
    await user.click(screen.getByRole('button', { name: 'Atualizar conversa' }));
    expect(await screen.findByText('Chegou')).toBeInTheDocument();
  });
  it('recusa resposta vazia sem enviar', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1 a 2000');
    expect(consultas()).toHaveLength(1);
  });
  it('com o caso resolvido mantém a conversa e mostra o bloco pós-resolução', async () => {
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    expect(await screen.findByRole('heading', { name: 'Seu caso foi resolvido' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sua resposta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar conversa' })).toBeInTheDocument();
  });
  it('não mostra o bloco com pos_resolucao falso (caso reaberto)', async () => {
    responder({ ...resolvido, pos_resolucao: false, resolucao: null, status: 'em_investigacao' });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    expect(screen.queryByText('Seu caso foi resolvido')).toBeNull();
  });
  it('informar a situação envia o código, recarrega o caso e reflete a última situação', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ ok: true }, 201);
    responder({ ...resolvido, ultima_situacao: 'melhorou' });
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText('Você informou: Melhorou')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/acompanhar/situacao', expect.objectContaining({ body: JSON.stringify({ codigo: 'K7M29QXD', situacao: 'melhorou' }) }));
    expect(consultas()).toHaveLength(3);
    expect(screen.getByText('Obrigado por contar. A equipe vai ver.')).toBeInTheDocument();
  });
  it('409 mostra a mensagem e recarrega o caso', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ erro: 'x' }, 409);
    responder({ ...resolvido, status: 'em_investigacao', pos_resolucao: false, resolucao: null });
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText('Esse caso ainda não foi resolvido.')).toBeInTheDocument();
    expect(consultas()).toHaveLength(3);
    expect(screen.queryByText('Seu caso foi resolvido')).toBeNull();
  });
  it('429 e falha de rede mantêm a tela com a mensagem', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({}, 429);
    await user.click(screen.getByRole('button', { name: 'Voltou a acontecer' }));
    expect(await screen.findByText('Foram feitas muitas tentativas. Aguarde alguns minutos e tente de novo.')).toBeInTheDocument();
    respostas.push(async () => { throw new TypeError('rede'); });
    await user.click(screen.getByRole('button', { name: 'Voltou a acontecer' }));
    expect(await screen.findByText(/Não foi possível conectar/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seu caso foi resolvido' })).toBeInTheDocument();
  });
  it('uma atualização lenta não sobrescreve a recarga posterior ao informar a situação', async () => {
    const user = userEvent.setup();
    const adiada = () => { let fim!: (r: Response) => void; const promessa = new Promise<Response>(r => { fim = r; }); return { promessa, fim }; };
    const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    const envio = adiada(); const antiga = adiada(); const nova = adiada();
    respostas.push(() => envio.promessa, () => antiga.promessa, () => nova.promessa);
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    await user.click(screen.getByRole('button', { name: 'Atualizar conversa' }));
    envio.fim(resposta({ ok: true }, 201));
    await waitFor(() => expect(consultas()).toHaveLength(4));
    nova.fim(resposta({ ...resolvido, ultima_situacao: 'melhorou' }));
    expect(await screen.findByText('Você informou: Melhorou')).toBeInTheDocument();
    antiga.fim(resposta({ ...resolvido, ultima_situacao: null }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar conversa' })).toBeEnabled());
    expect(screen.getByText('Você informou: Melhorou')).toBeInTheDocument();
  });
  it('desabilita as respostas da situação enquanto a conversa recarrega', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    respostas.push(() => new Promise<Response>(() => {}));
    await user.click(screen.getByRole('button', { name: 'Atualizar conversa' }));
    expect(screen.getByRole('button', { name: 'Melhorou' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltou a acontecer' })).toBeDisabled();
  });
  it('agradece mesmo quando a recarga depois de informar falha', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ ok: true }, 201);
    respostas.push(async () => { throw new TypeError('rede'); });
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText('Obrigado por contar. A equipe vai ver.')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível atualizar agora. Use Atualizar conversa.')).toBeInTheDocument();
  });
  it('o erro do 409 some ao atualizar a conversa', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ erro: 'x' }, 409);
    responder({ ...resolvido, status: 'em_investigacao', pos_resolucao: false, resolucao: null });
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText('Esse caso ainda não foi resolvido.')).toBeInTheDocument();
    responder({ ...resolvido, status: 'em_investigacao', pos_resolucao: false, resolucao: null });
    await user.click(screen.getByRole('button', { name: 'Atualizar conversa' }));
    await waitFor(() => expect(screen.queryByText('Esse caso ainda não foi resolvido.')).toBeNull());
  });
  it('o erro do 409 some quando o caso é resolvido de novo', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ erro: 'x' }, 409);
    responder({ ...resolvido, status: 'em_investigacao', pos_resolucao: false, resolucao: null });
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText('Esse caso ainda não foi resolvido.')).toBeInTheDocument();
    // a nova resolução chega por uma consulta que não passa por Atualizar (resposta de envio)
    responder({ ok: true }, 201);
    responder(resolvido);
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    expect(screen.queryByText('Esse caso ainda não foi resolvido.')).toBeNull();
  });
});

it('foca a conversa e registra somente os IDs vistos da coordenação', async () => {
 responder({ ...base, status:'novo', mensagens:[{id:42,autor:'coordenacao',texto:'Recebemos seu pedido',criado_em:'2026-10-14T12:00:00Z'}] });
 render(<Acompanhar codigoInicial="K7M2-9QXD" />);
 const titulo=await screen.findByRole('heading',{name:'Conversa com a coordenação'});
 await waitFor(() => expect(titulo).toHaveFocus());
 expect(screen.getByText('Mensagem nova')).toBeInTheDocument();
 expect(JSON.parse(localStorage.getItem('tetra-guard.acessos.v1') || '[]')).toEqual([{codigo:'K7M2-9QXD',lastRead:42}]);
});

it('não registra mensagem como vista enquanto a página está oculta', async () => {
 vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
 responder({ ...base,status:'novo',mensagens:[{id:50,autor:'coordenacao',texto:'Mensagem em segundo plano',criado_em:'2026-10-14T12:00:00Z'}] });
 render(<Acompanhar codigoInicial="K7M2-9QXD" />);
 await screen.findByText('Mensagem em segundo plano');
 expect(JSON.parse(localStorage.getItem('tetra-guard.acessos.v1') || '[]')).toEqual([{codigo:'K7M2-9QXD',lastRead:0}]);
 vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
 document.dispatchEvent(new Event('visibilitychange'));
 expect(JSON.parse(localStorage.getItem('tetra-guard.acessos.v1') || '[]')).toEqual([{codigo:'K7M2-9QXD',lastRead:50}]);
});

describe('Acompanhar: mensagens editadas e apagadas', () => {
  const coord = { autor: 'coordenacao', criado_em: '2026-10-14T12:00:00Z' };
  it('mostra (editada) ao lado do horário e o texto novo', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [{ ...coord, id: 1, texto: 'Texto corrigido', editada: true, apagada: false }] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    expect(await screen.findByText('Texto corrigido')).toBeInTheDocument();
    const artigo = screen.getByText('Texto corrigido').closest('article')!;
    expect(artigo).toHaveTextContent('(editada)');
    expect(artigo.querySelector('time')!.parentElement).toHaveTextContent('(editada)');
  });
  it('não mostra (editada) em mensagem comum', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [{ ...coord, id: 1, texto: 'Texto comum', editada: false, apagada: false }] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByText('Texto comum');
    expect(screen.queryByText(/\(editada\)/)).not.toBeInTheDocument();
  });
  it('mensagem apagada mostra o aviso no lugar do texto, sem horário e sem parágrafo vazio', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [{ ...coord, id: 1, texto: '', editada: false, apagada: true }] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const aviso = await screen.findByText('Mensagem apagada');
    const artigo = aviso.closest('article')!;
    expect(artigo.querySelector('time')).toBeNull();
    expect(artigo).not.toHaveTextContent('(editada)');
    expect([...artigo.querySelectorAll('p')].every(p => p.textContent!.trim() !== '')).toBe(true);
    expect(screen.getByRole('log')).toContainElement(artigo);
  });
  it('mensagem apagada da coordenação nunca conta como nova', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [{ ...coord, id: 5, texto: '', editada: false, apagada: true }] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByText('Mensagem apagada');
    expect(screen.queryByText('Mensagem nova')).not.toBeInTheDocument();
    expect(screen.queryByText(/mensagens? nova/i)).not.toBeInTheDocument();
  });
});
