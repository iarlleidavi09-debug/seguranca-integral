import { useEffect, useRef, useState } from 'react';
import { mensagemErroCoord, obterRelatorio } from '../shared/api';
import type { Relatorio } from '../shared/api';
import { usePolling } from './polling';

function dataLocal(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const rotulo = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const LINHAS_PRIORIDADE = [
  { campo: 'critica', nome: 'Crítica', cor: 'var(--prioridade-critica-texto)', traco: undefined },
  { campo: 'alta', nome: 'Alta', cor: 'var(--gravidade-alta-texto)', traco: '10 4' },
  { campo: 'media', nome: 'Média', cor: 'var(--gravidade-media-texto)', traco: '3 4' },
  { campo: 'baixa', nome: 'Baixa', cor: 'var(--gravidade-baixa-texto)', traco: '12 4 3 4' },
] as const;

const CONSULTA_ESTREITA = '(max-width: 599px)';
function useTelaEstreita() {
  const [estreita, setEstreita] = useState(() => window.matchMedia?.(CONSULTA_ESTREITA)?.matches ?? false);
  useEffect(() => {
    const consulta = window.matchMedia?.(CONSULTA_ESTREITA);
    if (!consulta) return;
    const atualizar = () => setEstreita(consulta.matches);
    atualizar();
    consulta.addEventListener?.('change', atualizar);
    return () => consulta.removeEventListener?.('change', atualizar);
  }, []);
  return estreita;
}

export default function Relatorios() {
  const telaEstreita = useTelaEstreita();
  const [periodo, setPeriodo] = useState(() => ({ inicio: dataLocal(new Date(Date.now() - 29 * 86400000)), fim: dataLocal(new Date()) }));
  const [filtro, setFiltro] = useState(periodo);
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState('');
  const [visualizacao, setVisualizacao] = useState<'dia' | 'acumulado' | 'prioridade'>('dia');
  usePolling(async (sinal, ativo) => {
    try {
      const r = await obterRelatorio(periodo.inicio, periodo.fim, sinal);
      if (ativo()) { setDados(r); setErro(''); }
    } catch (e) { if (ativo()) setErro(mensagemErroCoord(e)); }
  }, [periodo.inicio, periodo.fim]);
  let recebidos = 0, resolvidos = 0;
  const serie = (dados?.evolucao ?? []).map(d => {
    recebidos += d.recebidos; resolvidos += d.resolvidos;
    return visualizacao === 'acumulado' ? { ...d, recebidos, resolvidos } : d;
  });
  const seriePrioridades = dados?.evolucao_prioridades ?? [];
  const linhas = visualizacao === 'prioridade' ? LINHAS_PRIORIDADE.map(p => ({ ...p, valores: seriePrioridades.map(d => d[p.campo]) })) : [
    { campo: 'recebidos', nome: 'Recebidos', cor: 'var(--primaria-base)', traco: undefined, valores: serie.map(d => d.recebidos) },
    { campo: 'resolvidos', nome: 'Primeira resolução', cor: 'var(--sucesso-texto)', traco: '7 5', valores: serie.map(d => d.resolvidos) },
  ];
  const maximo = Math.ceil(Math.max(1, ...linhas.flatMap(l => l.valores)) / 2) * 2;
  const pontos = (valores: number[]) => valores.map((n, i) =>
    `${48 + i * 800 / Math.max(1, valores.length - 1)},${210 - n * 170 / maximo}`).join(' ');
  // Sempre a série diária bruta, para que o modo acumulado não infle a contagem.
  const diasComDados = (dados?.evolucao ?? []).filter(d => d.recebidos > 0 || d.resolvidos > 0).length;
  const tituloGrafico = visualizacao === 'prioridade' ? 'Evolução diária por prioridade' : visualizacao === 'acumulado' ? 'Recebidos e resolvidos acumulados' : 'Recebidos e resolvidos por dia';
  const prioridades = dados && <>
    {dados.prioridades.length === 0 ? <p>Sem pedidos no período.</p> : dados.prioridades.map(p => <div className="prioridade-barra" key={p.prioridade}>
      <span>{{ critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' }[p.prioridade] ?? p.prioridade}</span><strong>{p.quantidade}</strong>
      <progress max={dados.recebidos || 1} value={p.quantidade} aria-label={`Prioridade ${p.prioridade}`} />
    </div>)}
  </>;
  const linhasTabela = visualizacao === 'prioridade' ? seriePrioridades : serie;
  const legendaTabela = visualizacao === 'acumulado' ? 'Totais acumulados a partir do início do período' : visualizacao === 'prioridade' ? 'Pedidos por dia e prioridade atual' : 'Totais diários do período selecionado';
  const area = useRef<HTMLDivElement>(null), grafico = useRef<SVGSVGElement>(null);
  const [larguraGrafico, setLarguraGrafico] = useState(0);
  const pronto = dados?.inicio === periodo.inicio && dados?.fim === periodo.fim;
  // Mede a largura renderizada do SVG (viewBox de 900): o texto encolhe junto com ele, então o tamanho da fonte
  // em unidades do viewBox cresce para manter pelo menos 14 px efetivos (e nunca abaixo disso).
  useEffect(() => {
    const medir = () => setLarguraGrafico(grafico.current?.getBoundingClientRect?.()?.width ?? 0);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [pronto, visualizacao]);
  const tamanhoRotulo = larguraGrafico > 0 && larguraGrafico < 900 ? 14 * 900 / larguraGrafico : 14;
  // Ao montar e ao trocar visualização/período, a área rolável vai até o último dia com dados: é o trecho mais
  // útil e evita mostrar uma linha zerada quando os dados estão à direita fora da janela.
  const ultimoComDados = (dados?.evolucao ?? []).reduce((u, d, i) => d.recebidos > 0 || d.resolvidos > 0 ? i : u, -1);
  const totalDias = dados?.evolucao.length ?? 0;
  useEffect(() => {
    const el = area.current;
    if (!el || !pronto || ultimoComDados < 0) return;
    const escala = larguraGrafico > 0 ? larguraGrafico / 900 : 1;
    const x = 48 + ultimoComDados * 800 / Math.max(1, totalDias - 1);
    el.scrollLeft = Math.max(0, (x + 24) * escala - (el.clientWidth ?? 0));
  }, [pronto, visualizacao, periodo.inicio, periodo.fim, ultimoComDados, totalDias, larguraGrafico]);
  return <section className="relatorios" aria-labelledby="titulo-relatorios">
    <div className="relatorio-cabecalho"><div><h1 id="titulo-relatorios">Evolução do atendimento</h1>
      <p className="texto-secundario">Acompanhe a entrada de pedidos e a primeira resolução de cada caso.</p></div>
      <div className="relatorio-exportar">{pronto && !erro && <details className="acoes-recolhidas">
        <summary>Exportar relatório</summary><div className="acoes-recolhidas-conteudo">
        <a className="botao secundario" href={`/api/relatorios?${new URLSearchParams({ ...periodo, formato: 'csv' })}`} download>Exportar CSV / Excel</a>
        <button className="botao secundario" onClick={() => window.print()}>Imprimir / PDF</button>
      </div></details>}</div></div>
    <form className="relatorio-filtros" onSubmit={e => {
      e.preventDefault();
      if (filtro.fim < filtro.inicio || (Date.parse(filtro.fim) - Date.parse(filtro.inicio)) / 86400000 > 365) {
        setErro('Escolha datas em ordem e um período de até 366 dias.'); return;
      }
      setErro(''); setPeriodo({ ...filtro });
    }}>
      <label>De<input required type="date" value={filtro.inicio} onChange={e => setFiltro({ ...filtro, inicio: e.target.value })} /></label>
      <label>Até<input required type="date" value={filtro.fim} onChange={e => setFiltro({ ...filtro, fim: e.target.value })} /></label>
      <button className="botao principal">Aplicar período</button>
    </form>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {!pronto && !erro && <p role="status">Carregando os indicadores.</p>}
    {pronto && dados && <>
      <div className="relatorio-totais"><div><span>Pedidos recebidos no período</span><strong>{dados.recebidos}</strong></div>
        <div><span>Casos com primeira resolução no período</span><strong>{dados.resolvidos}</strong></div></div>
      <section className="relatorio-grafico" aria-labelledby="titulo-evolucao">
        <div className="grafico-cabecalho"><h2 id="titulo-evolucao">{tituloGrafico}</h2>
          <div className="grafico-visualizacoes">
            <label htmlFor="relatorio-visualizacao">Visualização do gráfico
            <select id="relatorio-visualizacao" value={visualizacao} onChange={e => setVisualizacao(e.target.value as typeof visualizacao)}>
            {([{ valor: 'dia', nome: 'Por dia' }, { valor: 'acumulado', nome: 'Acumulado' }, { valor: 'prioridade', nome: 'Por prioridade' }] as const).map(v =>
              <option key={v.valor} value={v.valor}>{v.nome}</option>)}
            </select></label>
          </div>
        </div>
        <p className="grafico-explicacao" role="status">{visualizacao === 'acumulado' ? 'Soma progressiva a partir do início do período selecionado.' : visualizacao === 'prioridade' ? 'Pedidos recebidos no período, agrupados pela prioridade atual.' : 'Quantidade registrada em cada dia, sem somar os dias anteriores.'}</p>
        <div className="grafico-legenda">{linhas.map(l => <span key={l.campo}><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="0" x2="26" y1="5" y2="5" stroke={l.cor} strokeWidth="3" strokeDasharray={l.traco} /></svg>{l.nome}</span>)}</div>
        <div ref={area} className="grafico-area" tabIndex={0} role="region" aria-label="Gráfico de evolução; use as setas para deslocar em telas pequenas"><svg ref={grafico} key={visualizacao} viewBox="0 0 900 260" role="img" aria-label={`${tituloGrafico} de ${rotulo(dados.inicio)} a ${rotulo(dados.fim)}. Dados completos na tabela abaixo.`}>
          {[0, 1, 2].map(n => <g key={n}><line x1="48" x2="848" y1={210 - n * 85} y2={210 - n * 85} stroke="var(--borda-suave)" />
            <text x="32" y={215 - n * 85} textAnchor="end" fontSize={tamanhoRotulo}>{Math.round(maximo * n / 2)}</text></g>)}
          {linhas.map(l => <g key={l.campo}><polyline points={pontos(l.valores)} fill="none" stroke={l.cor} strokeWidth="3" strokeDasharray={l.traco} strokeLinejoin="round" />
            {l.valores.length === 1 && <circle cx="48" cy={210 - l.valores[0] * 170 / maximo} r="4" fill={l.cor} />}</g>)}
          <text x="48" y="245" fontSize={tamanhoRotulo}>{rotulo(dados.inicio)}</text><text x="848" y="245" textAnchor="end" fontSize={tamanhoRotulo}>{rotulo(dados.fim)}</text>
        </svg></div>
        {diasComDados > 0 && diasComDados < 3 && <p className="relatorio-pouco-historico">Ainda há pouco histórico: só existem dados em {diasComDados} {diasComDados === 1 ? 'dia' : 'dias'} neste período.</p>}
        {!dados.recebidos && !dados.resolvidos && <p className="vazio">Nenhum pedido recebido ou primeira resolução neste período. Escolha outras datas para consultar o histórico.</p>}
      </section>
      <div className="relatorio-detalhes">{visualizacao !== 'prioridade' && <section className="relatorio-prioridades"><h2>Prioridade dos pedidos recebidos</h2>{prioridades}</section>}
      <details className="relatorio-tabela"><summary>{visualizacao === 'acumulado' ? 'Consultar os dados acumulados' : 'Consultar os dados por dia'}</summary>
        {telaEstreita ? <ul className="relatorio-lista" role="list" aria-label={legendaTabela}>{linhasTabela.map((d, i) => <li key={d.data}>
          <div><span>Data:</span> <strong>{d.data.split('-').reverse().join('/')}</strong></div>
          {linhas.map(l => <div key={l.campo}><span>{l.nome}:</span> <strong>{l.valores[i]}</strong></div>)}</li>)}</ul>
        : <div className="relatorio-tabela-scroll"><table><caption>{legendaTabela}</caption><thead><tr><th>Data</th>{linhas.map(l => <th key={l.campo}>{l.nome}</th>)}</tr></thead>
          <tbody>{linhasTabela.map((d, i) => <tr key={d.data}><td>{d.data.split('-').reverse().join('/')}</td>{linhas.map(l => <td key={l.campo}>{l.valores[i]}</td>)}</tr>)}</tbody></table></div>}
      </details></div>
      <p className="relatorio-nota">Horário de Brasília. Simulações não entram nos indicadores. As resoluções consideram a primeira finalização de cada caso, inclusive pedidos recebidos antes do período. O CSV contém os totais diários; use Imprimir / PDF para salvar este relatório.</p>
    </>}
  </section>;
}
