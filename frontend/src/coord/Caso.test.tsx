import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { chamadasA, servidor } from './testes/servidor';
import type { Rota } from './testes/servidor';

const base = {
  id: 5, tipo: 'ameaca', prioridade: 'alta', prioridade_original: 'alta', pontos: 3, status: 'novo', em_andamento: false, anonimo: true,
  simulacao: false, criado_em: '2026-10-14T10:00:00+00:00', atualizado_em: '2026-10-14T10:00:00+00:00',
};
const detalhe = (extra: Record<string, unknown> = {}) => ({
  ...base, relato: 'Relato completo do aluno.', quando: 'ontem', onde: 'aplicativo da turma',
  nome: null, turma: null, motivos: ['tipo: ameaca', 'ocorrendo agora', 'termos de risco: violencia'],
  ultimo_acesso: null,
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
    'POST /api/casos/5/status': c => {
      estado = { ...estado, status: c.status, eventos: [...estado.eventos, { id: 10, tipo: 'status', usuario_id: 1, usuario: 'Marina', detalhe: `status: ${estado.status} -> ${c.status}`, criado_em: '2026-10-14T12:00:00+00:00' }] };
      return { corpo: { ok: true } };
    },
    'POST /api/casos/5/prioridade': c => {
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

describe('Caso: cabeçalho e metadados', () => {
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
    expect(chamadasA('POST', '/api/casos/5/status')).toHaveLength(0);
  });

  it('muda o status pela API e atualiza a linha do tempo', async () => {
    const user = await abrirCaso();
    await user.selectOptions(await screen.findByLabelText('Status'), 'em_investigacao');
    await user.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByText('Status mudou de Novo para Em investigação por Marina')).toBeInTheDocument();
    const envio = chamadasA('POST', '/api/casos/5/status')[0];
    expect(envio.corpo).toEqual({ status: 'em_investigacao' });
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
    expect(chamadasA('POST', '/api/casos/5/status')[0].corpo).toEqual({ status: 'em_investigacao' });
    expect(await screen.findByLabelText('Status')).toHaveValue('em_investigacao');
  });

  it('401 ao agir devolve ao Login', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/status': () => ({ status: 401 }) });
    await user.selectOptions(await screen.findByLabelText('Status'), 'em_investigacao');
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByText('Relato completo do aluno.')).not.toBeInTheDocument();
  });

  it('erro ao mudar o status mostra a mensagem amigável', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/status': () => ({ status: 409 }) });
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
    const envio = chamadasA('POST', '/api/casos/5/prioridade')[0];
    expect(envio.corpo).toEqual({ prioridade: 'critica', justificativa: 'Nova ameaça' });
    expect(envio.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(chamadasA('GET', '/api/casos/5').length).toBeGreaterThan(antes);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reavaliar prioridade' })).toHaveFocus());
    await user.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByText('Prioridade mudou de Alta para Crítica por Marina. Motivo: Nova ameaça')).toBeInTheDocument();
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
  });

  it('erro 400 mostra mensagem amigável e mantém o texto digitado', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/prioridade': () => ({ status: 400 }) });
    await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'baixa');
    await user.type(screen.getByLabelText('Justificativa'), 'meu motivo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados e tente de novo.');
    expect(screen.getByLabelText('Justificativa')).toHaveValue('meu motivo');
    expect(screen.getByLabelText('Nova prioridade')).toHaveValue('baixa');
  });

  it('erro 404 mostra mensagem amigável', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/prioridade': () => ({ status: 404 }) });
    await user.click(await screen.findByRole('button', { name: 'Reavaliar prioridade' }));
    await user.selectOptions(screen.getByLabelText('Nova prioridade'), 'baixa');
    await user.type(screen.getByLabelText('Justificativa'), 'x');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontrado');
  });

  it('401 ao reavaliar devolve ao Login', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/prioridade': () => ({ status: 401 }) });
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
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Relato e investigação', 'Conversa', 'Notas internas', 'Histórico']);
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
    'POST /api/casos/5/resolucao': c => {
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
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByText('Caso resolvido.', { selector: '[role=status]' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/casos/5/resolucao')[0].corpo).toEqual({ desfecho: 'intervencao_realizada', providencias: 'Conversa com a turma', resultado: '' });
    expect(screen.queryByRole('heading', { name: 'Registrar resolução' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Acompanhamento após a resolução' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Caso 5/ })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Reabrir para investigação' })).toBeInTheDocument();
  });

  it('409 mostra a mensagem de caso já resolvido e recarrega o caso', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/resolucao': () => {
      estado = { ...estado, status: 'resolvido', resolucoes: [resolucaoFalsa()] };
      return { status: 409 };
    } });
    await user.click(await screen.findByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'x');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este caso já foi resolvido. Recarregue para ver o registro.');
    expect(await screen.findByRole('heading', { name: 'Acompanhamento após a resolução' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Caso 5/ })).toHaveFocus());
  });

  it('erro 400 mostra a mensagem e mantém o texto digitado', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/resolucao': () => ({ status: 400 }) });
    await user.click(await screen.findByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'meu texto');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados e tente de novo.');
    expect(screen.getByLabelText('Providências')).toHaveValue('meu texto');
    await waitFor(() => expect(screen.getByLabelText('Providências')).toHaveFocus());
  });

  it('401 ao resolver devolve ao Login', async () => {
    const user = await abrirCaso({}, { 'POST /api/casos/5/resolucao': () => ({ status: 401 }) });
    await user.click(await screen.findByLabelText('Situação solucionada'));
    await user.type(screen.getByLabelText('Providências'), 'x');
    await user.click(screen.getByRole('button', { name: 'Registrar resolução' }));
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
  });
});

describe('Caso: pós-resolução e recorrência', () => {
  const pendente = { status: 'resolvido', recorrencia_pendente: true, resolucoes: [resolucaoFalsa()], situacoes: [{ situacao: 'voltou', criado_em: '2026-10-15T09:00:00+00:00' }] };
  const revisar: Record<string, Rota> = {
    'POST /api/casos/5/revisao-recorrencia': () => {
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

  it('registra a revisão com corpo vazio, recarrega e tira o alerta', async () => {
    const user = await abrirCaso(pendente, revisar);
    expect(await screen.findByRole('heading', { name: 'Situação voltou a acontecer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar revisão' }));
    expect(await screen.findByText('Revisão registrada.', { selector: '[role=status]' })).toBeInTheDocument();
    expect(chamadasA('POST', '/api/casos/5/revisao-recorrencia')[0].corpo).toEqual({});
    expect(screen.queryByRole('heading', { name: 'Situação voltou a acontecer' })).not.toBeInTheDocument();
    expect(screen.getByText(/Revisado por Marina/)).toBeInTheDocument();
  });

  it('409 vira "Esta recorrência já foi revisada." e recarrega', async () => {
    const user = await abrirCaso(pendente, { 'POST /api/casos/5/revisao-recorrencia': () => {
      estado = { ...estado, recorrencia_pendente: false };
      return { status: 409 };
    } });
    await user.click(await screen.findByRole('button', { name: 'Registrar revisão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta recorrência já foi revisada.');
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
