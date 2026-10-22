import type { QuestionarioV3 } from '../shared/v3';
export function perguntasVisiveisV3(def: QuestionarioV3, marcadas: string[], respostas: Record<string, string[]>): string[] {
  const noEscopo = (p: QuestionarioV3['perguntas'][number]) => !p.para_opcoes || p.para_opcoes.some(id => marcadas.includes(id));
  const raizes = new Set(def.comuns);
  for (const opcao of def.grupos.flatMap(g => g.opcoes)) if (marcadas.includes(opcao.id)) opcao.perguntas.forEach(id => raizes.add(id));
  const alcance = new Set(def.perguntas.filter(p => raizes.has(p.id) && noEscopo(p)).map(p => p.id));
  let mudou = true;
  while (mudou) {
    mudou = false;
    const respondidas = new Set(def.perguntas.filter(p => alcance.has(p.id)).flatMap(p =>
      (respostas[p.id] ?? []).filter(id => p.respostas.some(r => r.id === id))));
    for (const pergunta of def.perguntas) {
      const alguma = pergunta.mostrar_se ?? [];
      const todas = pergunta.mostrar_se_todas ?? [];
      if (!alcance.has(pergunta.id) && noEscopo(pergunta) && (alguma.length || todas.length)
        && (!alguma.length || alguma.some(id => respondidas.has(id)))
        && todas.every(id => respondidas.has(id))) {
        alcance.add(pergunta.id); mudou = true;
      }
    }
  }
  return [...def.comuns, ...def.perguntas.map(p => p.id)].filter((id, i, lista) => alcance.has(id) && lista.indexOf(id) === i);
}
export function limparRespostasV3(def: QuestionarioV3, marcadas: string[], respostas: Record<string, string[]>): Record<string, string[]> {
  const normalizadas = Object.fromEntries(def.perguntas.flatMap(p => {
    const validas = [...new Set((respostas[p.id] ?? []).filter(id => p.respostas.some(r => r.id === id)))];
    const ids = p.tipo === 'unica' ? validas.slice(0, 1) : validas;
    return ids.length ? [[p.id, ids]] : [];
  }));
  const visiveis = new Set(perguntasVisiveisV3(def, marcadas, normalizadas));
  return Object.fromEntries(Object.entries(normalizadas).filter(([id]) => visiveis.has(id)));
}
export function montarEnvioV3(def: QuestionarioV3, marcadas: string[], respostas: Record<string, string[]>): string {
  const validas = new Set(def.grupos.flatMap(g => g.opcoes.map(o => o.id)));
  const escolhas = [...new Set(marcadas.filter(id => validas.has(id)))];
  return JSON.stringify({ versao: 3, marcadas: escolhas, respostas: limparRespostasV3(def, escolhas, respostas) });
}
