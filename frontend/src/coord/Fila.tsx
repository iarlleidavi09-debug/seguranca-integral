import { useEffect, useRef, useState } from 'react';
import { listarCasos, mensagemErroCoord, ErroApi } from '../shared/api';
import type { CasoFila, FiltrosFila } from '../shared/api';
import { usePolling } from './polling';
import {
  Prioridade, PRIORIDADES, Simulacao, STATUS, Status, TIPOS, acessoLegivel, motivo, rotuloPrioridade, rotuloStatus, tipo as rotuloDoTipo,
} from './rotulos';

const ATRASO_BUSCA_MS = 300;
const TAMANHO_BUSCA = 100;
const ordem = (p: string) => { const i = PRIORIDADES.indexOf(p as never); return i < 0 ? PRIORIDADES.length : i; };

type Props = {
  modo: 'casos' | 'pos';
  filtros: FiltrosFila;
  aoFiltrar: (filtros: FiltrosFila) => void;
  aoAbrir: (id: number) => void;
};

/** Ordenação estável: a API já entrega do mais antigo ao mais novo; aqui só se reforça a ordem de atenção. */
function ordenar(casos: CasoFila[], modo: 'casos' | 'pos'): CasoFila[] {
  const chave = modo === 'pos' ? (c: CasoFila) => (c.recorrencia_pendente ? 0 : 1) : (c: CasoFila) => ordem(c.prioridade);
  return [...casos].sort((a, b) => chave(a) - chave(b));
}

function Retorno() {
  return <span className="selo-recorrencia">
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M4 10a6 6 0 1 0 2-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 2.5v4.5h4.5Z" fill="currentColor" />
    </svg>
    Voltou a acontecer
  </span>;
}

export default function Fila({ modo, filtros, aoFiltrar, aoAbrir }: Props) {
  const pos = modo === 'pos';
  // a Pós-resolução não filtra por status na API: traz resolvidos e reabertos com recorrência pendente, e o filtro é feito aqui
  const status = pos ? '' : filtros.status;
  const { prioridade, tipo } = filtros;
  const q = filtros.q.trim();

  const [casos, setCasos] = useState<CasoFila[] | null>(null);
  const [erro, setErro] = useState('');
  const [anuncio, setAnuncio] = useState('');
  const vistos = useRef<Set<number> | null>(null);
  const chaveAnterior = useRef('');

  // o campo guarda o que a pessoa digita; os filtros só recebem o texto aparado 300 ms depois da última tecla
  const [busca, setBusca] = useState(filtros.q);
  const filtrosAtuais = useRef(filtros);
  filtrosAtuais.current = filtros;
  useEffect(() => { setBusca(atual => (atual.trim() === filtros.q ? atual : filtros.q)); }, [filtros.q]);
  useEffect(() => {
    const procurado = busca.trim();
    if (procurado === filtrosAtuais.current.q) return;
    const espera = setTimeout(() => aoFiltrar({ ...filtrosAtuais.current, q: procurado }), ATRASO_BUSCA_MS);
    return () => clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  usePolling(async (sinal, ativo) => {
    const chave = `${status}|${prioridade}|${tipo}|${q}`;
    if (chaveAnterior.current !== chave) vistos.current = null;
    chaveAnterior.current = chave;
    try {
      const recebidos = await listarCasos({ status, prioridade, tipo, q }, sinal);
      if (!ativo()) return;
      const ordenados = ordenar(pos ? recebidos.filter(c => c.status === 'resolvido' || c.recorrencia_pendente) : recebidos, modo);
      const anteriores = vistos.current;
      const novos = anteriores ? ordenados.filter(c => !anteriores.has(c.id)).length : 0;
      vistos.current = new Set(ordenados.map(c => c.id));
      setCasos(ordenados); setErro('');
      if (novos > 0) setAnuncio(novos === 1 ? 'Chegou 1 caso novo.' : `Chegaram ${novos} casos novos.`);
      else if (!anteriores) setAnuncio(pos
        ? (ordenados.length === 1 ? '1 caso resolvido ou com recorrência.' : `${ordenados.length} casos resolvidos ou com recorrência.`)
        : (ordenados.length === 1 ? '1 caso na fila.' : `${ordenados.length} casos na fila.`));
    } catch (falha) {
      if (!ativo()) return;
      if (falha instanceof ErroApi && falha.status === 401) return;
      setErro(mensagemErroCoord(falha));
    }
  }, [status, prioridade, tipo, q, modo, pos]);

  const filtrando = Boolean((pos ? '' : filtros.status) || prioridade || tipo || filtros.q || busca);
  const mudar = (parcial: Partial<FiltrosFila>) => aoFiltrar({ ...filtros, ...parcial });
  const limpar = () => { setBusca(''); aoFiltrar({ status: pos ? filtros.status : '', prioridade: '', tipo: '', q: '' }); };

  return <section aria-labelledby="titulo-fila" className="casos">
    <h1 id="titulo-fila" tabIndex={-1}>{pos ? 'O cuidado continua.' : 'Casos'}</h1>
    <p className="casos-intro">{pos
      ? 'Acompanhe os casos resolvidos e os que tiveram recorrência. Os casos em que a situação voltou a acontecer aparecem primeiro.'
      : 'Todos os pedidos da equipe, dos mais urgentes aos menos urgentes.'}</p>
    <form className="filtros" role="search" aria-label="Buscar e filtrar casos" onSubmit={e => e.preventDefault()}>
      <div className="filtro-busca"><label htmlFor="filtro-busca">Buscar por assunto ou número do caso</label>
        <input id="filtro-busca" type="search" maxLength={TAMANHO_BUSCA} autoComplete="off" value={busca} onChange={e => setBusca(e.target.value)} /></div>
      {!pos && <div><label htmlFor="filtro-status">Status</label>
        <select id="filtro-status" value={filtros.status} onChange={e => mudar({ status: e.target.value })}>
          <option value="">Todos</option>{STATUS.map(s => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
        </select></div>}
      <div><label htmlFor="filtro-prioridade">Prioridade</label>
        <select id="filtro-prioridade" value={prioridade} onChange={e => mudar({ prioridade: e.target.value })}>
          <option value="">Todas</option>{PRIORIDADES.map(p => <option key={p} value={p}>{rotuloPrioridade[p]}</option>)}
        </select></div>
      <div><label htmlFor="filtro-tipo">Tipo</label>
        <select id="filtro-tipo" value={tipo} onChange={e => mudar({ tipo: e.target.value })}>
          <option value="">Todos</option>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select></div>
      {filtrando && <button type="button" className="botao-texto" onClick={limpar}>Limpar filtros</button>}
    </form>
    <p className="texto-pequeno" role="status" aria-live="polite">{anuncio}</p>
    {erro && <p className="erro" role="alert">{erro} A fila tenta de novo sozinha.</p>}
    {casos === null && !erro && <p className="vazio">Carregando a fila.</p>}
    {casos !== null && casos.length === 0 && <p className="vazio">{filtrando ? 'Nenhum caso com esses filtros.' : pos ? 'Nenhum caso resolvido ou com recorrência ainda.' : 'Nenhum caso na fila.'}</p>}
    {casos !== null && casos.length > 0 && <table className="casos-tabela" role="table" aria-labelledby="titulo-fila">
      <thead role="rowgroup"><tr role="row">
        <th role="columnheader" scope="col">Caso e situação</th><th role="columnheader" scope="col">Prioridade</th>
        <th role="columnheader" scope="col">Status</th><th role="columnheader" scope="col">Último acesso</th>
        <th role="columnheader" scope="col"><span className="so-leitor">Abrir</span></th>
      </tr></thead>
      <tbody role="rowgroup">
        {casos.map(c => <tr key={c.id} role="row" className="casos-linha" data-gravidade={c.prioridade}>
          <td role="cell" className="casos-caso">
            <span className="casos-tipo"><strong>{rotuloDoTipo(c.tipo)}</strong>
              {c.recorrencia_pendente && <Retorno />}
              {c.em_andamento && <span className="selo-neutro">Ocorrendo agora</span>}
              {c.simulacao && <Simulacao />}</span>
            <span className="casos-resumo">{c.resumo}</span>
            {c.motivos?.length > 0 && <span className="casos-porque">Por que: {motivo(c.motivos[0])}</span>}
          </td>
          <td role="cell" data-rotulo="Prioridade"><Prioridade valor={c.prioridade} /></td>
          <td role="cell" data-rotulo="Status"><Status valor={c.status} /></td>
          <td role="cell" data-rotulo="Último acesso" className="casos-acesso">{acessoLegivel(c.ultimo_acesso_por, c.ultimo_acesso_em)}</td>
          <td role="cell" className="casos-acao">
            <button type="button" className="botao secundario casos-abrir" aria-label={`Caso ${c.id}. Abrir.`} onClick={() => aoAbrir(c.id)}>Abrir</button>
          </td>
        </tr>)}
      </tbody>
    </table>}
  </section>;
}
