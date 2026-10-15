export type Tela =
  | { nome: 'geral' } | { nome: 'casos' } | { nome: 'pos' }
  | { nome: 'caso'; id: number } | { nome: 'usuarios' } | { nome: 'ensaio' };

type Destino = 'geral' | 'casos' | 'pos' | 'usuarios' | 'ensaio';

const ITENS: { nome: Destino; rotulo: string }[] = [
  { nome: 'geral', rotulo: 'Visão geral' }, { nome: 'casos', rotulo: 'Casos' }, { nome: 'pos', rotulo: 'Pós-resolução' },
  { nome: 'usuarios', rotulo: 'Usuários' }, { nome: 'ensaio', rotulo: 'Ensaio' },
];

/** Barra lateral; abaixo de 760 px o CSS a transforma em barra superior rolável. */
export default function Navegacao({ tela, admin, pendencias, aoIr }: {
  tela: Tela; admin: boolean; pendencias: number; aoIr: (tela: Tela) => void;
}) {
  return <nav aria-label="Principal" className="coord-nav">
    {ITENS.filter(i => admin || i.nome !== 'usuarios').map(i => {
      // o detalhe de um caso pertence ao item Casos
      const aqui = tela.nome === i.nome || (i.nome === 'casos' && tela.nome === 'caso');
      return <button key={i.nome} type="button" className="nav-item" aria-current={aqui ? 'page' : undefined}
        onClick={() => aoIr({ nome: i.nome })}>
        {i.rotulo}
        {i.nome === 'pos' && pendencias > 0 && <>
          <span className="nav-contagem" aria-hidden="true">{pendencias}</span>
          <span className="so-leitor">{pendencias === 1 ? '1 pendente' : `${pendencias} pendentes`}</span>
        </>}
      </button>;
    })}
  </nav>;
}
