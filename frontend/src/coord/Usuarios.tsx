import { useCallback, useEffect, useRef, useState } from 'react';
import { criarUsuario, desativarUsuario, ErroApi, ErroCoord, listarUsuarios, mensagemErroCoord } from '../shared/api';
import type { UsuarioLista } from '../shared/api';
import LimparImplantacao from './LimparImplantacao';

const SENHA_MIN = 10;
const semSessao = (falha: unknown) => falha instanceof ErroApi && falha.status === 401;

export default function Usuarios({ meuId, confirmarInicial = null, aoLimpar = () => {} }: { meuId: number; confirmarInicial?: number | null; aoLimpar?: () => void }) {
  const [lista, setLista] = useState<UsuarioLista[] | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmando, setConfirmando] = useState<number | null>(confirmarInicial);
  const [ocupado, setOcupado] = useState(false);
  const trabalhando = useRef(false);
  const montado = useRef(true);
  const titulo = useRef<HTMLHeadingElement>(null);
  const gatilhos = useRef<Record<number, HTMLButtonElement | null>>({});
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const anterior = useRef<number | null>(null);
  useEffect(() => {
    if (confirmando !== null) botaoConfirmar.current?.focus();
    else if (anterior.current !== null) (gatilhos.current[anterior.current] ?? titulo.current)?.focus();
    anterior.current = confirmando;
  }, [confirmando]);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const carregar = useCallback(async () => {
    try { const dados = await listarUsuarios(); if (montado.current) setLista(dados); }
    catch (falha) { if (!semSessao(falha) && montado.current) setErro(mensagemErroCoord(falha)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (trabalhando.current) return;
    setAviso('');
    if (!nome.trim()) { setErro('Digite o nome do usuário.'); return; }
    if (senha.length < SENHA_MIN) { setErro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`); return; }
    trabalhando.current = true; setOcupado(true); setErro('');
    try {
      const novo = await criarUsuario(nome.trim(), senha);
      setNome(''); setSenha(''); setAviso(`Usuário ${novo.nome} criado.`);
      await carregar();
    } catch (falha) {
      if (semSessao(falha)) return;
      setErro(falha instanceof ErroCoord && falha.status === 400 && falha.detalhe
        ? `Não foi possível criar: ${falha.detalhe}.` : mensagemErroCoord(falha));
    } finally { trabalhando.current = false; if (montado.current) setOcupado(false); }
  }

  async function desativar(usuario: UsuarioLista) {
    if (trabalhando.current) return;
    trabalhando.current = true; setOcupado(true); setErro(''); setAviso('');
    try {
      await desativarUsuario(usuario.id);
      setConfirmando(null); setAviso(`Usuário ${usuario.nome} desativado.`);
      await carregar();
      titulo.current?.focus();
    } catch (falha) { if (!semSessao(falha)) setErro(mensagemErroCoord(falha)); }
    finally { trabalhando.current = false; if (montado.current) setOcupado(false); }
  }

  return <section aria-labelledby="titulo-usuarios">
    <h1 id="titulo-usuarios" ref={titulo} tabIndex={-1}>Usuários</h1>
    <div aria-live="polite" role="status" className="resultado-acao">{aviso}</div>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {lista === null && !erro && <p className="vazio">Carregando usuários.</p>}
    {lista !== null && <ul className="usuarios">
      {lista.map(u => <li key={u.id} className="usuario">
        <div className="usuario-nome"><strong>{u.nome}</strong>{u.id === meuId && <span className="selo-neutro">Você</span>}
          <span className="selo-neutro">{u.papel === 'admin' ? 'Administrador' : 'Coordenação'}</span>
          <span className="usuario-estado" data-ativo={u.ativo}>{u.ativo ? 'Ativo' : 'Desativado'}</span></div>
        {u.ativo && u.id !== meuId && (confirmando === u.id
          ? <div className="confirmar" role="group" aria-label={`Confirmar desativação de ${u.nome}`}
            onKeyDown={e => { if (e.key === 'Escape') setConfirmando(null); }}>
            <p>Desativar {u.nome}? A pessoa perde o acesso agora.</p>
            <div className="acoes">
              <button type="button" ref={botaoConfirmar} className="botao perigo" disabled={ocupado} onClick={() => void desativar(u)}>Confirmar desativação</button>
              <button type="button" className="botao secundario" onClick={() => setConfirmando(null)}>Cancelar</button>
            </div>
          </div>
          : <button type="button" ref={el => { gatilhos.current[u.id] = el; }} className="botao secundario" onClick={() => setConfirmando(u.id)} aria-label={`Desativar ${u.nome}`}>Desativar</button>)}
        {u.id === meuId && <p className="texto-pequeno">Você não pode desativar a própria conta.</p>}
      </li>)}
    </ul>}
    <h2>Novo usuário</h2>
    <form onSubmit={criar} noValidate className="form-usuario">
      <div className="campos">
        <div><label htmlFor="novo-nome">Nome</label>
          <input id="novo-nome" autoComplete="off" maxLength={100} value={nome} onChange={e => setNome(e.target.value)} /></div>
        <div><label htmlFor="nova-senha">Senha</label>
          <p className="texto-pequeno">Pelo menos {SENHA_MIN} caracteres.</p>
          <input id="nova-senha" type="password" autoComplete="new-password" maxLength={256} value={senha} onChange={e => setSenha(e.target.value)} /></div>
      </div>
      <div className="acoes"><button type="submit" className="botao principal" disabled={ocupado}>Criar usuário</button></div>
    </form>
    <LimparImplantacao aoLimpar={aoLimpar} />
  </section>;
}
