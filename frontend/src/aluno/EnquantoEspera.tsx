import { useEffect, useState } from 'react';
import { obterOrientacoes } from '../shared/api';
import type { Orientacoes } from '../shared/api';
import './orientacoes.css';

/** Carrega os passos de orientação imediata; falha de rede não vira erro na tela. */
function useOrientacoes(situacoes: string[], ativo: boolean) {
  const [dados, setDados] = useState<Orientacoes | null>(null);
  const chave = situacoes.join(',');
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    obterOrientacoes(chave ? chave.split(',') : []).then(d => { if (vivo) setDados(d); }).catch(() => { /* a orientação é um complemento: sem ela a tela segue */ });
    return () => { vivo = false; };
  }, [chave, ativo]);
  return dados;
}

function Passos({ dados }: { dados: Orientacoes }) {
  return <>
    <ul className="passos-espera">{dados.geral.passos.map((p, i) => <li key={i}>{p}</li>)}</ul>
    {dados.situacoes.map(s => <div key={s.id} className="passos-situacao">
      <h3>{s.titulo}</h3>
      <ul className="passos-espera">{s.passos.map((p, i) => <li key={i}>{p}</li>)}</ul>
    </div>)}
    {dados.contatos.length > 0 && <div className="passos-situacao">
      <h3>Onde pedir apoio</h3>
      <ul className="passos-espera">{dados.contatos.map((c, i) => <li key={i}><strong>{c.nome}</strong>{' '}<span>{c.contato}</span></li>)}</ul>
    </div>}
  </>;
}

/** Bloco aberto da tela de confirmação, abaixo do aviso de risco. */
export default function EnquantoEspera({ situacoes = [] }: { situacoes?: string[] }) {
  const dados = useOrientacoes(situacoes, true);
  if (!dados) return null;
  return <section className="cartao enquanto-espera" aria-labelledby="titulo-espera">
    <h2 id="titulo-espera">{dados.geral.titulo}</h2>
    <Passos dados={dados} />
  </section>;
}

/** Versão recolhida para o Acompanhar: só busca quando a pessoa abre. */
export function EnquantoEsperaRecolhivel({ situacoes = [] }: { situacoes?: string[] }) {
  const [aberto, setAberto] = useState(false);
  const dados = useOrientacoes(situacoes, aberto);
  return <details className="recolhivel enquanto-espera-recolhivel" onToggle={e => setAberto(e.currentTarget.open)}>
    <summary>Enquanto você espera</summary>
    {dados ? <Passos dados={dados} /> : <p className="texto-pequeno">{aberto ? 'Carregando orientações…' : ''}</p>}
  </details>;
}
