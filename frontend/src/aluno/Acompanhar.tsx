import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { acompanhar, enviarMensagem, enviarSituacao, ErroApi, mensagemErro } from '../shared/api';
import type { Caso, Situacao } from '../shared/api';
import { guardarAcesso, lerAcessos, normalizarCodigo } from './acessos';
import PosResolucao from './PosResolucao';
import { dataLegivel, rotuloStatus } from './rotulos';
import { useTempoReal } from '../shared/tempoReal';

const etapas = ['Recebido', 'Em investigação', 'Resolvido'];

export default function Acompanhar({ codigoInicial = '' }: { codigoInicial?: string }) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [codigoAtivo, setCodigoAtivo] = useState(codigoInicial);
  const [caso, setCaso] = useState<Caso | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [confirmada, setConfirmada] = useState(false); // "Resposta enviada." no lugar do contador: não aumenta o campo fixo
  const [informando, setInformando] = useState(false);
  const [erroSituacao, setErroSituacao] = useState('');
  const tituloConversa = useRef<HTMLHeadingElement>(null);
  const focoInicial = useRef(false);
  const [novas, setNovas] = useState<number[]>([]);
  const [avisoStorage, setAvisoStorage] = useState('');
  const [falhaAtualizar, setFalhaAtualizar] = useState(false);
  const alvoRolagem = useRef<HTMLElement | null>(null);
  const areaResposta = useRef<HTMLTextAreaElement>(null);
  const deveRolar = useRef(true); // só ao abrir e depois de enviar; tempo real e Atualizar não rolam
  const baseLida = useRef<{ codigo: string | null; valor: number } | null>(null); // lastRead da abertura: as novas são relativas a ele
  const consulta = useRef(0);
  const responder = useRef(false);
  const montado = useRef(true);
  const consultado = useRef<string | null>(null);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  async function buscar(codigoConsulta: string): Promise<boolean> {
    const atual = ++consulta.current;
    const dados = await acompanhar(codigoConsulta);
    if (!montado.current || atual !== consulta.current) return false;
    const chave = normalizarCodigo(codigoConsulta);
    const base = baseLida.current?.codigo === chave ? baseLida.current : { codigo: chave, valor: lerAcessos().find(a => a.codigo === chave)?.lastRead || 0 };
    baseLida.current = base;
    const ultimoLido = base.valor;
    setNovas(dados.mensagens.filter(m => m.autor === 'coordenacao' && !m.apagada && typeof m.id === 'number' && m.id! > ultimoLido).map(m => m.id!));
    if (!guardarAcesso(codigoConsulta)) setAvisoStorage('Não foi possível salvar o acesso neste navegador. Anote seu código para voltar.');
    setCaso(dados);
    setFalhaAtualizar(false);
    return true;
  }
  useEffect(() => {
    // no StrictMode o efeito roda duas vezes; a consulta inicial sai uma só vez por código
    if (!codigoInicial || consultado.current === codigoInicial) return;
    consultado.current = codigoInicial;
    setCarregando(true);
    buscar(codigoInicial)
      .catch(falha => { if (montado.current) setErro(mensagemErro(falha)); })
      .finally(() => { if (montado.current) setCarregando(false); });
  }, [codigoInicial]);
  async function consultar() {
    if (!codigo.trim()) { setErro('Digite seu código para acompanhar.'); return; }
    const atual = consulta.current + 1;
    setCarregando(true); setErro(''); setErroSituacao(''); setCaso(null); setAviso(''); setConfirmada(false); baseLida.current = null;
    try {
      if (await buscar(codigo)) { setCodigoAtivo(codigo); setCodigo(''); }
    } catch (falha) { if (atual === consulta.current) setErro(mensagemErro(falha)); }
    finally { if (atual === consulta.current) setCarregando(false); }
  }
  async function enviar() {
    if (responder.current) return;
    setConfirmada(false);
    if (!texto.trim() || texto.trim().length > 2000) { setErro('Escreva uma resposta de 1 a 2000 caracteres.'); return; }
    responder.current = true; setEnviando(true); setErro(''); setAviso(''); setConfirmada(false);
    try {
      await enviarMensagem(codigoAtivo, texto.trim());
      setTexto(''); setConfirmada(true);
      // responder equivale a ter lido tudo: o separador some, e só o que chegar depois volta a ser nova
      if (caso && baseLida.current) baseLida.current = { ...baseLida.current, valor: Math.max(baseLida.current.valor, ...caso.mensagens.filter(m => m.autor === 'coordenacao').map(m => m.id || 0)) };
      const leitura = consulta.current + 1;
      deveRolar.current = true;
      try { if (!(await buscar(codigoAtivo))) deveRolar.current = false; }
      catch (falha) { deveRolar.current = false; if (leitura === consulta.current) setFalhaAtualizar(true); setAviso(`${mensagemErro(falha)} Use Atualizar conversa para ver as mensagens.`); }
    } catch (falha) { setErro(mensagemErro(falha)); }
    finally { setEnviando(false); responder.current = false; }
  }
  async function atualizar() {
    const atual = consulta.current + 1;
    setCarregando(true); setErro(''); setErroSituacao('');
    try { if (await buscar(codigoAtivo)) setAviso('Conversa atualizada.'); }
    catch (falha) { if (atual === consulta.current) { setErro(mensagemErro(falha)); setFalhaAtualizar(true); } }
    finally { if (atual === consulta.current) setCarregando(false); }
  }
  // Uma leitura superada foi concluída; só erro de transporte/API é falha da recarga.
  async function recarregar(): Promise<boolean> {
    const atual = consulta.current + 1;
    try { await buscar(codigoAtivo); return true; }
    catch { if (atual === consulta.current) setFalhaAtualizar(true); return false; }
    finally { if (atual === consulta.current) setCarregando(false); }
  }
  const conexao = useTempoReal('aluno', caso !== null && !!codigoAtivo, () => { void recarregar(); }, codigoAtivo);
  const foraDoAr = conexao !== 'online' && conexao !== 'conectando';
  async function informarSituacao(situacao: Situacao) {
    setInformando(true); setErroSituacao('');
    try {
      await enviarSituacao(codigoAtivo, situacao);
    } catch (falha) {
      if (falha instanceof ErroApi && falha.status === 409) {
        setErroSituacao(mensagemErro(falha, 'situacao'));
        await recarregar(); // a mensagem de 409 já explica; Atualizar conversa tenta de novo se falhar
      }
      throw falha;
    } finally { setInformando(false); }
    // o agradecimento não depende de a recarga dar certo
    if (!(await recarregar())) setAviso('Não foi possível atualizar agora. Use Atualizar conversa.');
  }
  useEffect(() => {
    if (!caso) return;
    if (!focoInicial.current) { tituloConversa.current?.focus(); tituloConversa.current?.scrollIntoView?.({ block: 'start' }); focoInicial.current = true; }
    const registrar = () => {
      if (document.visibilityState !== 'visible') return;
      const ids = caso.mensagens.filter(m => m.autor === 'coordenacao').map(m => m.id || 0);
      if (!guardarAcesso(codigoAtivo, Math.max(0, ...ids))) setAvisoStorage('Não foi possível salvar o acesso neste navegador. Anote seu código para voltar.');
    };
    registrar(); document.addEventListener('visibilitychange', registrar);
    return () => document.removeEventListener('visibilitychange', registrar);
  }, [caso, codigoAtivo]);
  // rola até o separador (ou a última mensagem) ao abrir e ao enviar; o foco não sai do título
  useEffect(() => {
    if (!caso || !deveRolar.current) return;
    deveRolar.current = false;
    const alvo = alvoRolagem.current;
    // com separador, ele vai para o topo para as novas aparecerem abaixo; sem, a última mensagem fica visível
    alvo?.scrollIntoView?.({ block: alvo.getAttribute('role') === 'separator' ? 'start' : 'nearest' });
  }, [caso]);
  // o campo cresce com o texto, de 2 a 6 linhas
  useLayoutEffect(() => {
    const campo = areaResposta.current;
    if (!campo) return;
    campo.rows = 2;
    const estilo = getComputedStyle(campo);
    const linha = parseFloat(estilo.lineHeight) || 24;
    const folga = (parseFloat(estilo.paddingTop) || 0) + (parseFloat(estilo.paddingBottom) || 0) + (parseFloat(estilo.borderTopWidth) || 0) + (parseFloat(estilo.borderBottomWidth) || 0);
    campo.rows = Math.min(6, Math.max(2, Math.ceil((campo.scrollHeight - folga) / linha)));
  }, [texto, caso !== null]);
  const atual = caso ? etapas.indexOf(rotuloStatus(caso.status)) : -1;
  const primeiraNova = caso ? caso.mensagens.findIndex(m => m.autor === 'coordenacao' && !m.apagada && novas.includes(m.id || 0)) : -1;
  const blocoVisivel = !!caso && caso.pos_resolucao && !!caso.resolucao;
  // uma resolução nova torna o erro de 409 antigo obsoleto
  useEffect(() => { if (blocoVisivel) setErroSituacao(''); }, [blocoVisivel]);
  return <section>
    <h1>Acompanhar meu caso</h1>
    {!caso && !carregando && <form noValidate onSubmit={e => { e.preventDefault(); void consultar(); }}>
      <label htmlFor="codigo-consulta">Código de acompanhamento</label>
      <input id="codigo-consulta" value={codigo} onChange={e => setCodigo(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="characters" />
      <p className="texto-pequeno">Pode usar letras minúsculas, espaços ou digitar sem hífen.</p>
      <button className="botao principal">Acompanhar</button>
    </form>}
    {carregando && <p role="status">Buscando seu caso…</p>}
    {erro && !caso && <p role="alert" className="erro">{erro}</p>}
    {caso && <>
      <ol className="etapas" aria-label="Etapas do caso">
        {etapas.map((nome, i) => <li key={nome} className="etapa" data-estado={i < atual ? 'feita' : i === atual ? 'atual' : 'proxima'} aria-current={i === atual ? 'step' : undefined}>
          <span className="etapa-marca" aria-hidden="true">{i < atual ? '✓' : i + 1}</span>
          <span className="etapa-nome">{nome}</span>
          <span className="etapa-estado so-leitor">{i < atual ? 'Concluída' : i === atual ? 'Etapa atual' : 'Próxima'}</span>
        </li>)}
      </ol>
      {atual < 0 && <p className="texto-pequeno">Status indisponível no momento.</p>}
      {erroSituacao && !blocoVisivel && <p role="alert" className="erro">{erroSituacao}</p>}
      <PosResolucao caso={caso} aoInformar={informarSituacao} ocupado={informando || carregando || enviando} />
      <details className="recolhivel codigo-caso" open={avisoStorage ? true : undefined}>
        <summary>Seu código</summary>
        <p>Código para voltar: <strong>{normalizarCodigo(codigoAtivo) || codigoAtivo}</strong>. Anote em um lugar seguro.</p>
      </details>
      <h2 ref={tituloConversa} tabIndex={-1}>Conversa com a coordenação</h2>
      {novas.length > 0 && <p role="status">{novas.length === 1 ? "Uma mensagem nova da coordenação." : `${novas.length} mensagens novas da coordenação.`}</p>}
      {avisoStorage && <p role="status">{avisoStorage}</p>}
      {foraDoAr && <p className="texto-pequeno linha-conexao">Reconectando; atualização a cada 8 segundos</p>}
      <div role="log" aria-live="polite" aria-label="Mensagens do caso" className="mensagens">
        {!caso.mensagens.length && <p className="vazio">Ainda não há mensagens. Você pode escrever para a coordenação por aqui.</p>}
        {caso.mensagens.map((mensagem, i) => {
          const autor = mensagem.autor === 'aluno' ? 'Você' : 'Coordenação';
          const inicioGrupo = i === 0 || i === primeiraNova || caso.mensagens[i - 1].autor !== mensagem.autor;
          const ultimaSemNovas = primeiraNova < 0 && i === caso.mensagens.length - 1;
          return <Fragment key={`${mensagem.criado_em}-${i}`}>
            {i === primeiraNova && <div role="separator" aria-label="Novas mensagens" className="novas-divisor" ref={el => { alvoRolagem.current = el; }}>Novas mensagens</div>}
            <article className="mensagem" data-autor={mensagem.autor} data-inicio={inicioGrupo || undefined} aria-label={autor} ref={ultimaSemNovas ? el => { alvoRolagem.current = el; } : undefined}>
              {inicioGrupo && <h3>{autor}</h3>}
              {mensagem.apagada
                ? <p className="texto-pequeno">Mensagem apagada</p>
                : <><p>{mensagem.texto}</p><time dateTime={mensagem.criado_em}>{dataLegivel(mensagem.criado_em)}</time>{mensagem.editada && <span className="texto-pequeno"> (editada)</span>}</>}
            </article>
          </Fragment>;
        })}
      </div>
      <form noValidate onSubmit={e => { e.preventDefault(); void enviar(); }} className="resposta resposta-fixa">
        {erro && <p role="alert" className="erro">{erro}</p>}
        <div className="aviso-linha">
        <p role="status" className="aviso-resposta">{aviso}</p>
        {(foraDoAr || falhaAtualizar) && <button type="button" className="botao secundario atualizar" disabled={carregando || enviando} onClick={() => void atualizar()}>Atualizar conversa</button>}
        </div>
        <p role="status" className="so-leitor">{confirmada ? 'Resposta enviada.' : ''}</p>
        <label htmlFor="resposta" className="so-leitor">Sua resposta</label>
        <textarea id="resposta" ref={areaResposta} rows={2} maxLength={2000} value={texto} disabled={enviando} onChange={e => { setTexto(e.target.value); setConfirmada(false); }} aria-describedby="limite-resposta" />
        <div className="resposta-rodape">
          <p id="limite-resposta" className="texto-pequeno">{confirmada && !texto ? 'Resposta enviada.' : `${texto.length} de 2000 caracteres`}</p>
          <button className="botao principal" disabled={enviando || carregando}>{enviando ? 'Enviando resposta…' : 'Enviar resposta'}</button>
        </div>
      </form>
    </>}
  </section>;
}
