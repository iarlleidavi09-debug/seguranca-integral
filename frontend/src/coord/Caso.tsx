import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  criarNota, detalheCaso, enviarMensagemAoAluno, ErroApi, mensagemErroCoord, mudarGravidade, mudarStatus, urlAnexo,
} from '../shared/api';
import type { CasoDetalhe } from '../shared/api';
import {
  Gravidade, GRAVIDADES, Simulacao, STATUS, Status, dataLegivel, descricaoEvento, motivo, rotuloGravidade, rotuloStatus, tipo as rotuloDoTipo,
} from './rotulos';

type Aba = 'mensagens' | 'notas';
const TEXTO_MAX = 2000;
const sessaoPerdida = (falha: unknown) => falha instanceof ErroApi && falha.status === 401;

function Anexos({ caso, anexoInicial = null, imagemPrevia }: { caso: CasoDetalhe; anexoInicial?: number | null; imagemPrevia?: string }) {
  const [aberto, setAberto] = useState<number | null>(anexoInicial);
  const origem = useRef<HTMLElement | null>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (aberto !== null) fechar.current?.focus(); }, [aberto]);
  function fecharJanela() { setAberto(null); origem.current?.focus(); }
  function teclas(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fecharJanela(); }
    if (e.key === 'Tab') { e.preventDefault(); fechar.current?.focus(); }
  }
  if (caso.anexos.length === 0) return <p className="vazio">Sem anexos.</p>;
  return <>
    <ul className="miniaturas">
      {caso.anexos.map((a, i) => <li key={a.id}>
        <button type="button" className="miniatura" aria-label={`Ampliar anexo ${i + 1}`}
          onClick={e => { origem.current = e.currentTarget; setAberto(a.id); }}>
          <img src={imagemPrevia ?? urlAnexo(caso.id, a.id)} alt={`Anexo ${i + 1} do caso ${caso.id}`} loading="lazy" />
        </button>
      </li>)}
    </ul>
    {aberto !== null && <div className="fundo-janela" onClick={fecharJanela}>
      <div className="janela" role="dialog" aria-modal="true" aria-label="Anexo ampliado" onKeyDown={teclas} onClick={e => e.stopPropagation()}>
        <img src={imagemPrevia ?? urlAnexo(caso.id, aberto)} alt={`Anexo ampliado do caso ${caso.id}`} />
        <button type="button" ref={fechar} className="botao secundario" onClick={fecharJanela}>Fechar</button>
      </div>
    </div>}
  </>;
}

type Item = { chave: number; autor: string; texto: string; criado_em: string; lado?: string };

function Conversa({ titulo, campo, rotulo, ajuda, botao, itens, texto, aoMudar, aoEnviar, enviando }: {
  titulo: string; campo: string; rotulo: string; ajuda: string; botao: string; texto: string; enviando: boolean; itens: Item[];
  aoMudar: (valor: string) => void; aoEnviar: () => void;
}) {
  return <div>
    <h2 className="titulo-painel">{titulo}</h2>
    {itens.length === 0 ? <p className="vazio">Nada por aqui ainda.</p> : <ul className="mensagens">
      {itens.map(i => <li key={i.chave} className="mensagem" data-autor={i.lado}>
        <h3>{i.autor}</h3><p>{i.texto}</p><time dateTime={i.criado_em}>{dataLegivel(i.criado_em)}</time>
      </li>)}
    </ul>}
    <form className="resposta" onSubmit={e => { e.preventDefault(); aoEnviar(); }}>
      <label htmlFor={campo}>{rotulo}</label>
      <p className="texto-pequeno">{ajuda}</p>
      <textarea id={campo} rows={4} maxLength={TEXTO_MAX} value={texto} onChange={e => aoMudar(e.target.value)} />
      <p className="texto-pequeno contador">{texto.length} de {TEXTO_MAX}</p>
      <button type="submit" className="botao principal" disabled={enviando}>{botao}</button>
    </form>
  </div>;
}

export default function Caso({ id, aoVoltar, abaInicial = 'mensagens', anexoInicial = null, imagemPrevia }: { id: number; aoVoltar: () => void; abaInicial?: Aba; anexoInicial?: number | null; imagemPrevia?: string }) {
  const [caso, setCaso] = useState<CasoDetalhe | null>(null);
  const [erroCarga, setErroCarga] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [rascunho, setRascunho] = useState({ mensagens: '', notas: '' });
  const titulo = useRef<HTMLHeadingElement>(null);
  const abas = useRef<Record<Aba, HTMLButtonElement | null>>({ mensagens: null, notas: null });
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

  async function agir(acao: () => Promise<unknown>, sucesso: string, depois?: () => void) {
    if (trabalhando.current) return;
    trabalhando.current = true;
    setOcupado(true); setErro(''); setAviso('');
    try {
      await acao();
      depois?.();
      try { await recarregar(); setAviso(sucesso); }
      catch (falha) { if (!sessaoPerdida(falha)) setAviso(`${sucesso} Não foi possível atualizar a tela: ${mensagemErroCoord(falha)}`); }
    } catch (falha) {
      if (!sessaoPerdida(falha) && montado.current) setErro(mensagemErroCoord(falha));
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
  function teclasAbas(e: KeyboardEvent, atual: Aba) {
    const lista: Aba[] = ['mensagens', 'notas'];
    let destino: Aba | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') destino = lista[(lista.indexOf(atual) + 1) % lista.length];
    if (e.key === 'Home') destino = lista[0];
    if (e.key === 'End') destino = lista[lista.length - 1];
    if (destino) { e.preventDefault(); setAba(destino); abas.current[destino]?.focus(); }
  }

  if (erroCarga) return <section>
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar à fila</button>
    <h1 ref={titulo} tabIndex={-1}>Caso {id}</h1><p className="erro" role="alert">{erroCarga}</p>
  </section>;
  if (!caso) return <section>
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar à fila</button>
    <p className="vazio" role="status">Carregando o caso.</p>
  </section>;

  return <section aria-labelledby="titulo-caso">
    <button type="button" className="botao-texto" onClick={aoVoltar}>Voltar à fila</button>
    <div className="caso-topo">
      <h1 id="titulo-caso" ref={titulo} tabIndex={-1}>Caso {caso.id}: {rotuloDoTipo(caso.tipo)}</h1>
      <p className="caso-selos"><Gravidade valor={caso.gravidade} /><Status valor={caso.status} />
        {caso.simulacao && <Simulacao />}{caso.em_andamento && <span className="selo-neutro">Ocorrendo agora</span>}</p>
      <p className="texto-pequeno">Recebido em {dataLegivel(caso.criado_em)}. {caso.anonimo ? 'Denúncia anônima.' : `Identificado: ${caso.nome ?? 'sem nome'}${caso.turma ? `, turma ${caso.turma}` : ''}.`}</p>
    </div>
    <div className="seletores">
      <div><label htmlFor="caso-status">Status</label>
        <select id="caso-status" value={caso.status} aria-busy={ocupado}
          onChange={e => void agir(() => mudarStatus(id, e.target.value), `Status alterado para ${rotuloStatus[e.target.value] ?? e.target.value}.`)}>
          {STATUS.map(s => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
        </select></div>
      <div><label htmlFor="caso-gravidade">Gravidade</label>
        <select id="caso-gravidade" value={caso.gravidade} aria-busy={ocupado}
          onChange={e => void agir(() => mudarGravidade(id, e.target.value), `Gravidade alterada para ${rotuloGravidade[e.target.value] ?? e.target.value}.`)}>
          {GRAVIDADES.map(g => <option key={g} value={g}>{rotuloGravidade[g]}</option>)}
        </select></div>
    </div>
    <div aria-live="polite" role="status" className="resultado-acao">{aviso}</div>
    {erro && <p className="erro" role="alert">{erro}</p>}

    <div className="caso-grade">
      <div>
        <h2>Relato</h2>
        <p className="texto-livre">{caso.relato}</p>
        {(caso.quando || caso.onde) && <dl className="detalhes">
          {caso.quando && <><dt>Quando</dt><dd>{caso.quando}</dd></>}
          {caso.onde && <><dt>Onde</dt><dd>{caso.onde}</dd></>}
        </dl>}
        <h2>Anexos</h2>
        <Anexos caso={caso} anexoInicial={anexoInicial} imagemPrevia={imagemPrevia} />
        <h2>Motivos da triagem</h2>
        {caso.motivos.length === 0 ? <p className="vazio">Sem motivos registrados.</p>
          : <ul className="motivos">{caso.motivos.map(m => <li key={m}>{motivo(m)}</li>)}</ul>}
        <h2>Linha do tempo</h2>
        <ol className="linha-do-tempo">
          {caso.eventos.map(ev => <li key={ev.id}><span>{descricaoEvento(ev)}</span><time dateTime={ev.criado_em}>{dataLegivel(ev.criado_em)}</time></li>)}
        </ol>
      </div>
      <div className="conversas">
        <div role="tablist" aria-label="Conversas do caso" className="abas">
          <button type="button" role="tab" id="aba-mensagens" aria-selected={aba === 'mensagens'} aria-controls="painel-mensagens"
            tabIndex={aba === 'mensagens' ? 0 : -1} ref={el => { abas.current.mensagens = el; }}
            onClick={() => setAba('mensagens')} onKeyDown={e => teclasAbas(e, 'mensagens')}>Mensagens ao aluno</button>
          <button type="button" role="tab" id="aba-notas" aria-selected={aba === 'notas'} aria-controls="painel-notas"
            tabIndex={aba === 'notas' ? 0 : -1} ref={el => { abas.current.notas = el; }}
            onClick={() => setAba('notas')} onKeyDown={e => teclasAbas(e, 'notas')}>Notas internas</button>
        </div>
        {aba === 'mensagens' && <div role="tabpanel" id="painel-mensagens" aria-labelledby="aba-mensagens">
          <Conversa titulo="Conversa com o aluno" campo="texto-mensagem" rotulo="Mensagem ao aluno" ajuda="O aluno lê esta mensagem no acompanhamento."
            botao="Enviar ao aluno" texto={rascunho.mensagens} enviando={ocupado}
            aoMudar={valor => setRascunho(r => ({ ...r, mensagens: valor }))} aoEnviar={enviarMensagem}
            itens={caso.mensagens.map((m, i) => ({ chave: i, autor: m.autor === 'aluno' ? 'Aluno' : 'Coordenação', texto: m.texto, criado_em: m.criado_em, lado: m.autor }))} />
        </div>}
        {aba === 'notas' && <div role="tabpanel" id="painel-notas" aria-labelledby="aba-notas">
          <Conversa titulo="Notas da equipe" campo="texto-nota" rotulo="Nota interna" ajuda="Só a coordenação vê. O aluno nunca recebe esta nota."
            botao="Salvar nota" texto={rascunho.notas} enviando={ocupado}
            aoMudar={valor => setRascunho(r => ({ ...r, notas: valor }))} aoEnviar={enviarNota}
            itens={caso.notas.map(n => ({ chave: n.id, autor: n.usuario ?? 'Coordenação', texto: n.texto, criado_em: n.criado_em }))} />
        </div>}
      </div>
    </div>
  </section>;
}
