import { useState } from 'react';
import { entrar } from '../shared/api';
import type { Usuario } from '../shared/api';
import { ErroApi } from '../shared/api';

function textoErro(falha: unknown): string {
  const codigo = falha instanceof ErroApi ? falha.status : 0;
  if (codigo === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (codigo === 503) return 'Servidor ocupado, tente de novo.';
  if (codigo === 0) return 'Não foi possível conectar. Confira a conexão e tente de novo.';
  // a mesma frase para qualquer outra falha: não revela se o nome existe
  return 'Nome ou senha incorretos.';
}

export default function Login({ aviso, aoEntrar }: { aviso?: string; aoEntrar: (usuario: Usuario) => void }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    if (!nome.trim() || !senha) { setErro('Digite o nome e a senha.'); return; }
    setEnviando(true); setErro('');
    try { aoEntrar(await entrar(nome.trim(), senha)); }
    catch (falha) { setErro(textoErro(falha)); setSenha(''); }
    finally { setEnviando(false); }
  }
  return <main id="conteudo" className="login" tabIndex={-1}>
    <p className="marca">Segurança Integral</p>
    <h1>Portal da coordenação</h1>
    {aviso && <p className="aviso" role="status">{aviso}</p>}
    <form onSubmit={enviar} noValidate>
      <div className="campos">
        <div><label htmlFor="login-nome">Nome</label>
          <input id="login-nome" name="nome" autoComplete="username" value={nome} onChange={e => setNome(e.target.value)} maxLength={100} autoFocus /></div>
        <div><label htmlFor="login-senha">Senha</label>
          <input id="login-senha" name="senha" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} maxLength={256} /></div>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="acoes"><button type="submit" className="botao principal" disabled={enviando}>{enviando ? 'Entrando' : 'Entrar'}</button></div>
    </form>
  </main>;
}
