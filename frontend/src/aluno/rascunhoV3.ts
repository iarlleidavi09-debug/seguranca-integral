export type DadosRascunhoV3 = { marcadas: string[]; respostas: Record<string, string[]>; relato: string; quando: string; onde: string; em_andamento: boolean; anonimo: boolean; nome: string; turma: string;
  ano_relator: string; sala_relator: string; local_id: string; local_outro: string };
export const vazioV3: DadosRascunhoV3 = { marcadas: [], respostas: {}, relato: '', quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '',
  ano_relator: '', sala_relator: '', local_id: '', local_outro: '' };
const CHAVE = 'si-aluno-pedido-v3';
const ANTIGAS = ['si-aluno-rascunho-v1', 'si-aluno-rascunho-v2', 'si-aluno-rascunho-v3'];
const TTL = 86400000;
const texto = (v: unknown, limite: number) => typeof v === 'string' ? v.slice(0, limite) : '';
const idValido = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(id);
const ids = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter(idValido))].slice(0, 400) : [];
function sanitizar(d: Record<string, unknown>): DadosRascunhoV3 {
  const anonimo = d.anonimo !== false;
  const respostas: Record<string, string[]> = {};
  const marcadas = ids(d.marcadas);
  let restante = 400 - marcadas.length;
  if (d.respostas && typeof d.respostas === 'object' && !Array.isArray(d.respostas)) {
    for (const [pergunta, valor] of Object.entries(d.respostas)) {
      if (!idValido(pergunta) || restante <= 0) continue;
      const lista = ids(valor).slice(0, restante); restante -= lista.length;
      if (lista.length) respostas[pergunta] = lista;
    }
  }
  return { marcadas, respostas, relato: texto(d.relato, 5000), quando: texto(d.quando, 200), onde: texto(d.onde, 200),
    em_andamento: d.em_andamento === true, anonimo, nome: anonimo ? '' : texto(d.nome, 200), turma: anonimo ? '' : texto(d.turma, 50),
    ano_relator: texto(d.ano_relator, 40), sala_relator: texto(d.sala_relator, 50),
    local_id: typeof d.local_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(d.local_id) ? d.local_id : '', local_outro: texto(d.local_outro, 200) };
}
export function lerRascunhoV3(agora = Date.now()): { dados: DadosRascunhoV3 | null; aviso: string } {
  let aviso = '';
  try {
    for (const chave of ANTIGAS) if (localStorage.getItem(chave) !== null) {
      localStorage.removeItem(chave); aviso = 'Um rascunho antigo foi descartado. Comece um novo pedido.';
    }
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return { dados: null, aviso };
    const d = JSON.parse(bruto);
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.versao !== 3 || typeof d.salvoEm !== 'number' || !Number.isFinite(d.salvoEm) || d.salvoEm > agora || agora - d.salvoEm > TTL) {
      apagarRascunhoV3(); return { dados: null, aviso: 'O rascunho expirou ou não pôde ser restaurado. Comece um novo pedido.' };
    }
    return { dados: sanitizar(d), aviso };
  } catch {
    apagarRascunhoV3();
    return { dados: null, aviso: 'Não foi possível ler o rascunho neste navegador. Você pode continuar nesta tela.' };
  }
}
export function salvarRascunhoV3(dados: DadosRascunhoV3, agora = Date.now()): boolean {
  try { localStorage.setItem(CHAVE, JSON.stringify({ ...sanitizar(dados as unknown as Record<string, unknown>), versao: 3, salvoEm: agora })); return true; }
  catch { return false; }
}
export function apagarRascunhoV3(): void { try { localStorage.removeItem(CHAVE); } catch { /* Storage pode estar bloqueado. */ } }
