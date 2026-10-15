import { useCallback, useEffect, useRef, useState } from 'react';
import { estadoSetup, ouvirSessaoPerdida, quemSou, sair } from '../shared/api';
import type { EstadoSetup, Usuario } from '../shared/api';
import Login from './Login';
import Fila from './Fila';
import type { Filtros } from './Fila';
import Caso from './Caso';
import Usuarios from './Usuarios';
import Setup from './Setup';
import Ensaio from './Ensaio';

type Tela = { nome: 'fila' } | { nome: 'caso'; id: number } | { nome: 'usuarios' } | { nome: 'ensaio' };

// Só o número do caso vai para o endereço; nunca texto de caso nem nome de pessoa.
function telaDoEndereco(): Tela {
  const hash = window.location.hash;
  const caso = /^#caso-(\d{1,9})$/.exec(hash);
  if (caso) return { nome: 'caso', id: Number(caso[1]) };
  if (hash === '#usuarios') return { nome: 'usuarios' };
  if (hash === '#ensaio') return { nome: 'ensaio' };
  return { nome: 'fila' };
}
function enderecoDa(tela: Tela): string {
  if (tela.nome === 'caso') return `#caso-${tela.id}`;
  return tela.nome === 'fila' ? window.location.pathname : `#${tela.nome}`;
}

export default function App() {
  const [sessao, setSessao] = useState<Usuario | null | 'verificando'>('verificando');
  const [perdida, setPerdida] = useState(false);
  // primeiro acesso: banco sem usuários; `local` diz se a criação é permitida deste aparelho
  const [setup, setSetup] = useState<EstadoSetup | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({ status: '', tipo: '' });
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
  const chaveTela = tela.nome === 'caso' ? `caso-${tela.id}` : tela.nome;
  const anterior = useRef(chaveTela);
  useEffect(() => {
    if (anterior.current !== chaveTela) main.current?.focus();
    anterior.current = chaveTela;
  }, [chaveTela]);

  async function encerrar() {
    try { await sair(); } catch { /* o cookie vence sozinho; a tela de entrada aparece de qualquer forma */ }
    setPerdida(false); setSessao(null); setTela({ nome: 'fila' }); setFiltros({ status: '', tipo: '' });
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (sessao === 'verificando') return <main id="conteudo" className="login"><p role="status">Verificando a sessão.</p></main>;
  if (sessao === null && setup) {
    return <Setup local={setup.local} aoCriar={usuario => { setSetup(null); setSessao(usuario); }} />;
  }
  if (sessao === null) {
    return <Login aviso={perdida ? 'Sua sessão terminou. Entre de novo para continuar.' : undefined}
      aoEntrar={usuario => { setPerdida(false); setFiltros({ status: '', tipo: '' }); setSessao(usuario); }} />;
  }

  const admin = sessao.papel === 'admin';
  const item = (nome: Tela['nome'], rotulo: string) => {
    const aqui = tela.nome === nome || (nome === 'fila' && tela.nome === 'caso');
    return <button type="button" className="nav-item" aria-current={aqui ? 'page' : undefined}
      onClick={() => ir({ nome } as Tela)}>{rotulo}</button>;
  };
  return <>
    <a className="pular" href="#conteudo" onClick={e => { e.preventDefault(); main.current?.focus(); }}>Pular para o conteúdo</a>
    <header className="coord-cabecalho"><div className="coord-cabecalho-conteudo">
      <p className="marca">Segurança Integral <span>Coordenação</span></p>
      <nav aria-label="Principal">{item('fila', 'Fila')}{admin && item('usuarios', 'Usuários')}{item('ensaio', 'Ensaio')}</nav>
      <div className="sessao"><span className="sessao-nome">{sessao.nome}</span>
        <button type="button" className="botao secundario" onClick={() => void encerrar()}>Sair</button></div>
    </div></header>
    <main id="conteudo" ref={main} tabIndex={-1} className="painel">
      {tela.nome === 'fila' && <Fila aoAbrir={id => ir({ nome: 'caso', id })} filtros={filtros} aoFiltrar={setFiltros} />}
      {tela.nome === 'caso' && <Caso key={tela.id} id={tela.id} aoVoltar={() => ir({ nome: 'fila' })} />}
      {tela.nome === 'usuarios' && admin && <Usuarios meuId={sessao.id} />}
      {tela.nome === 'ensaio' && <Ensaio />}
    </main>
  </>;
}
