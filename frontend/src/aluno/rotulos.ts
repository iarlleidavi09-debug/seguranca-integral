const status: Record<string, string> = {
  novo: 'Recebido', em_investigacao: 'Em investigação', resolvido: 'Resolvido',
  // valores antigos da v1
  em_analise: 'Em investigação', aguardando_aluno: 'Em investigação', encaminhado: 'Em investigação',
};
const desfechos: Record<string, string> = { solucionada: 'Situação solucionada', intervencao_realizada: 'Intervenção realizada' };

export const rotuloStatus = (v: string): string => status[v] ?? 'Status indisponível';
export const rotuloDesfecho = (v: string): string => desfechos[v] ?? 'Desfecho indisponível';
export function dataLegivel(v: string): string {
  const data = new Date(v);
  return Number.isNaN(data.getTime()) ? 'Data indisponível' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
