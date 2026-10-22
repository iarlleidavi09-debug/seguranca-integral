import type { Ambiente } from '../../shared/mapa';
export const limitar = (n: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(maximo, n));
export const LIMITE_LARGURA = 12000, LIMITE_ALTURA = 8000;
export function ajustar(a: Ambiente): Ambiente {
 const largura = limitar(Math.round(a.largura), 40, LIMITE_LARGURA), altura = limitar(Math.round(a.altura), 40, LIMITE_ALTURA);
 return { ...a, largura, altura, x: limitar(Math.round(a.x), 0, LIMITE_LARGURA - largura), y: limitar(Math.round(a.y), 0, LIMITE_ALTURA - altura) };
}
export function descendentes(id: string, ambientes: Pick<Ambiente, 'id' | 'pai_id'>[]): Set<string> {
 const ids = new Set([id]); let mudou = true;
 while (mudou) { mudou = false; for (const a of ambientes) if (a.pai_id && ids.has(a.pai_id) && !ids.has(a.id)) { ids.add(a.id); mudou = true; } }
 return ids;
}
export function agregarAmbiente(id: string, ambientes: Pick<Ambiente, 'id' | 'pai_id'>[], totais: { id: string; total: number }[]) {
 const ids = descendentes(id, ambientes);
 return totais.filter(t => ids.has(t.id)).reduce((soma, t) => soma + t.total, 0);
}
export function caminho(id: string | null, ambientes: Ambiente[]): Ambiente[] {
 const resultado: Ambiente[] = []; const vistos = new Set<string>(); let atual = id;
 while (atual && !vistos.has(atual)) { vistos.add(atual); const a = ambientes.find(item => item.id === atual); if (!a) break; resultado.unshift(a); atual = a.pai_id; }
 return resultado;
}
export function distribuicaoAmbiente(id: string, ambientes: Pick<Ambiente, 'id' | 'pai_id'>[], resumo: import('../../shared/mapa').ResumoAmbiente[]) {
 const ids = descendentes(id, ambientes);
 const anos = new Map<string, number>();
 const salas = new Map<string, { ano: string; sala: string; total: number }>();
 for (const item of resumo) {
  if (!ids.has(item.id)) continue;
  for (const a of item.anos) anos.set(a.ano, (anos.get(a.ano) ?? 0) + a.total);
  for (const s of item.salas) {
   const chave = JSON.stringify([s.ano, s.sala]);
   salas.set(chave, { ano: s.ano, sala: s.sala, total: (salas.get(chave)?.total ?? 0) + s.total });
  }
 }
 return { anos: [...anos].map(([ano, total]) => ({ ano, total })).sort((a, b) => b.total - a.total || a.ano.localeCompare(b.ano)), salas: [...salas.values()].sort((a, b) => b.total - a.total || a.ano.localeCompare(b.ano) || a.sala.localeCompare(b.sala)) };
}

export function pontosL(a: Ambiente): string {
 const t = limitar(a.espessura ?? .35, .15, .85);
 const pontos = [[0, 0], [1, 0], [1, t], [t, t], [t, 1], [0, 1]];
 return pontos.map(([u, v]) => {
  let x = u, y = v;
  for (let giro = 0; giro < (a.rotacao ?? 0); giro += 90) [x, y] = [1 - y, x];
  return `${Math.round((a.x + x * a.largura) * 1000) / 1000},${Math.round((a.y + y * a.altura) * 1000) / 1000}`;
 }).join(' ');
}
export function faixaTexto(a: Ambiente): { y: number; altura: number } {
 if (a.formato !== 'l') return { y: a.y, altura: a.altura };
 const altura = a.altura * (a.espessura ?? .35);
 return { y: (a.rotacao ?? 0) >= 180 ? a.y + a.altura - altura : a.y, altura };
}
