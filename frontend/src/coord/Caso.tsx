import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  criarNota, detalheCaso, enviarMensagemAoAluno, ErroApi, mensagemErroCoord, mudarPrioridade, mudarStatus,
  registrarResolucao, revisarRecorrencia, urlFotoAutor, salvarAtendimento, concluirAcao, registrarLeituraConversa, urlExportacao, editarMensagemAoAluno, excluirMensagemAoAluno, versoesDaMensagem,
} from '../shared/api';
import type { CasoDetalhe, DadosResolucao, Prioridade as ValorPrioridade } from '../shared/api';
import Anexos from './Anexos';
import Integridade from './Integridade';
import Conversa, { TEXTO_MAX } from './Conversa';
import RespostasAluno from './RespostasAluno';
import PosResolucao from './PosResolucao';
import RegistrarResolucao from './RegistrarResolucao';
import ReavaliarPrioridade from './ReavaliarPrioridade';
import Presenca from './Presenca';
import Atendimento from './Atendimento';
import CodigoCaso from './CodigoCaso';
import { useRascunhoConversa } from './useRascunhoConversa';
import { obterSessaoRascunhosConversa, removerRascunhoConversa } from './rascunhosConversa';
import ModelosResposta from './ModelosResposta';
import { usePolling } from './polling';
import {
  Prioridade, Simulacao, STATUS, Status, acessoLegivel, dataLegivel, descricaoEvento, motivo, prioridade, rotuloStatus,
  assuntos, tipo,
} from './rotulos';

type Aba = 'relato' | 'conversa' | 'notas' | 'historico';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'relato', nome: 'Relato e investigação' }, { id: 'conversa', nome: 'Conversa' },
  { id: 'notas', nome: 'Notas internas' }, { id: 'historico', nome: 'Histórico' },
];
const sessaoPerdida = (falha: unknown) => falha instanceof ErroApi && falha.status === 401;
const NOTA_ROE = 'Relatório de apoio para impressão ou cópia. Os campos devem ser conferidos ao preencher o ROE.';

/** Verdadeiro quando a janela tem 1100 px ou mais; sem matchMedia (jsdom) vale falso. */
function useLargo(): boolean {
  const consultar = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1100px)') : null);
  const [largo, setLargo] = useState(() => Boolean(consultar()?.matches));
  useEffect(() => {
    const consulta = consultar();
    if (!consulta) return;
    const atualizar = () => setLargo(consulta.matches);
    atualizar();
    consulta.addEventListener?.('change', atualizar);
    return () => consulta.removeEventListener?.('change', atualizar);
  }, []);
  return largo;
}

/** "Por que esta prioridade?": coluna fixa a partir de 1100 px; abaixo disso, bloco recolhível aberto só para crítica ou alta. */
function PainelPrioridade({ caso }: { caso: CasoDetalhe }) {
  const largo = useLargo();
  const [aberto, setAberto] = useState(caso.prioridade === 'critica' || caso.prioridade === 'alta');
  const titulo = <h2 id="titulo-resumo">Por que esta prioridade?</h2>;
  const conteudo = <>
    {caso.motivos.length === 0 ? <p className="vazio">Sem motivos registrados.</p>
      : <ul className="motivos">{caso.motivos.map(m => <li key={m}>{motivo(m)}</li>)}</ul>}
    <p className="resumo-prioridade">Prioridade atual: <b>{prioridade(caso.prioridade)}</b></p>
    {caso.prioridade_original && caso.prioridade_original !== caso.prioridade
      && <p className="resumo-prioridade">Classificação original: <b>{prioridade(caso.prioridade_original)}</b></p>}
  </>;
  return <aside className="caso-lateral" aria-labelledby="titulo-resumo">
    {largo ? <>{titulo}{conteudo}</>
      : <details className="caso-lateral-detalhes" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
        <summary>{titulo}</summary>{conteudo}
      </details>}
  </aside>;
}

export default function Caso({ id, aoVoltar, aoMudar, abaInicial = 'relato', anexoInicial = null, imagemPrevia }: { id: number; aoVoltar: () => void; aoMudar?: () => void; abaInicial?: Aba; anexoInicial?: number | null; imagemPrevia?: string }) {
  const [caso, setCaso] = useState<CasoDetalhe | null>(null);
  const [erroCarga, setErroCarga] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [rascunho, setRascunho] = useRascunhoConversa(id);
  const gestao = useRef<HTMLDetailsElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const abas = useRef<Record<Aba, HTMLButtonElement | null>>({ relato: null, conversa: null, notas: null, historico: null });
  const trabalhando = useRef(false);
  const montado = useRef(true);
  const revisaoAtual = useRef(0);
  const rodadaCarga = useRef(0);
  const revisaoPrioridade = useRef<number | null>(null);
  const revisaoResolucao = useRef<number | null>(null);
  const [resolucaoEditando, setResolucaoEditando] = useState(false);
  useEffect(() => {
    if (resolucaoEditando && gestao.current) gestao.current.open = true;
  }, [resolucaoEditando]);
  // Maior id de mensagem já exibido na aba Conversa nesta visita (-1: nunca aberta). Serve ao ponto de mensagem nova.
  const [vistoAte, setVistoAte] = useState(-1);
  const abaAnterior = useRef<Aba>(abaInicial);
  const leitura = useRef({ casoId: id, ultimoId: 0, pendente: 0 });
  const [visivel, setVisivel] = useState(document.visibilityState !== 'hidden');
  useEffect(() => {
    const atualizar = () => setVisivel(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', atualizar);
    return () => document.removeEventListener('visibilitychange', atualizar);
  }, []);
  useEffect(() => {
    if (leitura.current.casoId !== id) leitura.current = { casoId: id, ultimoId: 0, pendente: 0 };
    if (aba !== 'conversa' || !visivel || caso?.id !== id) return;
    const ultimoId = Math.max(0, ...caso.mensagens.map(m => m.id ?? 0));
    const registro = leitura.current;
    if (ultimoId <= Math.max(registro.ultimoId, registro.pendente)) return;
    registro.pendente = ultimoId;
    void registrarLeituraConversa(id, ultimoId).then(() => {
      registro.ultimoId = Math.max(registro.ultimoId, ultimoId);
    }).catch(falha => {
      if (!sessaoPerdida(falha) && montado.current) setErro('Não foi possível confirmar a leitura da conversa. A fila pode continuar mostrando mensagens novas.');
    }).finally(() => { if (registro.pendente === ultimoId) registro.pendente = 0; });
  }, [aba, visivel, caso, id]);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => {
    if (aba !== 'conversa' || !caso) return;
    const maior = Math.max(0, ...caso.mensagens.map(m => m.id ?? 0));
    setVistoAte(atual => Math.max(atual, maior));
  }, [aba, caso]);
  // A aba escolhida volta para a vista quando a fileira de abas rola (celular). Não roda na carga inicial para não mover a página.
  useEffect(() => {
    if (abaAnterior.current === aba) return;
    abaAnterior.current = aba;
    abas.current[aba]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [aba]);

  const recarregar = useCallback(async () => {
    const rodada = ++rodadaCarga.current;
    const dados = await detalheCaso(id);
    if (montado.current && rodada === rodadaCarga.current) { revisaoAtual.current = dados.revisao_estado ?? 0; setCaso(dados); }
  }, [id]);

  usePolling(async (sinal, ativo) => {
    const rodada = ++rodadaCarga.current;
    try {
      const dados = await detalheCaso(id, sinal);
      if (ativo() && rodada === rodadaCarga.current) { revisaoAtual.current = dados.revisao_estado ?? 0; setCaso(dados); setErroCarga(''); }
    } catch (falha) {
      if (!ativo() || sessaoPerdida(falha)) return;
      if (!caso) setErroCarga(mensagemErroCoord(falha));
    }
  }, [id]);
  const pronto = caso !== null || erroCarga !== '';
  useEffect(() => { if (pronto) titulo.current?.focus(); }, [pronto]);

  /**
   * Guarda de reentrada das ações do caso: uma por vez, recarrega o detalhe depois, avisa em região aria-live
   * e trata o 401 (a sessão perdida volta ao Login pelo App, sem mensagem aqui).
   * Devolve true quando a ação foi gravada (mesmo que a recarga falhe), false caso contrário.
   * Com `conflito`, um 409 mostra essa mensagem no lugar da genérica e recarrega o caso (o estado já mudou).
   */
  async function agir(acao: () => Promise<unknown>, sucesso: string, depois?: () => void, conflito?: string, falhar?: (mensagem: string) => void): Promise<boolean> {
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
      // `falhar` entrega a mensagem a quem chamou (o item da conversa mostra o próprio alert) em vez do alert da página
      const mostrar = (mensagem: string) => { if (falhar) falhar(mensagem); else setErro(mensagem); };
      if (falha instanceof ErroApi && falha.status === 409) {
        if (montado.current) mostrar(conflito ?? 'O caso mudou enquanto você trabalhava. Confira o estado atualizado e confirme novamente. Seu texto foi preservado.');
        try { await recarregar(); } catch { /* a mensagem do conflito já orienta a recarregar */ }
        revisaoPrioridade.current = revisaoAtual.current;
        revisaoResolucao.current = revisaoAtual.current;
      } else if (!sessaoPerdida(falha) && montado.current) mostrar(mensagemErroCoord(falha));
      return false;
    } finally { trabalhando.current = false; if (montado.current) setOcupado(false); aoMudar?.(); }
  }

  function textoValido(texto: string): string | null {
    const limpo = texto.trim();
    if (!limpo || limpo.length > TEXTO_MAX) { setErro(`Escreva de 1 a ${TEXTO_MAX} caracteres.`); setAviso(''); return null; }
    return limpo;
  }
  const enviarMensagem = () => {
    const original = rascunho.mensagens;
    const sessaoEnvio = obterSessaoRascunhosConversa();
    const texto = textoValido(rascunho.mensagens); if (texto === null) return;
    void agir(() => enviarMensagemAoAluno(id, texto), 'Mensagem enviada ao aluno.', () => removerRascunhoConversa(id, 'mensagens', original, sessaoEnvio));
  };
  async function editarMensagem(mensagemId: number, texto: string) {
    let motivo = '';
    if (!await agir(() => editarMensagemAoAluno(id, mensagemId, texto), 'Mensagem editada.', undefined, undefined, m => { motivo = m; })) throw new Error(motivo);
  }
  async function excluirMensagem(mensagemId: number) {
    let motivo = '';
    if (!await agir(() => excluirMensagemAoAluno(id, mensagemId), 'Mensagem excluída.', undefined, undefined, m => { motivo = m; })) throw new Error(motivo);
  }
  const enviarNota = () => {
    const original = rascunho.notas;
    const sessaoEnvio = obterSessaoRascunhosConversa();
    const texto = textoValido(rascunho.notas); if (texto === null) return;
    void agir(() => criarNota(id, texto), 'Nota interna salva.', () => removerRascunhoConversa(id, 'notas', original, sessaoEnvio));
  };
  const trocarStatus = (novo: 'novo' | 'em_investigacao') =>
    void agir(() => mudarStatus(id, novo, revisaoAtual.current), `Status alterado para ${rotuloStatus[novo]}.`);
  async function reavaliar(nova: ValorPrioridade, justificativa: string) {
    const ok = await agir(() => mudarPrioridade(id, nova, justificativa, revisaoPrioridade.current ?? revisaoAtual.current), `Prioridade alterada para ${prioridade(nova)}.`);
    if (!ok) throw new Error('A prioridade não foi alterada.'); // o formulário fica aberto com o texto digitado
  }
  async function resolver(dados: DadosResolucao) {
    const ok = await agir(() => registrarResolucao(id, dados, revisaoResolucao.current ?? revisaoAtual.current), 'Caso resolvido.', () => { setResolucaoEditando(false); revisaoResolucao.current = null; });
    if (!ok) throw new Error('A resolução não foi registrada.'); // o formulário fica com o texto digitado
    titulo.current?.focus();
  }
  async function revisar() {
    const ok = await agir(() => revisarRecorrencia(id, revisaoAtual.current), 'Revisão registrada.');
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
  const contagens: Partial<Record<Aba, number>> = { conversa: caso.mensagens.length, notas: caso.notas.length, historico: caso.eventos.length };
  /**
   * Ponto de mensagem nova na aba Conversa. O detalhe do caso não traz `mensagens_novas` (só a fila traz), então
   * vale: a última mensagem é do aluno, não foi apagada e ainda não foi exibida nesta visita à aba Conversa.
   * Se o servidor passar a enviar `mensagens_novas` no detalhe, ele manda.
   */
  const ultimaMensagem = caso.mensagens.at(-1);
  const mensagemNova = aba !== 'conversa' && (caso.mensagens_novas !== undefined
    ? caso.mensagens_novas > 0
    : !!ultimaMensagem && ultimaMensagem.autor === 'aluno' && !ultimaMensagem.apagada_em && (ultimaMensagem.id ?? 0) > vistoAte);
  const descricaoAba = (idAba: Aba): string | undefined => {
    const n = contagens[idAba] ?? 0;
    if (!n) return undefined;
    const base = idAba === 'conversa' ? `${n} ${n === 1 ? 'mensagem' : 'mensagens'}` : idAba === 'notas' ? `${n} ${n === 1 ? 'nota' : 'notas'}` : `${n} ${n === 1 ? 'evento' : 'eventos'}`;
    return idAba === 'conversa' && mensagemNova ? `${base}. Há mensagem nova do aluno.` : `${base}.`;
  };
  return <section aria-labelledby="titulo-caso">
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar aos casos</button>
    <div className="caso-topo">
      <h1 id="titulo-caso" ref={titulo} tabIndex={-1}>Caso {caso.id}: {assuntos(caso)}</h1>
      <p className="caso-selos"><Prioridade valor={caso.prioridade} /><Status valor={caso.status} />
        {caso.canal === 'acolhimento' && <span className="selo-neutro">Acolhimento anônimo</span>}
        {caso.simulacao && <Simulacao />}{caso.em_andamento && <span className="selo-neutro">Ocorrendo agora</span>}</p>
      <CodigoCaso key={caso.id} codigo={caso.codigo_acompanhamento} />
      <div className="caso-faixa">
        <p className="texto-pequeno caso-linha">Recebido em {dataLegivel(caso.criado_em)} · Tipo de denúncia: {tipo(caso.tipo)} · {caso.anonimo ? 'Denúncia anônima' : `Identificado: ${caso.nome ?? 'sem nome'}${caso.turma ? `, turma ${caso.turma}` : ''}`}</p>
        <Presenca casoId={id} atividade={aba === 'conversa' && rascunho.mensagens ? 'mensagem' : aba === 'notas' && rascunho.notas ? 'nota' : 'vendo'} />
      </div>
      <details className="caso-dados"><summary>Dados do caso</summary><dl className="detalhes">
        <dt>Ano do relator</dt><dd>{caso.ano_relator || 'Sem informação'}</dd>
        <dt>Sala do relator</dt><dd>{caso.sala_relator || 'Sem informação'}</dd>
        <dt>Local da ocorrência</dt><dd>{caso.local_nome || caso.local_outro || 'Sem informação'}</dd>
      </dl>
      <div className="caso-meta-acesso"><span>Último acesso</span>
        <b>{acessoLegivel(caso.ultimo_acesso?.por ?? null, caso.ultimo_acesso?.em ?? null)}</b></div>
      <p className="texto-pequeno">{NOTA_ROE}</p>
      </details>
    </div>
    <details ref={gestao} className="acoes-recolhidas caso-gestao" onToggle={e => {
      if (!e.currentTarget.open && (resolucaoEditando || ocupado)) e.currentTarget.open = true;
    }}>
      <summary>Gerenciar caso</summary>
      <div className="caso-acoes acoes-recolhidas-conteudo">
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
      <ReavaliarPrioridade atual={caso.prioridade} aoConfirmar={reavaliar} ocupado={ocupado} aoAbrir={() => { revisaoPrioridade.current = revisaoAtual.current; }} />
      <a className="botao secundario caso-roe" href={urlExportacao(id)} target="_blank" rel="noopener" title={NOTA_ROE}>Exportar para o ROE</a>
      {(!resolvido || resolucaoEditando) && <details className="resolucao-detalhes" open={resolucaoEditando}
        onToggle={e => { const aberta = e.currentTarget.open; if (aberta && revisaoResolucao.current === null) revisaoResolucao.current = revisaoAtual.current; setResolucaoEditando(aberta); }}>
        <summary className="botao principal">Resolver este caso</summary>
        <RegistrarResolucao aoConfirmar={resolver} ocupado={ocupado} resolvido={resolvido}
          aoEditar={() => { if (revisaoResolucao.current === null) revisaoResolucao.current = revisaoAtual.current; setResolucaoEditando(true); }} />
      </details>}
      </div>
    </details>
    {resolvido && (caso.recorrencia_pendente || caso.atencao?.includes('mensagem_pendente')) && <p className="aviso caso-aviso-retorno">Há um retorno do aluno após a resolução. Confira a conversa e reabra a investigação se for necessário. O histórico será mantido.</p>}
    <Atendimento caso={caso} ocupado={ocupado}
      aoSalvar={(dados, revisao) => agir(() => salvarAtendimento(id, dados, revisao), 'Atendimento salvo.')}
      aoConcluir={revisao => agir(() => concluirAcao(id, revisao), 'Ação concluída.')} />
    <div aria-live="polite" role="status" className="resultado-acao">{aviso}</div>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {(resolvido || caso.recorrencia_pendente) && <PosResolucao caso={caso} aoRevisar={revisar} ocupado={ocupado} />}

    <div className="caso-layout">
      <PainelPrioridade caso={caso} />
      <div className="caso-principal">
        <div role="tablist" aria-label="Conteúdo do caso" className="abas">
          {ABAS.map(a => {
            const n = contagens[a.id] ?? 0;
            return <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id} aria-controls={aba === a.id ? `painel-${a.id}` : undefined}
              aria-describedby={n ? `descricao-aba-${a.id}` : undefined}
              tabIndex={aba === a.id ? 0 : -1} ref={el => { abas.current[a.id] = el; }}
              onClick={() => setAba(a.id)} onKeyDown={e => teclasAbas(e, a.id)}>{a.nome}
              {n > 0 && <span className="aba-contagem" aria-hidden="true"> {n}</span>}
              {a.id === 'conversa' && mensagemNova && <span className="aba-ponto-novo" aria-hidden="true" />}</button>;
          })}
        </div>
        {ABAS.map(a => descricaoAba(a.id) && <span key={a.id} id={`descricao-aba-${a.id}`} hidden>{descricaoAba(a.id)}</span>)}
        <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="painel-aba" tabIndex={0}>
          {aba === 'relato' && <>
            <h2>Relato</h2>
            <p className="texto-livre">{caso.relato}</p>
            {(caso.quando || caso.onde) && <dl className="detalhes">
              {caso.quando && <><dt>Quando</dt><dd>{caso.quando}</dd></>}
              {caso.onde && <><dt>Onde</dt><dd>{caso.onde}</dd></>}
            </dl>}
            <RespostasAluno questionario={caso.questionario} />
            {(caso.resolucoes?.length ?? 0) > 0 && <section className="autoria-registro" aria-labelledby="titulo-autoria-registro">
              <h2 id="titulo-autoria-registro">Autoria apurada (uso interno)</h2>
              <p className="texto-pequeno">Somente a coordenação vê estes dados. Não são enviados ao aluno.</p>
              {caso.resolucoes.map((resolucao, indice) => <div key={indice}>
                <h3>Apuração de {dataLegivel(resolucao.criado_em)}</h3>
                {resolucao.autoria === 'nao_identificada' ? <>
                  <p>Autoria não identificada</p><p className="texto-livre">{resolucao.justificativa_autoria}</p>
                </> : resolucao.autores?.length ? <ul className="autoria-lista">{resolucao.autores.map(autor => <li key={autor.id}>
                  <b>{autor.nome}</b>
                  <dl className="detalhes"><dt>Ano</dt><dd>{autor.ano}</dd><dt>Sala</dt><dd>{autor.sala}</dd></dl>
                  {autor.tem_foto && <img className="autoria-foto" src={urlFotoAutor(id, autor.id)} alt={`Foto de ${autor.nome}`} loading="lazy" />}
                </li>)}</ul> : <p>Autoria sem informação nesta resolução.</p>}
              </div>)}
            </section>}
            <h2 className={caso.anexos.length === 0 ? 'so-leitor' : undefined}>Anexos</h2>
            <Anexos caso={caso} anexoInicial={anexoInicial} imagemPrevia={imagemPrevia} />
            {caso.anexos.length > 0 && <Integridade casoId={caso.id} />}
          </>}
          {aba === 'conversa' && <Conversa titulo="Conversa com o aluno" campo="texto-mensagem" rotulo="Mensagem ao aluno" ajuda="O aluno lê esta mensagem no acompanhamento."
            ferramenta={<ModelosResposta key={id} textoAtual={rascunho.mensagens} ocupado={ocupado} aoInserir={texto => setRascunho(r => ({ ...r, mensagens: texto }))} />}
            botao="Enviar ao aluno" texto={rascunho.mensagens} enviando={ocupado}
            aoMudar={valor => setRascunho(r => ({ ...r, mensagens: valor }))} aoEnviar={enviarMensagem}
            aoEditar={editarMensagem} aoExcluir={excluirMensagem} aoVerVersoes={mensagemId => versoesDaMensagem(id, mensagemId)}
            itens={caso.mensagens.map((m, i) => ({ chave: i, id: m.id, autor: m.autor === 'aluno' ? 'Aluno' : (m.usuario ?? 'Coordenação'), texto: m.texto, criado_em: m.criado_em, lado: m.autor,
              editada: !!m.editada_em, apagada: !!m.apagada_em, podeAlterar: m.pode_alterar }))} />}
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
