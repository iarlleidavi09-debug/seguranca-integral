import { vi } from 'vitest';

export type Resposta = { status?: number; corpo?: unknown };
export type Rota = (corpo: any, url: URL) => Resposta | Promise<Resposta>;

export const chamadas = () => vi.mocked(fetch).mock.calls.map(([url, init]) => ({
  metodo: (init?.method ?? 'GET') as string, url: String(url), init: init as RequestInit | undefined,
  corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
}));
export const chamadasA = (metodo: string, caminho: string) => chamadas().filter(c => c.metodo === metodo && c.url.split('?')[0] === caminho);

/** Servidor falso por "METODO /caminho"; sem rota devolve 404 para deixar o erro visível. */
export function servidor(rotas: Record<string, Rota>) {
  vi.mocked(fetch).mockImplementation(async (entrada, init) => {
    const url = new URL(String(entrada), window.location.href);
    const rota = rotas[`${init?.method ?? 'GET'} ${url.pathname}`];
    const { status = 200, corpo = {} } = rota ? await rota(init?.body ? JSON.parse(String(init.body)) : undefined, url) : { status: 404 };
    return new Response(JSON.stringify(corpo), { status });
  });
}
