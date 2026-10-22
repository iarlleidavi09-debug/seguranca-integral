import { vi } from 'vitest';

export type Resposta = { status?: number; corpo?: unknown };
export type Rota = (corpo: any, url: URL) => Resposta | Promise<Resposta>;
const lerCorpo = (body: BodyInit | null | undefined) => body instanceof FormData
  ? JSON.parse(String(body.get('dados')))
  : body ? JSON.parse(String(body)) : undefined;

export const chamadas = () => vi.mocked(fetch).mock.calls.map(([url, init]) => ({
  metodo: (init?.method ?? 'GET') as string, url: String(url), init: init as RequestInit | undefined,
  corpo: lerCorpo(init?.body),
}));
export const chamadasA = (metodo: string, caminho: string) => chamadas().filter(c => c.metodo === metodo && c.url.split('?')[0] === caminho);

/** Servidor falso por "METODO /caminho"; sem rota devolve 404 para deixar o erro visível. */
export function servidor(rotas: Record<string, Rota>) {
  vi.mocked(fetch).mockImplementation(async (entrada, init) => {
    const url = new URL(String(entrada), window.location.href);
    const padroes: Record<string, Rota> = { 'GET /api/equipe': () => ({ corpo: { usuarios: [] } }) };
    const rota = rotas[`${init?.method ?? 'GET'} ${url.pathname}`] ?? padroes[`${init?.method ?? 'GET'} ${url.pathname}`];
    const { status = 200, corpo = {} } = rota ? await rota(lerCorpo(init?.body), url) : { status: 404 };
    return new Response(JSON.stringify(corpo), { status });
  });
}
