export type Mensagem = { autor: 'aluno' | 'coordenacao'; texto: string; criado_em: string };
export type ResultadoDenuncia = { codigo: string; anexos_recusados?: { nome: string; motivo: string }[] };
export type StatusAluno = 'novo' | 'em_investigacao' | 'resolvido';
export type ResolucaoAluno = { desfecho: 'solucionada' | 'intervencao_realizada'; providencias: string; resultado: string; criado_em: string };
export type Caso = {
  status: StatusAluno; mensagens: Mensagem[]; resolucao: ResolucaoAluno | null;
  pos_resolucao: boolean; ultima_situacao: Situacao | null;
};

export class ErroApi extends Error {
  constructor(public readonly status: number) {
    super(`Falha na API (${status})`);
    this.name = 'ErroApi';
  }
}

export function mensagemErro(erro: unknown, rota?: 'situacao'): string {
  const status = erro instanceof ErroApi ? erro.status : 0;
  switch (status) {
    case 400: return 'Confira os campos preenchidos e tente de novo.';
    case 404: return 'Não foi possível encontrar o caso. Confira o código e tente de novo.';
    case 409: if (rota === 'situacao') return 'Esse caso ainda não foi resolvido.'; break;
    case 413: return 'Os anexos são grandes demais. Use até 5 imagens de até 5 MB e tente de novo.';
    case 429: return 'Foram feitas muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 0: return 'Não foi possível conectar. Confira sua conexão e tente de novo.';
  }
  return 'Não foi possível concluir agora. Aguarde um pouco e tente de novo.';
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
export async function enviarSituacao(codigo: string, situacao: Situacao): Promise<void> {
  await post('/api/acompanhar/situacao', JSON.stringify({ codigo: normalizar(codigo), situacao }), true);
}

export type Resposta = { id: string; texto: string };
export type Pergunta = { id: string; dimensao: string; texto: string; tipo: 'unica' | 'multipla'; respostas: Resposta[]; mostrar_se?: string[] };
export type Opcao = { id: string; texto: string; perguntas: string[] };
export type SituacaoQ = { id: string; tipo: string; nome: string; descricao: string; opcoes: Opcao[] };
export type Questionario = { dimensoes: Record<string, string>; situacoes: SituacaoQ[]; perguntas: Pergunta[] };

/** Definição do questionário (sem pesos nem alertas). Falha de rede ou 503 viram ErroApi. */
export async function obterQuestionario(): Promise<Questionario> {
  let resposta: Response;
  try { resposta = await fetch('/api/questionario', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw new ErroApi(0); }
  if (!resposta.ok) throw new ErroApi(resposta.status);
  try { return await resposta.json() as Questionario; }
  catch { throw new ErroApi(502); }
}

// ---------------------------------------------------------------------------
// Cliente da coordenação (mesma origem, cookie de sessão)
// ---------------------------------------------------------------------------

export type Papel = 'admin' | 'coordenador';
export type Usuario = { id: number; nome: string; papel: Papel };
export type UsuarioLista = { id: number; nome: string; ativo: boolean; papel: Papel };
export type EstadoSetup = { pendente: boolean; local: boolean };
export type Prioridade = 'critica' | 'alta' | 'media' | 'baixa';
export type StatusCaso = 'novo' | 'em_investigacao' | 'resolvido';
export type Desfecho = 'solucionada' | 'intervencao_realizada';
export type Situacao = 'melhorou' | 'voltou';
export type CasoFila = {
  id: number; tipo: string; prioridade: Prioridade; pontos: number; status: StatusCaso;
  em_andamento: boolean; anonimo: boolean; simulacao: boolean;
  resumo: string; motivos: string[]; recorrencia_pendente: boolean;
  ultimo_acesso_por: string | null; ultimo_acesso_em: string | null;
  criado_em: string; atualizado_em: string;
};
export type Resumo = { status: Record<StatusCaso, number>; prioridade: Record<Prioridade, number>; recorrencia_pendente: number };
export type FiltrosFila = { status: string; prioridade: string; tipo: string; q: string };
export type Evento = { id: number; tipo: string; usuario_id: number | null; usuario: string | null; detalhe: string; criado_em: string };
export type Nota = { id: number; usuario_id: number; usuario: string | null; texto: string; criado_em: string };
export type AnexoCaso = { id: number; tipo: string; tamanho: number };
export type MensagemCoord = Mensagem & { usuario_id: number | null; usuario: string | null };
export type Resolucao = { desfecho: Desfecho; providencias: string; resultado: string; usuario: string | null; criado_em: string };
export type SituacaoInformada = { situacao: Situacao; criado_em: string };
export type RevisaoRecorrencia = { usuario: string | null; criado_em: string };
export type CasoDetalhe = Omit<CasoFila, 'resumo' | 'ultimo_acesso_por' | 'ultimo_acesso_em'> & {
  relato: string; quando: string | null; onde: string | null;
  nome: string | null; turma: string | null; prioridade_original: Prioridade;
  ultimo_acesso: { por: string | null; em: string } | null;
  anexos: AnexoCaso[]; eventos: Evento[]; mensagens: MensagemCoord[]; notas: Nota[];
  resolucoes: Resolucao[]; situacoes: SituacaoInformada[]; revisoes_recorrencia: RevisaoRecorrencia[];
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
    case 409: return 'O caso mudou enquanto você trabalhava. Atualize e confira o estado.';
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
export async function listarCasos(filtros: FiltrosFila, sinal?: AbortSignal): Promise<CasoFila[]> {
  const consulta = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) if (valor) consulta.set(chave, valor);
  const texto = consulta.toString();
  return (await coord<{ casos: CasoFila[] }>('GET', `/api/casos${texto ? `?${texto}` : ''}`, undefined, sinal)).casos;
}
export const obterResumo = (sinal?: AbortSignal) => coord<Resumo>('GET', '/api/resumo', undefined, sinal);
export const detalheCaso = (casoId: number, sinal?: AbortSignal) => coord<CasoDetalhe>('GET', `/api/casos/${id(casoId)}`, undefined, sinal);
export const mudarStatus = (casoId: number, status: 'novo' | 'em_investigacao') => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/status`, { status });
export const mudarPrioridade = (casoId: number, prioridade: Prioridade, justificativa: string) =>
  coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/prioridade`, { prioridade, justificativa });
export const registrarResolucao = (casoId: number, dados: { desfecho: Desfecho; providencias: string; resultado: string }) =>
  coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/resolucao`, dados);
export const revisarRecorrencia = (casoId: number) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/revisao-recorrencia`, {});
export const enviarMensagemAoAluno = (casoId: number, texto: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/mensagens`, { texto });
export const criarNota = (casoId: number, texto: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/notas`, { texto });
export async function listarUsuarios(sinal?: AbortSignal): Promise<UsuarioLista[]> {
  return (await coord<{ usuarios: UsuarioLista[] }>('GET', '/api/usuarios', undefined, sinal)).usuarios;
}
export const criarUsuario = (nome: string, senha: string) => coord<{ id: number; nome: string }>('POST', '/api/usuarios', { nome, senha });
export const desativarUsuario = (usuarioId: number) => coord<{ ok: boolean }>('POST', `/api/usuarios/${id(usuarioId)}/desativar`);
export const carregarSimulacao = () => coord<{ criados: number }>('POST', '/api/simulacao/carregar');
export const removerSimulacao = () => coord<{ removidos: number }>('DELETE', '/api/simulacao');
