import { useState } from 'react';
import type { ResultadoDenuncia } from '../shared/api';
import { TEXTO_ORIENTACAO } from './situacoes';

export default function Confirmacao({ resultado, onAcompanhar, orientacao = false, respostasNaoEnviadas = false }: { resultado: ResultadoDenuncia; onAcompanhar: () => void; orientacao?: boolean; respostasNaoEnviadas?: boolean }) {
  const [aviso, setAviso] = useState('');
  async function copiar() {
    try { await navigator.clipboard.writeText(resultado.codigo); setAviso('Código copiado. Guarde em um lugar seguro.'); }
    catch { setAviso('Não foi possível copiar. Anote o código ou selecione o texto para copiar.'); }
  }
  return <section className="confirmacao">
    <h1>Você deu o primeiro passo.</h1>
    <p>Seu pedido chegou à coordenação. Use o código abaixo para acompanhar e conversar com a escola.</p>
    <div className="codigo-bloco">
      <h2>Seu código de acompanhamento</h2>
      <p className="codigo">{resultado.codigo}</p>
      <button className="botao secundario" onClick={() => void copiar()}>Copiar código</button>
      <p className="texto-pequeno" role="status">{aviso}</p>
    </div>
    {orientacao && <div className="aviso orientacao"><p>{TEXTO_ORIENTACAO}</p></div>}
    <p className="aviso">Anote e guarde seu código. Ele só aparece nesta confirmação. Você vai precisar dele para voltar ao caso.</p>
    {respostasNaoEnviadas && <p className="texto-pequeno">As respostas às perguntas não foram enviadas, mas o seu relato chegou à coordenação.</p>}
    {!!resultado.anexos_recusados?.length && <div className="erro" role="alert"><p>Seu pedido foi recebido, mas estas imagens foram recusadas:</p>
      <ul>{resultado.anexos_recusados.map((anexo, i) => <li key={i}>{anexo.nome}: {anexo.motivo}</li>)}</ul>
    </div>}
    <button className="botao principal" onClick={onAcompanhar}>Acompanhar meu caso</button>
  </section>;
}
