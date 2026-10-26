import { useEffect, useRef } from 'react';

export type Tela =
  | { nome: 'geral' } | { nome: 'atendimento' } | { nome: 'casos' } | { nome: 'pos' }
  | { nome: 'mapa' } | { nome: 'relatorios' } | { nome: 'caso'; id: number } | { nome: 'usuarios' } | { nome: 'ensaio' };

type Destino = 'atendimento' | 'mapa' | 'geral' | 'casos' | 'pos' | 'usuarios' | 'ensaio' | 'relatorios';

const ICONES: Record<Destino, string> = {
  geral: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  atendimento: 'M8 7h12v14H4V7h4 M8 7V3h8v4 M9 13h6 M9 17h4',
  casos: 'M3 6h7l2 3h9v11H3z M3 6V4h7l2 2h7v3',
  pos: 'M4 12a8 8 0 1 0 2-5 M4 3v5h5 M9 12l2 2 4-4',
  mapa: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',
  usuarios: 'M15 21v-3a5 5 0 0 0-10 0v3 M14 5a4 4 0 1 1 0 6 M19 14a4 4 0 0 1 3 4v3 M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  ensaio: 'M9 3h6 M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3 M8 14h8',
  relatorios: 'M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5',
};

const ITENS: { nome: Destino; rotulo: string }[] = [
  { nome: 'geral', rotulo: 'Visão geral' }, { nome: 'atendimento', rotulo: 'Meu atendimento' }, { nome: 'casos', rotulo: 'Casos' }, { nome: 'pos', rotulo: 'Pós-resolução' },
  { nome: 'mapa', rotulo: 'Mapa da escola' },
  { nome: 'relatorios', rotulo: 'Relatórios' },
  { nome: 'usuarios', rotulo: 'Usuários' }, { nome: 'ensaio', rotulo: 'Ensaio' },
];

/** Barra lateral; abaixo de 760 px o CSS a transforma em barra superior rolável. */
export default function Navegacao({ tela, admin, pendencias, aoIr }: {
  tela: Tela; admin: boolean; pendencias: number; aoIr: (tela: Tela) => void;
}) {
  const atual = useRef<HTMLButtonElement>(null);
  // na barra rolável do celular, o item atual precisa estar à vista
  // o selo da contagem chega depois e desloca os itens: rola de novo quando ele muda e depois que o layout assenta
  useEffect(() => {
    const rolar = () => atual.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    rolar();
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => { segundo = requestAnimationFrame(rolar); });
    return () => { cancelAnimationFrame(primeiro); cancelAnimationFrame(segundo); };
  }, [tela.nome, pendencias]);
  return <nav aria-label="Principal" className="coord-nav">
    {ITENS.filter(i => admin || i.nome !== 'usuarios').map(i => {
      // o detalhe de um caso pertence ao item Casos
      const aqui = tela.nome === i.nome || (i.nome === 'casos' && tela.nome === 'caso');
      return <button key={i.nome} ref={aqui ? atual : undefined} type="button" className="nav-item" aria-current={aqui ? 'page' : undefined}
        onClick={() => aoIr({ nome: i.nome })}>
        <svg className="nav-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONES[i.nome]} /></svg>
        {i.rotulo}
        {i.nome === 'pos' && pendencias > 0 && <>
          {' '}
          <span className="nav-contagem" aria-hidden="true">{pendencias}</span>
          <span className="so-leitor">{pendencias === 1 ? '1 pendente' : `${pendencias} pendentes`}</span>
        </>}
      </button>;
    })}
  </nav>;
}
