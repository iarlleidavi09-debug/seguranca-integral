import type { CasoFila } from '../shared/api';
export const hojeNaEscola = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
type Planejado = Pick<CasoFila, 'responsavel' | 'proxima_acao' | 'prazo_acao'> & { status: string };
export function categoriaAgenda(caso: Planejado, usuario: number, hoje = hojeNaEscola()): 'vencidas' | 'hoje' | 'proximas' | 'sem_acao' | null {
 if (caso.responsavel?.id !== usuario || !caso.responsavel.ativo) return null;
 if (!caso.proxima_acao || !caso.prazo_acao) return caso.status === 'resolvido' ? null : 'sem_acao';
 return caso.prazo_acao < hoje ? 'vencidas' : caso.prazo_acao === hoje ? 'hoje' : 'proximas';
}
export function demoraPrimeiroAcesso(caso: Pick<CasoFila, 'criado_em' | 'ultimo_acesso_em' | 'nao_aberto'>, agora = Date.now()): boolean {
 return (caso.nao_aberto ?? !caso.ultimo_acesso_em) && agora - Date.parse(caso.criado_em) > 24 * 60 * 60 * 1000;
}
