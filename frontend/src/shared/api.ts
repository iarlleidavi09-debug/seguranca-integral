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
