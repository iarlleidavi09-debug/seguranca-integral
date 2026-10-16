import type { Questionario } from '../shared/api';

export type Respostas = Record<string, string[]>;

/**
 * Perguntas visíveis, na ordem da definição. Uma pergunta aparece quando uma opção
 * marcada (da situação) a cita, ou quando uma resposta de seu `mostrar_se` foi dada
 * em uma pergunta já visível. Repete até estabilizar.
 */
export function perguntasVisiveis(q: Questionario, situacaoId: string, marcadas: string[], respostas: Respostas): string[] {
  const situacao = q.situacoes.find(s => s.id === situacaoId);
  if (!situacao) return [];
  const abertas = new Set<string>();
  for (const opcao of situacao.opcoes) if (marcadas.includes(opcao.id)) for (const id of opcao.perguntas) abertas.add(id);
  const visiveis = new Set<string>();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of q.perguntas) {
      if (visiveis.has(p.id)) continue;
      const gatilho = (p.mostrar_se ?? []).some(rid => q.perguntas.some(o => visiveis.has(o.id) && o.respostas.some(r => r.id === rid) && (respostas[o.id] ?? []).includes(rid)));
      if (abertas.has(p.id) || gatilho) { visiveis.add(p.id); mudou = true; }
    }
  }
  return q.perguntas.filter(p => visiveis.has(p.id)).map(p => p.id);
}

/** Primeira pergunta visível ainda não visitada, em ordem. */
export function proxima(visiveis: string[], visitadas: string[]): string | null {
  return visiveis.find(id => !visitadas.includes(id)) ?? null;
}

/** Mantém só respostas de perguntas visíveis e ids que pertencem à pergunta; chaves na ordem da definição. */
export function limparInvisiveis(q: Questionario, situacaoId: string, marcadas: string[], respostas: Respostas): Respostas {
  const visiveis = new Set(perguntasVisiveis(q, situacaoId, marcadas, respostas));
  const limpas: Respostas = {};
  for (const p of q.perguntas) {
    if (!visiveis.has(p.id)) continue;
    const ids = (respostas[p.id] ?? []).filter(id => p.respostas.some(r => r.id === id));
    if (ids.length) limpas[p.id] = ids;
  }
  return limpas;
}

/** Texto JSON do campo `respostas` do POST de denúncias. */
export function montarEnvio(q: Questionario, situacaoId: string, marcadas: string[], respostas: Respostas): string {
  const situacao = q.situacoes.find(s => s.id === situacaoId);
  const daSituacao = situacao ? situacao.opcoes.filter(o => marcadas.includes(o.id)).map(o => o.id) : [];
  return JSON.stringify({ situacao: situacaoId, marcadas: daSituacao, respostas: limparInvisiveis(q, situacaoId, daSituacao, respostas) });
}
