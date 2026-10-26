import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { chamadasA, servidor } from './testes/servidor';
import type { Rota } from './testes/servidor';

const base = {
  id: 5, revisao_estado: 0, tipo: 'ameaca', prioridade: 'alta', prioridade_original: 'alta', pontos: 3, status: 'novo', em_andamento: false, anonimo: true,
  simulacao: false, criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00',
};
const detalhe = (extra: Record<string, unknown> = {}) => ({
  ...base, relato: 'Relato completo do aluno.', quando: 'ontem', onde: 'aplicativo da turma',
  nome: null, turma: null, motivos: ['tipo: ameaca', 'ocorrendo agora', 'termos de risco: violencia'],
  ultimo_acesso: null, questionario: null,
  anexos: [{ id: 9, tipo: 'png', tamanho: 100 }],
  eventos: [
    { id: 1, tipo: 'criado', usuario_id: null, usuario: null, detalhe: 'gravidade alta', criado_em: '2026-10-14T10:00:00+00:00' },
    { id: 2, tipo: 'gravidade', usuario_id: 1, usuario: 'Marina', detalhe: 'gravidade: media -> alta', criado_em: '2026-10-14T10:30:00+00:00' },
    { id: 3, tipo: 'status', usuario_id: 1, usuario: 'Marina', detalhe: 'status: em_analise -> aguardando_aluno', criado_em: '2026-10-14T10:40:00+00:00' },
  ],
  mensagens: [], notas: [], resolucoes: [], situacoes: [], revisoes_recorrencia: [],
  ...extra,
});
const logado: Rota = () => ({ corpo: { id: 1, nome: 'Marina', papel: 'admin' } });

let estado: any;
const abrirCaso = async (inicial: Record<string, unknown> = {}, rotas: Record<string, Rota> = {}) => {
  estado = detalhe(inicial);
  servidor({
    'GET /api/eu': logado, 'GET /api/casos': () => ({ corpo: { casos: [] } }),
    'GET /api/casos/5': () => ({ corpo: estado }),
    'POST /api/v3/casos/5/status': c => {
      estado = { ...estado, status: c.status, eventos: [...estado.eventos, { id: 10, tipo: 'status', usuario_id: 1, usuario: 'Marina', detalhe: `status: ${estado.status} -> ${c.status}`, criado_em: '2026-10-14T12:00:00+00:00' }] };
      return { corpo: { ok: true } };
    },
    'POST /api/v3/casos/5/prioridade': c => {
      estado = { ...estado, prioridade: c.prioridade, eventos: [...estado.eventos, { id: 11, tipo: 'prioridade', usuario_id: 1, usuario: 'Marina', detalhe: `${estado.prioridade} -> ${c.prioridade}: ${c.justificativa}`, criado_em: '2026-10-14T12:05:00+00:00' }] };
      return { corpo: { ok: true } };
    },
    'POST /api/casos/5/mensagens': () => ({ status: 201, corpo: { ok: true } }),
    ...rotas,
  });
  window.history.replaceState(null, '', '/#caso-5');
  render(<App />);
  return userEvent.setup();
};

beforeEach(() => { window.history.replaceState(null, '', '/'); });

it('registra leitura somente na conversa e oferece exportação autenticada', async () => {
  const user = await abrirCaso({ mensagens: [{ id: 12, autor: 'aluno', texto: 'Olá equipe', criado_em: base.criado_em, usuario: null, usuario_id: null }] }, {
    'POST /api/casos/5/conversa/lida': () => ({ corpo: { ok: true } }),
  });
  await screen.findByRole('heading', { name: /Caso 5/ });
  expect(chamadasA('POST', '/api/casos/5/conversa/lida')).toHaveLength(0);
  const link = screen.getByRole('link', { name: 'Exportar para o ROE' });
  expect(link).toHaveAttribute('href', '/api/casos/5/exportacao');
  expect(link).toHaveAttribute('rel', 'noopener');
  await user.click(screen.getByRole('tab', { name: 'Conversa' }));
  await waitFor(() => expect(chamadasA('POST', '/api/casos/5/conversa/lida')).toHaveLength(1));
  expect(chamadasA('POST', '/api/casos/5/conversa/lida')[0].corpo).toEqual({ ultimo_id: 12 });
  await user.click(screen.getByRole('tab', { name: 'Relato e investigação' }));
  await user.click(screen.getByRole('tab', { name: 'Conversa' }));
  expect(chamadasA('POST', '/api/casos/5/conversa/lida')).toHaveLength(1);
});

it('não registra leitura enquanto o documento está oculto', async () => {
  const propriedade = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  try {
    const user = await abrirCaso({ mensagens: [{ id: 20, autor: 'aluno', texto: 'Mensagem nova', criado_em: base.criado_em, usuario: null, usuario_id: null }] }, {
      'POST /api/casos/5/conversa/lida': () => ({ corpo: { ok: true } }),
    });
    await screen.findByRole('heading', { name: /Caso 5/ });
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    expect(chamadasA('POST', '/api/casos/5/conversa/lida')).toHaveLength(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(chamadasA('POST', '/api/casos/5/conversa/lida')).toHaveLength(1));
    expect(chamadasA('POST', '/api/casos/5/conversa/lida')[0].corpo).toEqual({ ultimo_id: 20 });
  } finally {
    if (propriedade) Object.defineProperty(document, 'visibilityState', propriedade);
    else Reflect.deleteProperty(document, 'visibilityState');
  }
});

describe('Caso: cabeçalho e metadados', () => {
  it('mostra turma do relator anônimo e o nome histórico do local', async () => {
    await abrirCaso({ ano_relator: '7º ano', sala_relator: 'B', local_id: 'patio', local_nome: 'Pátio antigo' });
    expect(await screen.findByText('7º ano')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('Pátio antigo')).toBeInTheDocument();
    expect(screen.getByText(/Denúncia anônima/)).toBeInTheDocument();
  });

  it('exibe autores apurados e fotos na seção interna autenticada', async () => {
    await abrirCaso({ status: 'resolvido', resolucoes: [resolucaoFalsa({ autoria: 'identificada', autores: [{ id: 4, nome: 'Ana', ano: '8º', sala: 'C', tem_foto: true }] })] });
    const secao = await screen.findByRole('region', { name: 'Autoria apurada (uso interno)' });
    for (const texto of ['Ana', '8º', 'C']) expect(within(secao).getByText(texto)).toBeInTheDocument();
    expect(within(secao).getByAltText('Foto de Ana')).toHaveAttribute('src', '/api/casos/5/autores/4/foto');
  });

  it('exibe justificativa de autoria não identificada separada das providências', async () => {
    await abrirCaso({ status: 'resolvido', resolucoes: [resolucaoFalsa({ autoria: 'nao_identificada', justificativa_autoria: 'Sem elementos suficientes', autores: [] })] });
    const secao = await screen.findByRole('region', { name: 'Autoria apurada (uso interno)' });
    expect(within(secao).getByText('Autoria não identificada')).toBeInTheDocument();
    expect(within(secao).getByText('Sem elementos suficientes')).toBeInTheDocument();
    expect(secao).not.toHaveTextContent('Conversa com a turma');
  });
  it('mostra relato, motivos e anexos e foca o título', async () => {
    await abrirCaso();
    const titulo = await screen.findByRole('heading', { name: /Caso 5/ });
    await waitFor(() => expect(titulo).toHaveFocus());
    expect(screen.getByText('Relato completo do aluno.')).toBeInTheDocument();
    expect(screen.getByText('Tipo: Ameaça')).toBeInTheDocument();
    expect(screen.getByText('Ocorrendo agora', { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText('Termos de risco: violencia')).toBeInTheDocument();
    expect(screen.getByAltText('Anexo 1 do caso 5')).toHaveAttribute('src', '/api/casos/5/anexos/9');
  });

  it('o histórico traduz eventos antigos da v1 sem valor cru', async () => {
    const user = await abrirCaso();
    await user.click(await screen.findByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByText('Caso recebido com prioridade alta')).toBeInTheDocument();
    expect(screen.getByText('Prioridade mudou de Média para Alta por Marina')).toBeInTheDocument();
    expect(screen.getByText('Status mudou de Em investigação para Em investigação por Marina')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/em_analise|gravidade/);
  });

  it('cabeçalho com tipo, prioridade, status, ocorrendo agora e anonimato', async () => {
    await abrirCaso({ em_andamento: true });
    const cabecalho = (await screen.findByRole('heading', { name: 'Caso 5: Ameaça' })).parentElement!;
    expect(within(cabecalho).getByText('Alta')).toBeInTheDocument();
    expect(within(cabecalho).getByText('Novo')).toBeInTheDocument();
    expect(within(cabecalho).getByText('Ocorrendo agora')).toBeInTheDocument();
    expect(within(cabecalho).getByText(/Denúncia anônima/)).toBeInTheDocument();
  });

  it('caso identificado mostra nome e turma', async () => {
    await abrirCaso({ anonimo: false, nome: 'Bia', turma: '8B' });
    expect(await screen.findByText(/Identificado: Bia, turma 8B/)).toBeInTheDocument();
  });

  it('Último acesso mostra o acesso anterior ou "Ainda não acessado"', async () => {
    await abrirCaso({ ultimo_acesso: { por: 'Paulo', em: '2026-10-13T09:00:00+00:00' } });
    const meta = (await screen.findByText('Último acesso')).parentElement!;
    expect(meta).toHaveTextContent(/Paulo, /);
  });

  it('sem acesso anterior mostra "Ainda não acessado"', async () => {
    await abrirCaso({ ultimo_acesso: null });
    const meta = (await screen.findByText('Último acesso')).parentElement!;
    expect(meta).toHaveTextContent('Ainda não acessado');
  });
});

describe('Caso: status', () => {
  it('o seletor tem só Novo e Em investigação quando não está resolvido', async () => {
    await abrirCaso();
    const seletor = await screen.findByLabelText('Status');
    expect(Array.from((seletor as HTMLSelectElement).options).map(o => o.text)).toEqual(['Novo', 'Em investigação']);
    expect(screen.getByText('Para resolver, registre a resolução.')).toBeInTheDocument();
    expect(screen.queryByText('Caso resolvido.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir para investigação' })).not.toBeInTheDocument();
  });

  it('status legado em_analise aparece como Em investigação sem enviar nada', async () => {
    await abrirCaso({ status: 'em_analise' });
    const seletor = await screen.findByLabelText('Status');
    expect(seletor).toHaveValue('em_investigacao');
    expect(within(seletor.closest('div')!).getByRole('option', { name: 'Em investigação' })).toBeInTheDocument();
    expect(screen.getByText('Em investigação', { selector: '.selo-status' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/v3/casos/5/status')).toHaveLength(0);
  });

  it('muda o status pela API e atualiza a linha do tempo', async () => {
    const user = await abrirCaso();
    await user.selectOptions(await screen.findByLabelText('Status'), 'em_investigacao');
    await user.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByText('Status mudou de Novo para Em investigação por Marina')).toBeInTheDocument();
    const envio = chamadasA('POST', '/api/v3/casos/5/status')[0];
    expect(envio.corpo).toEqual({ status: 'em_investigacao', revisao_estado: 0 });
    expect(envio.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(screen.getByText('Status alterado para Em investigação.', { selector: '[role=status]' })).toBeInTheDocument();
  });

  it('resolvido troca o seletor pelo aviso e oferece reabrir', async () => {
    const user = await abrirCaso({ status: 'resolvido' });
    expect(await screen.findByText('Caso resolvido.', { selector: '.caso-meta-status p' })).toBeInTheDocument();
    expect(screen.queryByText('Para resolver, registre a resolução.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reabrir para investigação' }));
    await screen.findByText('Status alterado para Em investigação.', { selector: '[role=status]' });
    expect(chamadasA('POST', '/api/v3/casos/5/status')[0].corpo).toEqual({ status: 'em_investigacao', revisao_estado: 0 });
    expect(await screen.findByLabelText('Status')).toHaveValue('em_investigacao');
  });

  it('401 ao agir devolve ao Login', async () => {
    const user = await abrirCaso({}, { 'POST /api/v3/casos/5/status': () => ({ status: 401 }) });
    await user.selectOptions(await screen.findByLabelText('Status'), 'em_investigacao');
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByText('Relato completo do aluno.')).not.toBeInTheDocument();
  });

  it('erro ao mudar o status mostra a mensagem amigável', async () => {
    const user = await abrirCaso({}, { 'POST /api/v3/casos/5/status': () => ({ status: 409 }) });
    await user.selectOptions(await screen.findByLabelText('Status'), 'em_investigacao');
    expect(await screen.findByRole('alert')).toHaveTextContent('O caso mudou enquanto você trabalhava');
  });
});

describe('Caso: reavaliar prioridade', () => {
  it('o botão Reavaliar prioridade não existe durante o carregamento', async () => {
    await abrirCaso({}, { 'GET /api/casos/5': () => new Promise(() => {}) });
    await screen.findByText('Carregando o caso.');
    expect(screen.queryByRole('button', { name: 'Reavaliar prioridade' })).not.toBeInTheDocument();
  });

  it('reavalia a prioridade pela API com justificativa e recarrega o detalhe', async () => {
    const user = await abrirCaso();
    await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'critica');
    await user.type(screen.getByLabelText('Justificativa'), '  Nova ameaça  ');
    const antes = chamadasA('GET', '/api/casos/5').length;
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Prioridade alterada para Crítica.', { selector: '[role=status]' })).toBeInTheDocument();
    const envio = chamadasA('POST', '/api/v3/casos/5/prioridade')[0];
    expect(envio.corpo).toEqual({ prioridade: 'critica', justificativa: 'Nova ameaça', revisao_estado: 0 });
    expect(envio.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(chamadasA('GET', '/api/casos/5').length).toBeGreaterThan(antes);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reavaliar prioridade' })).toHaveFocus());
    await user.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByText('Prioridade mudou de Alta para Crítica por Marina. Motivo: Nova ameaça')).toBeInTheDocument();
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
  });

  it('erro 400 mostra mensagem amigável e mantém o texto digitado', async () => {
    const user = await abrirCaso({}, { 'POST /api/v3/casos/5/prioridade': () => ({ status: 400 }) });
    await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'baixa');
    await user.type(screen.getByLabelText('Justificativa'), 'meu motivo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados e tente de novo.');
    expect(screen.getByLabelText('Justificativa')).toHaveValue('meu motivo');
    expect(screen.getByLabelText('Nova prioridade')).toHaveValue('baixa');
  });

  it('erro 404 mostra mensagem amigável', async () => {
    const user = await abrirCaso({}, { 'POST /api/v3/casos/5/prioridade': () => ({ status: 404 }) });
    await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'baixa');
    await user.type(screen.getByLabelText('Justificativa'), 'x');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontrado');
  });

  it('401 ao reavaliar devolve ao Login', async () => {
    const user = await abrirCaso({}, { 'POST /api/v3/casos/5/prioridade': () => ({ status: 401 }) });
    await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'baixa');
    await user.type(screen.getByLabelText('Justificativa'), 'x');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
  });
});

describe('Caso: painel "Por que esta prioridade?"', () => {
  it('mostra motivos traduzidos e a prioridade atual', async () => {
    await abrirCaso();
    const painel = (await screen.findByRole('heading', { name: 'Por que esta prioridade?' })).closest('aside')!;
    expect(within(painel).getByText('Tipo: Ameaça')).toBeInTheDocument();
    expect(within(painel).getByText('Termos de risco: violencia')).toBeInTheDocument();
    expect(painel).toHaveTextContent('Prioridade atual: Alta');
    expect(painel).not.toHaveTextContent('Classificação original');
  });

  it('mostra a classificação original quando a prioridade foi reavaliada', async () => {
    await abrirCaso({ prioridade: 'baixa', prioridade_original: 'alta' });
    const painel = (await screen.findByRole('heading', { name: 'Por que esta prioridade?' })).closest('aside')!;
    expect(painel).toHaveTextContent('Prioridade atual: Baixa');
    expect(painel).toHaveTextContent('Classificação original: Alta');
  });

  it('sem motivos mostra aviso', async () => {
    await abrirCaso({ motivos: [] });
    expect(await screen.findByText('Sem motivos registrados.')).toBeInTheDocument();
  });
});

describe('Caso: anexos', () => {
  it('amplia o anexo em uma janela e devolve o foco ao fechar', async () => {
    const user = await abrirCaso();
    const gatilho = await screen.findByRole('button', { name: 'Ampliar anexo 1' });
    await user.click(gatilho);
    const janela = screen.getByRole('dialog');
    expect(within(janela).getByRole('img')).toHaveAttribute('src', '/api/casos/5/anexos/9');
    expect(within(janela).getByRole('button', { name: 'Fechar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(gatilho).toHaveFocus();
  });

  it('sem anexos mostra aviso', async () => {
    await abrirCaso({ anexos: [] });
    expect(await screen.findByText('Sem anexos.')).toBeInTheDocument();
  });
});

describe('Caso: carregamento e navegação', () => {
  it('mostra o carregamento e depois o erro de carga com Voltar aos casos', async () => {
    const user = await abrirCaso({}, { 'GET /api/casos/5': () => ({ status: 500 }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir agora');
    await user.click(screen.getByRole('button', { name: 'Voltar aos casos' }));
    expect(window.location.hash).toBe('#casos');
  });

  it('carregando mostra o aviso e o botão Voltar aos casos', async () => {
    await abrirCaso({}, { 'GET /api/casos/5': () => new Promise(() => {}) });
    expect(await screen.findByText('Carregando o caso.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Voltar aos casos' })).toBeInTheDocument();
  });

  it('sessão perdida (401) na carga não mostra erro e volta ao Login', async () => {
    await abrirCaso({}, { 'GET /api/casos/5': () => ({ status: 401 }) });
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível/)).not.toBeInTheDocument();
  });

  it('o botão do caso carregado também diz Voltar aos casos', async () => {
    const user = await abrirCaso();
    await user.click(await screen.findByRole('button', { name: 'Voltar aos casos' }));
    expect(window.location.hash).toBe('#casos');
  });
});

const resolucaoFalsa = (extra: Record<string, unknown> = {}) => ({
  desfecho: 'solucionada', providencias: 'Conversa com a turma', resultado: 'Parou', usuario: 'Marina', criado_em: '2026-10-14T13:00:00+00:00', ...extra,
});

describe('Caso: abas', () => {
  it('a primeira aba é a padrão e mostra relato, quando e onde e anexos', async () => {
    await abrirCaso();
    const aba = await screen.findByRole('tab', { name: 'Relato e investigação' });
    expect(aba).toHaveAttribute('aria-selected', 'true');
    const painel = screen.getByRole('tabpanel');
    expect(painel).toHaveAttribute('aria-labelledby', aba.id);
    expect(within(painel).getByText('Relato completo do aluno.')).toBeInTheDocument();
    expect(within(painel).getByText('aplicativo da turma')).toBeInTheDocument();
    expect(within(painel).getByAltText('Anexo 1 do caso 5')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Relato e investigação', 'Conversa', 'Notas internas', 'Histórico 3']);
  });

  it('o bloco Respostas do aluno vem depois do relato e antes dos anexos', async () => {
    await abrirCaso({ questionario: { situacao: { id: 'ameacas', nome: 'Ameaças' }, marcadas: ['Recebi mensagens'], dimensoes: [{ id: 'quando', rotulo: 'Quando aconteceu', itens: [{ pergunta: 'Foi recente?', respostas: ['Hoje'] }] }] } });
    const painel = await screen.findByRole('tabpanel');
    const relato = within(painel).getByText('Relato completo do aluno.');
    const bloco = within(painel).getByRole('heading', { level: 3, name: 'Respostas do aluno' });
    const anexos = within(painel).getByRole('heading', { name: 'Anexos' });
    expect(within(painel).getByText('Situação: Ameaças')).toBeInTheDocument();
    expect(relato.compareDocumentPosition(bloco) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bloco.compareDocumentPosition(anexos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sem questionário mostra a mensagem no lugar do bloco', async () => {
    await abrirCaso();
    const painel = await screen.findByRole('tabpanel');
    expect(within(painel).getByText('O aluno não respondeu ao questionário.')).toBeInTheDocument();
  });

  it('Conversa mostra o nome da pessoa da coordenação quando houver e o formulário', async () => {
    const user = await abrirCaso({ mensagens: [
      { autor: 'aluno', texto: 'Oi', criado_em: '2026-10-14T11:00:00+00:00', usuario_id: null, usuario: null },
      { autor: 'coordenacao', texto: 'Estamos aqui', criado_em: '2026-10-14T11:05:00+00:00', usuario_id: 1, usuario: 'Marina' },
      { autor: 'coordenacao', texto: 'Mensagem antiga', criado_em: '2026-10-14T11:06:00+00:00', usuario_id: null, usuario: null },
    ] });
    await user.click(await screen.findByRole('tab', { name: 'Conversa' }));
    const painel = screen.getByRole('tabpanel');
    expect(within(painel).getByRole('heading', { name: 'Marina' })).toBeInTheDocument();
    expect(within(painel).getByRole('heading', { name: 'Aluno' })).toBeInTheDocument();
    expect(within(painel).getByRole('heading', { name: 'Coordenação' })).toBeInTheDocument();
    expect(within(painel).getByLabelText('Mensagem ao aluno')).toBeInTheDocument();
  });

  it('Notas internas traz a dica "Só a coordenação vê"', async () => {
    const user = await abrirCaso();
    await user.click(await screen.findByRole('tab', { name: 'Notas internas' }));
    expect(within(screen.getByRole('tabpanel')).getByText(/Só a coordenação vê/)).toBeInTheDocument();
  });

  it('Histórico lista os eventos com autoria', async () => {
    const user = await abrirCaso({ eventos: [
      { id: 1, tipo: 'resolucao', usuario_id: 1, usuario: 'Marina', detalhe: 'solucionada', criado_em: '2026-10-14T13:00:00+00:00' },
      { id: 2, tipo: 'revisao_recorrencia', usuario_id: 2, usuario: 'Paulo', detalhe: '', criado_em: '2026-10-14T14:00:00+00:00' },
    ] });
    await user.click(await screen.findByRole('tab', { name: 'Histórico' }));
    const painel = screen.getByRole('tabpanel');
    expect(within(painel).getByText('Caso resolvido por Marina: situação solucionada')).toBeInTheDocument();
    expect(within(painel).getByText('Recorrência revisada por Paulo')).toBeInTheDocument();
  });
});

describe('Caso: resolução', () => {
  const resolver: Record<string, Rota> = {
    'POST /api/v4/casos/5/resolucao': c => {
      estado = { ...estado, status: 'resolvido', resolucoes: [resolucaoFalsa(c)] };
      return { status: 201, corpo: { ok: true } };
    },
  };

  it('o formulário aparece só quando o caso não está resolvido', async () => {
    await abrirCaso({ status: 'resolvido' });
    await screen.findByRole('heading', { name: /Caso 5/ });
    expect(screen.queryByRole('heading', { name: 'Registrar resolução' })).not.toBeInTheDocument();
  });

  it('registra a resolução, recarrega, avisa e foca o título', async () => {
    const user = await abrirCaso({}, resolver);
    await user.click(await screen.findByLabelText('Intervenção realizada'));
    await user.type(screen.getByLabelText('Providências'), '  Conversa com a turma  ');
    await user.click(screen.getByLabelText('Autoria não identificada'));
    await user.type(screen.getByLabelText('Justificativa interna'), 'Apuração sem identificação');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByText('Caso resolvido.', { selector: '[role=status]' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/v4/casos/5/resolucao')[0].corpo).toEqual({ desfecho: 'intervencao_realizada', providencias: 'Conversa com a turma', resultado: '', revisao_estado: 0, autoria: 'nao_identificada', justificativa_autoria: 'Apuração sem identificação', autores: [] });
    expect(screen.queryByRole('heading', { name: 'Registrar resolução' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Acompanhamento após a resolução' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Caso 5/ })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Reabrir para investigação' })).toBeInTheDocument();
  });

  it('409 recarrega o caso e preserva o formulário de resolução', async () => {
    const user = await abrirCaso({}, { 'POST /api/v4/casos/5/resolucao': () => {
      estado = { ...estado, status: 'resolvido', resolucoes: [resolucaoFalsa()] };
      return { status: 409 };
    } });
    await user.click(await screen.findByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'x');
    await user.click(screen.getByLabelText('Autoria não identificada'));
    await user.type(screen.getByLabelText('Justificativa interna'), 'Apuração sem identificação');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O caso mudou enquanto você trabalhava.');
    expect(await screen.findByRole('heading', { name: 'Acompanhamento após a resolução' })).toBeInTheDocument();
    expect(screen.getByLabelText('Providências')).toHaveValue('x');
    expect(screen.getByLabelText('Justificativa interna')).toHaveValue('Apuração sem identificação');
    await waitFor(() => expect(screen.getByLabelText('Providências')).toHaveFocus());
  });

  it('erro 400 mostra a mensagem e mantém o texto digitado', async () => {
    const user = await abrirCaso({}, { 'POST /api/v4/casos/5/resolucao': () => ({ status: 400 }) });
    await user.click(await screen.findByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'meu texto');
    await user.click(screen.getByLabelText('Autoria não identificada'));
    await user.type(screen.getByLabelText('Justificativa interna'), 'Apuração sem identificação');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados e tente de novo.');
    expect(screen.getByLabelText('Providências')).toHaveValue('meu texto');
    await waitFor(() => expect(screen.getByLabelText('Providências')).toHaveFocus());
  });

  it('401 ao resolver devolve ao Login', async () => {
    const user = await abrirCaso({}, { 'POST /api/v4/casos/5/resolucao': () => ({ status: 401 }) });
    await user.click(await screen.findByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'x');
    await user.click(screen.getByLabelText('Autoria não identificada'));
    await user.type(screen.getByLabelText('Justificativa interna'), 'Apuração sem identificação');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
  });
});

describe('Caso: pós-resolução e recorrência', () => {
  const pendente = { status: 'resolvido', recorrencia_pendente: true, resolucoes: [resolucaoFalsa()], situacoes: [{ situacao: 'voltou', criado_em: '2026-10-15T09:00:00+00:00' }] };
  const revisar: Record<string, Rota> = {
    'POST /api/v3/casos/5/revisao-recorrencia': () => {
      estado = { ...estado, recorrencia_pendente: false, revisoes_recorrencia: [{ usuario: 'Marina', criado_em: '2026-10-15T10:00:00+00:00' }] };
      return { status: 201, corpo: { ok: true } };
    },
  };

  it('o bloco aparece com o caso resolvido', async () => {
    await abrirCaso({ status: 'resolvido', resolucoes: [resolucaoFalsa()] });
    expect(await screen.findByRole('heading', { name: 'Acompanhamento após a resolução' })).toBeInTheDocument();
  });

  it('caso em investigação sem pendência não mostra o bloco', async () => {
    await abrirCaso({ status: 'em_investigacao' });
    await screen.findByRole('heading', { name: /Caso 5/ });
    expect(screen.queryByRole('heading', { name: 'Acompanhamento após a resolução' })).not.toBeInTheDocument();
  });

  it('registra a revisão com revisão esperada, recarrega e tira o alerta', async () => {
    const user = await abrirCaso(pendente, revisar);
    expect(await screen.findByRole('heading', { name: 'Situação voltou a acontecer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar revisão' }));
    expect(await screen.findByText('Revisão registrada.', { selector: '[role=status]' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/v3/casos/5/revisao-recorrencia')[0].corpo).toEqual({ revisao_estado: 0 });
    expect(screen.queryByRole('heading', { name: 'Situação voltou a acontecer' })).not.toBeInTheDocument();
    expect(screen.getByText(/Revisado por Marina/)).toBeInTheDocument();
  });

  it('409 explica a mudança de estado e recarrega', async () => {
    const user = await abrirCaso(pendente, { 'POST /api/v3/casos/5/revisao-recorrencia': () => {
      estado = { ...estado, recorrencia_pendente: false };
      return { status: 409 };
    } });
    await user.click(await screen.findByRole('button', { name: 'Registrar revisão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O caso mudou enquanto você trabalhava.');
    expect(screen.queryByRole('button', { name: 'Registrar revisão' })).not.toBeInTheDocument();
  });

  it('caso reaberto com recorrência pendente mantém o alerta e a revisão funciona', async () => {
    const user = await abrirCaso({ ...pendente, status: 'em_investigacao' }, revisar);
    expect(await screen.findByRole('heading', { name: 'Situação voltou a acontecer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registrar resolução' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar revisão' }));
    expect(await screen.findByText('Revisão registrada.', { selector: '[role=status]' })).toBeInTheDocument();
  });

  it('o alerta fica acima das abas', async () => {
    await abrirCaso(pendente);
    const alerta = await screen.findByRole('heading', { name: 'Situação voltou a acontecer' });
    const aba = screen.getByRole('tablist');
    expect(alerta.compareDocumentPosition(aba) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('editar, excluir e ver versões de mensagens', () => {
  const msg = (extra: Record<string, unknown> = {}) => ({ id: 12, autor: 'coordenacao', texto: 'Texto original', criado_em: base.criado_em, usuario: 'Marina', usuario_id: 1, editada_em: null, apagada_em: null, pode_alterar: true, ...extra });

  it('editar atualiza a conversa e avisa', async () => {
    const user = await abrirCaso({ mensagens: [msg()] }, {
      'PATCH /api/casos/5/mensagens/12': c => { estado = { ...estado, mensagens: [msg({ texto: c.texto, editada_em: '2026-10-14T12:00:00+00:00' })] }; return { corpo: { ok: true } }; },
    });
    await screen.findByRole('heading', { name: /Caso 5/ });
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    await user.click(screen.getByRole('button', { name: 'Ações da mensagem' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const campo = screen.getByRole('textbox', { name: 'Editar mensagem' });
    await user.clear(campo); await user.type(campo, 'Texto corrigido');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Texto corrigido')).toBeInTheDocument();
    expect(chamadasA('PATCH', '/api/casos/5/mensagens/12')[0].corpo).toEqual({ texto: 'Texto corrigido' });
    expect(screen.getByText('editada')).toBeInTheDocument();
    expect(screen.getByText('Mensagem editada.')).toBeInTheDocument();
  });

  it('excluir mostra "Mensagem apagada"', async () => {
    const user = await abrirCaso({ mensagens: [msg()] }, {
      'DELETE /api/casos/5/mensagens/12': () => { estado = { ...estado, mensagens: [msg({ texto: '', apagada_em: '2026-10-14T12:00:00+00:00', pode_alterar: false })] }; return { corpo: { ok: true } }; },
    });
    await screen.findByRole('heading', { name: /Caso 5/ });
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    await user.click(screen.getByRole('button', { name: 'Ações da mensagem' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Mensagem apagada')).toBeInTheDocument();
    expect(screen.queryByText('Texto original')).toBeNull();
    expect(screen.getByText('Mensagem excluída.')).toBeInTheDocument();
  });

  it('ver versões lista o que o servidor devolve', async () => {
    const user = await abrirCaso({ mensagens: [msg({ editada_em: '2026-10-14T11:00:00+00:00' })] }, {
      'GET /api/casos/5/mensagens/12/versoes': () => ({ corpo: { versoes: [{ id: 1, texto: 'Redação antiga', acao: 'edicao', usuario: 'Marina', criado_em: '2026-10-14T11:00:00+00:00' }] } }),
    });
    await screen.findByRole('heading', { name: /Caso 5/ });
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    await user.click(screen.getByRole('button', { name: 'Ações da mensagem' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ver versões' }));
    expect(await screen.findByText('Redação antiga')).toBeInTheDocument();
  });

  it('o histórico descreve mensagem editada e apagada', async () => {
    const user = await abrirCaso({ eventos: [
      { id: 20, tipo: 'mensagem_editada', usuario_id: 1, usuario: 'Marina', detalhe: '12', criado_em: base.criado_em },
      { id: 21, tipo: 'mensagem_apagada', usuario_id: 1, usuario: 'Marina', detalhe: '12', criado_em: base.criado_em },
    ] });
    await user.click(await screen.findByRole('tab', { name: 'Histórico' }));
    expect(screen.getByText(/Mensagem editada por Marina/)).toBeInTheDocument();
    expect(screen.getByText(/Mensagem apagada por Marina/)).toBeInTheDocument();
  });

  it('falha 409 ao editar mostra um único alert informativo e preserva o texto', async () => {
    const user = await abrirCaso({ mensagens: [msg()] }, { 'POST /api/casos/5/conversa/lida': () => ({ corpo: { ok: true } }), 'PATCH /api/casos/5/mensagens/12': () => ({ status: 409, corpo: { erro: 'x' } }) });
    await screen.findByRole('heading', { name: /Caso 5/ });
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    await user.click(screen.getByRole('button', { name: 'Ações da mensagem' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const campo = screen.getByRole('textbox', { name: 'Editar mensagem' });
    await user.clear(campo); await user.type(campo, 'Meu rascunho');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getAllByRole('alert').filter(a => a.textContent)).toHaveLength(1));
    expect(screen.getAllByRole('alert').find(a => a.textContent)).toHaveTextContent(/O caso mudou/);
    expect(screen.getByRole('textbox', { name: 'Editar mensagem' })).toHaveValue('Meu rascunho');
  });

  it('falha de rede ao excluir mostra um único alert', async () => {
    const user = await abrirCaso({ mensagens: [msg()] }, { 'POST /api/casos/5/conversa/lida': () => ({ corpo: { ok: true } }), 'DELETE /api/casos/5/mensagens/12': () => { throw new TypeError('rede'); } });
    await screen.findByRole('heading', { name: /Caso 5/ });
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    await user.click(screen.getByRole('button', { name: 'Ações da mensagem' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.getAllByRole('alert').filter(a => a.textContent)).toHaveLength(1));
    expect(screen.getAllByRole('alert').find(a => a.textContent)).toHaveTextContent(/Não foi possível/);
  });
});

const msg = (id: number, autor: 'aluno' | 'coordenacao', extra: Record<string, unknown> = {}) =>
  ({ id, autor, texto: `Texto ${id}`, criado_em: base.criado_em, usuario: null, usuario_id: null, editada_em: null, apagada_em: null, pode_alterar: false, ...extra });

describe('Caso: página reorganizada', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a barra de ações reúne Status, Reavaliar, Exportar para o ROE e Resolver', async () => {
    await abrirCaso();
    const barra = (await screen.findByLabelText('Status')).closest('.caso-acoes') as HTMLElement;
    expect(barra).not.toBeNull();
    expect(within(barra).getByRole('button', { name: 'Reavaliar prioridade' })).toBeInTheDocument();
    const roe = within(barra).getByRole('link', { name: 'Exportar para o ROE' });
    expect(roe).toHaveAttribute('target', '_blank');
    expect(roe).toHaveAttribute('rel', 'noopener');
    expect(roe).toHaveClass('botao', 'secundario');
    expect(roe).toHaveAttribute('title', expect.stringContaining('Relatório de apoio para impressão ou cópia'));
    expect(within(barra).getByText('Resolver este caso')).toBeInTheDocument();
  });

  it('a nota do ROE fica em Dados do caso e não como parágrafo solto', async () => {
    await abrirCaso();
    const dados = (await screen.findByText('Dados do caso')).closest('details')!;
    expect(dados).not.toHaveAttribute('open');
    const nota = screen.getByText(/Relatório de apoio para impressão ou cópia/, { selector: 'p' });
    expect(dados).toContainElement(nota);
  });

  it('em caso resolvido a barra mostra Reabrir no lugar de Status e Resolver', async () => {
    await abrirCaso({ status: 'resolvido' });
    const reabrir = await screen.findByRole('button', { name: 'Reabrir para investigação' });
    expect(reabrir.closest('.caso-acoes')).not.toBeNull();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Resolver este caso')).not.toBeInTheDocument();
  });

  it('Resolver este caso abre o painel de resolução existente', async () => {
    const user = await abrirCaso();
    await user.click(await screen.findByText('Resolver este caso'));
    expect(screen.getByText('Resolver este caso').closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Registrar resolução' })).toBeInTheDocument();
  });

  it('o atendimento vira uma linha com responsável e próxima ação', async () => {
    await abrirCaso({ responsavel: { id: 2, nome: 'Ana', ativo: true }, proxima_acao: 'Conversar com a turma', prazo_acao: '2026-10-20' });
    const linha = await screen.findByText(/Responsável: Ana/);
    expect(linha).toHaveTextContent('Responsável: Ana · Próxima ação: Conversar com a turma até 20/10');
    expect(screen.getByText('Editar responsável e ação').closest('details')).not.toHaveAttribute('open');
  });

  it('as abas mostram contadores e o ponto de mensagem nova do aluno', async () => {
    const mensagens = [msg(1, 'coordenacao'), msg(2, 'aluno')];
    const notas = [{ id: 1, usuario: 'Marina', texto: 'n1', criado_em: base.criado_em }, { id: 2, usuario: 'Marina', texto: 'n2', criado_em: base.criado_em }];
    const user = await abrirCaso({ mensagens, notas }, { 'POST /api/casos/5/conversa/lida': () => ({ corpo: { ok: true } }) });
    const conversa = await screen.findByRole('tab', { name: 'Conversa' });
    expect(conversa).toHaveTextContent('Conversa 2');
    expect(screen.getByRole('tab', { name: 'Notas internas' })).toHaveTextContent('Notas internas 2');
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveTextContent('Histórico 3');
    expect(screen.getByRole('tab', { name: 'Relato e investigação' }).querySelector('.aba-contagem')).toBeNull();
    expect(conversa.querySelector('.aba-ponto-novo')).not.toBeNull();
    expect(conversa).toHaveAccessibleDescription(/mensagem nova/i);
    await user.click(conversa);
    await waitFor(() => expect(conversa.querySelector('.aba-ponto-novo')).toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Notas internas' }));
    expect(conversa.querySelector('.aba-ponto-novo')).toBeNull();
  });

  it('com a última mensagem do aluno apagada não há ponto', async () => {
    await abrirCaso({ mensagens: [msg(1, 'aluno', { apagada_em: '2026-10-14T11:00:00+00:00' })] });
    const conversa = await screen.findByRole('tab', { name: 'Conversa' });
    expect(conversa.querySelector('.aba-ponto-novo')).toBeNull();
  });

  it('setas, Home e End continuam movendo a seleção e a aba selecionada entra na vista', async () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    const user = await abrirCaso();
    const relato = await screen.findByRole('tab', { name: 'Relato e investigação' });
    relato.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Conversa' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(relato).toHaveAttribute('aria-selected', 'true');
    expect(rolar.mock.contexts).toContain(screen.getByRole('tab', { name: 'Histórico' }));
    expect(rolar.mock.contexts.at(-1)).toBe(relato);
  });

  it('estados vazios ocupam uma linha de texto secundário sem título visível', async () => {
    await abrirCaso({ anexos: [], questionario: null });
    const vazioQ = await screen.findByText('O aluno não respondeu ao questionário.');
    expect(vazioQ).toHaveClass('vazio-compacto');
    expect(screen.getByRole('heading', { level: 3, name: 'Respostas do aluno' })).toHaveClass('so-leitor');
    expect(screen.getByText('Sem anexos.')).toHaveClass('vazio-compacto');
    expect(screen.getByRole('heading', { level: 2, name: 'Anexos' })).toHaveClass('so-leitor');
  });

  it('Por que esta prioridade? fica num aside e abre por padrão só para crítica ou alta', async () => {
    await abrirCaso({ prioridade: 'alta' });
    const painel = (await screen.findByRole('heading', { name: 'Por que esta prioridade?' })).closest('aside')!;
    expect(painel).toHaveClass('caso-lateral');
    expect(painel.querySelector('details')).toHaveAttribute('open');
  });

  it('prioridade média deixa o painel recolhido', async () => {
    await abrirCaso({ prioridade: 'media', prioridade_original: 'media' });
    const painel = (await screen.findByRole('heading', { name: 'Por que esta prioridade?' })).closest('aside')!;
    expect(painel.querySelector('details')).not.toHaveAttribute('open');
  });

  it('a partir de 1100 px o painel é fixo, sem details', async () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: true, media: consulta, addEventListener: () => {}, removeEventListener: () => {} }));
    await abrirCaso({ prioridade: 'media', prioridade_original: 'media' });
    const painel = (await screen.findByRole('heading', { name: 'Por que esta prioridade?' })).closest('aside')!;
    expect(painel.querySelector('details')).toBeNull();
    expect(painel).toHaveTextContent('Prioridade atual: Média');
  });
});

describe('Caso resolvido: aviso de retorno do aluno', () => {
  it('o aviso fica numa linha própria abaixo da barra de ações, com o botão de reabrir na barra', async () => {
    await abrirCaso({ status: 'resolvido', recorrencia_pendente: true, resolucoes: [resolucaoFalsa()] });
    const aviso = await screen.findByText(/Há um retorno do aluno após a resolução/);
    const barra = document.querySelector('.caso-acoes') as HTMLElement;
    expect(barra).not.toContainElement(aviso);
    expect(aviso.previousElementSibling).toBe(barra);
    expect(within(barra).getByRole('button', { name: 'Reabrir para investigação' })).toBeInTheDocument();
  });
});

describe('Caso: indicador de Dados do caso', () => {
  it('esconde o marcador nativo para sobrar um só indicador', () => {
    const css = readFileSync('src/coord/coord.css', 'utf8');
    expect(css).toMatch(/\.caso-dados\s*>?\s*summary\s*\{[^}]*list-style:\s*none/);
    expect(css).toMatch(/\.caso-dados\s*>?\s*summary::-webkit-details-marker\s*\{[^}]*display:\s*none/);
  });
});
