import { expect, it } from 'vitest';
import { categoriaAgenda, demoraPrimeiroAcesso } from './agenda';
it('separa vencidas, hoje e próximas e não inclui outro responsável', () => {
 const caso = { responsavel: { id: 1, nome: 'Ana', ativo: true }, prazo_acao: '2026-10-17', proxima_acao: 'Conversar', status: 'em_investigacao' };
 expect(categoriaAgenda(caso, 1, '2026-10-17')).toBe('hoje');
 expect(categoriaAgenda({ ...caso, prazo_acao: '2026-10-16' }, 1, '2026-10-17')).toBe('vencidas');
 expect(categoriaAgenda({ ...caso, prazo_acao: '2026-10-18' }, 1, '2026-10-17')).toBe('proximas');
 expect(categoriaAgenda(caso, 2, '2026-10-17')).toBeNull();
 expect(categoriaAgenda({ ...caso, proxima_acao: null }, 1, '2026-10-17')).toBe('sem_acao');
});
it('avisa somente após 24 horas e antes do primeiro acesso', () => {
 const now = Date.parse('2026-10-17T15:00:00Z');
 expect(demoraPrimeiroAcesso({ criado_em: '2026-10-16T14:59:00Z', ultimo_acesso_em: null }, now)).toBe(true);
 expect(demoraPrimeiroAcesso({ criado_em: '2026-10-16T15:01:00Z', ultimo_acesso_em: null }, now)).toBe(false);
 expect(demoraPrimeiroAcesso({ criado_em: '2026-10-15T15:00:00Z', ultimo_acesso_em: '2026-10-16T14:59:00Z' }, now)).toBe(false);
});
