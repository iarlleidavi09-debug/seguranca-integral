import { vi } from 'vitest';
import type { Questionario } from '../shared/api';

/** Definição mínima para os testes do aluno: 2 situações com opções, 2 sem, 4 perguntas e 1 gatilho `mostrar_se`. */
export const DEFINICAO_TESTE: Questionario = {
  dimensoes: { quando: 'Quando', alcance: 'Alcance', risco: 'Risco' },
  situacoes: [
    {
      id: 'ameaca', tipo: 'ameaca', nome: 'Ameaças', descricao: 'Alguém está te ameaçando ou pressionando.',
      opcoes: [
        { id: 'a1', texto: 'Disseram que vão me machucar.', perguntas: ['q1', 'q6'] },
        { id: 'a2', texto: 'Ameaçaram divulgar algo particular meu.', perguntas: ['q1', 'q3'] },
        { id: 'a3', texto: 'Disseram que vão me encontrar ou me perseguir fora da internet.', perguntas: [] },
        { id: 'a4', texto: 'Ameaçaram alguém próximo de mim.', perguntas: [] },
      ],
    },
    {
      id: 'golpe', tipo: 'golpe', nome: 'Golpe', descricao: 'Pedidos suspeitos, links ou falsas oportunidades.',
      opcoes: [{ id: 'g1', texto: 'Pediram minha senha, código de acesso ou dados pessoais.', perguntas: ['q1'] }],
    },
    { id: 'aliciamento', tipo: 'aliciamento', nome: 'Aliciamento', descricao: 'Alguém está tentando se aproximar de você.', opcoes: [] },
    { id: 'outro', tipo: 'outro', nome: 'Outros', descricao: 'Não encontrei minha situação nas opções.', opcoes: [] },
  ],
  perguntas: [
    { id: 'q1', dimensao: 'quando', texto: 'Isso ainda está acontecendo?', tipo: 'unica', respostas: [{ id: 'q1.agora', texto: 'Sim, agora' }, { id: 'q1.parou', texto: 'Aconteceu e parou' }, { id: 'q1.nsei', texto: 'Não sei' }] },
    { id: 'q2', dimensao: 'alcance', texto: 'Quem mais sabe disso?', tipo: 'multipla', mostrar_se: ['q1.agora'], respostas: [{ id: 'q2.amigos', texto: 'Amigos' }, { id: 'q2.familia', texto: 'Minha família' }, { id: 'q2.ninguem', texto: 'Prefiro não dizer' }] },
    { id: 'q3', dimensao: 'alcance', texto: 'Onde isso aparece?', tipo: 'multipla', respostas: [{ id: 'q3.chat', texto: 'Em conversas' }, { id: 'q3.rede', texto: 'Em redes sociais' }] },
    { id: 'q6', dimensao: 'risco', texto: 'Você está seguro agora?', tipo: 'unica', respostas: [{ id: 'q6.sim', texto: 'Sim' }, { id: 'q6.mais_ou_menos', texto: 'Mais ou menos' }, { id: 'q6.nao', texto: 'Não' }, { id: 'q6.hoje', texto: 'Quero falar com alguém hoje' }] },
  ],
};

/**
 * Faz o `fetch` simulado responder à definição do questionário (ou à falha dela);
 * as demais chamadas seguem as respostas combinadas em cada teste.
 */
export function simularQuestionario(definicao: Questionario | 'rede' | number = DEFINICAO_TESTE): void {
  vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
    if (String(url) !== '/api/questionario') throw new Error('Chamada sem resposta simulada: ' + String(url));
    if (definicao === 'rede') throw new TypeError('Failed to fetch');
    if (typeof definicao === 'number') return new Response('{"erro":"questionario indisponivel"}', { status: definicao });
    return new Response(JSON.stringify(definicao), { status: 200 });
  });
}

/** Chamadas feitas ao envio do pedido (ignora a leitura do questionário). */
export const chamadasDeEnvio = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === '/api/denuncias');
export const formDoEnvio = (n = 0) => chamadasDeEnvio()[n][1]?.body as FormData;
