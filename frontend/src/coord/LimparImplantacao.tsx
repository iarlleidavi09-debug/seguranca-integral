import { useEffect, useRef, useState } from 'react';
import { ErroCoord, limparImplantacao, mensagemErroCoord, obterImplantacao } from '../shared/api';
import { dataLegivel } from './rotulos';
import type { Removidos, ResumoImplantacao } from '../shared/api';
import { limparRascunhosAtendimento } from './rascunhosAtendimento';

const FRASE = 'APAGAR TUDO';
const contagem = (r: Removidos) => `${r.casos} casos, ${r.mensagens} mensagens, ${r.anexos} anexos, ${r.backups} cópias de segurança`;

export default function LimparImplantacao({ aoLimpar }: { aoLimpar: () => void }) {
  const [dados, setDados] = useState<ResumoImplantacao | null>(null);
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState('');
  const [frase, setFrase] = useState('');
  const [backups, setBackups] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [focarTitulo, setFocarTitulo] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const trabalhando = useRef(false);
  const montado = useRef(true);
  const titulo = useRef<HTMLHeadingElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);
  const campoSenha = useRef<HTMLInputElement>(null);

  useEffect(() => {
    montado.current = true;
    obterImplantacao().then(d => { if (montado.current) setDados(d); }).catch(() => { /* sem cartão se não der para consultar */ });
    return () => { montado.current = false; };
  }, []);
  useEffect(() => { if (aberto) { campoSenha.current?.focus(); } }, [aberto]);

  useEffect(() => { if (focarTitulo && !aberto && !ocupado) { titulo.current?.focus(); setFocarTitulo(false); } }, [focarTitulo, aberto, ocupado]);
  useEffect(() => { if (erro && !ocupado) campoSenha.current?.focus(); }, [erro, ocupado]);

  if (!dados) return null;

  function fechar() {
    setAberto(false); setSenha(''); setFrase(''); setErro('');
    abrir.current?.focus();
  }

  async function apagar(e: React.FormEvent) {
    e.preventDefault();
    if (trabalhando.current || !senha || frase !== FRASE) return;
    trabalhando.current = true; setOcupado(true); setErro(''); setAviso(''); setAvisos([]);
    const enviada = senha;
    setSenha('');
    try {
      const r = await limparImplantacao(enviada, frase, backups);
      limparRascunhosAtendimento();
      if (!montado.current) { aoLimpar(); return; }
      setDados(d => d && { ...d, resumo: { casos: 0, mensagens: 0, anexos: 0, arquivos: 0, backups: Math.max(0, d.resumo.backups - r.removidos.backups) } });
      setAviso(`Dados apagados: ${contagem(r.removidos)}.`);
      setAvisos(r.avisos ?? []);
      setAberto(false); setFrase('');
      aoLimpar();
      setOcupado(false); trabalhando.current = false;
      setFocarTitulo(true);
    } catch (falha) {
      if (!montado.current) return;
      const detalhe = falha instanceof ErroCoord ? falha.detalhe : '';
      const status = falha instanceof ErroCoord ? falha.status : 0;
      setErro(status === 403 && detalhe === 'sem permissao' ? 'Sem permissão para apagar os dados.'
        : status === 403 && detalhe === 'senha incorreta' ? 'A senha está incorreta.'
          : status === 400 ? `Confirme digitando exatamente ${FRASE}.`
            : mensagemErroCoord(falha));
      setOcupado(false); trabalhando.current = false;
    }
  }

  const ultima = dados.ultima_limpeza;
  return <section className="zona-risco" aria-labelledby="titulo-zona-risco">
    <h2 id="titulo-zona-risco" ref={titulo} tabIndex={-1}>Implantação secundária: apagar todos os dados</h2>
    <p>Hoje: {contagem(dados.resumo)}.</p>
    <p>Apaga casos, conversas, anexos e, se marcado, as cópias de segurança. Mantém usuários e o mapa. Não há como desfazer.</p>
    {ultima && <p className="texto-pequeno">Última limpeza: em {dataLegivel(ultima.em).replace(', ', ' ')}{ultima.por ? ` por ${ultima.por}` : ''} ({ultima.casos} casos).</p>}
    <div role="status" aria-live="polite" className={ocupado ? 'texto-pequeno' : 'resultado-acao'}>
      {ocupado ? 'Apagando…' : aviso}
      {!ocupado && avisos.length > 0 && <>
        <p>Atenção: alguns arquivos não foram removidos.</p>
        <ul>{avisos.map(a => <li key={a}>{a}</li>)}</ul></>}
    </div>
    <button type="button" ref={abrir} className="botao secundario" aria-expanded={aberto} disabled={ocupado}
      onClick={() => { setAviso(''); setAvisos([]); setAberto(true); }}>Apagar todos os dados…</button>
    {aberto && <form className="zona-risco-painel" onSubmit={apagar} noValidate
      onKeyDown={e => { if (e.key === 'Escape' && !ocupado) { e.stopPropagation(); fechar(); } }}>
      <div className="campos">
        <div><label htmlFor="zona-senha">Senha</label>
          <input id="zona-senha" ref={campoSenha} type="password" autoComplete="current-password" maxLength={256}
            disabled={ocupado} value={senha} onChange={e => setSenha(e.target.value)} /></div>
        <div><label htmlFor="zona-frase">Digite {FRASE} para confirmar</label>
          <input id="zona-frase" autoComplete="off" disabled={ocupado} value={frase} onChange={e => setFrase(e.target.value)} /></div>
        <label className="opcao"><input type="checkbox" checked={backups} disabled={ocupado} onChange={e => setBackups(e.target.checked)} />
          Apagar também as cópias de segurança</label>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="acoes">
        <button type="submit" className="botao perigo" disabled={ocupado || !senha || frase !== FRASE}>Apagar tudo</button>
        <button type="button" className="botao secundario" disabled={ocupado} onClick={fechar}>Cancelar</button>
      </div>
    </form>}
  </section>;
}
