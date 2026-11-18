import type { QuestionarioV3 } from './v3';
export type Mensagem = { id?: number; autor: 'aluno' | 'coordenacao'; texto: string; criado_em: string; editada?: boolean; apagada?: boolean };
export type ResultadoDenuncia = { codigo: string; anexos_recusados?: { nome: string; motivo: string }[] };
export type StatusAluno = 'novo' | 'em_investigacao' | 'resolvido';
export type ResolucaoAluno = { desfecho: 'solucionada' | 'intervencao_realizada'; providencias: string; resultado: string; criado_em: string };
export type Caso = {
  status: StatusAluno; mensagens: Mensagem[]; resolucao: ResolucaoAluno | null;
  pos_resolucao: boolean; ultima_situacao: Situacao | null;
};

export class ErroApi extends Error {
  /** `erroServidor` guarda o texto de `{"erro": ...}` quando o servidor o envia; as mensagens para o aluno não o usam. */
  constructor(public readonly status: number, public readonly erroServidor = '') {
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
  if (!resposta.ok) {
    let texto = '';
    try { const dados = await resposta.json(); if (typeof dados?.erro === 'string') texto = dados.erro; } catch { /* corpo vazio ou que não é JSON */ }
    throw new ErroApi(resposta.status, texto);
  }
  try { return await resposta.json() as T; }
  catch { throw new ErroApi(502); }
}

const normalizar = (codigo: string) => codigo.replace(/[\s-]/g, '').toUpperCase();

export function enviarDenuncia(form: FormData): Promise<ResultadoDenuncia> {
  return post('/api/denuncias', form);
}
export function enviarPedidoV3(form: FormData): Promise<ResultadoDenuncia> { return post('/api/v3/denuncias', form); }
export function enviarPedidoV4(form: FormData): Promise<ResultadoDenuncia> { return post('/api/v4/denuncias', form); }
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
export type Pergunta = { id: string; dimensao: string; texto: string; tipo: 'unica' | 'multipla'; respostas: Resposta[]; mostrar_se?: string[]; mostrar_se_todas?: string[]; para_opcoes?: string[] };
export type Opcao = { id: string; texto: string; perguntas: string[] };
export type SituacaoQ = { id: string; tipo: string; nome: string; descricao: string; opcoes: Opcao[] };
export type Questionario = { dimensoes: Record<string, string>; situacoes: SituacaoQ[]; perguntas: Pergunta[] };

/** Quanto esperar pela definição antes de seguir sem ela. */
export const TEMPO_LIMITE_QUESTIONARIO = 8000;

/** Definição do questionário (sem pesos nem alertas). Falha de rede, tempo esgotado ou 503 viram ErroApi. */
export async function obterQuestionario(): Promise<Questionario> {
  return buscarDefinicao<Questionario>('/api/questionario');
}
export async function obterQuestionarioV3(): Promise<QuestionarioV3> {
  const def = await buscarDefinicao<QuestionarioV3>('/api/v3/questionario');
  if (def?.versao !== 3 || !Array.isArray(def.grupos) || !Array.isArray(def.comuns) || !Array.isArray(def.perguntas)) throw new ErroApi(502);
  const texto = (v: unknown) => typeof v === 'string' && v.length > 0;
  const lista = (v: unknown): v is string[] => Array.isArray(v) && v.every(texto);
  if (!lista(def.comuns) || !def.dimensoes || typeof def.dimensoes !== 'object' || !Object.values(def.dimensoes).every(texto)
    || !def.grupos.every(g => g && texto(g.id) && texto(g.nome) && Array.isArray(g.opcoes) && g.opcoes.every(o => o && texto(o.id) && texto(o.texto) && lista(o.perguntas)))
    || !def.perguntas.every(p => p && texto(p.id) && texto(p.texto) && texto(p.dimensao) && ['unica', 'multipla'].includes(p.tipo)
      && Array.isArray(p.respostas) && p.respostas.every(r => r && texto(r.id) && texto(r.texto))
      && (p.mostrar_se === undefined || lista(p.mostrar_se))
      && (p.mostrar_se_todas === undefined || lista(p.mostrar_se_todas))
      && (p.para_opcoes === undefined || (lista(p.para_opcoes) && p.para_opcoes.length > 0)))) throw new ErroApi(502);
  const perguntas = new Set(def.perguntas.map(p => p.id));
  const opcoes = new Set(def.grupos.flatMap(g => g.opcoes.map(o => o.id)));
  const alternativas = new Set(def.perguntas.flatMap(p => p.respostas.map(r => r.id)));
  const referencias = (valores: string[] | undefined, permitidas: Set<string>) => valores === undefined || (new Set(valores).size === valores.length && valores.every(id => permitidas.has(id)));
  if (def.perguntas.length > 200 || perguntas.size !== def.perguntas.length
    || def.perguntas.some(p => !referencias(p.para_opcoes, opcoes) || !referencias(p.mostrar_se, alternativas) || !referencias(p.mostrar_se_todas, alternativas))) throw new ErroApi(502);
  if (def.comuns.some(id => !perguntas.has(id)) || def.grupos.some(g => g.opcoes.some(o => o.perguntas.some(id => !perguntas.has(id))))) throw new ErroApi(502);
  return def;
}
export type BlocoOrientacao = { titulo: string; passos: string[] };
export type Orientacoes = { geral: BlocoOrientacao; situacoes: (BlocoOrientacao & { id: string })[]; contatos: { nome: string; contato: string }[] };
/** Passos de orientação imediata; só ids de situação trafegam, nunca dados do caso. */
export async function obterOrientacoes(situacoes: string[] = []): Promise<Orientacoes> {
  const consulta = situacoes.length ? `?situacoes=${situacoes.map(encodeURIComponent).join(',')}` : '';
  const dados = await buscarDefinicao<Orientacoes>(`/api/orientacoes${consulta}`);
  const texto = (v: unknown) => typeof v === 'string' && v.length > 0;
  const bloco = (b: unknown): b is BlocoOrientacao => !!b && texto((b as BlocoOrientacao).titulo) && Array.isArray((b as BlocoOrientacao).passos) && (b as BlocoOrientacao).passos.every(texto);
  if (!dados || !bloco(dados.geral) || !Array.isArray(dados.situacoes) || !dados.situacoes.every(s => bloco(s) && texto(s.id))
    || !Array.isArray(dados.contatos) || !dados.contatos.every(c => c && texto(c.nome) && texto(c.contato))) throw new ErroApi(502);
  return dados;
}
async function buscarDefinicao<T>(rota: string): Promise<T> {
  const controle = new AbortController();
  let cronometro: ReturnType<typeof setTimeout> | undefined;
  // a corrida garante a desistência mesmo que o fetch ignore o sinal de cancelamento
  const esgotado = new Promise<never>((_, rejeitar) => {
    cronometro = setTimeout(() => { controle.abort(); rejeitar(new ErroApi(0)); }, TEMPO_LIMITE_QUESTIONARIO);
  });
  const buscar = async (): Promise<T> => {
    let resposta: Response;
    try { resposta = await fetch(rota, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controle.signal }); }
    catch { throw new ErroApi(0); }
    if (!resposta.ok) throw new ErroApi(resposta.status);
    try { return await resposta.json() as T; }
    catch { throw new ErroApi(controle.signal.aborted ? 0 : 502); }
  };
  try { return await Promise.race([buscar(), esgotado]); }
  finally { clearTimeout(cronometro); }
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
  canal?: 'relato' | 'acolhimento';
  conversa_estado?: 'sem_mensagem' | 'mensagem_nova' | 'aguardando_equipe' | 'aguardando_aluno';
  mensagens_novas?: number; ultima_mensagem?: Mensagem | null;
  responsavel?: { id: number; nome: string; ativo: boolean } | null;
  proxima_acao?: string | null; prazo_acao?: string | null; atencao?: string[]; nao_aberto?: boolean;
  categorias?: string[]; opcoes?: string[]; assuntos?: string[]; revisao_estado?: number;
  id: number; tipo: string; prioridade: Prioridade; pontos: number; status: StatusCaso;
  em_andamento: boolean; anonimo: boolean; simulacao: boolean;
  resumo: string; motivos: string[]; recorrencia_pendente: boolean;
  ultimo_acesso_por: string | null; ultimo_acesso_em: string | null;
  criado_em: string; atualizado_em: string;
};
export type Resumo = { status: Record<StatusCaso, number>; prioridade: Record<Prioridade, number>; recorrencia_pendente: number };
export type FiltrosFila = { status: string; prioridade: string; tipo: string; q: string; grupo?: string; opcao?: string; visao?: string; atencao?: string; conversa?: string };
export type Evento = { id: number; tipo: string; usuario_id: number | null; usuario: string | null; detalhe: string; criado_em: string };
export type Nota = { id: number; usuario_id: number; usuario: string | null; texto: string; criado_em: string };
export type AnexoCaso = { id: number; tipo: string; tamanho: number };
export type MensagemCoord = Mensagem & { usuario_id: number | null; usuario: string | null; editada_em: string | null; apagada_em: string | null; pode_alterar: boolean };
export type VersaoMensagem = { id: number; texto: string; acao: 'edicao' | 'exclusao'; usuario: string | null; criado_em: string };
export type AutorResolucaoInput = { nome: string; ano: string; sala: string; foto?: File };
export type DadosResolucao = { desfecho: Desfecho; providencias: string; resultado: string; autoria: 'identificada' | 'nao_identificada'; justificativa_autoria: string; autores: AutorResolucaoInput[] };
export type AutorResolucao = { id: number; nome: string; ano: string; sala: string; tem_foto: boolean };
export type Resolucao = { desfecho: Desfecho; providencias: string; resultado: string; usuario: string | null; criado_em: string;
  autoria?: 'identificada' | 'nao_identificada'; justificativa_autoria?: string; autores?: AutorResolucao[] };
export type SituacaoInformada = { situacao: Situacao; criado_em: string };
export type RevisaoRecorrencia = { usuario: string | null; criado_em: string };
export type QuestionarioCaso = {
  situacao: { id: string; nome: string }; marcadas: string[];
  dimensoes: { id: string; rotulo: string; itens: { pergunta: string; respostas: string[] }[] }[];
};
export type CasoDetalhe = Omit<CasoFila, 'resumo' | 'ultimo_acesso_por' | 'ultimo_acesso_em'> & {
  codigo_acompanhamento?: string | null;
  relato: string; quando: string | null; onde: string | null;
  nome: string | null; turma: string | null; prioridade_original: Prioridade;
  ano_relator?: string | null; sala_relator?: string | null; local_id?: string | null; local_nome?: string | null; local_outro?: string | null;
  ultimo_acesso: { por: string | null; em: string } | null;
  anexos: AnexoCaso[]; eventos: Evento[]; mensagens: MensagemCoord[]; notas: Nota[];
  resolucoes: Resolucao[]; situacoes: SituacaoInformada[]; revisoes_recorrencia: RevisaoRecorrencia[];
  questionario: QuestionarioCaso | null;
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
export function notificarSessaoPerdida(): void { aoPerderSessao?.(); }

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

async function coord<T>(metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', caminho: string, corpo?: unknown, sinal?: AbortSignal): Promise<T> {
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
export const urlFotoAutor = (casoId: number, autorId: number) => `/api/casos/${id(casoId)}/autores/${id(autorId)}/foto`;
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
export const obterResumo = (sinal?: AbortSignal, somenteAbertos = false) => coord<Resumo>('GET', `/api/resumo${somenteAbertos ? '?abertos=1' : ''}`, undefined, sinal);

export type Relatorio = {
  inicio: string; fim: string; recebidos: number; resolvidos: number;
  evolucao: { data: string; recebidos: number; resolvidos: number }[];
  prioridades: { prioridade: string; quantidade: number }[];
  evolucao_prioridades: { data: string; critica: number; alta: number; media: number; baixa: number }[];
};
export const obterRelatorio = (inicio: string, fim: string, sinal?: AbortSignal) =>
  coord<Relatorio>('GET', `/api/relatorios?${new URLSearchParams({ inicio, fim })}`, undefined, sinal);
export const detalheCaso = (casoId: number, sinal?: AbortSignal) => coord<CasoDetalhe>('GET', `/api/casos/${id(casoId)}`, undefined, sinal);
export const registrarLeituraConversa = (casoId: number, ultimo_id: number) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/conversa/lida`, { ultimo_id });
export const urlExportacao = (casoId: number) => `/api/casos/${id(casoId)}/exportacao`;
export type EstadoIntegridade = 'integro' | 'divergente' | 'sem_registro' | 'ausente';
export type IntegridadeCaso = {
  anexos: { id: number; recebido_em: string | null; sha256: string | null; estado: EstadoIntegridade }[];
  pode_exportar: boolean;
};
export const integridadeCaso = (casoId: number, sinal?: AbortSignal) => coord<IntegridadeCaso>('GET', `/api/casos/${id(casoId)}/integridade`, undefined, sinal);
export const urlDossie = (casoId: number) => `/api/casos/${id(casoId)}/dossie`;
export type DadosAtendimento = { responsavel_id: number | null; proxima_acao: string; prazo_acao: string | null };
export const listarEquipe = (sinal?: AbortSignal) => coord<{ usuarios: { id: number; nome: string }[] }>('GET', '/api/equipe', undefined, sinal);
export const salvarAtendimento = (casoId: number, dados: DadosAtendimento, revisao_estado: number) => coord('POST', `/api/v3/casos/${id(casoId)}/atendimento`, { ...dados, revisao_estado });
export const concluirAcao = (casoId: number, revisao_estado: number) => coord('POST', `/api/v3/casos/${id(casoId)}/atendimento/concluir`, { revisao_estado });
const acaoCaso = (casoId: number, acao: string, dados: object, revisao?: number) => coord<{ ok: boolean }>('POST',
  `/api/${revisao === undefined ? '' : 'v3/'}casos/${id(casoId)}/${acao}`, { ...dados, ...(revisao === undefined ? {} : { revisao_estado: revisao }) });
export const mudarStatus = (casoId: number, status: 'novo' | 'em_investigacao', revisao?: number) => acaoCaso(casoId, 'status', { status }, revisao);
export const mudarPrioridade = (casoId: number, prioridade: Prioridade, justificativa: string, revisao?: number) => acaoCaso(casoId, 'prioridade', { prioridade, justificativa }, revisao);
export async function registrarResolucao(casoId: number, dados: DadosResolucao | { desfecho: Desfecho; providencias: string; resultado: string }, revisao?: number): Promise<{ ok: boolean }> {
  if (!('autoria' in dados)) return acaoCaso(casoId, 'resolucao', dados, revisao);
  const form = new FormData();
  const autores = dados.autores.map(({ foto, ...autor }, indice) => {
    if (!foto) return autor;
    const campo = `foto_${indice}`;
    form.append(campo, foto);
    return { ...autor, foto_campo: campo };
  });
  form.append('dados', JSON.stringify({ ...dados, autores, revisao_estado: revisao }));
  let resposta: Response;
  try { resposta = await fetch(`/api/v4/casos/${id(casoId)}/resolucao`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'X-SI-Coord': '1' }, body: form }); }
  catch { throw new ErroCoord(0); }
  if (!resposta.ok) {
    if (resposta.status === 401) aoPerderSessao?.();
    let detalhe = '';
    try { const erro = await resposta.json(); if (typeof erro?.erro === 'string') detalhe = erro.erro; } catch { /* Resposta sem JSON. */ }
    throw new ErroCoord(resposta.status, detalhe);
  }
  try { return await resposta.json() as { ok: boolean }; } catch { throw new ErroCoord(502); }
}
export const revisarRecorrencia = (casoId: number, revisao?: number) => acaoCaso(casoId, 'revisao-recorrencia', {}, revisao);
export type Atividade = 'vendo' | 'mensagem' | 'nota';
export type PessoaPresente = { id: number; nome: string; atividade: Atividade };
export const obterPresenca = (casoId: number) => coord<{ pessoas: PessoaPresente[] }>('GET', `/api/casos/${id(casoId)}/presenca`);
export const pulsarPresenca = (casoId: number, aba: string, atividade: Atividade) => coord<{ pessoas: PessoaPresente[] }>('POST', `/api/casos/${id(casoId)}/presenca`, { aba, atividade });
export const removerPresenca = (casoId: number, aba: string) => coord<{ pessoas: PessoaPresente[] }>('DELETE', `/api/casos/${id(casoId)}/presenca`, { aba });
export const enviarMensagemAoAluno = (casoId: number, texto: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/mensagens`, { texto });
export const editarMensagemAoAluno = (casoId: number, mensagemId: number, texto: string) => coord<{ ok: boolean }>('PATCH', `/api/casos/${id(casoId)}/mensagens/${id(mensagemId)}`, { texto });
export const excluirMensagemAoAluno = (casoId: number, mensagemId: number) => coord<{ ok: boolean }>('DELETE', `/api/casos/${id(casoId)}/mensagens/${id(mensagemId)}`);
export async function versoesDaMensagem(casoId: number, mensagemId: number): Promise<VersaoMensagem[]> {
  return (await coord<{ versoes: VersaoMensagem[] }>('GET', `/api/casos/${id(casoId)}/mensagens/${id(mensagemId)}/versoes`)).versoes;
}
export const criarNota = (casoId: number, texto: string) => coord<{ ok: boolean }>('POST', `/api/casos/${id(casoId)}/notas`, { texto });
export async function listarUsuarios(sinal?: AbortSignal): Promise<UsuarioLista[]> {
  return (await coord<{ usuarios: UsuarioLista[] }>('GET', '/api/usuarios', undefined, sinal)).usuarios;
}
export const criarUsuario = (nome: string, senha: string) => coord<{ id: number; nome: string }>('POST', '/api/usuarios', { nome, senha });
export const desativarUsuario = (usuarioId: number) => coord<{ ok: boolean }>('POST', `/api/usuarios/${id(usuarioId)}/desativar`);
export const removerUsuario = (usuarioId: number) => coord<{ ok: boolean }>('DELETE', `/api/usuarios/${id(usuarioId)}`, {});
export const carregarSimulacao = () => coord<{ criados: number }>('POST', '/api/simulacao/carregar');
export const removerSimulacao = () => coord<{ removidos: number }>('DELETE', '/api/simulacao');

export type Removidos = { casos: number; mensagens: number; anexos: number; arquivos: number; backups: number };
export type ResumoImplantacao = {
  secundaria: boolean; resumo: Removidos; ultima_limpeza: { em: string; por: string | null; casos: number } | null;
};
/** Devolve null quando a limpeza não está disponível (404 sem a flag, 403 fora do primeiro administrador). */
export async function obterImplantacao(): Promise<ResumoImplantacao | null> {
  try { return await coord<ResumoImplantacao>('GET', '/api/implantacao'); }
  catch (falha) {
    if (falha instanceof ErroApi && (falha.status === 404 || falha.status === 403)) return null;
    throw falha;
  }
}
export const limparImplantacao = (senha: string, confirmacao: string, apagarBackups: boolean) =>
  coord<{ ok: boolean; removidos: Removidos; avisos?: string[] }>('POST', '/api/implantacao/limpar', { senha, confirmacao, apagar_backups: apagarBackups });
