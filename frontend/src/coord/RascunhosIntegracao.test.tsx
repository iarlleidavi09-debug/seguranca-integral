import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { obterResumo } from '../shared/api';
import { limparRascunhosAtendimento } from './rascunhosAtendimento';
import { obterRascunhoConversa } from './rascunhosConversa';
import { chamadasA, servidor } from './testes/servidor';

const caso = {
  id: 5, revisao_estado: 0, tipo: 'ameaca', prioridade: 'alta', prioridade_original: 'alta', pontos: 3,
  status: 'novo', em_andamento: false, anonimo: true, simulacao: false,
  criado_em: '2026-11-03T12:00:00+00:00', atualizado_em: '2026-11-03T12:00:00+00:00',
  relato: 'Relato do aluno.', resumo: 'Situação na escola', nome: null, turma: null,
  motivos: [], anexos: [], eventos: [], mensagens: [], notas: [], resolucoes: [], situacoes: [], revisoes_recorrencia: [],
};
let sessaoAtiva = true;

beforeEach(() => {
  limparRascunhosAtendimento();
  sessaoAtiva = true;
  window.history.replaceState(null, '', '/#caso-5');
  servidor({
    'GET /api/eu': () => ({ corpo: { id: 1, nome: 'Marina', papel: 'admin' } }),
    'GET /api/casos/5': () => ({ corpo: caso }),
    'GET /api/casos': () => ({ corpo: { casos: [caso] } }),
    'GET /api/v3/questionario': () => ({ corpo: { versao: 3, grupos: [], comuns: [], perguntas: [], dimensoes: {} } }),
    'GET /api/resumo': () => sessaoAtiva
      ? { corpo: { status: {}, prioridade: {}, recorrencia_pendente: 0 } } : { status: 401 },
    'POST /api/logout': () => ({ corpo: { ok: true } }),
  });
});
afterEach(limparRascunhosAtendimento);

async function escreverRascunhos() {
  await screen.findByRole('heading', { name: /Caso 5/ });
  fireEvent.click(screen.getByRole('tab', { name: 'Conversa' }));
  fireEvent.change(screen.getByLabelText('Mensagem ao aluno'), { target: { value: 'Mensagem ainda não enviada.' } });
  fireEvent.click(screen.getByRole('tab', { name: 'Notas internas' }));
  fireEvent.change(screen.getByLabelText('Nota interna'), { target: { value: 'Nota só para a equipe.' } });
}

describe('Rascunhos na navegação real da coordenação', () => {
  it('restaura mensagem e nota ao voltar à fila e reabrir o caso sem enviar conteúdo', async () => {
    render(<App />);
    await escreverRascunhos();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos casos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Caso 5. Abrir.' }));
    await screen.findByRole('heading', { name: /Caso 5/ });
    fireEvent.click(screen.getByRole('tab', { name: 'Conversa' }));
    expect(screen.getByLabelText('Mensagem ao aluno')).toHaveValue('Mensagem ainda não enviada.');
    fireEvent.click(screen.getByRole('tab', { name: 'Notas internas' }));
    expect(screen.getByLabelText('Nota interna')).toHaveValue('Nota só para a equipe.');
    expect(chamadasA('POST', '/api/casos/5/mensagens')).toHaveLength(0);
    expect(chamadasA('POST', '/api/casos/5/notas')).toHaveLength(0);
  });

  it.each(['logout', 'sessão perdida'])('remove os textos sensíveis e o aviso de saída após %s', async forma => {
    render(<App />);
    await escreverRascunhos();
    if (forma === 'logout') fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    else {
      sessaoAtiva = false;
      await act(async () => { await obterResumo().catch(() => {}); });
    }
    await screen.findByRole('heading', { name: 'Portal da coordenação' });
    await waitFor(() => expect(obterRascunhoConversa(5)).toEqual({ mensagens: '', notas: '' }));
    const evento = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
  });
});
