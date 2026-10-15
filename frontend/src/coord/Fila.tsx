import { useEffect, useRef, useState } from 'react';
import { listarCasos, mensagemErroCoord, ErroApi } from '../shared/api';
import type { CasoFila } from '../shared/api';
import { Prioridade, PRIORIDADES, Simulacao, STATUS, Status, TIPOS, dataLegivel, rotuloStatus, tipo as rotuloDoTipo } from './rotulos';

export const INTERVALO_MS = 8000;
const ordem = (g: string) => { const i = PRIORIDADES.indexOf(g as never); return i < 0 ? PRIORIDADES.length : i; };

export type Filtros = { status: string; tipo: string };

export default function Fila({ aoAbrir, filtros, aoFiltrar }: { aoAbrir: (id: number) => void; filtros: Filtros; aoFiltrar: (filtros: Filtros) => void }) {
  const { status: filtroStatus, tipo: filtroTipo } = filtros;
  const [casos, setCasos] = useState<CasoFila[] | null>(null);
  const [erro, setErro] = useState('');
  const [anuncio, setAnuncio] = useState('');
  const vistos = useRef<Set<number> | null>(null);
  const filtrosAnteriores = useRef('');

  useEffect(() => {
    let ativo = true;
    let emCurso = false;
    const controle = new AbortController();
    const chave = `${filtroStatus}|${filtroTipo}`;
    const filtroMudou = filtrosAnteriores.current !== chave;
    filtrosAnteriores.current = chave;
    if (filtroMudou) vistos.current = null;

    async function carregar() {
      // um tick que cai durante uma requisição lenta é ignorado, não a cancela
      if (emCurso) return;
      emCurso = true;
      try {
        const recebidos = await listarCasos({ status: filtroStatus, prioridade: '', tipo: filtroTipo, q: '' }, controle.signal);
        if (!ativo) return;
        // a API já ordena; a ordenação estável aqui só garante alta, média e baixa
        const ordenados = [...recebidos].sort((a, b) => ordem(a.prioridade) - ordem(b.prioridade));
        const anteriores = vistos.current;
        const novos = anteriores ? ordenados.filter(c => !anteriores.has(c.id)).length : 0;
        vistos.current = new Set(ordenados.map(c => c.id));
        setCasos(ordenados); setErro('');
        if (novos > 0) setAnuncio(novos === 1 ? 'Chegou 1 caso novo.' : `Chegaram ${novos} casos novos.`);
        else if (!anteriores) setAnuncio(ordenados.length === 1 ? '1 caso na fila.' : `${ordenados.length} casos na fila.`);
      } catch (falha) {
        if (!ativo) return;
        if (falha instanceof ErroApi && falha.status === 401) return;
        setErro(mensagemErroCoord(falha));
      } finally { emCurso = false; }
    }
    void carregar();
    const relogio = setInterval(() => { if (!document.hidden) void carregar(); }, INTERVALO_MS);
    const aoMudarVisibilidade = () => { if (!document.hidden) void carregar(); };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      controle.abort();
    };
  }, [filtroStatus, filtroTipo]);

  const filtrando = Boolean(filtroStatus || filtroTipo);
  return <section aria-labelledby="titulo-fila">
    <h1 id="titulo-fila" tabIndex={-1}>Fila de casos</h1>
    <form className="filtros" onSubmit={e => e.preventDefault()}>
      <div><label htmlFor="filtro-status">Status</label>
        <select id="filtro-status" value={filtroStatus} onChange={e => aoFiltrar({ ...filtros, status: e.target.value })}>
          <option value="">Todos</option>{STATUS.map(s => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
        </select></div>
      <div><label htmlFor="filtro-tipo">Tipo</label>
        <select id="filtro-tipo" value={filtroTipo} onChange={e => aoFiltrar({ ...filtros, tipo: e.target.value })}>
          <option value="">Todos</option>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select></div>
      {filtrando && <button type="button" className="botao-texto" onClick={() => aoFiltrar({ status: '', tipo: '' })}>Limpar filtros</button>}
    </form>
    <p className="texto-pequeno" role="status" aria-live="polite">{anuncio}</p>
    {erro && <p className="erro" role="alert">{erro} A fila tenta de novo sozinha.</p>}
    {casos === null && !erro && <p className="vazio">Carregando a fila.</p>}
    {casos !== null && casos.length === 0 && <p className="vazio">{filtrando ? 'Nenhum caso com esses filtros.' : 'Nenhum caso na fila.'}</p>}
    {casos !== null && casos.length > 0 && <ul className="fila">
      {casos.map(c => <li key={c.id} className="fila-item" data-gravidade={c.prioridade}>
        <button type="button" className="fila-linha" onClick={() => aoAbrir(c.id)}>
          <span className="fila-gravidade"><Prioridade valor={c.prioridade} /></span>
          <span className="fila-tipo"><strong>{rotuloDoTipo(c.tipo)}</strong>
            {c.em_andamento && <span className="selo-neutro">Ocorrendo agora</span>}
            {c.simulacao && <Simulacao />}</span>
          <span className="fila-resumo">{c.resumo}</span>
          <span className="fila-status"><Status valor={c.status} /></span>
          <span className="fila-data">{dataLegivel(c.criado_em)}</span>
          <span className="so-leitor">Caso {c.id}. Abrir.</span>
        </button>
      </li>)}
    </ul>}
  </section>;
}
