import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { listarCasos, mensagemErroCoord, ErroApi, obterQuestionarioV3 } from '../shared/api';
import type { CasoFila, FiltrosFila } from '../shared/api';
import type { GrupoV3 } from '../shared/v3';
import { usePolling } from './polling';
import { categoriaAgenda, demoraPrimeiroAcesso } from './agenda';
import { MOTIVOS_ATENCAO, prazoLegivel } from './Atendimento';
import FavoritosFila from './FavoritosFila';
import AcaoAgenda from './AcaoAgenda';
import './qualidadedevida-fila.css';
import {
  Prioridade, PRIORIDADES, Simulacao, STATUS, Status, TIPOS, assuntos, acessoLegivel, dataLegivel, motivo, rotuloPrioridade, rotuloStatus,
} from './rotulos';

const ATRASO_BUSCA_MS = 300;
const TAMANHO_BUSCA = 100;
const ordem = (p: string) => { const i = PRIORIDADES.indexOf(p as never); return i < 0 ? PRIORIDADES.length : i; };
const motivoRelevante = (c: CasoFila) => c.motivos?.find(m => !/^tipo:/i.test(m));
const CONVERSAS = { sem_mensagem: 'Sem mensagem', mensagem_nova: 'Mensagem nova', aguardando_equipe: 'Aguardando resposta da equipe', aguardando_aluno: 'Aguardando resposta do aluno' };
export function filtrarConversa(caso: CasoFila, filtro: string): boolean {
  const estado = caso.conversa_estado ?? 'sem_mensagem';
  return !filtro || (filtro === 'com_mensagem' ? estado !== 'sem_mensagem' : estado === filtro);
}

type Props = {
  modo: 'casos' | 'pos';
  meuId?: number;
  userId?: number;
  filtros: FiltrosFila;
  aoFiltrar: (filtros: FiltrosFila) => void;
  aoAbrir: (id: number, orderedIds?: number[]) => void;
  retorno?: { id: number; rolagem: number };
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

type ChipCaso = { chave: string; texto: string; no: ReactNode };
/** Selos de um caso, do mais grave ao menos grave: só os dois primeiros aparecem, o resto vai para o "+N". */
function chipsDoCaso(c: CasoFila): ChipCaso[] {
  const lista: ChipCaso[] = [];
  const texto = (chave: string, t: string, classe: string) => lista.push({ chave, texto: t, no: <span className={classe}>{t}</span> });
  if (c.status === 'resolvido' && c.atencao?.includes('mensagem_pendente')) texto('volta', 'Aluno voltou a pedir ajuda', 'selo-recorrencia');
  if (c.em_andamento) texto('agora', 'Ocorrendo agora', 'selo-neutro');
  if (!c.simulacao && demoraPrimeiroAcesso(c)) texto('demora', 'Sem primeiro acesso há mais de 24 horas', 'selo-recorrencia');
  for (const m of c.atencao ?? []) { const t = MOTIVOS_ATENCAO[m] ?? m; lista.push({ chave: `atencao:${m}`, texto: t, no: <span className="casos-motivo">{t}</span> }); }
  if (c.recorrencia_pendente) lista.push({ chave: 'retorno', texto: 'Voltou a acontecer', no: <Retorno /> });
  if (c.canal === 'acolhimento') texto('acolhimento', 'Acolhimento anônimo', 'selo-neutro');
  if (c.simulacao) lista.push({ chave: 'simulacao', texto: 'simulação', no: <Simulacao /> });
  return lista;
}

export default function Fila({ modo, meuId, userId, filtros, aoFiltrar, aoAbrir, retorno }: Props) {
  const pos = modo === 'pos';
  // a Pós-resolução não filtra por status na API: traz resolvidos e reabertos com recorrência pendente, e o filtro é feito aqui
  const status = pos ? '' : filtros.status;
  const { prioridade, tipo } = filtros;
  const grupo = filtros.grupo ?? '';
  const opcao = filtros.opcao ?? '';
  const q = filtros.q.trim();

  const [casos, setCasos] = useState<CasoFila[] | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [anuncio, setAnuncio] = useState('');
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [grupos, setGrupos] = useState<GrupoV3[]>([]);
  const [erroCatalogo, setErroCatalogo] = useState('');
  const [recarregar, setRecarregar] = useState(0);
  const retornou = useRef(false);
  const tabela = useRef<HTMLTableElement>(null);
  useEffect(() => {
    let ativo = true;
    obterQuestionarioV3().then(def => { if (ativo) setGrupos(def.grupos); }).catch(() => {
      if (ativo) setErroCatalogo('Os filtros de situações estão indisponíveis agora. Os demais filtros continuam funcionando.');
    });
    return () => { ativo = false; };
  }, []);
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
    setAtualizando(true);
    const chave = `${status}|${prioridade}|${tipo}|${q}|${grupo}|${opcao}`;
    if (chaveAnterior.current !== chave) vistos.current = null;
    chaveAnterior.current = chave;
    try {
      const recebidos = await listarCasos({ status, prioridade, tipo, q, ...(grupo ? { grupo } : {}), ...(opcao ? { opcao } : {}) }, sinal);
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
    } finally { if (ativo()) setAtualizando(false); }
  }, [status, prioridade, tipo, q, grupo, opcao, modo, pos, recarregar]);

  const conversa = filtros.conversa ?? '';
  const filtrando = Boolean((pos ? '' : filtros.status) || prioridade || tipo || filtros.q || busca || grupo || opcao || conversa);
  const mudar = (parcial: Partial<FiltrosFila>) => aoFiltrar({ ...filtros, ...parcial });
  const limpar = () => { setBusca(''); aoFiltrar({ status: pos ? filtros.status : '', prioridade: '', tipo: '', q: '' }); };
  const visao = pos ? '' : filtros.visao ?? '';
  const motivoAtencao = pos ? '' : filtros.atencao ?? '';
  const filtrosAtivos = [pos ? '' : filtros.status, prioridade, tipo, grupo, opcao, motivoAtencao, conversa].filter(Boolean).length;
  const naoAberto = (c: CasoFila) => c.nao_aberto ?? !c.ultimo_acesso_em;
  const precisaAtencao = (c: CasoFila) => (c.atencao?.length ?? 0) > 0;
  const visoes = meuId ? [
    { id: '', nome: 'Meus casos', aceita: (c: CasoFila) => c.responsavel?.id === meuId },
    ...([{ id: 'vencidas', nome: 'Ações vencidas' }, { id: 'hoje', nome: 'Para hoje' }, { id: 'proximas', nome: 'Próximas ações' }, { id: 'sem_acao', nome: 'Sem ação planejada' }] as const).map(v => ({ ...v, aceita: (c: CasoFila) => categoriaAgenda(c, meuId) === v.id })),
  ] : [
    { id: '', nome: 'Todos', aceita: (_c: CasoFila) => true },
    { id: 'nao_abertos', nome: 'Ainda não abertos', aceita: naoAberto },
    { id: 'atencao', nome: 'Precisam de atenção', aceita: precisaAtencao },
    { id: 'resolvidos', nome: 'Resolvidos', aceita: (c: CasoFila) => c.status === 'resolvido' },
  ];
  const casosDaVisao = meuId ? casos?.filter(c => c.responsavel?.id === meuId) ?? null : casos;
  const exibidos = casosDaVisao?.filter(c => (visoes.find(v => v.id === visao)?.aceita(c) ?? true)
    && (!motivoAtencao || c.atencao?.includes(motivoAtencao)) && filtrarConversa(c, conversa)) ?? null;
  const abrir = (id: number) => aoAbrir(id, exibidos?.map(c => c.id) ?? []);
  useEffect(() => {
    if (!retorno || retornou.current || casos === null) return;
    retornou.current = true;
    tabela.current?.querySelector<HTMLButtonElement>(`[data-caso-id="${retorno.id}"] .casos-assunto`)?.focus({ preventScroll: true });
    window.scrollTo({ top: retorno.rolagem, behavior: 'instant' });
  }, [casos, retorno]);

  return <section aria-labelledby="titulo-fila" className="casos" aria-busy={atualizando}>
    <h1 id="titulo-fila" tabIndex={-1}>{meuId ? 'Meu atendimento' : pos ? 'O cuidado continua.' : 'Casos'}</h1>
    {meuId && <p className="casos-intro">Casos atribuídos a você. Prazos seguem o horário de Brasília.</p>}
    {pos && <p className="casos-intro">Resolvidos e recorrências, com as pendências primeiro.</p>}
    <form className="busca-casos" role="search" aria-label="Buscar e filtrar casos" onSubmit={e => e.preventDefault()}>
      <div className="filtro-busca"><label htmlFor="filtro-busca">Buscar por assunto ou número do caso</label>
        <input id="filtro-busca" type="search" maxLength={TAMANHO_BUSCA} autoComplete="off" value={busca} onChange={e => setBusca(e.target.value)} /></div>
      <div><label htmlFor="filtro-conversa">Conversa</label>
        <select id="filtro-conversa" value={conversa} onChange={e => mudar({ conversa: e.target.value })}>
          <option value="">Todas as conversas</option><option value="com_mensagem">Com mensagem</option>
          {Object.entries(CONVERSAS).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
        </select></div>
      {(filtrando || visao || motivoAtencao) && <button type="button" className="botao-texto" onClick={limpar}>Limpar filtros</button>}
    </form>

    <p className="fila-contexto texto-pequeno">Visão: {pos ? 'Pós-resolução' : visoes.find(v => v.id === visao)?.nome ?? 'Todos'}{filtrosAtivos > 0 ? ` · ${filtrosAtivos} ${filtrosAtivos === 1 ? 'filtro ativo' : 'filtros ativos'}` : ''}</p>
    <details className="acoes-recolhidas fila-organizacao">
      <summary>Organizar fila</summary>
      <div className="acoes-recolhidas-conteudo">
    {!pos && <div className="fila-visoes" role="group" aria-label="Organização dos casos">
      {visoes.map(v => <button key={v.id} type="button" className="botao secundario" aria-pressed={visao === v.id}
        onClick={() => mudar({ visao: v.id, status: '' })}>{v.nome} ({casos === null ? '…' : casos.filter(c => v.aceita(c) && (!motivoAtencao || c.atencao?.includes(motivoAtencao)) && filtrarConversa(c, conversa)).length})</button>)}
    </div>}
      <details className="filtros-detalhados"><summary>Filtros detalhados{filtrosAtivos > 0 ? ` (${filtrosAtivos} ${filtrosAtivos === 1 ? 'ativo' : 'ativos'})` : ''}</summary>
      <div className="filtros">
      {!pos && <p className="filtros-ajuda texto-pequeno">Resolvidos também aparecem em atenção quando há mensagem sem resposta, recorrência ou ação vencida. As contagens consideram os filtros selecionados.</p>}
      {!pos && <div><label htmlFor="filtro-atencao">Motivo de atenção</label>
        <select id="filtro-atencao" value={motivoAtencao} onChange={e => mudar({ atencao: e.target.value })}>
          <option value="">Todos os motivos</option>{Object.entries(MOTIVOS_ATENCAO).map(([id, nome]) => <option value={id} key={id}>{nome}</option>)}
        </select></div>}
      {!pos && <div><label htmlFor="filtro-status">Status</label>
        <select id="filtro-status" value={filtros.status} onChange={e => mudar({ status: e.target.value })}>
          <option value="">Todos</option><option value="abertos">Em aberto (novos e em investigação)</option>{STATUS.map(s => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
        </select></div>}
      <div><label htmlFor="filtro-prioridade">Prioridade</label>
        <select id="filtro-prioridade" value={prioridade} onChange={e => mudar({ prioridade: e.target.value })}>
          <option value="">Todas</option>{PRIORIDADES.map(p => <option key={p} value={p}>{rotuloPrioridade[p]}</option>)}
        </select></div>
      <div><label htmlFor="filtro-tipo">Tipo</label>
        <select id="filtro-tipo" value={tipo} onChange={e => mudar({ tipo: e.target.value })}>
          <option value="">Todos</option>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select></div>
      <div><label htmlFor="filtro-grupo">Grupo de situações</label>
        <select id="filtro-grupo" disabled={!grupos.length} value={grupo} onChange={e => mudar({ grupo: e.target.value, opcao: '' })}>
          <option value="">Todos os grupos</option>{grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select></div>
      <div><label htmlFor="filtro-opcao">Situação relatada</label>
        <select id="filtro-opcao" disabled={!grupos.length} value={opcao} onChange={e => mudar({ opcao: e.target.value })}>
          <option value="">Todas as situações</option>{grupos.filter(g => !grupo || g.id === grupo).flatMap(g => g.opcoes).map(o => <option key={o.id} value={o.id}>{o.texto}</option>)}
        </select></div>
      </div></details>
    {userId !== undefined && <FavoritosFila key={`${userId}:${meuId ? 'meus' : modo}`} usuario={userId} fila={meuId ? 'meus' : modo} filtros={filtros} aoAplicar={novos => { setBusca(''); aoFiltrar(novos); }} />}
      </div>
    </details>
    {erroCatalogo && <p className="aviso" role="status">{erroCatalogo}</p>}
    <p className="so-leitor" role="status" aria-live="polite">{anuncio}</p>
    {atualizando && casos !== null && <p role="status">Atualizando casos…</p>}
    {atualizando && casos !== null && <p className="so-leitor">Os resultados anteriores permanecem visíveis até a atualização terminar.</p>}
    {erro && <p className="erro" role="alert">{erro} A fila tenta de novo sozinha.</p>}
    {casos === null && !erro && <p className="vazio">Carregando a fila.</p>}
    {exibidos !== null && <p className="texto-pequeno" role="status">{exibidos.length} {exibidos.length === 1 ? 'caso exibido' : 'casos exibidos'}.</p>}
    {exibidos !== null && exibidos.length === 0 && <p className="vazio">{filtrando || visao || motivoAtencao ? 'Nenhum caso com esses filtros.' : pos ? 'Nenhum caso resolvido ou com recorrência ainda.' : 'Nenhum caso na fila.'}</p>}
    {retorno && exibidos?.some(c => c.id === retorno.id) && <p className="so-leitor" role="status">De volta à fila. Caso {retorno.id} selecionado.</p>}
    {retorno && exibidos !== null && !exibidos.some(c => c.id === retorno.id) && <p className="aviso" role="status">O caso {retorno.id} não aparece nos filtros atuais. A fila foi atualizada.</p>}
    {exibidos !== null && exibidos.length > 0 && <table ref={tabela} className="casos-tabela" role="table" aria-labelledby="titulo-fila">
      <thead role="rowgroup"><tr role="row">
        <th role="columnheader" scope="col">Caso e situação</th><th role="columnheader" scope="col">Prioridade</th>
        <th role="columnheader" scope="col">Status</th><th role="columnheader" scope="col">Último acesso</th>
      </tr></thead>
      <tbody role="rowgroup">
        {exibidos.map(c => {
          const novas = c.mensagens_novas ?? 0;
          const estadoConversa = c.conversa_estado ?? 'sem_mensagem';
          const porque = motivoRelevante(c);
          const chips = chipsDoCaso(c);
          const ocultos = Math.max(0, chips.length - 2);
          const aberto = expandidos.has(c.id);
          const idFaixa = `selos-${c.id}`;
          const textoResponsavel = `${novas === 0 && estadoConversa !== 'sem_mensagem' ? `${CONVERSAS[estadoConversa]} · ` : ''}`
            + `Responsável: ${c.responsavel?.nome ?? 'Não atribuído'}${c.responsavel && !c.responsavel.ativo ? ' (conta desativada)' : ''}`
            + `${c.proxima_acao ? ` · ${c.proxima_acao}${c.prazo_acao ? ` · até ${prazoLegivel(c.prazo_acao)}` : ''}` : ''}`;
          const textoPrevia = c.ultima_mensagem
            ? `${c.ultima_mensagem.autor === 'aluno' ? 'Aluno' : 'Equipe'} · ${dataLegivel(c.ultima_mensagem.criado_em)}: ${c.ultima_mensagem.texto.slice(0, 180)}` : '';
          return <tr key={c.id} role="row" className="casos-linha" data-gravidade={c.prioridade} data-caso-id={c.id} data-retorno={retorno?.id === c.id || undefined} onClick={e => {
            // um só caminho por caso para teclado e leitor de tela (o botão do assunto); o clique na linha é só para quem usa mouse ou toque
            if ((e.target as HTMLElement).closest('button, a, summary, input, select, textarea, label')) return;
            if (window.getSelection()?.toString()) return;
            abrir(c.id);
          }}>
            <td role="cell" className="casos-caso">
              <div className="casos-linha1">
                <button type="button" className="casos-assunto" aria-label={`Caso ${c.id}. Abrir.`} onClick={() => abrir(c.id)}>{assuntos(c)}</button>
                {novas > 0 && <span className="selo-neutro casos-novas">{`${novas} ${novas === 1 ? 'mensagem nova' : 'mensagens novas'}`}</span>}
              </div>
              <span className="casos-resumo" title={`${c.resumo}${porque ? ` Por que: ${motivo(porque)}` : ''}`}>{c.resumo}</span>
              {porque && <span className="so-leitor casos-porque">Por que: {motivo(porque)}</span>}
              <span className="casos-meta" title={textoResponsavel}>{textoResponsavel}</span>
              {meuId && c.responsavel?.ativo && <AcaoAgenda caso={c} aoAtualizar={() => setRecarregar(n => n + 1)} />}
              {c.ultima_mensagem && <span className="casos-previa" title={textoPrevia}>
                <time dateTime={c.ultima_mensagem.criado_em}>{c.ultima_mensagem.autor === 'aluno' ? 'Aluno' : 'Equipe'} · {dataLegivel(c.ultima_mensagem.criado_em)}</time>
                {': '}<span>{c.ultima_mensagem.texto.slice(0, 180)}</span></span>}
              {chips.length > 0 && <div className="casos-selos" id={idFaixa} data-aberto={aberto}>
                {chips.map((x, i) => <span key={x.chave} className={i < 2 ? 'casos-chip' : 'casos-chip casos-chip-extra'}>{x.no}</span>)}
                {ocultos > 0 && <button type="button" className="casos-mais" aria-expanded={aberto} aria-controls={idFaixa}
                  aria-label={aberto ? `Mostrar menos: esconder ${ocultos} ${ocultos === 1 ? 'selo' : 'selos'}` : `Mostrar mais ${ocultos} ${ocultos === 1 ? 'selo' : 'selos'}`}
                  onClick={() => setExpandidos(atual => { const novo = new Set(atual); if (novo.has(c.id)) novo.delete(c.id); else novo.add(c.id); return novo; })}>+{ocultos}</button>}
              </div>}
            </td>
            <td role="cell" className="casos-prioridade"><Prioridade valor={c.prioridade} /></td>
            <td role="cell" className="casos-status"><Status valor={c.status} /></td>
            <td role="cell" className="casos-acesso">{acessoLegivel(c.ultimo_acesso_por, c.ultimo_acesso_em)}</td>
          </tr>;
        })}
      </tbody>
    </table>}
  </section>;
}
