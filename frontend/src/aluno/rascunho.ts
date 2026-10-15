import { SITUACOES } from './situacoes';

export type DadosRascunho = { situacaoId: string; marcadas: string[]; relato: string; quando: string; onde: string; em_andamento: boolean; anonimo: boolean; nome: string; turma: string };

const CHAVE = 'si-aluno-rascunho-v2';
const CHAVE_V1 = 'si-aluno-rascunho-v1';
const VALIDADE_MS = 24 * 60 * 60 * 1000;

const corta = (valor: unknown, limite: number) => typeof valor === 'string' ? valor.slice(0, limite) : '';

/** Lê o rascunho; qualquer problema (expirado, adulterado, bloqueado) devolve null sem lançar. */
export function lerRascunho(agora: number = Date.now()): DadosRascunho | null {
  try {
    localStorage.removeItem(CHAVE_V1);
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
      marcadas: situacao.opcoes.filter(o => (d.marcadas as unknown[]).includes(o)),
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
      situacaoId: dados.situacaoId, marcadas: dados.marcadas,
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
