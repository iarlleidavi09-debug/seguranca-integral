import { describe, expect, it, vi } from 'vitest';
import { obterQuestionarioV3 } from './api';

const catalogo = () => ({
  versao: 3, dimensoes: { risco: 'Risco' }, comuns: [],
  grupos: [{ id: 'rede', nome: 'Na internet', opcoes: [{ id: 'cyber', texto: 'Ataques na internet', perguntas: ['q-cyber-tipo'] }] }],
  perguntas: [
    { id: 'q-cyber-tipo', dimensao: 'risco', texto: 'O que aconteceu na internet?', tipo: 'unica', para_opcoes: ['cyber'], respostas: [{ id: 'q-cyber-tipo.boato', texto: 'Espalharam um boato' }] },
    { id: 'q-cyber-alcance', dimensao: 'risco', texto: 'Quem recebeu esse boato?', tipo: 'unica', para_opcoes: ['cyber'], mostrar_se_todas: ['q-cyber-tipo.boato'], respostas: [{ id: 'q-cyber-alcance.turma', texto: 'Colegas da turma' }] },
  ],
});
const responder = (dados: unknown) => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(dados)));
describe('Estrutura pública de bifurcações temáticas', () => {
  it('preserva escopo e condição AND na definição pública', async () => {
    const dados = catalogo(); responder(dados);
    expect(await obterQuestionarioV3()).toEqual(dados);
  });
  it.each(['escopo-ausente', 'escopo-vazio', 'and-inexistente', 'and-formato', 'or-inexistente'])('recusa definição inválida: %s', async modo => {
    const dados = catalogo();
    const pergunta = dados.perguntas[1] as unknown as Record<string, unknown>;
    if (modo === 'escopo-ausente') pergunta.para_opcoes = ['inexistente'];
    if (modo === 'escopo-vazio') pergunta.para_opcoes = [];
    if (modo === 'and-inexistente') pergunta.mostrar_se_todas = ['q-nao-existe.sim'];
    if (modo === 'and-formato') pergunta.mostrar_se_todas = 'q-cyber-tipo.boato';
    if (modo === 'or-inexistente') pergunta.mostrar_se = ['q-nao-existe.sim'];
    responder(dados);
    await expect(obterQuestionarioV3()).rejects.toMatchObject({ status: 502 });
  });
});
