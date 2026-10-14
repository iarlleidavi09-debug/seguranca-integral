import { useEffect, useRef, useState } from 'react';
import { acompanhar, enviarMensagem, mensagemErro } from '../shared/api';
import type { Caso } from '../shared/api';

const status: Record<string, string> = { novo: 'Recebido', em_analise: 'Em análise', aguardando_aluno: 'Aguardando sua resposta', encaminhado: 'Encaminhado', resolvido: 'Resolvido' };
function dataLegivel(valor: string) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data indisponível' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Acompanhar({ codigoInicial = '' }: { codigoInicial?: string }) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [codigoAtivo, setCodigoAtivo] = useState(codigoInicial);
  const [caso, setCaso] = useState<Caso | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const consulta = useRef(0);
  const responder = useRef(false);
  const montado = useRef(true);
  const consultado = useRef<string | null>(null);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => {
    // no StrictMode o efeito roda duas vezes; a consulta inicial sai uma só vez por código
    if (!codigoInicial || consultado.current === codigoInicial) return;
    consultado.current = codigoInicial;
    setCarregando(true);
    acompanhar(codigoInicial).then(dados => { if (montado.current) setCaso(dados); })
      .catch(falha => { if (montado.current) setErro(mensagemErro(falha)); })
      .finally(() => { if (montado.current) setCarregando(false); });
  }, [codigoInicial]);
  async function consultar() {
    if (!codigo.trim()) { setErro('Digite seu código para acompanhar.'); return; }
    const atual = ++consulta.current;
    setCarregando(true); setErro(''); setCaso(null); setAviso('');
    try {
      const dados = await acompanhar(codigo);
      if (atual === consulta.current) { setCaso(dados); setCodigoAtivo(codigo); setCodigo(''); }
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
      try { setCaso(await acompanhar(codigoAtivo)); }
      catch (falha) { setAviso(`Resposta enviada. ${mensagemErro(falha)} Use Atualizar conversa para ver as mensagens.`); }
    } catch (falha) { setErro(mensagemErro(falha)); }
    finally { setEnviando(false); responder.current = false; }
  }
  async function atualizar() {
    setCarregando(true); setErro('');
    try { setCaso(await acompanhar(codigoAtivo)); setAviso('Conversa atualizada.'); }
    catch (falha) { setErro(mensagemErro(falha)); }
    finally { setCarregando(false); }
  }
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
      <p className="status-caso"><span className="status-ponto" data-status={caso.status} aria-hidden="true" />{status[caso.status] ?? 'Status indisponível'}</p>
      <h2>Conversa com a coordenação</h2>
      <div role="log" aria-live="polite" aria-label="Mensagens do caso" className="mensagens">
        {!caso.mensagens.length && <p className="vazio">Ainda não há mensagens. Você pode escrever para a coordenação por aqui.</p>}
        {caso.mensagens.map((mensagem, i) => <article key={`${mensagem.criado_em}-${i}`} className="mensagem" data-autor={mensagem.autor}>
          <h3>{mensagem.autor === 'aluno' ? 'Você' : 'Coordenação'}</h3>
          <p>{mensagem.texto}</p><time dateTime={mensagem.criado_em}>{dataLegivel(mensagem.criado_em)}</time>
        </article>)}
      </div>
      <button type="button" className="botao secundario atualizar" disabled={carregando || enviando} onClick={() => void atualizar()}>Atualizar conversa</button>
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
