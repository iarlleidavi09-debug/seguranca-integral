export type Mensagem = { autor: 'aluno' | 'coordenacao'; texto: string; criado_em: string };
export type ResultadoDenuncia = { codigo: string; anexos_recusados?: { nome: string; motivo: string }[] };
export type Caso = { status: string; mensagens: Mensagem[] };

export class ErroApi extends Error {
  constructor(public readonly status: number) {
    super(`Falha na API (${status})`);
    this.name = 'ErroApi';
  }
}

export function mensagemErro(erro: unknown): string {
  const status = erro instanceof ErroApi ? erro.status : 0;
  switch (status) {
    case 400: return 'Confira os campos preenchidos e tente de novo.';
    case 404: return 'Não foi possível encontrar o caso. Confira o código e tente de novo.';
    case 413: return 'Os anexos são grandes demais. Use até 5 imagens de até 5 MB e tente de novo.';
    case 429: return 'Foram feitas muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 0: return 'Não foi possível conectar. Confira sua conexão e tente de novo.';
    default: return 'Não foi possível concluir agora. Aguarde um pouco e tente de novo.';
  }
}

async function post<T>(caminho: string, body: BodyInit, json = false): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: 'POST', body, credentials: 'same-origin', cache: 'no-store',
      ...(json ? { headers: { 'Content-Type': 'application/json' } } : {}),
    });
  } catch { throw new ErroApi(0); }
  if (!resposta.ok) throw new ErroApi(resposta.status);
  try { return await resposta.json() as T; }
  catch { throw new ErroApi(502); }
}

const normalizar = (codigo: string) => codigo.replace(/[\s-]/g, '').toUpperCase();

export function enviarDenuncia(form: FormData): Promise<ResultadoDenuncia> {
  return post('/api/denuncias', form);
}
export function acompanhar(codigo: string): Promise<Caso> {
  return post('/api/acompanhar', JSON.stringify({ codigo: normalizar(codigo) }), true);
}
export async function enviarMensagem(codigo: string, texto: string): Promise<void> {
  await post('/api/acompanhar/mensagens', JSON.stringify({ codigo: normalizar(codigo), texto }), true);
}

// ---------------------------------------------------------------------------
// Cliente da coordenação (mesma origem, cookie de sessão)
// ---------------------------------------------------------------------------

export type Papel = 'admin' | 'coordenador';
export type Usuario = { id: number; nome: string; papel: Papel };
export type UsuarioLista = { id: number; nome: string; ativo: boolean; papel: Papel };
export type EstadoSetup = { pendente: boolean; local: boolean };
export type CasoFila = {
  id: number; tipo: string; gravidade: string; pontos: number; status: string;
  em_andamento: boolean; anonimo: boolean; simulacao: boolean;
  resumo: string; criado_em: string; atualizado_em: string;
};
export type Evento = { id: number; tipo: string; usuario_id: number | null; usuario: string | null; detalhe: string; criado_em: string };
export type Nota = { id: number; usuario_id: number; usuario: string | null; texto: string; criado_em: string };
export type AnexoCaso = { id: number; tipo: string; tamanho: number };
export type CasoDetalhe = Omit<CasoFila, 'resumo'> & {
  relato: string; quando: string | null; onde: string | null;
  nome: string | null; turma: string | null; motivos: string[];
  anexos: AnexoCaso[]; eventos: Evento[]; mensagens: Mensagem[]; notas: Nota[];
};

export class ErroCoord extends ErroApi {
  constructor(status: number, public readonly detalhe = '') {
    super(status);
    this.name = 'ErroCoord';
  }
}

let aoPerderSessao: (() => void) | null = null;
/** Registra quem é avisado quando qualquer chamada responde 401. */
export function ouvirSessaoPerdida(ouvinte: (() => void) | null): void { aoPerderSessao = ouvinte; }

export function mensagemErroCoord(erro: unknown): string {
  const status = erro instanceof ErroApi ? erro.status : 0;
  switch (status) {
    case 0: return 'Não foi possível conectar. Confira a conexão e tente de novo.';
    case 400: return 'Confira os dados e tente de novo.';
    case 404: return 'Não encontrado. Pode ter sido removido.';
    case 429: return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 503: return 'Servidor ocupado, tente de novo.';
    default: return 'Não foi possível concluir agora. Tente de novo.';
  }
}

async function coord<T>(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown, sinal?: AbortSignal): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: metodo, credentials: 'same-origin', cache: 'no-store', signal: sinal,
      // toda alteração leva o tipo JSON, mesmo sem corpo; sem ele o servidor responde 415
      ...(metodo === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo ?? {}) }),
    });
  } catch (falha) {
    if (sinal?.aborted) throw falha;
    throw new ErroCoord(0);
  }
  if (!resposta.ok) {
    if (resposta.status === 401) aoPerderSessao?.();
    let detalhe = '';
    try { const dados = await resposta.json(); if (typeof dados?.erro === 'string') detalhe = dados.erro; } catch { /* corpo vazio */ }
    throw new ErroCoord(resposta.status, detalhe);
  }
  try { return await resposta.json() as T; }
  catch { throw new ErroCoord(502); }
}

const id = (valor: number) => encodeURIComponent(String(valor));

export const urlAnexo = (casoId: number, anexoId: number) => `/api/casos/${id(casoId)}/anexos/${id(anexoId)}`;
// O login só devolve o nome; o id (para não desativar a própria conta) vem de /api/eu.
export const entrar = (nome: string, senha: string) => coord<{ nome: string }>('POST', '/api/login', { nome, senha });
export const sair = () => coord<{ ok: boolean }>('POST', '/api/logout');
export const estadoSetup = () => coord<EstadoSetup>('GET', '/api/setup');
export const criarPrimeiroAdmin = (nome: string, senha: string) => coord<{ nome: string }>('POST', '/api/setup', { nome, senha });
export const quemSou = () => coord<Usuario>('GET', '/api/eu');
export async function listarCasos(status: string, tipo: string, sinal?: AbortSignal): Promise<CasoFila[]> {
  const consulta = new URLSearchParams();
  if (status) consulta.set('status', status);
  if (tipo) consulta.set('tipo', tipo);
  const texto = consulta.toString();
  return (await coord<{ casos: CasoFila[] }>('GET', `/api/casos${texto ? `?${texto}` : ''}`, undefined, sinal)).casos;
}
export const detalheCaso = (casoId: number, sinal?: AbortSignal) => coord<CasoDetalhe>('GET', `/api/casos/${id(casoId)}`, undefined, sinal);
export const mudarStatus = (casoId: number, status: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/status`, { status });
export const mudarGravidade = (casoId: number, gravidade: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/gravidade`, { gravidade });
export const enviarMensagemAoAluno = (casoId: number, texto: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/mensagens`, { texto });
export const criarNota = (casoId: number, texto: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/notas`, { texto });
export async function listarUsuarios(sinal?: AbortSignal): Promise<UsuarioLista[]> {
  return (await coord<{ usuarios: UsuarioLista[] }>('GET', '/api/usuarios', undefined, sinal)).usuarios;
}
export const criarUsuario = (nome: string, senha: string) => coord<{ id: number; nome: string }>('POST', '/api/usuarios', { nome, senha });
export const desativarUsuario = (usuarioId: number) => coord<{ ok: boolean }>('POST', `/api/usuarios/${id(usuarioId)}/desativar`);
export const carregarSimulacao = () => coord<{ criados: number }>('POST', '/api/simulacao/carregar');
export const removerSimulacao = () => coord<{ removidos: number }>('DELETE', '/api/simulacao');
