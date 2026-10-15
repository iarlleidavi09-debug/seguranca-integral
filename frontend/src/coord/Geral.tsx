import { useRef, useState } from 'react';
import { ErroApi, listarCasos, mensagemErroCoord, obterResumo } from '../shared/api';
import type { CasoFila, FiltrosFila, Resumo } from '../shared/api';
import { usePolling } from './polling';
import { Prioridade, PRIORIDADES, Status, acessoLegivel, tipo as rotuloDoTipo } from './rotulos';

const SEM_FILTROS: FiltrosFila = { status: '', prioridade: '', tipo: '', q: '' };
const LIMITE_ATENCAO = 5;
const CARTOES = [
  { status: 'novo', nome: 'Aguardando o primeiro olhar', apoio: 'Pedidos novos' },
  { status: 'em_investigacao', nome: 'Investigação em andamento', apoio: 'Em cuidado pela equipe' },
  { status: 'resolvido', nome: 'Resolvidos', apoio: 'Atendimentos concluídos' },
] as const;

type Panorama = { resumo: Resumo; casos: CasoFila[] };

export default function Geral({ aoVerCasos, aoAbrirCaso, aoResumo }: {
  aoVerCasos: (parcial: Partial<FiltrosFila>) => void; aoAbrirCaso: (id: number) => void; aoResumo?: (pendentes: number) => void;
}) {
  const [dados, setDados] = useState<Panorama | null>(null);
  const [erro, setErro] = useState('');
  // o alerta falado vale só para a primeira exibição do bloco de recorrência
  const [alertaFalado, setAlertaFalado] = useState(false);

  // o bloco de recorrência só dispara o alerta falado na primeira exibição seguida
  const exibiuBloco = useRef(false);

  usePolling(async (sinal, ativo) => {
    try {
      const [resumo, casos] = await Promise.all([obterResumo(sinal), listarCasos(SEM_FILTROS, sinal)]);
      if (!ativo()) return;
      setDados({ resumo, casos }); setErro('');
      aoResumo?.(resumo.recorrencia_pendente);
      if (resumo.recorrencia_pendente > 0 && !exibiuBloco.current) { exibiuBloco.current = true; setAlertaFalado(true); }
      else setAlertaFalado(false);
      if (resumo.recorrencia_pendente === 0) exibiuBloco.current = false;
    } catch (falha) {
      if (!ativo()) return;
      if (falha instanceof ErroApi && falha.status === 401) return;
      setErro(mensagemErroCoord(falha));
    }
  }, []);

  const resumo = dados?.resumo;
  const pendente = resumo && resumo.recorrencia_pendente > 0 ? dados.casos.find(c => c.recorrencia_pendente) : undefined;
  const atencao = dados ? dados.casos.filter(c => c.status !== 'resolvido').slice(0, LIMITE_ATENCAO) : [];
  const vazia = Boolean(dados) && dados!.casos.length === 0 && Object.values(dados!.resumo.status).every(n => n === 0);

  return <section aria-labelledby="titulo-geral" className="geral">
    <h1 id="titulo-geral" tabIndex={-1}>Cada pedido merece atenção.</h1>
    <p className="geral-intro">Organize os próximos cuidados, junto com a sua equipe.</p>
    {erro && <p className="erro" role="alert">{erro} A visão geral tenta de novo sozinha.</p>}
    {!dados && !erro && <p className="vazio">Carregando o panorama.</p>}
    {dados && resumo && <>
      {resumo.recorrencia_pendente > 0 && <section className="recorrencia" aria-labelledby="titulo-recorrencia" role={alertaFalado ? 'alert' : undefined}>
        <svg className="recorrencia-icone" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path d="M12 2 23 21H1Z" fill="currentColor" />
          <path d="M12 9v6" stroke="var(--recorrencia-fundo)" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="12" cy="17.8" r="1.2" fill="var(--recorrencia-fundo)" />
        </svg>
        <div>
          <h2 id="titulo-recorrencia">Um cuidado precisa ser retomado</h2>
          <p>{pendente ? `Caso ${pendente.id}: a situação voltou a acontecer. Revise a intervenção anterior e avalie medidas mais efetivas.`
            : 'Uma situação já resolvida voltou a acontecer. Revise a intervenção anterior e avalie medidas mais efetivas.'}</p>
        </div>
        {pendente && <button type="button" className="botao secundario" onClick={() => aoAbrirCaso(pendente.id)}>Abrir caso {pendente.id}</button>}
      </section>}

      <div className="geral-cartoes">
        {CARTOES.map(c => <button key={c.status} type="button" className="geral-cartao" onClick={() => aoVerCasos({ status: c.status })}>
          <span className="geral-cartao-nome">{c.nome}</span>
          <strong>{resumo.status[c.status]}</strong>
          <span className="geral-cartao-apoio">{c.apoio}</span>
        </button>)}
      </div>

      <h2 id="titulo-prioridades" className="geral-subtitulo">Por prioridade</h2>
      <ul className="geral-prioridades" aria-labelledby="titulo-prioridades">
        {PRIORIDADES.map(p => {
          const n = resumo.prioridade[p];
          const destaque = (p === 'critica' || p === 'alta') && n > 0;
          return <li key={p} data-gravidade={p} data-destaque={destaque ? 'sim' : 'nao'}>
            <Prioridade valor={p} /><strong>{n}</strong>
          </li>;
        })}
      </ul>

      <h2 id="titulo-atencao" className="geral-subtitulo">Onde concentrar a atenção</h2>
      {vazia && <p className="vazio">Nenhum pedido por enquanto.</p>}
      {!vazia && atencao.length === 0 && <p className="vazio">Nenhum pedido aguardando atenção agora.</p>}
      {atencao.length > 0 && <ul className="fila" aria-labelledby="titulo-atencao">
        {atencao.map(c => <li key={c.id} className="fila-item" data-gravidade={c.prioridade}>
          <button type="button" className="fila-linha geral-linha" onClick={() => aoAbrirCaso(c.id)}>
            <span className="fila-gravidade"><Prioridade valor={c.prioridade} /></span>
            <span className="fila-tipo"><strong>{rotuloDoTipo(c.tipo)}</strong></span>
            <span className="fila-resumo">{c.resumo}</span>
            <span className="fila-status"><Status valor={c.status} /></span>
            <span className="fila-data">{acessoLegivel(c.ultimo_acesso_por, c.ultimo_acesso_em)}</span>
            <span className="so-leitor">Caso {c.id}. Abrir.</span>
          </button>
        </li>)}
      </ul>}
    </>}
  </section>;
}
