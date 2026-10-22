import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  criarNota, detalheCaso, enviarMensagemAoAluno, ErroApi, mensagemErroCoord, mudarPrioridade, mudarStatus,
  registrarResolucao, revisarRecorrencia, urlFotoAutor, salvarAtendimento, concluirAcao, registrarLeituraConversa, urlExportacao,
} from '../shared/api';
import type { CasoDetalhe, DadosResolucao, Prioridade as ValorPrioridade } from '../shared/api';
import Anexos from './Anexos';
import Conversa, { TEXTO_MAX } from './Conversa';
import RespostasAluno from './RespostasAluno';
import PosResolucao from './PosResolucao';
import RegistrarResolucao from './RegistrarResolucao';
import ReavaliarPrioridade from './ReavaliarPrioridade';
import Presenca from './Presenca';
import Atendimento from './Atendimento';
import { usePolling } from './polling';
import {
  Prioridade, Simulacao, STATUS, Status, acessoLegivel, dataLegivel, descricaoEvento, motivo, prioridade, rotuloStatus,
  assuntos,
} from './rotulos';

type Aba = 'relato' | 'conversa' | 'notas' | 'historico';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'relato', nome: 'Relato e investigação' }, { id: 'conversa', nome: 'Conversa' },
  { id: 'notas', nome: 'Notas internas' }, { id: 'historico', nome: 'Histórico' },
];
const sessaoPerdida = (falha: unknown) => falha instanceof ErroApi && falha.status === 401;

export default function Caso({ id, aoVoltar, aoMudar, abaInicial = 'relato', anexoInicial = null, imagemPrevia }: { id: number; aoVoltar: () => void; aoMudar?: () => void; abaInicial?: Aba; anexoInicial?: number | null; imagemPrevia?: string }) {
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
  const revisaoAtual = useRef(0);
  const rodadaCarga = useRef(0);
  const revisaoPrioridade = useRef<number | null>(null);
  const revisaoResolucao = useRef<number | null>(null);
  const [resolucaoEditando, setResolucaoEditando] = useState(false);
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
      if (falha instanceof ErroApi && falha.status === 409) {
        if (montado.current) setErro(conflito ?? 'O caso mudou enquanto você trabalhava. Confira o estado atualizado e confirme novamente. Seu texto foi preservado.');
        try { await recarregar(); } catch { /* a mensagem do conflito já orienta a recarregar */ }
        revisaoPrioridade.current = revisaoAtual.current;
        revisaoResolucao.current = revisaoAtual.current;
      } else if (!sessaoPerdida(falha) && montado.current) setErro(mensagemErroCoord(falha));
      return false;
    } finally { trabalhando.current = false; if (montado.current) setOcupado(false); aoMudar?.(); }
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
  return <section aria-labelledby="titulo-caso">
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar aos casos</button>
    <div className="caso-topo">
      <h1 id="titulo-caso" ref={titulo} tabIndex={-1}>Caso {caso.id}: {assuntos(caso)}</h1>
      <p className="caso-selos"><Prioridade valor={caso.prioridade} /><Status valor={caso.status} />
        {caso.canal === 'acolhimento' && <span className="selo-neutro">Acolhimento anônimo</span>}
        {caso.simulacao && <Simulacao />}{caso.em_andamento && <span className="selo-neutro">Ocorrendo agora</span>}</p>
      <p className="texto-pequeno">Recebido em {dataLegivel(caso.criado_em)}. {caso.anonimo ? 'Denúncia anônima.' : `Identificado: ${caso.nome ?? 'sem nome'}${caso.turma ? `, turma ${caso.turma}` : ''}.`}</p>
      <p><a href={urlExportacao(id)} target="_blank" rel="noopener">Exportar para preenchimento do ROE</a></p>
      <p className="texto-pequeno">Relatório de apoio para impressão ou cópia. Os campos devem ser conferidos ao preencher o ROE.</p>
      <details className="caso-dados"><summary>Dados do caso</summary><dl className="detalhes">
        <dt>Ano do relator</dt><dd>{caso.ano_relator || 'Sem informação'}</dd>
        <dt>Sala do relator</dt><dd>{caso.sala_relator || 'Sem informação'}</dd>
        <dt>Local da ocorrência</dt><dd>{caso.local_nome || caso.local_outro || 'Sem informação'}</dd>
      </dl>
      <div className="caso-meta-acesso"><span>Último acesso</span>
        <b>{acessoLegivel(caso.ultimo_acesso?.por ?? null, caso.ultimo_acesso?.em ?? null)}</b></div>
      </details>
    </div>
    <Presenca casoId={id} atividade={aba === 'conversa' && rascunho.mensagens ? 'mensagem' : aba === 'notas' && rascunho.notas ? 'nota' : 'vendo'} />
    <div className="caso-meta">
      {resolvido
        ? <div className="caso-meta-status">
          <p>Caso resolvido.</p>
          {(caso.recorrencia_pendente || caso.atencao?.includes('mensagem_pendente')) && <p className="aviso">Há um retorno do aluno após a resolução. Confira a conversa e reabra a investigação se for necessário. O histórico será mantido.</p>}
          <button type="button" className="botao secundario" disabled={ocupado} onClick={() => trocarStatus('em_investigacao')}>Reabrir para investigação</button>
        </div>
        : <div className="caso-meta-status"><label htmlFor="caso-status">Status</label>
          <select id="caso-status" value={caso.status === 'novo' ? 'novo' : 'em_investigacao'} disabled={ocupado} aria-busy={ocupado}
            onChange={e => trocarStatus(e.target.value as 'novo' | 'em_investigacao')}>
            {STATUS.filter(s => s !== 'resolvido').map(s => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
          </select></div>}
      <ReavaliarPrioridade atual={caso.prioridade} aoConfirmar={reavaliar} ocupado={ocupado} aoAbrir={() => { revisaoPrioridade.current = revisaoAtual.current; }} />
    </div>
    <Atendimento caso={caso} ocupado={ocupado}
      aoSalvar={(dados, revisao) => agir(() => salvarAtendimento(id, dados, revisao), 'Atendimento salvo.')}
      aoConcluir={revisao => agir(() => concluirAcao(id, revisao), 'Ação concluída.')} />
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
      <div>
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
    {(!resolvido || resolucaoEditando) && <details className="resolucao-detalhes" open={resolucaoEditando}
      onToggle={e => { const aberta = e.currentTarget.open; if (aberta && revisaoResolucao.current === null) revisaoResolucao.current = revisaoAtual.current; setResolucaoEditando(aberta); }}>
      <summary>Resolver este caso</summary>
      <RegistrarResolucao aoConfirmar={resolver} ocupado={ocupado} resolvido={resolvido}
        aoEditar={() => { if (revisaoResolucao.current === null) revisaoResolucao.current = revisaoAtual.current; setResolucaoEditando(true); }} />
    </details>}
  </section>;
}
