import { useRef, useState } from 'react';
import { ErroApi, listarCasos, mensagemErroCoord, obterResumo } from '../shared/api';
import type { CasoFila, FiltrosFila, Resumo } from '../shared/api';
import { usePolling } from './polling';
import PadroesObservados from './PadroesObservados';
import { Prioridade, PRIORIDADES, Simulacao, Status, acessoLegivel, assuntos, rotuloPrioridade } from './rotulos';

const SEM_FILTROS: FiltrosFila = { status: '', prioridade: '', tipo: '', q: '' };
const LIMITE_ATENCAO = 5;
const CARTOES = [
  { status: 'novo', nome: 'Aguardando o primeiro olhar' },
  { status: 'em_investigacao', nome: 'Investigação em andamento' },
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
      const [resumo, casos] = await Promise.all([obterResumo(sinal, true), listarCasos(SEM_FILTROS, sinal)]);
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
  const pendente = resumo && resumo.recorrencia_pendente > 0 ? dados.casos.find(c => c.recorrencia_pendente && c.status !== 'resolvido') : undefined;
  const atencao = dados ? dados.casos.filter(c => c.status !== 'resolvido').slice(0, LIMITE_ATENCAO) : [];
  const proximosPassos = dados ? dados.casos
    .filter(c => c.status !== 'resolvido' && c.proxima_acao?.trim())
    .sort((a, b) => (a.prazo_acao || '9999-12-31').localeCompare(b.prazo_acao || '9999-12-31'))
    .slice(0, LIMITE_ATENCAO) : [];
  const vazia = Boolean(dados) && dados!.casos.every(c => c.status === 'resolvido') && dados!.resumo.status.novo === 0 && dados!.resumo.status.em_investigacao === 0;

  return <section aria-labelledby="titulo-geral" className="geral">
    <header className="geral-cabecalho">
      <h1 id="titulo-geral" tabIndex={-1}>Cada pedido merece atenção.</h1>
      <p>Consulte os pedidos recebidos, acompanhe as providências e retome os casos que precisam de atenção. Os indicadores abaixo ajudam a organizar a leitura; a avaliação de cada situação cabe à equipe.</p>
    </header>
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
          {pendente?.simulacao && <Simulacao />}
        </div>
        {pendente && <button type="button" className="botao secundario" onClick={() => aoAbrirCaso(pendente.id)}>Abrir caso {pendente.id}</button>}
      </section>}

      <div className="geral-cartoes">
        {CARTOES.map(c => <button key={c.status} type="button" className="geral-cartao" onClick={() => aoVerCasos({ status: c.status })}>
          <span className="geral-cartao-nome">{c.nome}</span>
          <strong>{resumo.status[c.status]}</strong>
        </button>)}
      </div>

      <PadroesObservados aoAbrirCaso={aoAbrirCaso} />

      <div className="geral-corpo">
        <section className="geral-pedidos" aria-labelledby="titulo-atencao">
          <h2 id="titulo-atencao" className="geral-subtitulo">Onde concentrar a atenção</h2>
          {vazia && <p className="vazio">Nenhum pedido em aberto.</p>}
          {!vazia && atencao.length === 0 && <p className="vazio">Nenhum pedido aguardando atenção agora.</p>}
          {atencao.length > 0 && <ul className="fila" aria-labelledby="titulo-atencao">
            {atencao.map(c => <li key={c.id} className="fila-item" data-gravidade={c.prioridade}>
              <button type="button" className="fila-linha geral-linha" onClick={() => aoAbrirCaso(c.id)}>
                <span className="fila-gravidade"><Prioridade valor={c.prioridade} /></span>
                <span className="fila-tipo"><strong>{assuntos(c)}</strong> {c.simulacao && <Simulacao />}</span>
                <span className="fila-resumo">{c.resumo}</span>
                <span className="fila-status"><Status valor={c.status} /></span>
                <span className="fila-data">{acessoLegivel(c.ultimo_acesso_por, c.ultimo_acesso_em)}</span>
                <span className="so-leitor">Caso {c.id}. Abrir.</span>
              </button>
            </li>)}
          </ul>}
        </section>
        <aside className="geral-organizacao" aria-label="Organização dos casos">
          <section className="geral-passos" aria-labelledby="titulo-passos">
            <h2 id="titulo-passos">Próximos passos</h2>
            {proximosPassos.length === 0 ? <p className="texto-pequeno">Nenhum próximo passo registrado nos casos em aberto.</p> : <ul>
              {proximosPassos.map(c => <li key={c.id}>
                <button type="button" onClick={() => aoAbrirCaso(c.id)}>{c.proxima_acao} {c.simulacao && <Simulacao />}<span className="so-leitor">. Abrir caso {c.id}.</span></button>
                <p className="texto-pequeno">Caso {c.id} · {c.responsavel?.nome || 'Sem responsável'}</p>
                <p className="texto-pequeno">{c.prazo_acao ? <time dateTime={c.prazo_acao}>{c.prazo_acao.split('-').reverse().join('/')}</time> : 'Sem prazo registrado'}</p>
              </li>)}
            </ul>}
          </section>
          <section className="geral-prioridades-bloco" aria-labelledby="titulo-prioridades">
            <h2 id="titulo-prioridades" className="geral-subtitulo">Por prioridade</h2>
            <ul className="geral-prioridades" aria-labelledby="titulo-prioridades">
              {PRIORIDADES.map(p => {
                const n = resumo.prioridade[p];
                const destaque = (p === 'critica' || p === 'alta') && n > 0;
                return <li key={p} data-gravidade={p} data-destaque={destaque ? 'sim' : 'nao'}>
                  <button type="button" className="geral-prioridade-botao" aria-label={`${rotuloPrioridade[p]}: ${n} casos em aberto. Ver casos.`} onClick={() => aoVerCasos({ prioridade: p, status: 'abertos' })}>
                    <Prioridade valor={p} /><strong>{n}</strong>
                  </button>
                </li>;
              })}
            </ul>
          </section>
        </aside>
      </div>
      <p className="geral-rodape texto-pequeno">Informações internas da equipe escolar.</p>
    </>}
  </section>;
}
