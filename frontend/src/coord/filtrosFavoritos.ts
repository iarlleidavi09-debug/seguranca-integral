import type { FiltrosFila } from '../shared/api';

export type FavoritoFila = { nome: string; filtros: FiltrosFila };
export const chaveFavoritos = (usuario: number, fila: string) => `si:filtros:${usuario}:${fila}:v1`;
const valores: Partial<Record<keyof FiltrosFila, string[]>> = {
  status: ['', 'abertos', 'novo', 'em_investigacao', 'resolvido'], prioridade: ['', 'critica', 'alta', 'media', 'baixa'],
  tipo: ['', 'cyberbullying', 'ameaca', 'vazamento', 'golpe', 'perfil_falso', 'aliciamento', 'outro'],
  visao: ['', 'nao_abertos', 'atencao', 'resolvidos', 'vencidas', 'hoje', 'proximas', 'sem_acao'],
  atencao: ['', 'sem_responsavel', 'sem_resposta', 'mensagem_pendente', 'acao_vencida', 'recorrencia'],
  conversa: ['', 'com_mensagem', 'sem_mensagem', 'mensagem_nova', 'aguardando_equipe', 'aguardando_aluno'],
};
export function filtrosParaFavorito(valor: unknown): FiltrosFila {
  const filtros: FiltrosFila = { status: '', prioridade: '', tipo: '', q: '' };
  if (!valor || typeof valor !== 'object') return filtros;
  const origem = valor as Record<string, unknown>;
  for (const [campo, aceitos] of Object.entries(valores)) {
    if (typeof origem[campo] === 'string' && aceitos.includes(origem[campo] as string)) filtros[campo as keyof FiltrosFila] = origem[campo] as string;
  }
  for (const campo of ['grupo', 'opcao'] as const) {
    if (typeof origem[campo] === 'string' && /^[a-z0-9_-]{1,80}$/.test(origem[campo])) filtros[campo] = origem[campo];
  }
  return filtros;
}
export function lerFavoritos(usuario: number, fila: string): FavoritoFila[] {
  try {
    const dados: unknown = JSON.parse(localStorage.getItem(chaveFavoritos(usuario, fila)) ?? '[]');
    if (!Array.isArray(dados)) return [];
    return dados.filter(f => f && typeof f.nome === 'string' && f.nome.trim() && f.nome.length <= 40 && f.filtros && typeof f.filtros === 'object')
      .slice(0, 10).map(f => ({ nome: f.nome.trim(), filtros: filtrosParaFavorito(f.filtros) }));
  } catch { return []; }
}
export function guardarFavoritos(usuario: number, fila: string, favoritos: FavoritoFila[]): boolean {
  try {
    localStorage.setItem(chaveFavoritos(usuario, fila), JSON.stringify(favoritos.slice(0, 10).map(f => ({ nome: f.nome, filtros: filtrosParaFavorito(f.filtros) }))));
    return true;
  } catch { return false; }
}
