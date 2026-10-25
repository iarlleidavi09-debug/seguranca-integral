import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ErroCoord, mensagemErroCoord } from '../../shared/api';
import { obterMapa, obterResumoMapa, salvarMapa } from '../../shared/mapa';
import type { Ambiente, EstadoMapa, FiltrosMapa, ResumoMapa, TipoAmbiente } from '../../shared/mapa';
import { ouvirAtualizacoes } from '../../shared/tempoReal';
import { agregarAmbiente, ajustar, caminho, descendentes, distribuicaoAmbiente, limitar, pontosL, faixaTexto, LIMITE_LARGURA, LIMITE_ALTURA } from './modelo';
import './mapa.css';
import { conferirPlanta } from './conferencia';
const TIPOS: Record<TipoAmbiente, string> = { ala: 'Ala', andar: 'Andar', sala: 'Sala', area: 'Área comum', escadaria: 'Escadaria' };
type Forma = Pick<Ambiente, 'formato' | 'rotacao' | 'espessura'>;
function ControlesFormato({ valor, aoMudar, novo = false }: { valor: Forma; aoMudar: (valor: Forma) => void; novo?: boolean }) {
 return <><label>{novo ? 'Formato do novo ambiente' : 'Formato do ambiente'}<select value={valor.formato ?? 'retangulo'} onChange={e => aoMudar({ ...valor, formato: e.target.value as Forma['formato'] })}><option value="retangulo">Retângulo</option><option value="l">Em L</option></select></label>{valor.formato === 'l' && <><label>{novo ? 'Rotação do novo ambiente' : 'Rotação do ambiente'}<select value={valor.rotacao ?? 0} onChange={e => aoMudar({ ...valor, rotacao: Number(e.target.value) as Forma['rotacao'] })}>{[0,90,180,270].map(r => <option key={r} value={r}>{r}°</option>)}</select></label><label>{novo ? 'Espessura dos novos braços (%)' : 'Espessura dos braços (%)'}<input required type="number" min={15} max={85} step={1} value={Math.round((valor.espessura ?? .35) * 100)} onChange={e => aoMudar({ ...valor, espessura: Number(e.target.value) / 100 })}/></label><p className="texto-pequeno">De 15% a 85% de cada dimensão da ala.</p></>}</>;
}
const FILTROS: FiltrosMapa = { periodo: '30', base: 'relator', ano: '', sala: '' };
type Gesto = { inicio: { x: number; y: number }; origem: Ambiente[]; ambiente?: Ambiente; modo: 'desenhar' | 'mover' | 'tamanho' };
export default function Mapa() {
 const [estado, setEstado] = useState<EstadoMapa | null>(null), [rascunho, setRascunho] = useState<Ambiente[] | null>(null);
 const [conferenciaAberta, setConferenciaAberta] = useState(false);
 const avisosPlanta = useMemo(() => rascunho ? conferirPlanta(rascunho) : [], [rascunho]);
 useEffect(() => { setConferenciaAberta(false); }, [rascunho]);
 const [historico, setHistorico] = useState<Ambiente[][]>([]), [pai, setPai] = useState<string | null>(null);
 const [selecionado, setSelecionado] = useState<string | null>(null), [erro, setErro] = useState(''), [aviso, setAviso] = useState('');
 const [ocupado, setOcupado] = useState(false), [nome, setNome] = useState(''), [tipo, setTipo] = useState<TipoAmbiente>('ala');
 const [filtros, setFiltros] = useState(FILTROS), [resumo, setResumo] = useState<ResumoMapa | null>(null), [erroResumo, setErroResumo] = useState('');
 const [formaNova, setFormaNova] = useState<Forma>({ formato: 'retangulo', rotacao: 0, espessura: .35 });
 const [busca, setBusca] = useState(''), [zoom, setZoom] = useState(100), [desenhar, setDesenhar] = useState(false);
 const [previa, setPrevia] = useState<Ambiente | null>(null), [formulario, setFormulario] = useState<Ambiente | null>(null);
 const [extensao, setExtensao] = useState({ largura: 1200, altura: 800 });
 const [unidadesPorPixel, setUnidadesPorPixel] = useState(1);
 const [pedidoRevelar, setPedidoRevelar] = useState(0);
 const rolagem = useRef<HTMLDivElement>(null), campoNovo = useRef<HTMLInputElement>(null), focarNovo = useRef(false);
 const svg = useRef<SVGSVGElement>(null), gesto = useRef<Gesto | null>(null), editando = useRef(false), trava = useRef(false);
 const mapa = rascunho ?? estado?.ambientes ?? [], edicao = rascunho !== null;
 const nivel = mapa.filter(a => a.pai_id === pai);
 const larguraPlanta = Math.min(LIMITE_LARGURA, Math.max(extensao.largura, ...nivel.map(a => Math.ceil((a.x + a.largura) / 400) * 400)));
 const alturaPlanta = Math.min(LIMITE_ALTURA, Math.max(extensao.altura, ...nivel.map(a => Math.ceil((a.y + a.altura) / 400) * 400)));
 editando.current = edicao;
 const atual = mapa.find(a => a.id === selecionado);
 const tamanhoAlca = 44.1 * unidadesPorPixel;
 const tamanhoTexto = { fontSize: Math.max(20, 14 * unidadesPorPixel) };
 useEffect(() => {
  const medir = () => { const largura = svg.current?.getBoundingClientRect().width; if (largura) setUnidadesPorPixel(larguraPlanta / largura); };
  medir();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
  if (svg.current) observer?.observe(svg.current);
  window.addEventListener('resize', medir);
  return () => { observer?.disconnect(); window.removeEventListener('resize', medir); };
 }, [larguraPlanta, zoom, estado !== null]);
 useEffect(() => {
  if (!selecionado || gesto.current) return;
  const quadro = requestAnimationFrame(() => {
   const viewport = rolagem.current;
   const alvo = [...(svg.current?.querySelectorAll<SVGGElement>('[data-ambiente]') ?? [])].find(el => el.getAttribute('data-ambiente') === selecionado);
   if (!viewport || !alvo) return;
   const r = viewport.getBoundingClientRect(), a = alvo.getBoundingClientRect();
   const esquerda = r.left + viewport.clientLeft + 8, topo = r.top + viewport.clientTop + 8;
   const direita = esquerda + viewport.clientWidth - 16, baixo = topo + viewport.clientHeight - 16;
   viewport.scrollLeft += a.left < esquerda ? a.left - esquerda : a.right > direita ? Math.min(a.right - direita, a.left - esquerda) : 0;
   viewport.scrollTop += a.top < topo ? a.top - topo : a.bottom > baixo ? Math.min(a.bottom - baixo, a.top - topo) : 0;
  });
  return () => cancelAnimationFrame(quadro);
 }, [selecionado, pai, pedidoRevelar, zoom, larguraPlanta, alturaPlanta]);
 function iniciarEdicao(focar = false) {
  if (!estado) return;
  focarNovo.current = focar; setRascunho(estado.ambientes); setHistorico([]); setErro(''); setAviso('');
 }
 useEffect(() => { if (edicao && focarNovo.current) { focarNovo.current = false; campoNovo.current?.focus(); } }, [edicao]);
 function selecionar(id: string) { setSelecionado(id); setPedidoRevelar(p => p + 1); }
 useEffect(() => { setFormulario(atual ? ajustar({ ...atual }) : null); }, [atual]);
 const carregar = useCallback(async () => {
  try { const dados = await obterMapa(); if (!editando.current) { setEstado(dados); setErro(''); } else setAviso('Há atualizações disponíveis. Seu rascunho foi preservado.'); }
  catch (e) { if (!(e instanceof ErroCoord && e.status === 401)) setErro(mensagemErroCoord(e)); }
 }, []);
 useEffect(() => { void carregar(); return ouvirAtualizacoes(() => void carregar()); }, [carregar]);
 const rodada = useRef(0);
 const carregarResumo = useCallback(async () => {
  const minha = ++rodada.current;
  try { const dados = await obterResumoMapa(filtros); if (minha === rodada.current) { setResumo(dados); setErroResumo(''); } }
  catch (e) { if (minha === rodada.current) { setResumo(null); setErroResumo(mensagemErroCoord(e)); } }
 }, [filtros]);
 useEffect(() => { void carregarResumo(); const sair = ouvirAtualizacoes(() => void carregarResumo()); return () => { rodada.current++; sair(); }; }, [carregarResumo]);
 useEffect(() => {
  const proteger = (e: BeforeUnloadEvent) => { if (editando.current) e.preventDefault(); };
  window.addEventListener('beforeunload', proteger); return () => window.removeEventListener('beforeunload', proteger);
 }, []);
 function alterar(novos: Ambiente[]) { if (ocupado) return; setHistorico(h => [...h.slice(-49), mapa]); setRascunho(novos); setAviso(''); setErro(''); }
 function novo(geometria = { x: 80, y: 80, largura: 240, altura: 160 }, porDesenho = false) {
  if (!nome.trim() && !porDesenho) { setErro('Digite o nome do novo ambiente.'); return; }
  if (mapa.length >= 500 || caminho(pai, mapa).length >= 6) { setErro('Limite de 500 ambientes ou seis níveis atingido.'); return; }
  const a: Ambiente = ajustar({ id: crypto.randomUUID(), nome: nome.trim() || ({ ala: 'Nova ala', andar: 'Novo andar', sala: 'Nova sala', area: 'Nova área', escadaria: 'Nova escadaria' }[tipo]), tipo, pai_id: pai, ...formaNova, x: geometria.x, y: geometria.y, largura: geometria.largura, altura: geometria.altura });
  alterar([...mapa, a]); setSelecionado(a.id); setNome(''); setDesenhar(false);
 }
 function navegar(id: string | null) { setPai(id); setSelecionado(null); setDesenhar(false); setBusca(''); setExtensao({ largura: 1200, altura: 800 }); }
 async function salvar(aceitarAvisos = false) {
  if (avisosPlanta.length && !aceitarAvisos) { setConferenciaAberta(true); return; }
  if (!estado || !rascunho || trava.current) return; trava.current = true; setOcupado(true); setErro('');
  try { const dados = await salvarMapa({ revisao: estado.revisao, ambientes: rascunho }); setEstado(dados); setRascunho(null); setHistorico([]); setSelecionado(null); setAviso('Planta salva.'); }
  catch (e) { setErro(e instanceof ErroCoord && e.status === 409 ? 'A planta mudou ou um ambiente está vinculado a casos. Seu rascunho foi preservado. Cancele a edição para carregar a planta atual e conferir.' : mensagemErroCoord(e)); }
  finally { trava.current = false; setOcupado(false); }
 }
 function ponto(e: PointerEvent<SVGSVGElement>) {
  const rect = svg.current!.getBoundingClientRect();
  return { x: limitar((e.clientX - rect.left) * larguraPlanta / rect.width, 0, larguraPlanta), y: limitar((e.clientY - rect.top) * alturaPlanta / rect.height, 0, alturaPlanta) };
 }
 function iniciar(e: PointerEvent<SVGSVGElement>) {
  if (!edicao || ocupado || e.button !== 0) return;
  const alvo = (e.target as Element).closest('[data-ambiente]'), a = mapa.find(item => item.id === alvo?.getAttribute('data-ambiente'));
  if (!desenhar && !a) { setSelecionado(null); return; }
  
  e.currentTarget.setPointerCapture?.(e.pointerId);
  gesto.current = { inicio: ponto(e), origem: mapa, ambiente: a, modo: desenhar ? 'desenhar' : (e.target as Element).hasAttribute('data-tamanho') ? 'tamanho' : 'mover' };
  if (a && !desenhar) setSelecionado(a.id);
 }
 function mover(e: PointerEvent<SVGSVGElement>) {
  const g = gesto.current; if (!g) return;
  const p = ponto(e), dx = p.x - g.inicio.x, dy = p.y - g.inicio.y;
  if (g.modo === 'desenhar') setPrevia(ajustar({ id: 'previa', nome, tipo, pai_id: pai, ...formaNova, x: Math.min(g.inicio.x, p.x), y: Math.min(g.inicio.y, p.y), largura: Math.max(40, Math.abs(dx)), altura: Math.max(40, Math.abs(dy)) }));
  else if (g.ambiente) {
   const a = g.ambiente;
   setRascunho(g.origem.map(item => item.id !== a.id ? item : ajustar(g.modo === 'mover' ? { ...a, x: limitar(a.x + dx, 0, larguraPlanta - a.largura), y: limitar(a.y + dy, 0, alturaPlanta - a.altura) } : { ...a, largura: limitar(a.largura + dx, 40, larguraPlanta - a.x), altura: limitar(a.altura + dy, 40, alturaPlanta - a.y) })));
  }
 }
 function terminar() {
  const g = gesto.current; if (!g) return; gesto.current = null;
  if (g.modo === 'desenhar' && previa) novo(previa, true);
  else if (g.modo !== 'desenhar') setHistorico(h => [...h.slice(-49), g.origem]);
  setPrevia(null);
 }
 const visiveis = mapa.filter(a => a.pai_id === pai), trilha = caminho(pai, mapa);
 const filhosSelecionados = formulario ? descendentes(formulario.id, mapa) : new Set<string>();
 const profundidadeFilhos = formulario ? Math.max(0, ...mapa.filter(a => filhosSelecionados.has(a.id)).map(a => caminho(a.id, mapa).length - caminho(formulario.id, mapa).length)) : 0;
 const distribuicao = atual && resumo ? distribuicaoAmbiente(atual.id, mapa, resumo.ambientes) : null;
 const filtrar = (chave: keyof FiltrosMapa, valor: string) => setFiltros(f => ({ ...f, [chave]: valor }));
 return <section className="mapa" aria-labelledby="titulo-mapa">
  <header className="mapa-cabecalho"><h1 id="titulo-mapa">Mapa da escola</h1>
   {!edicao && estado && mapa.length > 0 && <button className="botao principal" onClick={() => iniciarEdicao()}>Editar planta</button>}
  </header>
  {erro && <div className="erro" role="alert">{erro}{!estado && <button className="botao secundario" onClick={() => void carregar()}>Tentar novamente</button>}</div>}
  {aviso && <p role="status">{aviso}</p>}
  {!estado ? !erro && <p role="status">Carregando a planta.</p> : <>
   <details className="mapa-filtros-detalhes"><summary>Filtros do mapa{filtros.ano || filtros.sala || filtros.base !== 'relator' || filtros.periodo !== '30' ? ' (ativos)' : ''}</summary>
   <div className="mapa-filtros" aria-label="Filtros de casos">
    <label>Período<select value={filtros.periodo} onChange={e => filtrar('periodo', e.target.value)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="todos">Todo o período</option></select></label>
    <label>Base das turmas<select value={filtros.base} onChange={e => filtrar('base', e.target.value)}><option value="relator">Turma de quem relata</option><option value="autores">Autores apurados</option></select></label>
    <label>Ano da turma<input maxLength={40} value={filtros.ano} onChange={e => filtrar('ano', e.target.value)} placeholder="Todos" /></label>
    <label>Sala da turma<input maxLength={50} value={filtros.sala} onChange={e => filtrar('sala', e.target.value)} placeholder="Todas" /></label>
   </div>
   <p className="texto-pequeno">Contagens representam casos, não pessoas. Simulações não entram. Cada ambiente inclui seus descendentes.</p>
   <div className="mapa-legenda" aria-label="Legenda de casos"><span data-concentracao="0">0 casos</span><span data-concentracao="1">1 a 3 casos</span><span data-concentracao="2">4 a 7 casos</span><span data-concentracao="3">8 ou mais casos</span></div>
   </details>
   {erroResumo ? <p role="alert">Contagens indisponíveis. {erroResumo}</p> : resumo && <div className="mapa-contagens" aria-label="Resumo dos casos"><p><strong>{resumo.total}</strong> casos no período</p><p><strong>{resumo.sem_local}</strong> sem local</p><p><strong>{resumo.sem_turma}</strong> sem turma</p>{filtros.base === 'autores' && <p><strong>{resumo.sem_autoria}</strong> sem autoria apurada</p>}</div>}
   <div className="mapa-ferramentas"><nav aria-label="Níveis da planta" className={mapa.length > 0 && !visiveis.length ? 'mapa-niveis-destaque' : undefined}><button className="botao secundario" onClick={() => navegar(null)}>Escola</button>{trilha.map(a => <button className="botao secundario" key={a.id} onClick={() => navegar(a.id)}>{a.nome}</button>)}</nav><label>Zoom<select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[50, 75, 100, 125, 150, 200].map(z => <option value={z} key={z}>{z}%</option>)}</select></label><label>Buscar ambiente<input value={busca} onChange={e => setBusca(e.target.value)} maxLength={80}/></label></div>
   {busca.trim() && <ul className="mapa-resultados">{mapa.filter(a => a.nome.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase())).map(a => <li key={a.id}><button className="botao secundario" onClick={() => { navegar(a.pai_id); selecionar(a.id); }}>{[...caminho(a.pai_id, mapa).map(p => p.nome), a.nome].join(' / ')}</button></li>)}</ul>}
   {edicao && <div className="mapa-edicao"><p>Arraste sobre a área vazia para desenhar. Selecione um ambiente para mover; arraste seu canto para redimensionar.</p><div className="acoes"><button className="botao secundario" disabled={ocupado || !historico.length} onClick={() => { setRascunho(historico[historico.length - 1]); setHistorico(h => h.slice(0, -1)); setSelecionado(null); }}>Desfazer</button><button className="botao secundario" disabled={ocupado} onClick={() => { setRascunho(null); setHistorico([]); setSelecionado(null); setDesenhar(false); setPai(null); void carregar(); }}>Cancelar edição</button><button className="botao principal" disabled={ocupado} onClick={() => void salvar()}>{ocupado ? 'Salvando…' : 'Salvar planta'}</button></div></div>}
   {edicao && <div className="mapa-edicao"><div className="acoes">
    <button type="button" className="botao secundario" disabled={ocupado || larguraPlanta >= LIMITE_LARGURA} onClick={() => setExtensao({ largura: Math.min(LIMITE_LARGURA, larguraPlanta + 400), altura: alturaPlanta })}>Ampliar para a direita</button>
    <button type="button" className="botao secundario" disabled={ocupado || alturaPlanta >= LIMITE_ALTURA} onClick={() => setExtensao({ largura: larguraPlanta, altura: Math.min(LIMITE_ALTURA, alturaPlanta + 400) })}>Ampliar para baixo</button>
   </div><p className="texto-pequeno">Amplie a área para adicionar mais blocos. Use a rolagem para alcançar o espaço novo ou afaste o zoom.</p></div>}
   {edicao && conferenciaAberta && avisosPlanta.length > 0 && <section className="aviso" aria-label="Conferência da planta"><h2>Confira antes de salvar</h2><p>{avisosPlanta.length} avisos encontrados. Áreas sobrepostas podem ser intencionais; confira os ambientes antes de continuar.</p><ul>{avisosPlanta.slice(0,20).map((a,i) => <li key={i}>{a.texto} <button type="button" className="botao-texto" onClick={() => { const alvo = mapa.find(b => b.id === a.ids[0]); if (alvo) { navegar(alvo.pai_id); selecionar(alvo.id); } }}>Localizar ambiente</button></li>)}</ul>{avisosPlanta.length > 20 && <p>Mostrando os primeiros 20 avisos.</p>}<div className="acoes"><button type="button" className="botao secundario" onClick={() => setConferenciaAberta(false)}>Continuar editando</button><button type="button" className="botao principal" disabled={ocupado} onClick={() => void salvar(true)}>Salvar mesmo assim</button></div></section>}
   <div className="mapa-corpo"><div>{!edicao && mapa.length === 0 && <section className="mapa-vazio-cartao" aria-labelledby="titulo-mapa-vazio"><h2 id="titulo-mapa-vazio">A planta ainda está vazia</h2><p>Adicione uma ala ou um ambiente para começar.</p><button className="botao principal" onClick={() => iniciarEdicao(true)}>Editar planta</button></section>}<div hidden={!edicao && mapa.length === 0} ref={rolagem} className={`mapa-rolagem mapa-zoom-${zoom}`} role="region" aria-label="Área rolável da planta" tabIndex={0}>
    <svg ref={svg} viewBox={`0 0 ${larguraPlanta} ${alturaPlanta}`} width={`${larguraPlanta / 1200 * zoom}%`} className={desenhar ? 'mapa-planta desenhando' : 'mapa-planta'} aria-label="Planta esquemática do nível atual" role="group" onPointerDown={iniciar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={() => { if (gesto.current) setRascunho(gesto.current.origem); gesto.current = null; setPrevia(null); }}>
     <rect width={larguraPlanta} height={alturaPlanta} className="mapa-fundo" />
     {visiveis.map(a => <g key={a.id} data-ambiente={a.id} data-concentracao={!resumo ? 0 : (agregarAmbiente(a.id, mapa, resumo.ambientes) === 0 ? 0 : agregarAmbiente(a.id, mapa, resumo.ambientes) <= 3 ? 1 : agregarAmbiente(a.id, mapa, resumo.ambientes) <= 7 ? 2 : 3)} className={selecionado === a.id ? 'mapa-ambiente selecionado' : 'mapa-ambiente'} role="button" tabIndex={0} aria-label={`${a.nome}, ${TIPOS[a.tipo]}${resumo ? `, ${agregarAmbiente(a.id, mapa, resumo.ambientes)} casos` : ''}`} onClick={() => !desenhar && setSelecionado(a.id)} onDoubleClick={() => { if (a.tipo === 'escadaria') navegar(a.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelecionado(a.id); } }}>
      <title>{a.nome}</title>{a.formato === 'l' ? <polygon points={pontosL(a)}/> : <rect x={a.x} y={a.y} width={a.largura} height={a.altura} rx="8"/>}{faixaTexto(a).altura >= 32 && <text x={a.x + 12} y={faixaTexto(a).y + 26} style={tamanhoTexto}>{a.nome.length > Math.floor(a.largura / (12 * tamanhoTexto.fontSize / 20)) ? `${a.nome.slice(0, Math.max(1, Math.floor(a.largura / (12 * tamanhoTexto.fontSize / 20)) - 1))}…` : a.nome}</text>}{resumo && faixaTexto(a).altura >= 60 && <text x={a.x + 12} y={faixaTexto(a).y + 52} style={tamanhoTexto}>{agregarAmbiente(a.id, mapa, resumo.ambientes)} casos</text>}
      {edicao && selecionado === a.id && <rect data-tamanho="true" className="mapa-alca" x={Math.max(0, a.x + a.largura - tamanhoAlca)} y={Math.max(0, a.y + a.altura - tamanhoAlca)} width={tamanhoAlca} height={tamanhoAlca}/>}
     </g>)}
     {previa && (previa.formato === 'l' ? <polygon className="mapa-previa" points={pontosL(previa)}/> : <rect className="mapa-previa" x={previa.x} y={previa.y} width={previa.largura} height={previa.altura}/>)}
    </svg></div>{!visiveis.length && (mapa.length > 0 || edicao) && <section className="mapa-vazio-cartao" aria-label="Nível sem ambientes">{mapa.length === 0 ? <><h2>A planta ainda está vazia</h2><p>Adicione uma ala ou um ambiente para começar.</p></> : <p>Este nível ainda não tem ambientes.</p>}<p className="texto-pequeno">{edicao ? 'Digite um nome em Novo ambiente e use Adicionar ou desenhe na área vazia.' : 'Use os níveis acima para voltar ou escolha Editar planta para adicionar.'}</p></section>}
    <p className="texto-pequeno">Planta esquemática · {larguraPlanta} × {alturaPlanta} unidades neste nível · sem escala métrica</p>
   </div><aside className="mapa-inspector" aria-label="Ambiente selecionado">
    {atual && <><h2>{atual.nome}</h2><p>{TIPOS[atual.tipo]}{resumo ? ` · ${agregarAmbiente(atual.id, mapa, resumo.ambientes)} casos` : ''}</p>{atual.tipo === 'escadaria' && <button className="botao secundario" onClick={() => navegar(atual.id)}>Abrir este nível</button>}</>}
    {atual && distribuicao && <div className="mapa-distribuicao"><h3>Casos por ano</h3>{distribuicao.anos.length ? <ul>{distribuicao.anos.map(a => <li key={a.ano}>{a.ano}: <strong>{a.total}</strong> {a.total === 1 ? 'caso' : 'casos'}</li>)}</ul> : <p>Sem informação de ano neste ambiente.</p>}<h3>Casos por turma</h3>{distribuicao.salas.length ? <ul>{distribuicao.salas.map(s => <li key={JSON.stringify([s.ano, s.sala])}>{s.ano}, sala {s.sala}: <strong>{s.total}</strong> {s.total === 1 ? 'caso' : 'casos'}</li>)}</ul> : <p>Sem informação de turma neste ambiente.</p>}{filtros.base === 'autores' && <p className="texto-pequeno">Um caso com autores de turmas diferentes pode aparecer em mais de um grupo. Os grupos não devem ser somados como total de casos.</p>}</div>}
    {edicao && formulario && <form onSubmit={e => { e.preventDefault(); if (formulario.nome.trim() && [formulario.x, formulario.y, formulario.largura, formulario.altura].every(Number.isFinite)) alterar(mapa.map(a => a.id === formulario.id ? ajustar({ ...formulario, nome: formulario.nome.trim() }) : a)); }}>
     <label>Nome do ambiente<input required maxLength={80} value={formulario.nome} onChange={e => setFormulario({ ...formulario, nome: e.target.value })}/></label><label>Tipo do ambiente<select value={formulario.tipo} onChange={e => setFormulario({ ...formulario, tipo: e.target.value as TipoAmbiente })}>{Object.entries(TIPOS).map(([v, texto]) => <option key={v} value={v}>{texto}</option>)}</select></label>
     <ControlesFormato valor={formulario} aoMudar={forma => setFormulario({ ...formulario, ...forma })}/><label>Dentro de<select value={formulario.pai_id ?? ''} onChange={e => setFormulario({ ...formulario, pai_id: e.target.value || null })}><option value="">Escola</option>{mapa.filter(a => !filhosSelecionados.has(a.id) && caminho(a.id, mapa).length + profundidadeFilhos < 6).map(a => <option key={a.id} value={a.id}>{caminho(a.id, mapa).map(p => p.nome).join(' / ')}</option>)}</select></label>
     <div className="mapa-numeros">{(['x', 'y', 'largura', 'altura'] as const).map(campo => <label key={campo}>{{ x: 'Posição X', y: 'Posição Y', largura: 'Largura', altura: 'Altura' }[campo]}<input required type="number" min={campo === 'largura' || campo === 'altura' ? 40 : 0} max={campo === 'x' || campo === 'largura' ? LIMITE_LARGURA : LIMITE_ALTURA} value={formulario[campo]} onChange={e => setFormulario({ ...formulario, [campo]: e.target.value === '' ? '' : Number(e.target.value) } as Ambiente)}/></label>)}</div><button disabled={ocupado} className="botao secundario">Aplicar alterações</button>
     <button type="button" className="botao secundario" disabled={ocupado || mapa.some(a => a.pai_id === formulario.id)} onClick={() => { alterar(mapa.filter(a => a.id !== formulario.id)); setSelecionado(null); }}>Excluir ambiente</button><p className="texto-pequeno">Ambientes com filhos não podem ser excluídos. O servidor protege os vínculos com casos.</p>
    </form>}
    {edicao && <form onSubmit={e => { e.preventDefault(); novo(); }}><h2>Novo ambiente</h2><label>Nome do novo ambiente<input ref={campoNovo} required maxLength={80} value={nome} onChange={e => setNome(e.target.value)}/></label><label>Tipo do novo ambiente<select value={tipo} onChange={e => setTipo(e.target.value as TipoAmbiente)}>{Object.entries(TIPOS).map(([v, texto]) => <option key={v} value={v}>{texto}</option>)}</select></label><ControlesFormato novo valor={formaNova} aoMudar={setFormaNova}/><button disabled={ocupado} className="botao secundario">Adicionar ambiente</button><button disabled={ocupado} type="button" className="botao secundario" aria-pressed={desenhar} onClick={() => { setErro(''); setDesenhar(d => !d); }}>{desenhar ? 'Parar desenho' : formaNova.formato === 'l' ? 'Desenhar em L' : 'Desenhar retângulo'}</button><p className="texto-pequeno">O botão Adicionar cria o ambiente sem usar o mouse. Ajuste posição e tamanho pelos campos.</p></form>}
    {!edicao && !atual && <p>Selecione um ambiente para consultar. Use uma escadaria para mudar de nível.</p>}
   </aside></div>
  </>}
 </section>;
}








