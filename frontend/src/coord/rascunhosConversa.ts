export type CampoConversa = 'mensagens' | 'notas';
export type RascunhoConversa = { mensagens: string; notas: string };

const vazio: RascunhoConversa = Object.freeze({ mensagens: '', notas: '' });
const rascunhos = new Map<number, RascunhoConversa>();
const ouvintes = new Set<() => void>();
let protegendoSaida = false;
let sessao = 0;

export const obterSessaoRascunhosConversa = () => sessao;

function avisarSaida(evento: BeforeUnloadEvent) {
  evento.preventDefault();
  evento.returnValue = '';
}

function publicar() {
  const pendente = rascunhos.size > 0;
  if (typeof window !== 'undefined' && pendente !== protegendoSaida) {
    if (pendente) window.addEventListener('beforeunload', avisarSaida);
    else window.removeEventListener('beforeunload', avisarSaida);
    protegendoSaida = pendente;
  }
  ouvintes.forEach(ouvinte => ouvinte());
}

export const obterRascunhoConversa = (id: number): RascunhoConversa => rascunhos.get(id) ?? vazio;

export function atualizarRascunhoConversa(id: number, proximo: RascunhoConversa) {
  const atual = obterRascunhoConversa(id);
  if (atual.mensagens === proximo.mensagens && atual.notas === proximo.notas) return;
  if (proximo.mensagens || proximo.notas) rascunhos.set(id, Object.freeze({ ...proximo }));
  else rascunhos.delete(id);
  publicar();
}

export function guardarRascunhoConversa(id: number, campo: CampoConversa, texto: string) {
  atualizarRascunhoConversa(id, { ...obterRascunhoConversa(id), [campo]: texto });
}

export function removerRascunhoConversa(id: number, campo: CampoConversa, textoEnviado?: string, sessaoEnvio?: number) {
  if (sessaoEnvio !== undefined && sessaoEnvio !== sessao) return;
  const atual = obterRascunhoConversa(id);
  if (textoEnviado !== undefined && atual[campo] !== textoEnviado) return;
  guardarRascunhoConversa(id, campo, '');
}

export function limparRascunhosConversa() {
  sessao++;
  rascunhos.clear();
  publicar();
}

export function observarRascunhosConversa(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}
