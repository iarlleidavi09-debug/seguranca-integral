import { useEffect, useRef, useState } from 'react';
import { ErroApi, mensagemErro } from '../shared/api';
import type { Caso, Situacao } from '../shared/api';
import { dataLegivel, rotuloDesfecho } from './rotulos';

const rotuloSituacao: Record<Situacao, string> = { melhorou: 'Melhorou', voltou: 'Voltou a acontecer' };
const agradecimento: Record<Situacao, string> = {
  melhorou: 'Obrigado por contar. A equipe vai ver.',
  voltou: 'Obrigado por contar. A equipe vai rever o que foi feito.',
};

export default function PosResolucao({ caso, aoInformar, ocupado }: { caso: Caso; aoInformar: (s: Situacao) => Promise<void>; ocupado: boolean }) {
  const [obrigado, setObrigado] = useState('');
  const [falha, setFalha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [focar, setFocar] = useState(0);
  const travado = useRef(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focar) titulo.current?.focus(); }, [focar]);
  const { resolucao } = caso;
  if (!caso.pos_resolucao || !resolucao) return null;

  async function informar(situacao: Situacao) {
    if (travado.current) return;
    travado.current = true; setEnviando(true); setFalha(''); setObrigado('');
    try {
      await aoInformar(situacao);
      setObrigado(agradecimento[situacao]); setFocar(n => n + 1);
    } catch (erro) {
      setFalha(erro instanceof ErroApi && erro.status === 429
        ? 'Muitas tentativas. Tente de novo em alguns minutos.'
        : mensagemErro(erro, 'situacao'));
    } finally { setEnviando(false); travado.current = false; }
  }
  const desabilitado = ocupado || enviando;
  return <section className="pos-resolucao" aria-labelledby="titulo-pos-resolucao">
    <h2 id="titulo-pos-resolucao" ref={titulo} tabIndex={-1}>Seu caso foi resolvido</h2>
    <p className="pos-desfecho">{rotuloDesfecho(resolucao.desfecho)}</p>
    <h3>O que foi feito</h3>
    <p className="texto-livre">{resolucao.providencias}</p>
    <h3>Resultado</h3>
    <p className="texto-livre">{resolucao.resultado}</p>
    <time className="texto-pequeno" dateTime={resolucao.criado_em}>{dataLegivel(resolucao.criado_em)}</time>
    <div className="pos-pergunta">
      <h3>Como você está agora?</h3>
      {caso.ultima_situacao && <p className="texto-pequeno">Você informou: {rotuloSituacao[caso.ultima_situacao]}</p>}
      <div className="pos-botoes">
        <button type="button" className="botao secundario" disabled={desabilitado} onClick={() => void informar('melhorou')}>Melhorou</button>
        <button type="button" className="botao secundario" disabled={desabilitado} onClick={() => void informar('voltou')}>Voltou a acontecer</button>
      </div>
      <p role="status">{obrigado}</p>
      {falha && <p role="alert" className="erro">{falha}</p>}
    </div>
  </section>;
}
