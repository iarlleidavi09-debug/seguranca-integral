import { useCallback, useEffect, useRef, useState } from 'react';
import { definirEmailAlerta, ErroApi, mensagemErroCoord, obterAlertas, salvarPreferenciasAlerta } from '../shared/api';
import type { EstadoAlertas, PreferenciasAlerta, UsuarioAlerta } from '../shared/api';
import './alertas.css';

const OPCOES: { chave: keyof PreferenciasAlerta; rotulo: string; ajuda: string }[] = [
  { chave: 'critico', rotulo: 'Novo caso crítico', ajuda: 'Um aviso assim que chega um caso de prioridade crítica.' },
  { chave: 'recorrencia', rotulo: 'Caso que voltou a acontecer', ajuda: 'Um aviso quando o aluno diz que a situação voltou e há revisão pendente.' },
  { chave: 'resumo', rotulo: 'Resumo diário', ajuda: 'Um aviso por dia quando há casos novos esperando a primeira resposta.' },
];

function LinhaEmail({ usuario, aoSalvar }: { usuario: UsuarioAlerta; aoSalvar: (id: number, email: string) => Promise<void> }) {
  const [email, setEmail] = useState(usuario.email);
  const [ocupado, setOcupado] = useState(false);
  return <li className="alertas-linha">
    <form noValidate onSubmit={async e => { e.preventDefault(); setOcupado(true); try { await aoSalvar(usuario.id, email.trim()); } finally { setOcupado(false); } }}>
      <label htmlFor={`email-${usuario.id}`}>E-mail de {usuario.nome}{!usuario.ativo && ' (desativado)'}</label>
      <div className="alertas-linha-campos">
        <input id={`email-${usuario.id}`} type="email" autoComplete="off" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
        <button type="submit" className="botao secundario" disabled={ocupado || email.trim() === usuario.email} aria-label={`Salvar e-mail de ${usuario.nome}`}>Salvar</button>
      </div>
    </form>
  </li>;
}

export default function Alertas() {
  const [estado, setEstado] = useState<EstadoAlertas | null>(null);
  const [prefs, setPrefs] = useState<PreferenciasAlerta | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const carregar = useCallback(async () => {
    try {
      const dados = await obterAlertas();
      if (!montado.current) return;
      setEstado(dados);
      setPrefs({ critico: dados.minhas.critico, recorrencia: dados.minhas.recorrencia, resumo: dados.minhas.resumo });
    } catch (falha) { if (montado.current) setErro(mensagemErroCoord(falha)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs || ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    try { await salvarPreferenciasAlerta(prefs); if (montado.current) { setAviso('Preferências salvas.'); await carregar(); } }
    catch (falha) { if (montado.current) setErro(mensagemErroCoord(falha)); }
    finally { if (montado.current) setOcupado(false); }
  }

  async function salvarEmail(usuarioId: number, email: string) {
    setErro(''); setAviso('');
    try {
      await definirEmailAlerta(usuarioId, email);
      if (montado.current) { setAviso(email ? 'Endereço salvo.' : 'Endereço removido.'); await carregar(); }
    } catch (falha) {
      if (montado.current) setErro(falha instanceof ErroApi && falha.status === 400
        ? 'Esse e-mail não parece válido. Confira o endereço.' : mensagemErroCoord(falha));
    }
  }

  return <section aria-labelledby="titulo-alertas" className="alertas">
    <h1 id="titulo-alertas" tabIndex={-1}>Alertas</h1>
    <p className="texto-pequeno">Avisos por e-mail para você saber de um caso sem abrir o painel. A mensagem nunca traz o relato, o código, o local nem nomes: só diz que há algo para ver.</p>
    <div aria-live="polite" role="status" className="resultado-acao">{aviso}</div>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {estado === null && !erro && <p className="vazio">Carregando alertas.</p>}
    {estado !== null && !estado.configurado && <p className="alertas-aviso">O envio de e-mail ainda não foi configurado nesta instalação. As preferências ficam salvas e passam a valer quando a escola configurar o servidor de e-mail.</p>}
    {estado !== null && prefs !== null && <form onSubmit={salvar} noValidate className="alertas-form">
      <fieldset>
        <legend>Quero receber por e-mail</legend>
        {OPCOES.map(o => <div key={o.chave} className="alertas-opcao">
          <label><input type="checkbox" checked={prefs[o.chave]} onChange={e => setPrefs({ ...prefs, [o.chave]: e.target.checked })} /> {o.rotulo}</label>
          <p className="texto-pequeno">{o.ajuda}{o.chave === 'resumo' && estado.resumo_hora ? ` Sai por volta das ${estado.resumo_hora}.` : ''}</p>
        </div>)}
      </fieldset>
      {!estado.minhas.tem_email && <p className="alertas-aviso">Seu usuário ainda não tem e-mail cadastrado, então nada será enviado. Peça a um administrador para cadastrar.</p>}
      <div className="acoes"><button type="submit" className="botao principal" disabled={ocupado}>Salvar preferências</button></div>
    </form>}
    {estado?.usuarios && <details className="alertas-enderecos">
      <summary>Endereços de e-mail da equipe</summary>
      <ul className="alertas-lista">
        {estado.usuarios.map(u => <LinhaEmail key={`${u.id}-${u.email}`} usuario={u} aoSalvar={salvarEmail} />)}
      </ul>
    </details>}
  </section>;
}
