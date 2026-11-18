import { useState } from 'react';
import type { ResultadoDenuncia } from '../shared/api';
import { TEXTO_ORIENTACAO } from './situacoes';
import { copiarTexto } from '../shared/copiarTexto';
import EnquantoEspera from './EnquantoEspera';
import './comprovante.css';

export default function Confirmacao({ resultado, onAcompanhar, orientacao = false, respostasNaoEnviadas = false, situacoes = [] }: { resultado: ResultadoDenuncia; onAcompanhar: () => void; orientacao?: boolean; respostasNaoEnviadas?: boolean; situacoes?: string[] }) {
  const [aviso, setAviso] = useState('');
  async function copiar() {
    setAviso(await copiarTexto(resultado.codigo)
      ? 'Código copiado. Guarde em um lugar seguro.'
      : 'Não foi possível copiar. Anote o código ou selecione o texto para copiar.');
  }
  return <section className="confirmacao">
    <h1>Você deu o primeiro passo.</h1>
    <p>Seu pedido chegou à coordenação. Use o código abaixo neste portal para acompanhar e conversar com a equipe.</p>
    <div className="codigo-bloco comprovante-codigo" role="region" aria-label="Comprovante de acompanhamento">
      <h2>Seu código de acompanhamento</h2>
      <p className="codigo">{resultado.codigo}</p>
      <div className="comprovante-acoes">
        <button className="botao secundario" onClick={() => void copiar()}>Copiar código</button>
        <button className="botao secundario" onClick={() => window.print()}>Imprimir ou salvar comprovante</button>
      </div>
      <p className="texto-pequeno" role="status">{aviso}</p>
      <p className="comprovante-instrucoes">Abra o portal TETRAGUARD da sua escola, escolha acompanhar um caso e informe este código. Guarde este comprovante em um lugar seguro.</p>
    </div>
    {orientacao && <div className="aviso orientacao" role="status"><p>{TEXTO_ORIENTACAO}</p></div>}
    <EnquantoEspera situacoes={situacoes} />
    <p className="aviso">Anote e guarde seu código. Tentamos salvar o acesso neste navegador para você voltar pelo início. Se usar um aparelho compartilhado, apague o acesso salvo ao terminar.</p>
    {respostasNaoEnviadas && <p className="texto-pequeno">As respostas às perguntas não foram enviadas, mas o seu relato chegou à coordenação.</p>}
    {!!resultado.anexos_recusados?.length && <div className="erro" role="alert"><p>Seu pedido foi recebido, mas estas imagens foram recusadas:</p>
      <ul>{resultado.anexos_recusados.map((anexo, i) => <li key={i}>{anexo.nome}: {anexo.motivo}</li>)}</ul>
    </div>}
    <button className="botao principal" onClick={onAcompanhar}>Acompanhar meu caso</button>
  </section>;
}
