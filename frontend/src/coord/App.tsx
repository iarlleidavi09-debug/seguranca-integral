import { useCallback, useEffect, useRef, useState } from 'react';
import { estadoSetup, obterResumo, ouvirSessaoPerdida, quemSou, sair } from '../shared/api';
import type { EstadoSetup, FiltrosFila, Usuario } from '../shared/api';
import Login from './Login';
import Fila from './Fila';
import Geral from './Geral';
import Caso from './Caso';
import Usuarios from './Usuarios';
import Setup from './Setup';
import Ensaio from './Ensaio';
import Navegacao from './Navegacao';
import Mapa from './mapa/Mapa';
import Relatorios from './Relatorios';
import MetalLiquido from './MetalLiquido';
import type { Tela } from './Navegacao';
import { useTempoReal } from '../shared/tempoReal';
import { limparRascunhosAtendimento } from './rascunhosAtendimento';
import './qualidadedevida-fila.css';

const FILTROS_VAZIOS: FiltrosFila = { status: '', prioridade: '', tipo: '', q: '' };

// Só o número do caso vai para o endereço; nunca texto de caso nem nome de pessoa.
function telaDoEndereco(): Tela {
  const hash = window.location.hash;
  const caso = /^#caso-(\d{1,9})$/.exec(hash);
  if (caso) return { nome: 'caso', id: Number(caso[1]) };
  if (hash === '#atendimento') return { nome: 'atendimento' };
  if (hash === '#casos') return { nome: 'casos' };
  if (hash === '#pos-resolucao') return { nome: 'pos' };
  if (hash === '#usuarios') return { nome: 'usuarios' }; // quem não é admin cai na Visão geral (ver telaVisivel)
  if (hash === '#mapa') return { nome: 'mapa' };
  if (hash === '#relatorios') return { nome: 'relatorios' };
  if (hash === '#ensaio') return { nome: 'ensaio' };
  return { nome: 'geral' };
}
function enderecoDa(tela: Tela): string {
  if (tela.nome === 'caso') return `#caso-${tela.id}`;
  if (tela.nome === 'geral') return window.location.pathname;
  return tela.nome === 'pos' ? '#pos-resolucao' : `#${tela.nome}`;
}

export default function App() {
  const [sessao, setSessao] = useState<Usuario | null | 'verificando'>('verificando');
  const [perdida, setPerdida] = useState(false);
  const [mapaVisitado, setMapaVisitado] = useState(false);
  // primeiro acesso: banco sem usuários; `local` diz se a criação é permitida deste aparelho
  const [setup, setSetup] = useState<EstadoSetup | null>(null);
  const [filtros, setFiltros] = useState<FiltrosFila>(FILTROS_VAZIOS);
  // a Pós-resolução guarda os próprios filtros; o status dela é sempre resolvido
  const [filtrosMeus, setFiltrosMeus] = useState<FiltrosFila>(FILTROS_VAZIOS);
  const [filtrosPos, setFiltrosPos] = useState<FiltrosFila>(FILTROS_VAZIOS);
  const [tela, setTela] = useState<Tela>(telaDoEndereco);
  const [origemFila, setOrigemFila] = useState<{ tela: 'atendimento' | 'casos' | 'pos'; ids: number[]; id: number; rolagem: number } | null>(null);
  const main = useRef<HTMLElement>(null);
  const atual = useRef(sessao);
  atual.current = sessao;

  useEffect(() => {
    // qualquer chamada que responda 401 devolve a pessoa ao Login
    ouvirSessaoPerdida(() => {
      limparRascunhosAtendimento();
      setOrigemFila(null);
      if (atual.current !== null && atual.current !== 'verificando') setPerdida(true);
      setSessao(null);
    });
    let ativo = true;
    quemSou().then(u => { if (ativo) setSessao(u); }).catch(async () => {
      // sem sessão: se ainda não há nenhuma conta, o primeiro acesso é a criação do administrador
      let estado: EstadoSetup | null = null;
      try { const e = await estadoSetup(); if (e.pendente) estado = e; } catch { /* segue para o login */ }
      if (ativo) { setSetup(estado); setSessao(null); }
    });
    return () => { ativo = false; ouvirSessaoPerdida(null); };
  }, []);

  useEffect(() => {
    const aoNavegar = () => setTela(telaDoEndereco());
    window.addEventListener('popstate', aoNavegar);
    window.addEventListener('hashchange', aoNavegar);
    return () => { window.removeEventListener('popstate', aoNavegar); window.removeEventListener('hashchange', aoNavegar); };
  }, []);

  const ir = useCallback((proxima: Tela) => {
    window.history.pushState(null, '', enderecoDa(proxima));
    setTela(proxima);
  }, []);
  // vai para Casos já com os filtros pedidos (usado pela Visão geral)
  const verCasos = useCallback((parcial: Partial<FiltrosFila>) => {
    setFiltros({ ...FILTROS_VAZIOS, ...parcial });
    ir({ nome: 'casos' });
  }, [ir]);
  const [pendencias, setPendencias] = useState(0);
  const ehAdmin = typeof sessao === 'object' && sessao !== null && sessao.papel === 'admin';
  const telaVisivel: Tela = tela.nome === 'usuarios' && !ehAdmin ? { nome: 'geral' } : tela;
  const chaveTela = telaVisivel.nome === 'caso' ? `caso-${telaVisivel.id}` : telaVisivel.nome;
  const anterior = useRef(chaveTela);
  useEffect(() => {
    let transicao: Animation | undefined;
    if (anterior.current !== chaveTela) {
      main.current?.focus();
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        transicao = main.current?.animate?.([
          { opacity: 0.65, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
    }
    anterior.current = chaveTela;
    return () => transicao?.cancel();
  }, [chaveTela]);

  // contador da navegação; se o resumo falhar, a casca segue sem contador
  const logada = typeof sessao === 'object' && sessao !== null;
  useEffect(() => {
    if (!logada) setMapaVisitado(false);
    else if (telaVisivel.nome === 'mapa') setMapaVisitado(true);
  }, [logada, telaVisivel.nome]);
  const rodadaResumo = useRef(0);
  const atualizarResumo = useCallback(() => {
    const minha = ++rodadaResumo.current;
    obterResumo().then(r => { if (minha === rodadaResumo.current) setPendencias(r.recorrencia_pendente); })
      .catch(() => { if (minha === rodadaResumo.current) setPendencias(0); });
  }, []);
  const conexao = useTempoReal('coord', logada, atualizarResumo);
  useEffect(() => {
    if (!logada) { rodadaResumo.current += 1; setPendencias(0); return; }
    atualizarResumo();
    return () => { rodadaResumo.current += 1; };
  }, [logada, chaveTela, atualizarResumo]);

  async function encerrar() {
    limparRascunhosAtendimento();
    setOrigemFila(null);
    try { await sair(); } catch { /* o cookie vence sozinho; a tela de entrada aparece de qualquer forma */ }
    limparRascunhosAtendimento();
    setPerdida(false); setSessao(null); setMapaVisitado(false); setTela({ nome: 'geral' }); setFiltros(FILTROS_VAZIOS); setFiltrosPos(FILTROS_VAZIOS); setFiltrosMeus(FILTROS_VAZIOS);
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (sessao === 'verificando') return <div className="coord-app"><main id="conteudo" className="login"><p role="status">Verificando a sessão.</p></main></div>;
  if (sessao === null && setup) {
    return <div className="coord-app"><Setup local={setup.local} aoCriar={usuario => { setSetup(null); setSessao(usuario); }} /></div>;
  }
  if (sessao === null) {
    return <div className="coord-app"><Login aviso={perdida ? 'Sua sessão terminou. Entre de novo para continuar.' : undefined}
      aoEntrar={usuario => { setPerdida(false); setFiltros(FILTROS_VAZIOS); setFiltrosPos(FILTROS_VAZIOS); setFiltrosMeus(FILTROS_VAZIOS); setSessao(usuario); }} /></div>;
  }

  const admin = sessao.papel === 'admin';
  const abrirCaso = (id: number, orderedIds?: number[]) => {
    if (orderedIds && (telaVisivel.nome === 'atendimento' || telaVisivel.nome === 'casos' || telaVisivel.nome === 'pos')) {
      setOrigemFila({ tela: telaVisivel.nome, ids: orderedIds, id, rolagem: window.scrollY });
    } else setOrigemFila(null);
    ir({ nome: 'caso', id });
  };
  const indiceCaso = telaVisivel.nome === 'caso' ? origemFila?.ids.indexOf(telaVisivel.id) ?? -1 : -1;
  const navegarCaso = (passo: number) => {
    const id = origemFila?.ids[indiceCaso + passo];
    if (id === undefined || !origemFila) return;
    setOrigemFila({ ...origemFila, id });
    ir({ nome: 'caso', id });
  };
  return <div className="coord-app">
    <a className="pular" href="#conteudo" onClick={e => { e.preventDefault(); main.current?.focus(); }}>Pular para o conteúdo</a>
    <div className="coord-layout">
      <div className="coord-lateral">
        <div className="coord-marca-linha"><p className="marca">TETRAGUARD <span>Coordenação</span></p><p className="coord-proposito">Cuidado e convivência escolar</p></div>
        <Navegacao tela={telaVisivel} admin={admin} pendencias={pendencias} aoIr={ir} />
        <div className="coord-lateral-rodape">
          <div className="sessao"><span className="sessao-nome">{sessao.nome}</span>
            <button type="button" className="botao secundario" onClick={() => void encerrar()}>Sair</button></div>
          <MetalLiquido />
        </div>
      </div>
      <div className="coord-coluna">
        <div className="coord-topo">
          <span className="texto-pequeno" role="status">{conexao === 'online' ? 'Atualizações ao vivo' : conexao === 'conectando' ? 'Conectando às atualizações' : 'Reconectando; atualização a cada 8 segundos'}</span></div>
        <main id="conteudo" ref={main} tabIndex={-1} className="painel">
          {telaVisivel.nome === 'geral' && <Geral aoVerCasos={verCasos} aoAbrirCaso={abrirCaso} />}
          {telaVisivel.nome === 'atendimento' && <Fila modo="casos" userId={sessao.id} meuId={sessao.id} filtros={filtrosMeus} aoFiltrar={setFiltrosMeus} aoAbrir={abrirCaso} retorno={origemFila?.tela === 'atendimento' ? origemFila : undefined} />}
          {telaVisivel.nome === 'casos' && <Fila modo="casos" userId={sessao.id} filtros={filtros} aoFiltrar={setFiltros} aoAbrir={abrirCaso} retorno={origemFila?.tela === 'casos' ? origemFila : undefined} />}
          {telaVisivel.nome === 'pos' && <Fila modo="pos" userId={sessao.id} filtros={filtrosPos} aoFiltrar={setFiltrosPos} aoAbrir={abrirCaso} retorno={origemFila?.tela === 'pos' ? origemFila : undefined} />}
          {telaVisivel.nome === 'caso' && <>
            {origemFila && indiceCaso >= 0 && <div className="fila-navegar" role="group" aria-label="Navegar nos casos da fila">
              <p className="texto-pequeno">{origemFila.tela === 'atendimento' ? 'Meu atendimento' : origemFila.tela === 'pos' ? 'Pós-resolução' : 'Casos'} · {indiceCaso + 1} de {origemFila.ids.length} na fila selecionada</p>
              <div><button type="button" className="botao secundario" disabled={indiceCaso === 0} onClick={() => navegarCaso(-1)}>Caso anterior</button>
              <button type="button" className="botao secundario" disabled={indiceCaso === origemFila.ids.length - 1} onClick={() => navegarCaso(1)}>Próximo caso</button></div>
            </div>}
            <Caso key={telaVisivel.id} id={telaVisivel.id} aoVoltar={() => {
              if (origemFila) setOrigemFila({ ...origemFila, id: telaVisivel.id });
              ir({ nome: origemFila?.tela ?? 'casos' });
            }} aoMudar={atualizarResumo} />
          </>}
          {telaVisivel.nome === 'usuarios' && <Usuarios meuId={sessao.id} aoLimpar={atualizarResumo} />}
          {telaVisivel.nome === 'ensaio' && <Ensaio />}
          {telaVisivel.nome === 'relatorios' && <Relatorios />}
          {(mapaVisitado || telaVisivel.nome === 'mapa') && <div hidden={telaVisivel.nome !== 'mapa'}><Mapa /></div>}
        </main>
      </div>
    </div>
  </div>;
}
