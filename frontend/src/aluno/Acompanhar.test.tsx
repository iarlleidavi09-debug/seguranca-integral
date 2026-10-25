import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import Acompanhar from './Acompanhar';

let respostas: Array<() => Promise<Response>> = [];
let eventos: 'online' | 'conectando' | 'queda' | 'controlado' = 'online';
let fluxo: ReadableStreamDefaultController<Uint8Array> | null = null;
beforeEach(() => {
  respostas = [];
  eventos = 'online'; fluxo = null;
  localStorage.clear();
  vi.mocked(fetch).mockImplementation(async url => {
    if (url === '/api/acompanhar/eventos' && eventos === 'queda') throw new TypeError('rede');
    if (url === '/api/acompanhar/eventos' && eventos === 'conectando') return new Promise<Response>(() => {});
    if (url === '/api/acompanhar/eventos' && eventos === 'controlado') return new Response(new ReadableStream<Uint8Array>({ start(c) { fluxo = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
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
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('button', { name: 'Acompanhar' }));
    responder({ ...base, status: 'em_investigacao', mensagens: [{ autor: 'coordenacao', texto: '<img src=x onerror=alert(1)>', criado_em: '2026-10-14T12:00:00Z' }] });
    await user.type(screen.getByLabelText('Código de acompanhamento'), ' k7m2 9qxd ');
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
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('button', { name: 'Acompanhar' }));
    responder({ erro: 'detalhe privado' }, 404);
    await user.type(screen.getByLabelText('Código de acompanhamento'), 'invalido');
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
    expect(correntes[0].querySelector('.so-leitor')).toHaveTextContent('Etapa atual');
  });
  it('etapas ficam em uma linha com o estado só para leitor de tela', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const lista = await screen.findByRole('list', { name: 'Etapas do caso' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(3);
    expect(lista.querySelector('[aria-current="step"]')).not.toBeNull();
    expect(within(lista).getByText('Etapa atual')).toHaveClass('so-leitor');
  });
  it('código fica em Seu código, fechado por padrão', async () => {
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="k7m2 9qxd" />);
    const resumo = await screen.findByText('Seu código', { selector: 'summary' });
    const bloco = resumo.closest('details')!;
    expect(bloco).toHaveClass('codigo-caso');
    expect(bloco).not.toHaveAttribute('open');
    expect(bloco).toHaveTextContent('K7M2-9QXD');
    expect(bloco).toHaveTextContent('Anote em um lugar seguro.');
  });
  it('o aviso de armazenamento aparece fora do bloco fechado do código', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const aviso = await screen.findByText(/Não foi possível salvar o acesso/);
    expect(aviso.closest('details')).toBeNull();
    // sem armazenamento, o código precisa estar à vista
    expect(document.querySelector('details.codigo-caso')).toHaveAttribute('open');
  });
  it('foco inicial continua no título Conversa com a coordenação', async () => {
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const titulo = await screen.findByRole('heading', { name: 'Conversa com a coordenação' });
    await waitFor(() => expect(titulo).toHaveFocus());
  });
  it('não mostra Atualizações ao vivo nem o botão quando online', async () => {
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/acompanhar/eventos')).toBe(true));
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(screen.queryByText('Atualizações ao vivo')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar conversa' })).not.toBeInTheDocument();
  });
  it('conectando não mostra o botão', async () => {
    eventos = 'conectando';
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(screen.queryByRole('button', { name: 'Atualizar conversa' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Conectando às atualizações/)).not.toBeInTheDocument();
  });
  it('fora do ar mostra a linha e o botão, que atualiza a conversa', async () => {
    eventos = 'queda';
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    expect(await screen.findByText('Reconectando; atualização a cada 8 segundos')).toBeInTheDocument();
    const antes = consultas().length;
    responder({ ...base, status: 'novo', mensagens: [] });
    await user.click(screen.getByRole('button', { name: 'Atualizar conversa' }));
    expect(await screen.findByText('Conversa atualizada.')).toBeInTheDocument();
    expect(consultas().length).toBe(antes + 1);
  });
  it('sem transmissão em tempo real (resposta que não é event-stream) o botão continua alcançável', async () => {
    vi.mocked(fetch).mockImplementation(async url => {
      if (url === '/api/acompanhar/eventos') return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      const proxima = respostas.shift();
      if (!proxima) throw new Error('Resposta HTTP não preparada no teste');
      return proxima();
    });
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    expect(await screen.findByRole('button', { name: 'Atualizar conversa' })).toBeInTheDocument();
  });
  it('online: após enviar resposta com a releitura falhando, o botão aparece e some ao atualizar', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    responder({ ok: true }, 201);
    respostas.push(async () => new Response('{}', { status: 500 }));
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByText(/Use Atualizar conversa para ver/)).toBeInTheDocument();
    const botao = screen.getByRole('button', { name: 'Atualizar conversa' });
    responder({ ...base, status: 'novo', mensagens: [] });
    await user.click(botao);
    expect(await screen.findByText('Conversa atualizada.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar conversa' })).not.toBeInTheDocument();
  });
  it('online: após informar situação com a recarga falhando, o botão aparece', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ ok: true }, 201);
    respostas.push(async () => new Response('{}', { status: 500 }));
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    await screen.findByText('Não foi possível atualizar agora. Use Atualizar conversa.');
    expect(screen.getByRole('button', { name: 'Atualizar conversa' })).toBeInTheDocument();
  });
  it('online: após 409 com a recarga falhando, o botão aparece', async () => {
    const user = userEvent.setup();
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ erro: 'x' }, 409);
    respostas.push(async () => new Response('{}', { status: 500 }));
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText('Esse caso ainda não foi resolvido.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar conversa' })).toBeInTheDocument();
  });
  it('online com leitura bem-sucedida: o botão continua ausente', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    responder({ ok: true }, 201);
    responder({ ...base, status: 'novo', mensagens: [] });
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(document.querySelector('.resposta-rodape')).toHaveTextContent('Resposta enviada.'));
    expect(screen.queryByRole('button', { name: 'Atualizar conversa' })).not.toBeInTheDocument();
  });
  it('status desconhecido não marca etapa nem quebra', async () => {
    responder({ ...base, status: 'inventado', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const lista = await screen.findByRole('list', { name: 'Etapas do caso' });
    expect(lista.querySelector('[aria-current]')).toBeNull();
  });
  it('Atualizar conversa recarrega as mensagens', async () => {
    const user = userEvent.setup();
    eventos = 'queda';
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByText(/Ainda não há mensagens/);
    responder({ ...base, status: 'novo', mensagens: [{ autor: 'coordenacao', texto: 'Chegou', criado_em: '2026-10-14T12:00:00Z' }] });
    await user.click(await screen.findByRole('button', { name: 'Atualizar conversa' }));
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
    eventos = 'queda';
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    expect(await screen.findByRole('heading', { name: 'Seu caso foi resolvido' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sua resposta')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Atualizar conversa' })).toBeInTheDocument();
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
    eventos = 'queda';
    const adiada = () => { let fim!: (r: Response) => void; const promessa = new Promise<Response>(r => { fim = r; }); return { promessa, fim }; };
    const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    const envio = adiada(); const antiga = adiada(); const nova = adiada();
    respostas.push(() => envio.promessa, () => antiga.promessa, () => nova.promessa);
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    await user.click(await screen.findByRole('button', { name: 'Atualizar conversa' }));
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
    eventos = 'queda';
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    respostas.push(() => new Promise<Response>(() => {}));
    await user.click(await screen.findByRole('button', { name: 'Atualizar conversa' }));
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
    expect(screen.getByRole('button', { name: 'Atualizar conversa' })).toBeInTheDocument();
  });
  it('o erro do 409 some ao atualizar a conversa', async () => {
    const user = userEvent.setup();
    eventos = 'queda';
    responder(resolvido);
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('heading', { name: 'Seu caso foi resolvido' });
    responder({ erro: 'x' }, 409);
    responder({ ...resolvido, status: 'em_investigacao', pos_resolucao: false, resolucao: null });
    await user.click(screen.getByRole('button', { name: 'Melhorou' }));
    expect(await screen.findByText('Esse caso ainda não foi resolvido.')).toBeInTheDocument();
    responder({ ...resolvido, status: 'em_investigacao', pos_resolucao: false, resolucao: null });
    await user.click(await screen.findByRole('button', { name: 'Atualizar conversa' }));
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
 expect(screen.getByRole('separator')).toHaveTextContent('Novas mensagens');
 expect(screen.getByText('Uma mensagem nova da coordenação.')).toHaveAttribute('role', 'status');
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
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.queryByText(/mensagens? nova/i)).not.toBeInTheDocument();
  });
});

describe('Acompanhar: conversa em formato de chat', () => {
  const t = '2026-10-14T12:00:00Z';
  const coord = (id: number, texto: string, extra = {}) => ({ id, autor: 'coordenacao', texto, criado_em: t, editada: false, apagada: false, ...extra });
  const aluno = (id: number, texto: string) => ({ id, autor: 'aluno', texto, criado_em: t, editada: false, apagada: false });
  const abrir = async (mensagens: unknown[]) => {
    responder({ ...base, status: 'em_investigacao', mensagens });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('log', { name: 'Mensagens do caso' });
  };
  it('nome do autor só na primeira mensagem do grupo', async () => {
    await abrir([aluno(1, 'um'), aluno(2, 'dois'), coord(3, 'três')]);
    const log = screen.getByRole('log');
    expect(within(log).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Você', 'Coordenação']);
    expect([...log.querySelectorAll('article')].map(a => a.getAttribute('aria-label'))).toEqual(['Você', 'Você', 'Coordenação']);
  });
  it('separador único Novas mensagens antes da primeira nova', async () => {
    await abrir([aluno(1, 'oi'), coord(2, 'nova a'), coord(3, 'nova b')]);
    const separadores = screen.getAllByRole('separator');
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toHaveTextContent('Novas mensagens');
    expect(separadores[0].nextElementSibling).toHaveTextContent('nova a');
    expect(separadores[0].previousElementSibling).toHaveTextContent('oi');
    expect(screen.queryByText('Mensagem nova')).not.toBeInTheDocument();
    expect(screen.getByText('2 mensagens novas da coordenação.')).toHaveAttribute('role', 'status');
  });
  it('sem mensagens novas não há separador', async () => {
    localStorage.setItem('tetra-guard.acessos.v1', JSON.stringify([{ codigo: 'K7M2-9QXD', lastRead: 9 }]));
    await abrir([coord(2, 'velha')]);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
  it('mensagem nova apagada não gera separador, mas a nova seguinte sim', async () => {
    await abrir([coord(2, '', { apagada: true }), coord(3, 'valida')]);
    const sep = screen.getByRole('separator');
    expect(sep.nextElementSibling).toHaveTextContent('valida');
    expect(sep.previousElementSibling).toHaveTextContent('Mensagem apagada');
  });
  it('contagem de novas continua em role status', async () => {
    await abrir([coord(2, 'a')]);
    expect(screen.getByText('Uma mensagem nova da coordenação.')).toHaveAttribute('role', 'status');
  });
  it('campo de resposta fica depois do log e tem a classe resposta-fixa', async () => {
    await abrir([]);
    const campo = screen.getByLabelText('Sua resposta') as HTMLTextAreaElement;
    const form = campo.closest('form')!;
    expect(form).toHaveClass('resposta', 'resposta-fixa');
    expect(screen.getByRole('log').compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(campo.rows).toBe(2);
    expect(screen.getByText('0 de 2000 caracteres')).toBeInTheDocument();
  });
  it('o campo cresce com o texto até 6 linhas', async () => {
    const user = userEvent.setup();
    const alturaSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get');
    await abrir([]);
    const campo = screen.getByLabelText('Sua resposta') as HTMLTextAreaElement;
    alturaSpy.mockReturnValue(72); await user.type(campo, 'a');
    expect(campo.rows).toBe(3);
    alturaSpy.mockReturnValue(900); await user.type(campo, 'b');
    expect(campo.rows).toBe(6);
    alturaSpy.mockRestore();
  });
  it('digitar não se perde ao receber mensagens', async () => {
    const user = userEvent.setup();
    eventos = 'controlado';
    await abrir([]);
    await user.type(screen.getByLabelText('Sua resposta'), 'rascunho');
    responder({ ...base, status: 'em_investigacao', mensagens: [coord(7, 'chegou')] });
    await waitFor(() => expect(fluxo).not.toBeNull());
    fluxo!.enqueue(new TextEncoder().encode('event: atualizar\n\n'));
    expect(await screen.findByText('chegou')).toBeInTheDocument();
    expect(screen.getByLabelText('Sua resposta')).toHaveValue('rascunho');
  });
  it('enviar continua igual', async () => {
    const user = userEvent.setup();
    await abrir([]);
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva uma resposta de 1 a 2000 caracteres.');
    responder({ ok: true }, 201);
    responder({ ...base, status: 'em_investigacao', mensagens: [aluno(1, 'olá')] });
    await user.type(screen.getByLabelText('Sua resposta'), 'olá');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(document.querySelector('.resposta-rodape')).toHaveTextContent('Resposta enviada.'));
    expect(consultas()).toHaveLength(3);
  });
  it('rola até o separador sem mover o foco', async () => {
    const rolagem = vi.fn();
    Element.prototype.scrollIntoView = rolagem;
    try {
      await abrir([aluno(1, 'oi'), coord(2, 'nova')]);
      await waitFor(() => expect(rolagem.mock.contexts.at(-1)).toBe(screen.getByRole('separator')));
      expect(rolagem.mock.lastCall![0]).toEqual({ block: 'start' });
      expect(screen.getByRole('heading', { name: 'Conversa com a coordenação' })).toHaveFocus();
    } finally { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; }
  });
  it('sem novas rola a última mensagem sem mover o foco', async () => {
    const rolagem = vi.fn();
    Element.prototype.scrollIntoView = rolagem;
    localStorage.setItem('tetra-guard.acessos.v1', JSON.stringify([{ codigo: 'K7M2-9QXD', lastRead: 9 }]));
    try {
      await abrir([aluno(1, 'oi'), coord(2, 'ultima')]);
      const artigos = screen.getByRole('log').querySelectorAll('article');
      await waitFor(() => expect(rolagem.mock.contexts.at(-1)).toBe(artigos[1]));
      expect(rolagem.mock.lastCall![0]).toEqual({ block: 'nearest' });
      expect(screen.getByRole('heading', { name: 'Conversa com a coordenação' })).toHaveFocus();
    } finally { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; }
  });
});

describe('Acompanhar: leitura superada que falha não liga o botão', () => {
  const adiada = () => { let fim!: (r: Response) => void; const promessa = new Promise<Response>(r => { fim = r; }); return { promessa, fim }; };
  const ok = () => new Response(JSON.stringify({ ...base, status: 'novo', mensagens: [] }), { status: 200 });
  const avisar = () => fluxo!.enqueue(new TextEncoder().encode('event: atualizar\n\n'));
  it('recarregar: falha antiga depois de uma leitura nova bem-sucedida', async () => {
    eventos = 'controlado';
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    await waitFor(() => expect(fluxo).not.toBeNull());
    const antiga = adiada(); const nova = adiada();
    respostas.push(() => antiga.promessa, () => nova.promessa);
    avisar(); await waitFor(() => expect(consultas()).toHaveLength(2));
    avisar(); await waitFor(() => expect(consultas()).toHaveLength(3));
    nova.fim(ok());
    antiga.fim(new Response('{}', { status: 500 }));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByRole('button', { name: 'Atualizar conversa' })).not.toBeInTheDocument();
  });
  it('enviar: falha antiga da releitura depois de uma leitura nova bem-sucedida', async () => {
    const user = userEvent.setup();
    eventos = 'controlado';
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    await waitFor(() => expect(fluxo).not.toBeNull());
    const antiga = adiada(); const nova = adiada();
    responder({ ok: true }, 201);
    respostas.push(() => antiga.promessa, () => nova.promessa);
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(consultas()).toHaveLength(3));
    avisar(); await waitFor(() => expect(consultas()).toHaveLength(4));
    nova.fim(ok());
    antiga.fim(new Response('{}', { status: 500 }));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByRole('button', { name: 'Atualizar conversa' })).not.toBeInTheDocument();
  });
});

describe('Acompanhar: quando a conversa rola', () => {
  const t = '2026-10-14T12:00:00Z';
  const msg = (id: number, autor: string, texto: string) => ({ id, autor, texto, criado_em: t, editada: false, apagada: false });
  const comRolagem = async (corpo: (rolagem: ReturnType<typeof vi.fn>) => Promise<void>) => {
    const rolagem = vi.fn();
    Element.prototype.scrollIntoView = rolagem;
    try { await corpo(rolagem); } finally { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; }
  };
  // só conta rolagens do alvo (artigo do log ou separador); a do título não interessa
  const alvos = (rolagem: ReturnType<typeof vi.fn>) => (rolagem.mock.contexts as Element[]).filter(c => c.tagName === 'ARTICLE' || c.getAttribute('role') === 'separator');
  const estabilizar = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
  it('mensagem que chega por tempo real depois da abertura não rola de novo', async () => {
    eventos = 'controlado';
    await comRolagem(async rolagem => {
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'coordenacao', 'primeira')] });
      render(<Acompanhar codigoInicial="K7M2-9QXD" />);
      await screen.findByText('primeira');
      await waitFor(() => expect(fluxo).not.toBeNull());
      await waitFor(() => expect(rolagem.mock.contexts.at(-1)).toBe(screen.getByRole('separator')));
      await estabilizar();
      const antes = alvos(rolagem).length;
      expect(antes).toBe(1);
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'coordenacao', 'primeira'), msg(2, 'coordenacao', 'segunda')] });
      fluxo!.enqueue(new TextEncoder().encode('event: atualizar\n\n'));
      expect(await screen.findByText('segunda')).toBeInTheDocument();
      await estabilizar();
      expect(alvos(rolagem)).toHaveLength(antes);
      expect(screen.getByRole('heading', { name: 'Conversa com a coordenação' })).toHaveFocus();
    });
  });
  it('Atualizar conversa não rola', async () => {
    const user = userEvent.setup();
    eventos = 'queda';
    await comRolagem(async rolagem => {
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'aluno', 'um')] });
      render(<Acompanhar codigoInicial="K7M2-9QXD" />);
      await screen.findByText('um');
      await waitFor(() => expect(alvos(rolagem)).toHaveLength(1));
      await estabilizar();
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'aluno', 'um'), msg(2, 'aluno', 'dois')] });
      await user.click(await screen.findByRole('button', { name: 'Atualizar conversa' }));
      await screen.findByText('dois');
      await estabilizar();
      expect(alvos(rolagem)).toHaveLength(1);
    });
  });
  it('enviar resposta rola até a última mensagem', async () => {
    const user = userEvent.setup();
    await comRolagem(async rolagem => {
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'aluno', 'um')] });
      render(<Acompanhar codigoInicial="K7M2-9QXD" />);
      await screen.findByText('um');
      await waitFor(() => expect(alvos(rolagem)).toHaveLength(1));
      await estabilizar();
      responder({ ok: true }, 201);
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'aluno', 'um'), msg(2, 'aluno', 'dois')] });
      await user.type(screen.getByLabelText('Sua resposta'), 'dois');
      await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
      await waitFor(() => expect(document.querySelector('.resposta-rodape')).toHaveTextContent('Resposta enviada.'));
      const artigos = screen.getByRole('log').querySelectorAll('article');
      await waitFor(() => expect(alvos(rolagem).at(-1)).toBe(artigos[1]));
      await estabilizar();
      expect(alvos(rolagem)).toHaveLength(2);
    });
  });
  it('falha da releitura de enviar liga o botão mesmo com refresh de tempo real iniciado durante o POST', async () => {
    const user = userEvent.setup();
    eventos = 'controlado';
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    await waitFor(() => expect(fluxo).not.toBeNull());
    let fimPost!: (r: Response) => void; let fimRefresh!: (r: Response) => void;
    respostas.push(() => new Promise<Response>(r => { fimPost = r; }), () => new Promise<Response>(r => { fimRefresh = r; }));
    respostas.push(async () => new Response('{}', { status: 500 }));
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(consultas()).toHaveLength(2));
    fluxo!.enqueue(new TextEncoder().encode('event: atualizar\n\n'));
    await waitFor(() => expect(consultas()).toHaveLength(3));
    fimPost(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    expect(await screen.findByText(/Use Atualizar conversa para ver/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar conversa' })).toBeInTheDocument();
    fimRefresh(new Response('{}', { status: 500 }));
  });
});

describe('Acompanhar: novas relativas à abertura da conversa', () => {
  const t = '2026-10-14T12:00:00Z';
  const coord = (id: number, texto: string) => ({ id, autor: 'coordenacao', texto, criado_em: t, editada: false, apagada: false });
  const avisar = () => fluxo!.enqueue(new TextEncoder().encode('event: atualizar\n\n'));
  it('uma segunda leitura do tempo real mantém separador e contagem', async () => {
    eventos = 'controlado';
    responder({ ...base, status: 'em_investigacao', mensagens: [coord(1, 'a'), coord(2, 'b')] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByText('2 mensagens novas da coordenação.');
    await waitFor(() => expect(JSON.parse(localStorage.getItem('tetra-guard.acessos.v1') || '[]')[0].lastRead).toBe(2));
    await waitFor(() => expect(fluxo).not.toBeNull());
    responder({ ...base, status: 'em_investigacao', mensagens: [coord(1, 'a'), coord(2, 'b')] });
    avisar(); await waitFor(() => expect(consultas()).toHaveLength(2));
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(screen.getByRole('separator')).toHaveTextContent('Novas mensagens');
    expect(screen.getByText('2 mensagens novas da coordenação.')).toBeInTheDocument();
  });
  it('mensagem que chega depois entra na contagem e o separador fica antes da primeira original', async () => {
    eventos = 'controlado';
    responder({ ...base, status: 'em_investigacao', mensagens: [coord(1, 'a')] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByText('Uma mensagem nova da coordenação.');
    await waitFor(() => expect(fluxo).not.toBeNull());
    responder({ ...base, status: 'em_investigacao', mensagens: [coord(1, 'a'), coord(2, 'b')] });
    avisar();
    expect(await screen.findByText('2 mensagens novas da coordenação.')).toBeInTheDocument();
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(screen.getByRole('separator').nextElementSibling).toHaveTextContent('a');
  });
  it('reabrir o caso com o lastRead avançado não mostra separador', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [coord(1, 'a')] });
    const { unmount } = render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByRole('separator');
    unmount();
    responder({ ...base, status: 'em_investigacao', mensagens: [coord(1, 'a')] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByText('a');
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});

describe('Acompanhar: campo de resposta compacto', () => {
  it('rótulo só para leitor de tela e contador e botão na mesma linha', async () => {
    responder({ ...base, status: 'em_investigacao', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    const campo = await screen.findByLabelText('Sua resposta');
    expect(document.querySelector('label[for="resposta"]')).toHaveClass('so-leitor');
    const rodape = campo.closest('form')!.querySelector('.resposta-rodape')!;
    expect(rodape).toContainElement(screen.getByText('0 de 2000 caracteres'));
    expect(rodape).toContainElement(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(campo).toHaveAttribute('aria-describedby', 'limite-resposta');
  });
});

describe('Acompanhar: responder equivale a ter lido', () => {
  const t = '2026-10-14T12:00:00Z';
  const msg = (id: number, autor: string, texto: string) => ({ id, autor, texto, criado_em: t, editada: false, apagada: false });
  it('depois de enviar não há separador, rola a última mensagem e uma nova posterior volta a gerar separador', async () => {
    const user = userEvent.setup();
    eventos = 'controlado';
    const rolagem = vi.fn();
    Element.prototype.scrollIntoView = rolagem;
    try {
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'coordenacao', 'pendente')] });
      render(<Acompanhar codigoInicial="K7M2-9QXD" />);
      expect(await screen.findByRole('separator')).toBeInTheDocument();
      await waitFor(() => expect(fluxo).not.toBeNull());
      responder({ ok: true }, 201);
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'coordenacao', 'pendente'), msg(2, 'aluno', 'minha resposta')] });
      await user.type(screen.getByLabelText('Sua resposta'), 'minha resposta');
      await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
      await screen.findByText('minha resposta');
      expect(screen.queryByRole('separator')).not.toBeInTheDocument();
      expect(screen.queryByText(/mensagens? nova/i)).not.toBeInTheDocument();
      const artigos = screen.getByRole('log').querySelectorAll('article');
      await waitFor(() => expect(rolagem.mock.contexts.at(-1)).toBe(artigos[1]));
      expect(rolagem.mock.lastCall![0]).toEqual({ block: 'nearest' });
      responder({ ...base, status: 'em_investigacao', mensagens: [msg(1, 'coordenacao', 'pendente'), msg(2, 'aluno', 'minha resposta'), msg(3, 'coordenacao', 'depois')] });
      fluxo!.enqueue(new TextEncoder().encode('event: atualizar\n\n'));
      expect(await screen.findByText('Uma mensagem nova da coordenação.')).toBeInTheDocument();
      expect(screen.getByRole('separator').nextElementSibling).toHaveTextContent('depois');
    } finally { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; }
  });
});

describe('Acompanhar: avisos e erros ficam junto do campo fixo', () => {
  it('aviso e botão Atualizar conversa dentro do campo depois de enviar com releitura falhando', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    responder({ ok: true }, 201);
    respostas.push(async () => new Response('{}', { status: 500 }));
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    const aviso = await screen.findByText(/Use Atualizar conversa para ver/);
    const campo = document.querySelector('form.resposta-fixa')!;
    expect(campo).toContainElement(aviso);
    expect(campo).toContainElement(screen.getByRole('button', { name: 'Atualizar conversa' }));
    const linha = document.querySelector('.aviso-linha')!;
    expect(campo).toContainElement(linha as HTMLElement);
    expect(linha).toContainElement(aviso);
    expect(linha).toContainElement(screen.getByRole('button', { name: 'Atualizar conversa' }));
    // sem anúncio duplo: o aviso de falha não repete a confirmação já anunciada pelo status oculto
    expect(aviso.textContent).not.toMatch(/^Resposta enviada/);
  });
  it('erro de envio fica dentro do campo e preserva o texto', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    responder({}, 429);
    await user.type(screen.getByLabelText('Sua resposta'), 'rascunho');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    const alerta = await screen.findByRole('alert');
    expect(document.querySelector('form.resposta-fixa')).toContainElement(alerta);
    expect(screen.getByLabelText('Sua resposta')).toHaveValue('rascunho');
  });
  it('erro da consulta inicial continua fora do campo', async () => {
    const user = userEvent.setup();
    render(<Acompanhar />);
    await user.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(document.querySelector('form.resposta-fixa')).toBeNull();
  });
  it('o separador tem nome acessível', async () => {
    responder({ ...base, status: 'novo', mensagens: [{ id: 1, autor: 'coordenacao', texto: 'x', criado_em: '2026-10-14T12:00:00Z' }] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    expect(await screen.findByRole('separator', { name: 'Novas mensagens' })).toBeInTheDocument();
  });
});

describe('Acompanhar: confirmação de envio não muda a altura do campo', () => {
  const visiveisAcima = (form: Element) => [...form.children].filter(c => c.querySelector('textarea') === null && c.tagName !== 'LABEL' && !c.classList.contains('resposta-rodape') && !c.classList.contains('so-leitor') && (c.textContent || '').trim() !== '').length;
  it('Resposta enviada. ocupa o lugar do contador, sem linha nova, e o contador volta ao digitar', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    const form = document.querySelector('form.resposta-fixa')!;
    const antes = visiveisAcima(form);
    const oculto = form.querySelector('p.so-leitor[role="status"]')!;
    expect(oculto).toHaveTextContent('');
    responder({ ok: true }, 201);
    responder({ ...base, status: 'novo', mensagens: [{ id: 1, autor: 'aluno', texto: 'oi', criado_em: '2026-10-14T12:00:00Z' }] });
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(form.querySelector('.resposta-rodape')).toHaveTextContent('Resposta enviada.'));
    expect(form.querySelector('.resposta-rodape')).not.toHaveTextContent('de 2000 caracteres');
    expect(visiveisAcima(form)).toBe(antes);
    const estados = screen.getAllByRole('status').filter(e => e.textContent === 'Resposta enviada.');
    expect(estados).toContain(oculto);
    expect(form).not.toHaveAttribute('aria-busy');
    expect(screen.getByLabelText('Sua resposta')).toHaveAttribute('aria-describedby', 'limite-resposta');
    await user.type(screen.getByLabelText('Sua resposta'), 'a');
    expect(form.querySelector('.resposta-rodape')).toHaveTextContent('1 de 2000 caracteres');
  });
});

describe('Acompanhar: confirmada é zerada nos outros caminhos', () => {
  const rodape = () => document.querySelector('.resposta-rodape')!;
  const enviarUma = async (user: ReturnType<typeof userEvent.setup>) => {
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    responder({ ok: true }, 201);
    responder({ ...base, status: 'novo', mensagens: [] });
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(rodape()).toHaveTextContent('Resposta enviada.'));
  };
  it('enviar com o campo vazio depois de um sucesso volta o contador', async () => {
    const user = userEvent.setup();
    await enviarUma(user);
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva uma resposta de 1 a 2000 caracteres.');
    expect(rodape()).toHaveTextContent('0 de 2000 caracteres');
    expect(rodape()).not.toHaveTextContent('Resposta enviada.');
    expect(document.querySelector('p.so-leitor[role="status"]')).toHaveTextContent('');
  });
  it('envio que falha mostra o contador', async () => {
    const user = userEvent.setup();
    responder({ ...base, status: 'novo', mensagens: [] });
    render(<Acompanhar codigoInicial="K7M2-9QXD" />);
    await screen.findByLabelText('Sua resposta');
    responder({}, 429);
    await user.type(screen.getByLabelText('Sua resposta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await screen.findByRole('alert');
    expect(rodape()).not.toHaveTextContent('Resposta enviada.');
    expect(rodape()).toHaveTextContent('2 de 2000 caracteres');
  });
});
