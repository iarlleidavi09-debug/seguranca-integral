import { useCallback, useEffect, useRef, useState } from 'react';
import { estadoSetup, obterResumo, ouvirSessaoPerdida, quemSou, sair } from '../shared/api';
import type { EstadoSetup, FiltrosFila, Usuario } from '../shared/api';
import Login from './Login';
import Fila from './Fila';
import Caso from './Caso';
import Usuarios from './Usuarios';
import Setup from './Setup';
import Ensaio from './Ensaio';
import Navegacao from './Navegacao';
import type { Tela } from './Navegacao';

const FILTROS_VAZIOS: FiltrosFila = { status: '', prioridade: '', tipo: '', q: '' };

// Só o número do caso vai para o endereço; nunca texto de caso nem nome de pessoa.
function telaDoEndereco(): Tela {
  const hash = window.location.hash;
  const caso = /^#caso-(\d{1,9})$/.exec(hash);
  if (caso) return { nome: 'caso', id: Number(caso[1]) };
  if (hash === '#casos') return { nome: 'casos' };
  if (hash === '#pos-resolucao') return { nome: 'pos' };
  if (hash === '#usuarios') return { nome: 'usuarios' };
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
  // primeiro acesso: banco sem usuários; `local` diz se a criação é permitida deste aparelho
  const [setup, setSetup] = useState<EstadoSetup | null>(null);
  const [filtros, setFiltros] = useState<FiltrosFila>(FILTROS_VAZIOS);
  const [tela, setTela] = useState<Tela>(telaDoEndereco);
  const main = useRef<HTMLElement>(null);
  const atual = useRef(sessao);
  atual.current = sessao;

  useEffect(() => {
    // qualquer chamada que responda 401 devolve a pessoa ao Login
    ouvirSessaoPerdida(() => {
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
  const chaveTela = tela.nome === 'caso' ? `caso-${tela.id}` : tela.nome;
  const anterior = useRef(chaveTela);
  useEffect(() => {
    if (anterior.current !== chaveTela) main.current?.focus();
    anterior.current = chaveTela;
  }, [chaveTela]);

  // contador da navegação; se o resumo falhar, a casca segue sem contador
  const logada = typeof sessao === 'object' && sessao !== null;
  useEffect(() => {
    if (!logada) { setPendencias(0); return; }
    let ativo = true;
    obterResumo().then(r => { if (ativo) setPendencias(r.recorrencia_pendente); }).catch(() => { if (ativo) setPendencias(0); });
    return () => { ativo = false; };
  }, [logada, chaveTela]);

  async function encerrar() {
    try { await sair(); } catch { /* o cookie vence sozinho; a tela de entrada aparece de qualquer forma */ }
    setPerdida(false); setSessao(null); setTela({ nome: 'geral' }); setFiltros(FILTROS_VAZIOS);
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (sessao === 'verificando') return <div className="coord-app"><main id="conteudo" className="login"><p role="status">Verificando a sessão.</p></main></div>;
  if (sessao === null && setup) {
    return <div className="coord-app"><Setup local={setup.local} aoCriar={usuario => { setSetup(null); setSessao(usuario); }} /></div>;
  }
  if (sessao === null) {
    return <div className="coord-app"><Login aviso={perdida ? 'Sua sessão terminou. Entre de novo para continuar.' : undefined}
      aoEntrar={usuario => { setPerdida(false); setFiltros(FILTROS_VAZIOS); setSessao(usuario); }} /></div>;
  }

  const admin = sessao.papel === 'admin';
  // as telas Visão geral, Casos e Pós-resolução mostram a Fila atual até serem refeitas
  const fila = <Fila aoAbrir={id => ir({ nome: 'caso', id })} filtros={{ status: filtros.status, tipo: filtros.tipo }}
    aoFiltrar={f => setFiltros(anterior => ({ ...anterior, ...f }))} />;
  return <div className="coord-app">
    <a className="pular" href="#conteudo" onClick={e => { e.preventDefault(); main.current?.focus(); }}>Pular para o conteúdo</a>
    <div className="coord-layout">
      <div className="coord-lateral">
        <p className="marca">Segurança Integral <span>Coordenação</span></p>
        <Navegacao tela={tela} admin={admin} pendencias={pendencias} aoIr={ir} />
        <div className="sessao"><span className="sessao-nome">{sessao.nome}</span>
          <button type="button" className="botao secundario" onClick={() => void encerrar()}>Sair</button></div>
      </div>
      <div className="coord-coluna">
        <div className="coord-topo"><p><span className="ponto" aria-hidden="true" />Responsabilidade compartilhada</p></div>
        <main id="conteudo" ref={main} tabIndex={-1} className="painel">
          {/* substituída na Task 3 */}
          {tela.nome === 'geral' && fila}
          {/* substituída na Task 4 */}
          {tela.nome === 'casos' && fila}
          {/* substituída na Task 6 */}
          {tela.nome === 'pos' && fila}
          {tela.nome === 'caso' && <Caso key={tela.id} id={tela.id} aoVoltar={() => ir({ nome: 'casos' })} />}
          {tela.nome === 'usuarios' && admin && <Usuarios meuId={sessao.id} />}
          {tela.nome === 'ensaio' && <Ensaio />}
        </main>
      </div>
    </div>
  </div>;
}
