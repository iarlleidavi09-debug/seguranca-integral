import { useEffect, useRef } from 'react';
import type { CasoDetalhe } from '../shared/api';
import { dataLegivel, desfecho as nomeDesfecho } from './rotulos';

const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
const ROTULO_SITUACAO: Record<string, string> = { melhorou: 'Melhorou', voltou: 'Voltou a acontecer' };

/**
 * Acompanhamento depois da resolução: aviso de recorrência pendente, resolução mais recente e históricos.
 * Quem chama grava a revisão, recarrega o caso e trata o 409; a falha volta como exceção.
 */
export default function PosResolucao({ caso, aoRevisar, ocupado }: {
  caso: CasoDetalhe;
  aoRevisar: () => Promise<void>;
  ocupado: boolean;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const montado = useRef(true);
  // o alerta é anunciado só na primeira exibição; as renderizações seguintes não repetem o anúncio
  const jaMostrou = useRef(false);
  const falado = caso.recorrencia_pendente && !jaMostrou.current;
  useEffect(() => { jaMostrou.current = caso.recorrencia_pendente; }, [caso.recorrencia_pendente]);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const resolucao = caso.resolucoes.length ? caso.resolucoes[caso.resolucoes.length - 1] : null;

  async function revisar() {
    try {
      await aoRevisar();
      if (montado.current) titulo.current?.focus();
    } catch {
      // quem chama mostra o erro; o botão estava desabilitado durante o envio e perdeu o foco
      if (montado.current) setTimeout(() => botao.current?.focus(), 0);
    }
  }

  return <section className="pos-resolucao" aria-labelledby="titulo-pos-resolucao">
    <h2 id="titulo-pos-resolucao" ref={titulo} tabIndex={-1}>Acompanhamento após a resolução</h2>
    {caso.recorrencia_pendente && <div className="recorrencia" aria-labelledby="titulo-recorrencia-caso" role={falado ? 'alert' : undefined}>
      <svg className="recorrencia-icone" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M12 2 23 21H1Z" fill="currentColor" />
        <path d="M12 9v6" stroke="var(--recorrencia-fundo)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="17.8" r="1.2" fill="var(--recorrencia-fundo)" />
      </svg>
      <div>
        <h3 id="titulo-recorrencia-caso">Situação voltou a acontecer</h3>
        <p>Revise o resultado da intervenção anterior e avalie medidas mais efetivas</p>
      </div>
      <button type="button" ref={botao} className="botao" disabled={ocupado} onClick={() => void revisar()}>Registrar revisão</button>
    </div>}

    <h3>Resolução mais recente</h3>
    {resolucao === null ? <p className="vazio">Nenhuma resolução registrada.</p> : <div className="pos-registro">
      <p className="pos-quem"><b>{maiuscula(nomeDesfecho(resolucao.desfecho))}</b> por {resolucao.usuario ?? 'pessoa da coordenação'}, <time dateTime={resolucao.criado_em}>{dataLegivel(resolucao.criado_em)}</time></p>
      <dl className="detalhes">
        <dt>Providências</dt><dd>{resolucao.providencias}</dd>
        <dt>Resultado observado</dt><dd>{resolucao.resultado || 'Sem resultado informado'}</dd>
      </dl>
    </div>}

    {caso.situacoes.length > 0 && <>
      <h3>Situações informadas pelo aluno</h3>
      <ul className="pos-lista">
        {caso.situacoes.map((s, i) => <li key={i}>{`${ROTULO_SITUACAO[s.situacao] ?? s.situacao}, ${dataLegivel(s.criado_em)}`}</li>)}
      </ul>
    </>}

    {caso.revisoes_recorrencia.length > 0 && <>
      <h3>Revisões da recorrência</h3>
      <ul className="pos-lista">
        {caso.revisoes_recorrencia.map((r, i) => <li key={i}>{`Revisado por ${r.usuario ?? 'pessoa da coordenação'}, ${dataLegivel(r.criado_em)}`}</li>)}
      </ul>
    </>}
  </section>;
}
