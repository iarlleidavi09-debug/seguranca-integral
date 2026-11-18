import { normalizarCodigo } from './acessos';

const respostas = new Map<string, string>();
const ouvintes = new Set<() => void>();
const chave = (codigo: string) => normalizarCodigo(codigo) || codigo;
const protegerSaida = (evento: BeforeUnloadEvent) => { evento.preventDefault(); evento.returnValue = ''; };
function atualizar() {
  window.removeEventListener('beforeunload', protegerSaida);
  if ([...respostas.values()].some(texto => texto.trim())) window.addEventListener('beforeunload', protegerSaida);
  ouvintes.forEach(ouvinte => ouvinte());
}

export function lerRespostaRascunho(codigo: string): string { return respostas.get(chave(codigo)) || ''; }
export function guardarRespostaRascunho(codigo: string, texto: string): void {
  if (texto) respostas.set(chave(codigo), texto);
  else respostas.delete(chave(codigo));
  atualizar();
}
export function limparRespostaEnviada(codigo: string, texto: string): void {
  if (lerRespostaRascunho(codigo) === texto) { respostas.delete(chave(codigo)); atualizar(); }
}
export function observarRespostasRascunho(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}
export function limparRespostasRascunho(): void { respostas.clear(); atualizar(); }
