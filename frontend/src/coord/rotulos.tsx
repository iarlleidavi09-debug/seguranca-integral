import type { Evento } from '../shared/api';

export const STATUS = ['novo', 'em_investigacao', 'resolvido'] as const;
export const PRIORIDADES = ['critica', 'alta', 'media', 'baixa'] as const;
export const DESFECHOS = ['solucionada', 'intervencao_realizada'] as const;
export const TIPOS = [
  ['cyberbullying', 'Cyberbullying'], ['ameaca', 'Ameaça'], ['vazamento', 'Vazamento de fotos ou dados'],
  ['golpe', 'Golpe ou extorsão'], ['perfil_falso', 'Perfil falso'], ['aliciamento', 'Aliciamento'], ['outro', 'Outro'],
] as const;

export const rotuloStatus: Record<string, string> = {
  novo: 'Novo', em_investigacao: 'Em investigação', resolvido: 'Resolvido',
  // dados da v1 que ainda cheguem sem migração
  em_analise: 'Em investigação', aguardando_aluno: 'Em investigação', encaminhado: 'Em investigação',
};
export const rotuloPrioridade: Record<string, string> = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const rotuloDesfecho: Record<string, string> = { solucionada: 'situação solucionada', intervencao_realizada: 'intervenção realizada' };
export const rotuloTipo: Record<string, string> = Object.fromEntries(TIPOS);

export const status = (valor: string) => rotuloStatus[valor] ?? valor;
export const prioridade = (valor: string) => rotuloPrioridade[valor] ?? valor;
export const desfecho = (valor: string) => rotuloDesfecho[valor] ?? valor;
export const tipo = (valor: string) => rotuloTipo[valor] ?? valor;

export function dataLegivel(valor: string): string {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data indisponível' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const MOTIVOS_ALERTA: Record<string, string> = {
  'alerta: ameaca com violencia em andamento': 'Alerta: ameaça com violência em andamento',
  'alerta: risco de automutilacao em andamento': 'Alerta: risco de automutilação em andamento',
  'alerta: conteudo intimo com extorsao': 'Alerta: conteúdo íntimo com extorsão',
};

/** "tipo: ameaca" vira "Tipo: Ameaça"; alertas ganham acento; os outros motivos seguem como vieram. */
export function motivo(texto: string): string {
  if (MOTIVOS_ALERTA[texto]) return MOTIVOS_ALERTA[texto];
  const achado = /^tipo: (.+)$/.exec(texto);
  return achado ? `Tipo: ${tipo(achado[1])}` : texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function acessoLegivel(por: string | null, em: string | null): string {
  if (!em) return 'Ainda não acessado';
  return por ? `${por}, ${dataLegivel(em)}` : dataLegivel(em);
}

export function descricaoEvento(evento: Evento): string {
  const quem = evento.usuario ? ` por ${evento.usuario}` : '';
  const tipoEvento = evento.tipo === 'gravidade' ? 'prioridade' : evento.tipo; // eventos da v1
  switch (tipoEvento) {
    case 'criado': {
      const p = /^(?:prioridade|gravidade) (\S+)$/.exec(evento.detalhe);
      return p ? `Caso recebido com prioridade ${prioridade(p[1]).toLowerCase()}` : 'Caso recebido';
    }
    case 'status': {
      const m = /^status: (\S+) -> (\S+)$/.exec(evento.detalhe);
      return m ? `Status mudou de ${status(m[1])} para ${status(m[2])}${quem}` : `Status alterado${quem}`;
    }
    case 'prioridade': {
      const m = /^(?:(?:prioridade|gravidade): )?(\S+) -> ([^\s:]+)(?:: ([\s\S]*))?$/.exec(evento.detalhe);
      if (!m) return `Prioridade alterada${quem}`;
      const base = `Prioridade mudou de ${prioridade(m[1])} para ${prioridade(m[2])}${quem}`;
      return m[3] ? `${base}. Motivo: ${m[3]}` : base;
    }
    case 'resolucao': return `Caso resolvido${quem}: ${desfecho(evento.detalhe)}`;
    case 'recorrencia': return 'O aluno informou que a situação voltou a acontecer';
    case 'revisao_recorrencia': return `Recorrência revisada${quem}`;
    case 'mensagem_coordenacao': return `Mensagem enviada ao aluno${quem}`;
    case 'mensagem_aluno': return 'O aluno enviou uma mensagem';
    case 'nota_interna': return `Nota interna registrada${quem}`;
    default: return `${evento.tipo}${quem}`;
  }
}

/** Forma e texto, nunca só cor: octógono com "!" (crítica), triângulo (alta), losango (média), círculo (baixa). */
export function Prioridade({ valor }: { valor: string }) {
  return <span className="selo-gravidade" data-gravidade={valor}>
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      {valor === 'critica' && <>
        <path d="M6.5 1h7L19 6.5v7L13.5 19h-7L1 13.5v-7Z" fill="currentColor" />
        <path d="M10 5.5v5.5" stroke="var(--fundo-superficie)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="10" cy="14.2" r="1.2" fill="var(--fundo-superficie)" />
      </>}
      {valor === 'alta' && <path d="M10 2 19 18H1Z" fill="currentColor" />}
      {valor === 'media' && <path d="M10 1 19 10 10 19 1 10Z" fill="currentColor" />}
      {valor !== 'critica' && valor !== 'alta' && valor !== 'media' && <circle cx="10" cy="10" r="8" fill="currentColor" />}
    </svg>
    {prioridade(valor)}
  </span>;
}

export function Status({ valor }: { valor: string }) {
  return <span className="selo-status" data-status={valor}><span className="status-ponto" aria-hidden="true" />{status(valor)}</span>;
}

export function Simulacao() {
  return <span className="selo-simulacao">simulação</span>;
}
