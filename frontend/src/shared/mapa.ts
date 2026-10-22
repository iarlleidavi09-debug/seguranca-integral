import { ErroApi, ErroCoord, notificarSessaoPerdida } from './api';
export type TipoAmbiente = 'ala' | 'andar' | 'sala' | 'area' | 'escadaria';
export type Ambiente = { id: string; nome: string; tipo: TipoAmbiente; pai_id: string | null; x: number; y: number; largura: number; altura: number; formato?: 'retangulo' | 'l'; rotacao?: 0 | 90 | 180 | 270; espessura?: number };
export type LocalMapa = Pick<Ambiente, 'id' | 'nome' | 'tipo' | 'pai_id'>;
export type CatalogoLocais = { revisao: number; ambientes: LocalMapa[] };
export type EstadoMapa = { revisao: number; ambientes: Ambiente[] };
export type FiltrosMapa = { periodo: '7' | '30' | '90' | 'todos'; base: 'relator' | 'autores'; ano: string; sala: string };
export type ResumoAmbiente = { id: string; total: number; anos: { ano: string; total: number }[]; salas: { ano: string; sala: string; total: number }[] };
export type ResumoMapa = { total: number; sem_local: number; sem_turma: number; sem_autoria: number; ambientes: ResumoAmbiente[] };
async function requisitar<T>(url: string, corpo?: EstadoMapa, publico = false, signal?: AbortSignal): Promise<T> {
 let resposta: Response;
 try { resposta = await fetch(url, { method: corpo ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
  ...(corpo ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}) }); }
 catch (erro) { if (signal?.aborted) throw erro; throw publico ? new ErroApi(0) : new ErroCoord(0); }
 if (!resposta.ok) {
  if (!publico && resposta.status === 401) notificarSessaoPerdida();
  let detalhe = ''; try { detalhe = (await resposta.json()).erro || ''; } catch { /* resposta sem JSON */ }
  throw publico ? new ErroApi(resposta.status, detalhe) : new ErroCoord(resposta.status, detalhe);
 }
 try { return await resposta.json() as T; } catch { throw publico ? new ErroApi(502) : new ErroCoord(502); }
}
export async function obterLocais(signal?: AbortSignal): Promise<CatalogoLocais> {
 const controle = new AbortController();
 const abortar = () => controle.abort();
 signal?.addEventListener('abort', abortar, { once: true });
 if (signal?.aborted) controle.abort();
 let cronometro: ReturnType<typeof setTimeout> | undefined;
 try {
  const limite = new Promise<never>((_, rejeitar) => { cronometro = setTimeout(() => { controle.abort(); rejeitar(new ErroApi(0)); }, 8000); });
  const dados = await Promise.race([requisitar<CatalogoLocais>('/api/locais', undefined, true, controle.signal), limite]);
  if (!dados || !Number.isFinite(dados.revisao) || !Array.isArray(dados.ambientes) || !dados.ambientes.every(a => a && typeof a.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(a.id) && typeof a.nome === 'string' && a.nome.length > 0 && a.nome.length <= 80 && ['ala','andar','sala','area','escadaria'].includes(a.tipo) && (a.pai_id === null || typeof a.pai_id === 'string'))) throw new ErroApi(502);
  const ids = new Set(dados.ambientes.map(a => a.id));
  if (ids.size !== dados.ambientes.length || dados.ambientes.some(a => a.pai_id !== null && !ids.has(a.pai_id))) throw new ErroApi(502);
  return dados;
 } finally { clearTimeout(cronometro); signal?.removeEventListener('abort', abortar); }
}
export const obterMapa = () => requisitar<EstadoMapa>('/api/mapa');
export const obterPlantaPublica = (signal?: AbortSignal) => requisitar<EstadoMapa>('/api/planta', undefined, true, signal);
export const salvarMapa = (estado: EstadoMapa) => requisitar<EstadoMapa>('/api/mapa', estado);
export const obterResumoMapa = (filtros: FiltrosMapa) => requisitar<ResumoMapa>(`/api/mapa/resumo?${new URLSearchParams(filtros)}`);


