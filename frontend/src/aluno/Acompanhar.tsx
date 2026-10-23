import { useEffect, useRef, useState } from 'react';
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
  const [informando, setInformando] = useState(false);
  const [erroSituacao, setErroSituacao] = useState('');
  const tituloConversa = useRef<HTMLHeadingElement>(null);
  const focoInicial = useRef(false);
  const [novas, setNovas] = useState<number[]>([]);
  const [avisoStorage, setAvisoStorage] = useState('');
  const [falhaAtualizar, setFalhaAtualizar] = useState(false);
  const consulta = useRef(0);
  const responder = useRef(false);
  const montado = useRef(true);
  const consultado = useRef<string | null>(null);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  async function buscar(codigoConsulta: string): Promise<boolean> {
    const atual = ++consulta.current;
    const dados = await acompanhar(codigoConsulta);
    if (!montado.current || atual !== consulta.current) return false;
    const ultimoLido = lerAcessos().find(a => a.codigo === normalizarCodigo(codigoConsulta))?.lastRead || 0;
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
    setCarregando(true); setErro(''); setErroSituacao(''); setCaso(null); setAviso('');
    try {
      if (await buscar(codigo)) { setCodigoAtivo(codigo); setCodigo(''); }
    } catch (falha) { if (atual === consulta.current) setErro(mensagemErro(falha)); }
    finally { if (atual === consulta.current) setCarregando(false); }
  }
  async function enviar() {
    if (responder.current) return;
    if (!texto.trim() || texto.trim().length > 2000) { setErro('Escreva uma resposta de 1 a 2000 caracteres.'); return; }
    responder.current = true; setEnviando(true); setErro(''); setAviso('');
    try {
      await enviarMensagem(codigoAtivo, texto.trim());
      setTexto(''); setAviso('Resposta enviada.');
      try { await buscar(codigoAtivo); }
      catch (falha) { setFalhaAtualizar(true); setAviso(`Resposta enviada. ${mensagemErro(falha)} Use Atualizar conversa para ver as mensagens.`); }
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
    catch { setFalhaAtualizar(true); return false; }
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
  const atual = caso ? etapas.indexOf(rotuloStatus(caso.status)) : -1;
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
    {erro && <p role="alert" className="erro">{erro}</p>}
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
      <details className="recolhivel codigo-caso">
        <summary>Seu código</summary>
        <p>Código para voltar: <strong>{normalizarCodigo(codigoAtivo) || codigoAtivo}</strong>. Anote em um lugar seguro.</p>
      </details>
      <h2 ref={tituloConversa} tabIndex={-1}>Conversa com a coordenação</h2>
      {novas.length > 0 && <p role="status">{novas.length === 1 ? "Uma mensagem nova da coordenação." : `${novas.length} mensagens novas da coordenação.`}</p>}
      {avisoStorage && <p role="status">{avisoStorage}</p>}
      {foraDoAr && <p className="texto-pequeno linha-conexao">Reconectando; atualização a cada 8 segundos</p>}
      <div role="log" aria-live="polite" aria-label="Mensagens do caso" className="mensagens">
        {!caso.mensagens.length && <p className="vazio">Ainda não há mensagens. Você pode escrever para a coordenação por aqui.</p>}
        {caso.mensagens.map((mensagem, i) => <article key={`${mensagem.criado_em}-${i}`} className="mensagem" data-autor={mensagem.autor}>
          {!mensagem.apagada && novas.includes(mensagem.id || 0) && <p className="texto-pequeno">Mensagem nova</p>}
          <h3>{mensagem.autor === 'aluno' ? 'Você' : 'Coordenação'}</h3>
          {mensagem.apagada
            ? <p className="texto-pequeno">Mensagem apagada</p>
            : <><p>{mensagem.texto}</p><time dateTime={mensagem.criado_em}>{dataLegivel(mensagem.criado_em)}</time>{mensagem.editada && <span className="texto-pequeno"> (editada)</span>}</>}
        </article>)}
      </div>
      {(foraDoAr || falhaAtualizar) && <button type="button" className="botao secundario atualizar" disabled={carregando || enviando} onClick={() => void atualizar()}>Atualizar conversa</button>}
      <form noValidate onSubmit={e => { e.preventDefault(); void enviar(); }} aria-busy={enviando} className="resposta">
        <label htmlFor="resposta">Sua resposta</label>
        <textarea id="resposta" rows={4} maxLength={2000} value={texto} disabled={enviando} onChange={e => setTexto(e.target.value)} aria-describedby="limite-resposta" />
        <p id="limite-resposta" className="texto-pequeno">{texto.length} de 2000 caracteres</p>
        <button className="botao principal" disabled={enviando || carregando}>{enviando ? 'Enviando resposta…' : 'Enviar resposta'}</button>
      </form>
      <p role="status">{aviso}</p>
    </>}
  </section>;
}
