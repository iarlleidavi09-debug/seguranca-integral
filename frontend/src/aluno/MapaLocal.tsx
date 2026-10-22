import { useEffect, useRef, useState } from 'react';
import { obterPlantaPublica } from '../shared/mapa';
import type { Ambiente } from '../shared/mapa';
import { caminho, faixaTexto, pontosL } from '../coord/mapa/modelo';
import './mapa-local.css';

export default function MapaLocal({ valor, aoEscolher }: { valor: string; aoEscolher: (id: string) => void }) {
 const [ambientes, setAmbientes] = useState<Ambiente[] | null>(null);
 const [erro, setErro] = useState(false), [tentativa, setTentativa] = useState(0);
 const [busca, setBusca] = useState(''), [localizado, setLocalizado] = useState<string | null>(null);
 const rolagem = useRef<HTMLDivElement>(null);
 const [pai, setPai] = useState<string | null>(null), [zoom, setZoom] = useState(50);
 useEffect(() => {
  const controle = new AbortController();
  const timeout = setTimeout(() => controle.abort(), 8000);
  setErro(false);
  obterPlantaPublica(controle.signal).then(dados => {
   if (!Array.isArray(dados.ambientes) || dados.ambientes.some(a => ![a.x,a.y,a.largura,a.altura].every(Number.isFinite))) throw new Error('Planta inválida');
   if (!controle.signal.aborted) setAmbientes(dados.ambientes);
  }).catch(() => { if (!desmontado) setErro(true); }).finally(() => clearTimeout(timeout));
  let desmontado = false;
  return () => { desmontado = true; clearTimeout(timeout); controle.abort(); };
 }, [tentativa]);
 useEffect(() => {
  const local = ambientes?.find(a => a.id === valor);
  if (local) setPai(local.pai_id);
 }, [valor, ambientes]);
 useEffect(() => {
  if (!localizado) return;
  const frame = requestAnimationFrame(() => {
   const viewport = rolagem.current;
   const alvo = [...(viewport?.querySelectorAll<SVGGElement>('[data-local]') ?? [])].find(a => a.getAttribute('data-local') === localizado);
   if (!viewport || !alvo) return;
   const v = viewport.getBoundingClientRect(), r = alvo.getBoundingClientRect();
   viewport.scrollLeft += r.left-v.left-16;
   viewport.scrollTop += r.top-v.top-16;
  });
  return () => cancelAnimationFrame(frame);
 }, [localizado, pai, zoom]);
 if (erro) return <div className="planta-local"><p>A planta não pôde ser exibida. Escolha pela lista ou descreva o local.</p><button type="button" className="botao secundario" onClick={() => setTentativa(n => n+1)}>Tentar carregar a planta</button></div>;
 if (!ambientes) return <p role="status">Carregando a planta da escola…</p>;
 if (!ambientes.length) return null;
 const nivel = ambientes.filter(a => a.pai_id === pai);
 const largura = Math.max(1200, ...nivel.map(a => a.x+a.largura+40));
 const altura = Math.max(800, ...nivel.map(a => a.y+a.altura+40));
 const escolhido = ambientes.find(a => a.id === valor);
 const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
 const encontrados = busca.trim() ? ambientes.filter(a => normalizar(a.nome).includes(normalizar(busca.trim()))) : [];
 const possuiFilhos = (id: string) => ambientes.some(a => a.pai_id === id);
 function ativar(a: Ambiente) {
  if (a.tipo === 'escadaria' && possuiFilhos(a.id)) setPai(a.id);
  else aoEscolher(a.id);
 }
 return <section className="planta-local" aria-label="Marcar local na planta">
  <p>Toque no ambiente onde aconteceu. Use as escadas para mudar de andar.</p>
  <label>Buscar ambiente na planta<input type="search" maxLength={80} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Biblioteca, quadra, sala…" /></label>
  {busca.trim() && <div className="planta-local-busca"><p role="status">{encontrados.length} {encontrados.length === 1 ? 'ambiente encontrado' : 'ambientes encontrados'}{encontrados.length > 20 ? '. Refine a busca; mostrando os primeiros 20.' : '.'}</p><ul>{encontrados.slice(0,20).map(a => <li key={a.id}><button type="button" className="botao secundario" aria-label={`Localizar ${a.nome}`} onClick={() => { setPai(a.pai_id); setLocalizado(a.id); setBusca(''); }}>{caminho(a.id, ambientes).map(p => p.nome).join(' / ')}</button></li>)}</ul></div>}
  <div className="planta-local-ferramentas"><nav aria-label="Andares da escola"><button type="button" className="botao secundario" onClick={() => setPai(null)}>Térreo / escola</button>{caminho(pai,ambientes).map(a => <button type="button" className="botao secundario" key={a.id} onClick={() => setPai(a.id)}>{a.nome}</button>)}</nav>
   <label>Zoom da planta<select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[25,50,75,100].map(n=><option key={n} value={n}>{n}%</option>)}</select></label></div>
  <div ref={rolagem} className="planta-local-rolagem" tabIndex={0} role="region" aria-label="Planta rolável da escola" key={pai ?? 'escola'}>
   <svg viewBox={`0 0 ${largura} ${altura}`} width={Math.max(720,largura*zoom/100)} role="group" aria-label="Ambientes do andar atual">
    {nivel.map(a => <g key={a.id} data-local={a.id} className={`planta-local-ambiente${a.id===valor?' marcado':''}${a.id===localizado?' localizado':''}`} role="button" tabIndex={0} aria-pressed={a.id===valor} aria-label={`${a.tipo==='escadaria'&&possuiFilhos(a.id)?'Ir para: ':'Marcar: '}${a.nome}`} onClick={()=>ativar(a)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ativar(a);}}}>
     <title>{a.nome}</title>{a.formato==='l'?<polygon points={pontosL(a)}/>:<rect x={a.x} y={a.y} width={a.largura} height={a.altura} rx={8}/>}
     <text x={a.x+12} y={faixaTexto(a).y+30}>{a.nome.length>Math.floor(a.largura/12)?a.nome.slice(0,Math.max(1,Math.floor(a.largura/12)-1))+'…':a.nome}</text>
    </g>)}
   </svg>
  </div>
  <p className="texto-pequeno">Arraste as barras de rolagem para explorar a planta. Aumente o zoom para ler os nomes.</p>
  <p role="status">{escolhido ? `Local marcado: ${escolhido.nome}` : 'Nenhum local marcado na planta.'}</p>
  {escolhido?.tipo === 'escadaria' && possuiFilhos(escolhido.id) && <button type="button" className="botao secundario" onClick={()=>setPai(escolhido.id)}>Ver ambientes de {escolhido.nome}</button>}
 </section>;
}
