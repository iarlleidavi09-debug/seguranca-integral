import { useState } from 'react';
import { ErroApi, listarPadroes, marcarPadrao, mensagemErroCoord } from '../shared/api';
import type { PadraoObservado } from '../shared/api';
import { usePolling } from './polling';
import './padroes.css';

const dataCurta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

/** Cartões de padrões observados. Sem padrões (ou sem acesso à rota) não ocupa espaço. */
export default function PadroesObservados({ aoAbrirCaso, aoMudar }: {
  aoAbrirCaso: (id: number) => void; aoMudar?: (padroes: PadraoObservado[]) => void;
}) {
  const [padroes, setPadroes] = useState<PadraoObservado[]>([]);
  const [erro, setErro] = useState('');

  const carregar = async (sinal?: AbortSignal, ativo: () => boolean = () => true) => {
    try {
      const lista = await listarPadroes(sinal);
      if (ativo()) { setPadroes(lista); aoMudar?.(lista); }
    } catch (falha) {
      // a lista complementa a visão geral: falha de leitura não derruba a tela
      if (ativo() && !(falha instanceof ErroApi && falha.status === 401)) { setPadroes([]); aoMudar?.([]); }
    }
  };
  usePolling((sinal, ativo) => carregar(sinal, ativo), []);

  const marcar = async (chave: string, estado: 'novo' | 'acompanhando' | 'descartado') => {
    try { await marcarPadrao(chave, estado); setErro(''); } catch (falha) { setErro(mensagemErroCoord(falha)); }
    await carregar();
  };

  if (padroes.length === 0 && !erro) return null;
  return <section className="padroes" aria-labelledby="titulo-padroes">
    <h2 id="titulo-padroes">Padrões observados</h2>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {padroes.map(p => <article key={p.chave} className="padrao" aria-label={`Padrão observado: ${p.texto}`}>
      <h3>Padrão observado{p.estado === 'acompanhando' && <span className="padrao-estado">Em acompanhamento</span>}</h3>
      <p>{p.texto}</p>
      <p className="padrao-periodo texto-pequeno">{p.contagem} casos, de {dataCurta(p.primeiro_em)} a {dataCurta(p.ultimo_em)}</p>
      <details className="padrao-casos">
        <summary>Ver os {p.casos.length} casos</summary>
        <ul>{p.casos.map(id => <li key={id}><button type="button" className="botao secundario" onClick={() => aoAbrirCaso(id)}>Abrir caso {id}</button></li>)}</ul>
      </details>
      <div className="padrao-acoes">
        {p.estado === 'acompanhando'
          ? <button type="button" className="botao secundario" onClick={() => void marcar(p.chave, 'novo')}>Parar de acompanhar</button>
          : <button type="button" className="botao secundario" onClick={() => void marcar(p.chave, 'acompanhando')}>Acompanhar</button>}
        <button type="button" className="botao secundario" onClick={() => void marcar(p.chave, 'descartado')}>Descartar</button>
      </div>
    </article>)}
  </section>;
}
