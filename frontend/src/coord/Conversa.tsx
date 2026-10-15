import { dataLegivel } from './rotulos';

export const TEXTO_MAX = 2000;
export type Item = { chave: number; autor: string; texto: string; criado_em: string; lado?: string };

export default function Conversa({ titulo, campo, rotulo, ajuda, botao, itens, texto, aoMudar, aoEnviar, enviando }: {
  titulo: string; campo: string; rotulo: string; ajuda: string; botao: string; texto: string; enviando: boolean; itens: Item[];
  aoMudar: (valor: string) => void; aoEnviar: () => void;
}) {
  return <div>
    <h2 className="titulo-painel">{titulo}</h2>
    {itens.length === 0 ? <p className="vazio">Nada por aqui ainda.</p> : <ul className="mensagens">
      {itens.map(i => <li key={i.chave} className="mensagem" data-autor={i.lado}>
        <h3>{i.autor}</h3><p>{i.texto}</p><time dateTime={i.criado_em}>{dataLegivel(i.criado_em)}</time>
      </li>)}
    </ul>}
    <form className="resposta" onSubmit={e => { e.preventDefault(); aoEnviar(); }}>
      <label htmlFor={campo}>{rotulo}</label>
      <p className="texto-pequeno">{ajuda}</p>
      <textarea id={campo} rows={4} maxLength={TEXTO_MAX} value={texto} onChange={e => aoMudar(e.target.value)} />
      <p className="texto-pequeno contador">{texto.length} de {TEXTO_MAX}</p>
      <button type="submit" className="botao principal" disabled={enviando}>{botao}</button>
    </form>
  </div>;
}
