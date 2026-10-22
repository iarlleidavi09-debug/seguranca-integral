import { useState } from 'react';
import { criarPrimeiroAdmin, ErroCoord, mensagemErroCoord, quemSou } from '../shared/api';
import type { Usuario } from '../shared/api';

const SENHA_MIN = 10;

export default function Setup({ local, aoCriar }: { local: boolean; aoCriar: (usuario: Usuario) => void }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  // depois da conta criada, só a leitura da sessão se repete; a senha não é reenviada
  const [criada, setCriada] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    if (!criada) {
      if (!nome.trim()) { setErro('Digite o nome do administrador.'); return; }
      if (senha.length < SENHA_MIN) { setErro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`); return; }
      if (senha !== confirma) { setErro('As duas senhas não são iguais.'); return; }
    }
    setEnviando(true); setErro('');
    try {
      if (!criada) { await criarPrimeiroAdmin(nome.trim(), senha); setCriada(true); setSenha(''); setConfirma(''); }
    } catch (falha) {
      setErro(falha instanceof ErroCoord && falha.status === 409
        ? 'Já existe uma conta. Recarregue a página para entrar.'
        : falha instanceof ErroCoord && falha.status === 403
          ? 'A conta de administrador só pode ser criada na máquina do servidor.'
          : falha instanceof ErroCoord && falha.status === 400 && falha.detalhe
            ? `Não foi possível criar: ${falha.detalhe}.` : mensagemErroCoord(falha));
      setEnviando(false); return;
    }
    try { aoCriar(await quemSou()); }
    catch { setErro('A conta foi criada, mas não foi possível entrar. Tente de novo.'); }
    finally { setEnviando(false); }
  }

  if (!local) {
    return <main id="conteudo" className="login" tabIndex={-1}>
      <p className="marca">TETRA-GUARD</p>
      <h1>Primeiro acesso</h1>
      <p>Ainda não existe nenhuma conta. Para criar a conta de administrador, abra este portal no computador onde o servidor está instalado.</p>
    </main>;
  }
  return <main id="conteudo" className="login" tabIndex={-1}>
    <p className="marca">TETRA-GUARD</p>
    <h1>Criar conta de administrador</h1>
    <p>Esta é a primeira conta do portal. Com ela você cria as contas das demais pessoas da coordenação.</p>
    <form onSubmit={enviar} noValidate>
      {!criada && <div className="campos">
        <div><label htmlFor="setup-nome">Nome</label>
          <input id="setup-nome" name="nome" autoComplete="username" value={nome} onChange={e => setNome(e.target.value)} maxLength={100} autoFocus /></div>
        <div><label htmlFor="setup-senha">Senha</label>
          <input id="setup-senha" name="senha" type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} maxLength={256} aria-describedby="setup-dica" />
          <p id="setup-dica" className="dica">Pelo menos {SENHA_MIN} caracteres.</p></div>
        <div><label htmlFor="setup-confirma">Repita a senha</label>
          <input id="setup-confirma" name="confirma" type="password" autoComplete="new-password" value={confirma} onChange={e => setConfirma(e.target.value)} maxLength={256} /></div>
      </div>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="acoes"><button type="submit" className="botao principal" disabled={enviando}>{enviando ? 'Criando' : criada ? 'Tentar de novo' : 'Criar conta e entrar'}</button></div>
    </form>
  </main>;
}
