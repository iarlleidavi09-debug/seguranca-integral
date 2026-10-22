export type Acesso = { codigo: string; lastRead: number };
const chave = 'tetra-guard.acessos.v1';
export function normalizarCodigo(valor: string): string | null {
 const limpo = valor.replace(/[\s-]/g, '').toUpperCase();
 return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(limpo) ? `${limpo.slice(0,4)}-${limpo.slice(4)}` : null;
}
export function lerAcessos(): Acesso[] {
 try {
  const dados: unknown = JSON.parse(localStorage.getItem(chave) || '[]');
  if (!Array.isArray(dados)) return [];
  return dados.filter((v): v is Acesso => !!v && typeof v.codigo === 'string' && normalizarCodigo(v.codigo) === v.codigo && Number.isSafeInteger(v.lastRead) && v.lastRead >= 0);
 } catch { return []; }
}
function gravar(acessos: Acesso[]): boolean {
 try { localStorage.setItem(chave, JSON.stringify(acessos)); return true; } catch { return false; }
}
export function guardarAcesso(valor: string, lastRead?: number): boolean {
 const codigo = normalizarCodigo(valor); if (!codigo) return false;
 const acessos = lerAcessos(); const anterior = acessos.find(a => a.codigo === codigo);
 return gravar([{ codigo, lastRead: Math.max(anterior?.lastRead || 0, lastRead || 0) }, ...acessos.filter(a => a.codigo !== codigo)]);
}
export function removerAcesso(codigo?: string): boolean { return gravar(codigo ? lerAcessos().filter(a => a.codigo !== codigo) : []); }
