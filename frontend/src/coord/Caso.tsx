import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  criarNota, detalheCaso, enviarMensagemAoAluno, ErroApi, mensagemErroCoord, mudarPrioridade, mudarStatus,
  registrarResolucao, revisarRecorrencia,
} from '../shared/api';
import type { CasoDetalhe, Desfecho, Prioridade as ValorPrioridade } from '../shared/api';
import Anexos from './Anexos';
import Conversa, { TEXTO_MAX } from './Conversa';
import PosResolucao from './PosResolucao';
import RegistrarResolucao from './RegistrarResolucao';
import ReavaliarPrioridade from './ReavaliarPrioridade';
import {
  Prioridade, Simulacao, STATUS, Status, acessoLegivel, dataLegivel, descricaoEvento, motivo, prioridade, rotuloStatus,
  tipo as rotuloDoTipo,
} from './rotulos';

type Aba = 'relato' | 'conversa' | 'notas' | 'historico';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'relato', nome: 'Relato e investigação' }, { id: 'conversa', nome: 'Conversa' },
  { id: 'notas', nome: 'Notas internas' }, { id: 'historico', nome: 'Histórico' },
];
const sessaoPerdida = (falha: unknown) => falha instanceof ErroApi && falha.status === 401;

export default function Caso({ id, aoVoltar, abaInicial = 'relato', anexoInicial = null, imagemPrevia }: { id: number; aoVoltar: () => void; abaInicial?: Aba; anexoInicial?: number | null; imagemPrevia?: string }) {
  const [caso, setCaso] = useState<CasoDetalhe | null>(null);
  const [erroCarga, setErroCarga] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [rascunho, setRascunho] = useState({ mensagens: '', notas: '' });
  const titulo = useRef<HTMLHeadingElement>(null);
  const abas = useRef<Record<Aba, HTMLButtonElement | null>>({ relato: null, conversa: null, notas: null, historico: null });
  const trabalhando = useRef(false);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const recarregar = useCallback(async () => {
    const dados = await detalheCaso(id);
    if (montado.current) setCaso(dados);
  }, [id]);

  useEffect(() => {
    const controle = new AbortController();
    setCaso(null); setErroCarga('');
    detalheCaso(id, controle.signal)
      .then(dados => { if (!controle.signal.aborted) setCaso(dados); })
      .catch(falha => {
        if (controle.signal.aborted || sessaoPerdida(falha)) return;
        setErroCarga(mensagemErroCoord(falha));
      });
    return () => controle.abort();
  }, [id]);
  const pronto = caso !== null || erroCarga !== '';
  useEffect(() => { if (pronto) titulo.current?.focus(); }, [pronto]);

  /**
   * Guarda de reentrada das ações do caso: uma por vez, recarrega o detalhe depois, avisa em região aria-live
   * e trata o 401 (a sessão perdida volta ao Login pelo App, sem mensagem aqui).
   * Devolve true quando a ação foi gravada (mesmo que a recarga falhe), false caso contrário.
   * Com `conflito`, um 409 mostra essa mensagem no lugar da genérica e recarrega o caso (o estado já mudou).
   */
  async function agir(acao: () => Promise<unknown>, sucesso: string, depois?: () => void, conflito?: string): Promise<boolean> {
    if (trabalhando.current) return false;
    trabalhando.current = true;
    setOcupado(true); setErro(''); setAviso('');
    try {
      await acao();
      depois?.();
      try { await recarregar(); setAviso(sucesso); }
      catch (falha) { if (!sessaoPerdida(falha)) setAviso(`${sucesso} Não foi possível atualizar a tela: ${mensagemErroCoord(falha)}`); }
      return true;
    } catch (falha) {
      if (conflito && falha instanceof ErroApi && falha.status === 409) {
        if (montado.current) setErro(conflito);
        try { await recarregar(); } catch { /* a mensagem do conflito já orienta a recarregar */ }
        if (montado.current) titulo.current?.focus(); // o formulário some com a recarga; o foco vai ao título
      } else if (!sessaoPerdida(falha) && montado.current) setErro(mensagemErroCoord(falha));
      return false;
    } finally { trabalhando.current = false; if (montado.current) setOcupado(false); }
  }

  function textoValido(texto: string): string | null {
    const limpo = texto.trim();
    if (!limpo || limpo.length > TEXTO_MAX) { setErro(`Escreva de 1 a ${TEXTO_MAX} caracteres.`); setAviso(''); return null; }
    return limpo;
  }
  const enviarMensagem = () => {
    const texto = textoValido(rascunho.mensagens); if (texto === null) return;
    void agir(() => enviarMensagemAoAluno(id, texto), 'Mensagem enviada ao aluno.', () => setRascunho(r => (r.mensagens.trim() === texto ? { ...r, mensagens: '' } : r)));
  };
  const enviarNota = () => {
    const texto = textoValido(rascunho.notas); if (texto === null) return;
    void agir(() => criarNota(id, texto), 'Nota interna salva.', () => setRascunho(r => (r.notas.trim() === texto ? { ...r, notas: '' } : r)));
  };
  const trocarStatus = (novo: 'novo' | 'em_investigacao') =>
    void agir(() => mudarStatus(id, novo), `Status alterado para ${rotuloStatus[novo]}.`);
  async function reavaliar(nova: ValorPrioridade, justificativa: string) {
    const ok = await agir(() => mudarPrioridade(id, nova, justificativa), `Prioridade alterada para ${prioridade(nova)}.`);
    if (!ok) throw new Error('A prioridade não foi alterada.'); // o formulário fica aberto com o texto digitado
  }
  async function resolver(dados: { desfecho: Desfecho; providencias: string; resultado: string }) {
    const ok = await agir(() => registrarResolucao(id, dados), 'Caso resolvido.', undefined, 'Este caso já foi resolvido. Recarregue para ver o registro.');
    if (!ok) throw new Error('A resolução não foi registrada.'); // o formulário fica com o texto digitado
    titulo.current?.focus();
  }
  async function revisar() {
    const ok = await agir(() => revisarRecorrencia(id), 'Revisão registrada.', undefined, 'Esta recorrência já foi revisada.');
    if (!ok) throw new Error('A revisão não foi registrada.');
  }
  function teclasAbas(e: KeyboardEvent, atual: Aba) {
    const ids = ABAS.map(a => a.id);
    const i = ids.indexOf(atual);
    let destino: Aba | null = null;
    if (e.key === 'ArrowRight') destino = ids[(i + 1) % ids.length];
    if (e.key === 'ArrowLeft') destino = ids[(i - 1 + ids.length) % ids.length];
    if (e.key === 'Home') destino = ids[0];
    if (e.key === 'End') destino = ids[ids.length - 1];
    if (destino) { e.preventDefault(); setAba(destino); abas.current[destino]?.focus(); }
  }

  if (erroCarga) return <section>
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar aos casos</button>
    <h1 ref={titulo} tabIndex={-1}>Caso {id}</h1><p className="erro" role="alert">{erroCarga}</p>
  </section>;
  if (!caso) return <section>
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar aos casos</button>
    <p className="vazio" role="status">Carregando o caso.</p>
  </section>;

  const resolvido = caso.status === 'resolvido';
  return <section aria-labelledby="titulo-caso">
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar aos casos</button>
    <div className="caso-topo">
      <h1 id="titulo-caso" ref={titulo} tabIndex={-1}>Caso {caso.id}: {rotuloDoTipo(caso.tipo)}</h1>
      <p className="caso-selos"><Prioridade valor={caso.prioridade} /><Status valor={caso.status} />
        {caso.simulacao && <Simulacao />}{caso.em_andamento && <span className="selo-neutro">Ocorrendo agora</span>}</p>
      <p className="texto-pequeno">Recebido em {dataLegivel(caso.criado_em)}. {caso.anonimo ? 'Denúncia anônima.' : `Identificado: ${caso.nome ?? 'sem nome'}${caso.turma ? `, turma ${caso.turma}` : ''}.`}</p>
    </div>
    <div className="caso-meta">
      {resolvido
        ? <div className="caso-meta-status">
          <p>Caso resolvido.</p>
          <button type="button" className="botao secundario" disabled={ocupado} onClick={() => trocarStatus('em_investigacao')}>Reabrir para investigação</button>
        </div>
        : <div className="caso-meta-status"><label htmlFor="caso-status">Status</label>
          <select id="caso-status" value={caso.status === 'novo' ? 'novo' : 'em_investigacao'} disabled={ocupado} aria-busy={ocupado}
            onChange={e => trocarStatus(e.target.value as 'novo' | 'em_investigacao')}>
            {STATUS.filter(s => s !== 'resolvido').map(s => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
          </select></div>}
      <div className="caso-meta-acesso"><span>Último acesso</span>
        <b>{acessoLegivel(caso.ultimo_acesso?.por ?? null, caso.ultimo_acesso?.em ?? null)}</b></div>
      <ReavaliarPrioridade atual={caso.prioridade} aoConfirmar={reavaliar} ocupado={ocupado} />
    </div>
    {!resolvido && <RegistrarResolucao aoConfirmar={resolver} ocupado={ocupado} />}
    <div aria-live="polite" role="status" className="resultado-acao">{aviso}</div>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {(resolvido || caso.recorrencia_pendente) && <PosResolucao caso={caso} aoRevisar={revisar} ocupado={ocupado} />}

    <div className="caso-layout">
      <aside className="caso-resumo" aria-labelledby="titulo-resumo">
        <h2 id="titulo-resumo">Por que esta prioridade?</h2>
        {caso.motivos.length === 0 ? <p className="vazio">Sem motivos registrados.</p>
          : <ul className="motivos">{caso.motivos.map(m => <li key={m}>{motivo(m)}</li>)}</ul>}
        <p className="resumo-prioridade">Prioridade atual: <b>{prioridade(caso.prioridade)}</b></p>
        {caso.prioridade_original && caso.prioridade_original !== caso.prioridade
          && <p className="resumo-prioridade">Classificação original: <b>{prioridade(caso.prioridade_original)}</b></p>}
      </aside>
      <div className="caso-principal">
        <div role="tablist" aria-label="Conteúdo do caso" className="abas">
          {ABAS.map(a => <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id} aria-controls={aba === a.id ? `painel-${a.id}` : undefined}
            tabIndex={aba === a.id ? 0 : -1} ref={el => { abas.current[a.id] = el; }}
            onClick={() => setAba(a.id)} onKeyDown={e => teclasAbas(e, a.id)}>{a.nome}</button>)}
        </div>
        <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="painel-aba" tabIndex={0}>
          {aba === 'relato' && <>
            <h2>Relato</h2>
            <p className="texto-livre">{caso.relato}</p>
            {(caso.quando || caso.onde) && <dl className="detalhes">
              {caso.quando && <><dt>Quando</dt><dd>{caso.quando}</dd></>}
              {caso.onde && <><dt>Onde</dt><dd>{caso.onde}</dd></>}
            </dl>}
            <h2>Anexos</h2>
            <Anexos caso={caso} anexoInicial={anexoInicial} imagemPrevia={imagemPrevia} />
          </>}
          {aba === 'conversa' && <Conversa titulo="Conversa com o aluno" campo="texto-mensagem" rotulo="Mensagem ao aluno" ajuda="O aluno lê esta mensagem no acompanhamento."
            botao="Enviar ao aluno" texto={rascunho.mensagens} enviando={ocupado}
            aoMudar={valor => setRascunho(r => ({ ...r, mensagens: valor }))} aoEnviar={enviarMensagem}
            itens={caso.mensagens.map((m, i) => ({ chave: i, autor: m.autor === 'aluno' ? 'Aluno' : (m.usuario ?? 'Coordenação'), texto: m.texto, criado_em: m.criado_em, lado: m.autor }))} />}
          {aba === 'notas' && <Conversa titulo="Notas da equipe" campo="texto-nota" rotulo="Nota interna" ajuda="Só a coordenação vê. O aluno nunca recebe esta nota."
            botao="Salvar nota" texto={rascunho.notas} enviando={ocupado}
            aoMudar={valor => setRascunho(r => ({ ...r, notas: valor }))} aoEnviar={enviarNota}
            itens={caso.notas.map(n => ({ chave: n.id, autor: n.usuario ?? 'Coordenação', texto: n.texto, criado_em: n.criado_em }))} />}
          {aba === 'historico' && <>
            <h2 className="titulo-painel">Histórico do caso</h2>
            <ol className="linha-do-tempo">
              {caso.eventos.map(ev => <li key={ev.id}><span>{descricaoEvento(ev)}</span><time dateTime={ev.criado_em}>{dataLegivel(ev.criado_em)}</time></li>)}
            </ol>
          </>}
        </div>
      </div>
    </div>
  </section>;
}
