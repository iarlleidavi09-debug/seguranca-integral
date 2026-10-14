import type { Evento } from '../shared/api';

export const STATUS = ['novo', 'em_analise', 'aguardando_aluno', 'encaminhado', 'resolvido'] as const;
export const GRAVIDADES = ['alta', 'media', 'baixa'] as const;
export const TIPOS = [
  ['cyberbullying', 'Cyberbullying'], ['ameaca', 'Ameaça'], ['vazamento', 'Vazamento de fotos ou dados'],
  ['golpe', 'Golpe ou extorsão'], ['perfil_falso', 'Perfil falso'], ['aliciamento', 'Aliciamento'], ['outro', 'Outro'],
] as const;

export const rotuloStatus: Record<string, string> = {
  novo: 'Novo', em_analise: 'Em análise', aguardando_aluno: 'Aguardando aluno', encaminhado: 'Encaminhado', resolvido: 'Resolvido',
};
export const rotuloGravidade: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const rotuloTipo: Record<string, string> = Object.fromEntries(TIPOS);

export const status = (valor: string) => rotuloStatus[valor] ?? valor;
export const gravidade = (valor: string) => rotuloGravidade[valor] ?? valor;
export const tipo = (valor: string) => rotuloTipo[valor] ?? valor;

export function dataLegivel(valor: string): string {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data indisponível' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** "tipo: ameaca" vira "Tipo: Ameaça"; os outros motivos seguem como vieram. */
export function motivo(texto: string): string {
  const achado = /^tipo: (.+)$/.exec(texto);
  return achado ? `Tipo: ${tipo(achado[1])}` : texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function descricaoEvento(evento: Evento): string {
  const quem = evento.usuario ? ` por ${evento.usuario}` : '';
  const mudanca = /^(status|gravidade): (\S+) -> (\S+)$/.exec(evento.detalhe);
  switch (evento.tipo) {
    case 'criado': {
      const g = /^gravidade (\S+)$/.exec(evento.detalhe);
      return g ? `Caso recebido com gravidade ${gravidade(g[1]).toLowerCase()}` : 'Caso recebido';
    }
    case 'status':
      return mudanca ? `Status mudou de ${status(mudanca[2])} para ${status(mudanca[3])}${quem}` : `Status alterado${quem}`;
    case 'gravidade':
      return mudanca ? `Gravidade mudou de ${gravidade(mudanca[2])} para ${gravidade(mudanca[3])}${quem}` : `Gravidade alterada${quem}`;
    case 'mensagem_coordenacao': return `Mensagem enviada ao aluno${quem}`;
    case 'mensagem_aluno': return 'O aluno enviou uma mensagem';
    case 'nota_interna': return `Nota interna registrada${quem}`;
    default: return `${evento.tipo}${quem}`;
  }
}

/** Forma e texto, nunca só cor: triângulo (alta), losango (média), círculo (baixa). */
export function Gravidade({ valor }: { valor: string }) {
  return <span className="selo-gravidade" data-gravidade={valor}>
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      {valor === 'alta' && <path d="M10 2 19 18H1Z" fill="currentColor" />}
      {valor === 'media' && <path d="M10 1 19 10 10 19 1 10Z" fill="currentColor" />}
      {valor !== 'alta' && valor !== 'media' && <circle cx="10" cy="10" r="8" fill="currentColor" />}
    </svg>
    {gravidade(valor)}
  </span>;
}

export function Status({ valor }: { valor: string }) {
  return <span className="selo-status" data-status={valor}><span className="status-ponto" aria-hidden="true" />{status(valor)}</span>;
}

export function Simulacao() {
  return <span className="selo-simulacao">simulação</span>;
}
