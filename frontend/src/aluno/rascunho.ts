import { SITUACOES } from './situacoes';

export type DadosRascunho = { situacaoId: string; marcadas: string[]; respostas: Record<string, string[]>; relato: string; quando: string; onde: string; em_andamento: boolean; anonimo: boolean; nome: string; turma: string };

const CHAVE = 'si-aluno-rascunho-v3';
const CHAVES_ANTIGAS = ['si-aluno-rascunho-v1', 'si-aluno-rascunho-v2'];
const MAX_IDS = 60;
const MAX_ID = 80;
const VALIDADE_MS = 24 * 60 * 60 * 1000;

const idValido = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_ID;

/** Ids de opção e de resposta: só texto curto, no máximo 60 no total (marcadas primeiro). */
function limparIds(marcadasBrutas: unknown, respostasBrutas: unknown): { marcadas: string[]; respostas: Record<string, string[]> } {
  let restante = MAX_IDS;
  const marcadas = (Array.isArray(marcadasBrutas) ? marcadasBrutas : []).filter(idValido).slice(0, restante);
  restante -= marcadas.length;
  const respostas: Record<string, string[]> = {};
  if (respostasBrutas && typeof respostasBrutas === 'object' && !Array.isArray(respostasBrutas)) {
    for (const [pergunta, lista] of Object.entries(respostasBrutas as Record<string, unknown>)) {
      if (!Array.isArray(lista) || restante <= 0) continue;
      const ids = lista.filter(idValido).slice(0, restante);
      if (!ids.length) continue;
      respostas[pergunta] = ids;
      restante -= ids.length;
    }
  }
  return { marcadas, respostas };
}

const corta = (valor: unknown, limite: number) => typeof valor === 'string' ? valor.slice(0, limite) : '';

/** Lê o rascunho; qualquer problema (expirado, adulterado, bloqueado) devolve null sem lançar. */
export function lerRascunho(agora: number = Date.now()): DadosRascunho | null {
  try {
    for (const antiga of CHAVES_ANTIGAS) localStorage.removeItem(antiga);
    const bruto = localStorage.getItem(CHAVE);
    if (bruto === null) return null;
    let dados: unknown;
    try { dados = JSON.parse(bruto); } catch { localStorage.removeItem(CHAVE); return null; }
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) { localStorage.removeItem(CHAVE); return null; }
    const d = dados as Record<string, unknown>;
    const situacao = SITUACOES.find(s => s.id === d.situacaoId);
    if (typeof d.salvoEm !== 'number' || !Number.isFinite(d.salvoEm) || !situacao || !Array.isArray(d.marcadas)) { localStorage.removeItem(CHAVE); return null; }
    if (Math.abs(agora - d.salvoEm) > VALIDADE_MS) { localStorage.removeItem(CHAVE); return null; }
    const anonimo = d.anonimo !== false;
    return {
      situacaoId: situacao.id,
      ...limparIds(d.marcadas, d.respostas),
      relato: corta(d.relato, 5000), quando: corta(d.quando, 200), onde: corta(d.onde, 200),
      em_andamento: d.em_andamento === true, anonimo,
      nome: anonimo ? '' : corta(d.nome, 200), turma: anonimo ? '' : corta(d.turma, 50),
    };
  } catch { return null; }
}

/** Devolve false quando o navegador não deixa guardar. Nunca guarda código, imagens nem conversa. */
export function salvarRascunho(dados: DadosRascunho, agora: number = Date.now()): boolean {
  try {
    const anonimo = dados.anonimo;
    localStorage.setItem(CHAVE, JSON.stringify({
      situacaoId: dados.situacaoId, ...limparIds(dados.marcadas, dados.respostas),
      relato: corta(dados.relato, 5000), quando: corta(dados.quando, 200), onde: corta(dados.onde, 200),
      em_andamento: dados.em_andamento, anonimo,
      nome: anonimo ? '' : corta(dados.nome, 200), turma: anonimo ? '' : corta(dados.turma, 50),
      salvoEm: agora,
    }));
    return true;
  } catch { return false; }
}

export function apagarRascunho(): void {
  try { localStorage.removeItem(CHAVE); } catch { /* O armazenamento pode estar bloqueado. */ }
}
