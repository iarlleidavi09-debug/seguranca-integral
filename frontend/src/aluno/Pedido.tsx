import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ErroApi, enviarPedidoV4, mensagemErro, obterQuestionarioV3 } from '../shared/api';
import { obterLocais } from '../shared/mapa';
import MapaLocal from './MapaLocal';
import type { LocalMapa } from '../shared/mapa';
import type { Pergunta, ResultadoDenuncia } from '../shared/api';
import type { QuestionarioV3 } from '../shared/v3';
import { limparRespostasV3, montarEnvioV3, perguntasVisiveisV3 } from './fluxoV3';
import { apagarRascunhoV3, lerRascunhoV3, salvarRascunhoV3, vazioV3 } from './rascunhoV3';
import type { DadosRascunhoV3 } from './rascunhoV3';
import { girarImagem } from './girarImagem';
import { LIMITE_RELATO, TEXTO_ORIENTACAO } from './situacoes';

type Passo = 1 | 2 | 3 | 4;
type Anexo = { id: number; arquivo: File; url: string };
export type ExtrasEnvioV3 = { orientacao: boolean; respostasNaoEnviadas: boolean };
const titulos = ['Qual é a situação?', 'O que está acontecendo?', 'Conte com suas palavras', 'Revise seu pedido'];
const risco = ['q-seguranca.nao', 'q-seguranca.incerta'];
const novoRecibo = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');

export default function Pedido({ onEnviado, onEnviando }: { onEnviado: (resultado: ResultadoDenuncia, extras?: ExtrasEnvioV3) => void; onEnviando?: (enviando: boolean) => void }) {
  const [restaurado] = useState(lerRascunhoV3);
  const [dados, setDados] = useState<DadosRascunhoV3>(restaurado.dados ?? vazioV3);
  const [aviso, setAviso] = useState(restaurado.aviso);
  const [passo, setPasso] = useState<Passo>(1);
  const [definicao, setDefinicao] = useState<QuestionarioV3 | null | 'carregando'>('carregando');
  const [visitadas, setVisitadas] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [confirmarSemRespostas, setConfirmarSemRespostas] = useState(false);
  const [semRespostasConfirmado, setSemRespostasConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [girando, setGirando] = useState<number[]>([]);
  const [erroAnexos, setErroAnexos] = useState('');
  const [locais, setLocais] = useState<LocalMapa[] | null>(null);
  const [erroLocais, setErroLocais] = useState(false);
  const anoRelator = useRef<HTMLInputElement>(null);
  const salaRelator = useRef<HTMLInputElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const legenda = useRef<HTMLLegendElement>(null);
  const alterado = useRef(false);
  const ativo = useRef(true);
  const trava = useRef(false);
  const urls = useRef(new Set<string>());
  const sequencia = useRef(0);
  const atuais = useRef(anexos); atuais.current = anexos;
  const tentativa = useRef<{ assinatura: string; form: FormData } | null>(null);
  const recibo = useRef<string | null>(null);
  const podeRenovarRecibo = useRef(false);
  const def = typeof definicao === 'object' ? definicao : null;
  const visiveis = def ? perguntasVisiveisV3(def, dados.marcadas, dados.respostas) : [];
  const visitadasValidas = visitadas.filter(id => visiveis.includes(id));
  const pergunta = def?.perguntas.find(p => p.id === visitadasValidas.at(-1));
  const assuntosPergunta = pergunta && def ? def.grupos.flatMap(g => g.opcoes)
    .filter(o => dados.marcadas.includes(o.id) && (pergunta.para_opcoes ? pergunta.para_opcoes.includes(o.id) : o.perguntas.includes(pergunta.id)))
    .map(o => o.texto) : [];
  const orientacao = risco.some(id => (dados.respostas['q-seguranca'] ?? []).includes(id));
  const temRascunho = dados.marcadas.length > 0 || Object.values(dados.respostas).some(ids => ids.length > 0) || Boolean(dados.relato || dados.quando || dados.onde || dados.nome || dados.turma || dados.ano_relator || dados.sala_relator || dados.local_id || dados.local_outro || dados.em_andamento || !dados.anonimo);
  const tamanhoTexto = dados.relato.trim().length;
  const excesso = tamanhoTexto - LIMITE_RELATO;
  useEffect(() => {
    let vivo = true;
    obterQuestionarioV3().then(q => { if (vivo) setDefinicao(atual => atual === 'carregando' ? q : atual); })
      .catch(() => { if (vivo) setDefinicao(atual => atual === 'carregando' ? null : atual); });
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    let vivo = true;
    const controle = new AbortController();
    obterLocais(controle.signal).then(c => { if (vivo) setLocais(c.ambientes); }).catch(() => { if (vivo) setErroLocais(true); });
    return () => { vivo = false; controle.abort(); };
  }, []);
  useEffect(() => {
    if (!def) return;
    const validas = new Set(def.grupos.flatMap(g => g.opcoes.map(o => o.id)));
    setDados(d => {
      const marcadas = d.marcadas.filter(id => validas.has(id));
      const respostas = limparRespostasV3(def, marcadas, d.respostas);
      return JSON.stringify([marcadas, respostas]) === JSON.stringify([d.marcadas, d.respostas]) ? d : { ...d, marcadas, respostas };
    });
  }, [def]);
  useEffect(() => {
    if (!alterado.current) return;
    if (!temRascunho) apagarRascunhoV3();
    else if (!salvarRascunhoV3(dados)) setAviso('Este navegador não permite salvar o rascunho. Mantenha esta tela aberta até enviar.');
  }, [dados, temRascunho]);
  useEffect(() => { if (passo === 2) legenda.current?.focus(); else titulo.current?.focus(); }, [passo, pergunta?.id]);
  useEffect(() => {
    const criadas = urls.current; ativo.current = true;
    return () => { ativo.current = false; criadas.forEach(url => URL.revokeObjectURL(url)); criadas.clear(); };
  }, []);
  useEffect(() => {
    if (!enviando) return;
    const impedir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', impedir);
    return () => window.removeEventListener('beforeunload', impedir);
  }, [enviando]);
  function editar(mudar: (d: DadosRascunhoV3) => DadosRascunhoV3) {
    if (trava.current) return;
    alterado.current = true; tentativa.current = null; podeRenovarRecibo.current = false; setConfirmarSemRespostas(false); setSemRespostasConfirmado(false); setErro(''); setDados(mudar);
  }
  function alterar<K extends keyof DadosRascunhoV3>(campo: K, valor: DadosRascunhoV3[K]) { editar(d => ({ ...d, [campo]: valor })); }
  function caminhoLocal(id: string): string {
    const nomes: string[] = [], vistos = new Set<string>();
    let atual = locais?.find(l => l.id === id);
    while (atual && !vistos.has(atual.id)) { vistos.add(atual.id); nomes.unshift(atual.nome); atual = locais?.find(l => l.id === atual?.pai_id); }
    return nomes.join(' / ') || 'Local selecionado anteriormente';
  }
  function validarTurma(): boolean {
    if (!dados.ano_relator.trim()) { setErro('Informe seu ano para continuar.'); anoRelator.current?.focus(); return false; }
    if (!dados.sala_relator.trim()) { setErro('Informe sua sala para continuar.'); salaRelator.current?.focus(); return false; }
    if (locais && dados.local_id && !locais.some(l => l.id === dados.local_id)) { setErro('O local escolhido não está mais no mapa. Escolha outro ou selecione “Não sei / fora do mapa”.'); return false; }
    return true;
  }
  function marcar(id: string, marcada: boolean) {
    editar(d => {
      const marcadas = marcada ? [...new Set([...d.marcadas, id])] : d.marcadas.filter(v => v !== id);
      return { ...d, marcadas, respostas: def ? limparRespostasV3(def, marcadas, d.respostas) : {} };
    });
  }
  function responder(p: Pergunta, id: string, marcada: boolean) {
    if (!def) return;
    editar(d => {
      const lista = d.respostas[p.id] ?? [];
      const respostas = { ...d.respostas, [p.id]: p.tipo === 'unica' ? [id] : marcada ? [...new Set([...lista, id])] : lista.filter(v => v !== id) };
      return { ...d, respostas: limparRespostasV3(def, d.marcadas, respostas) };
    });
  }
  function relatoLivre() { if (definicao === 'carregando') setDefinicao(null); setPasso(3); setErro(''); }
  function voltar() {
    setErro('');
    if (passo === 2 && visitadasValidas.length > 1) setVisitadas(visitadasValidas.slice(0, -1));
    else if (passo === 2) setPasso(1);
    else if (passo === 3) setPasso(def && visitadasValidas.length ? 2 : 1);
    else setPasso(3);
  }
  function adicionar(e: ChangeEvent<HTMLInputElement>) {
    const novos: Anexo[] = [];
    const erros: string[] = [];
    for (const arquivo of Array.from(e.target.files ?? [])) {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(arquivo.type)) {
        erros.push(`${arquivo.name}: use PNG, JPEG, WebP ou GIF.`); continue;
      }
      if (arquivo.size > 5 * 1024 * 1024) { erros.push(`${arquivo.name}: o limite é 5 MB por imagem.`); continue; }
      if (anexos.length + novos.length >= 5) { erros.push('Você pode adicionar até 5 imagens.'); continue; }
      const url = URL.createObjectURL(arquivo);
      urls.current.add(url);
      novos.push({ arquivo, url, id: ++sequencia.current });
    }
    tentativa.current = null; setAnexos(atuais => [...atuais, ...novos]);
    setErroAnexos([...new Set(erros)].join(' '));
    e.target.value = '';
  }
  function remover(anexo: Anexo) {
    URL.revokeObjectURL(anexo.url);
    urls.current.delete(anexo.url);
    tentativa.current = null; setAnexos(atuais => atuais.filter(a => a.id !== anexo.id));
    setErroAnexos('');
  }
  async function girar(anexo: Anexo) {
    setGirando(g => [...g, anexo.id]); setErroAnexos('');
    try {
      const girado = await girarImagem(anexo.arquivo, 90);
      // o aluno pode ter removido o anexo, ou saído da tela, enquanto a imagem girava
      if (!ativo.current || !atuais.current.some(a => a.id === anexo.id)) return;
      const url = URL.createObjectURL(girado);
      urls.current.add(url);
      const antiga = atuais.current.find(a => a.id === anexo.id)!.url;
      URL.revokeObjectURL(antiga);
      urls.current.delete(antiga);
      tentativa.current = null; setAnexos(lista => lista.map(a => a.id === anexo.id ? { ...a, arquivo: girado, url } : a));
    } catch (falha) {
      if (!ativo.current) return;
      setErroAnexos(falha instanceof Error && falha.message === 'girar-grande'
        ? 'A imagem girada passa de 5 MB. Ela continua anexada como estava.'
        : 'Não foi possível girar esta imagem. Ela continua anexada como estava.');
    } finally { if (ativo.current) setGirando(g => g.filter(id => id !== anexo.id)); }
  }
  function montarFormulario(comRespostas: boolean) {
    const assinatura = JSON.stringify([dados, anexos.map(a => [a.id, a.arquivo.name, a.arquivo.size, a.arquivo.lastModified]), comRespostas]);
    if (tentativa.current?.assinatura === assinatura) return tentativa.current.form;
    const form = new FormData();
    recibo.current ??= novoRecibo();
    form.append('envio_id', recibo.current);
    form.append('relato', dados.relato.trim());
    if (comRespostas && def) form.append('respostas', montarEnvioV3(def, dados.marcadas, dados.respostas));
    form.append('quando', dados.quando); form.append('onde', dados.onde);
    form.append('em_andamento', String(dados.em_andamento)); form.append('anonimo', String(dados.anonimo));
    form.append('nome', dados.anonimo ? '' : dados.nome); form.append('turma', dados.anonimo ? '' : dados.turma);
    form.append('ano_relator', dados.ano_relator.trim()); form.append('sala_relator', dados.sala_relator.trim());
    form.append('local_id', dados.local_id); form.append('local_outro', dados.local_outro.trim());
    anexos.forEach(a => form.append('anexos[]', a.arquivo));
    tentativa.current = { assinatura, form }; return form;
  }
  async function enviar(comRespostas: boolean) {
    if (trava.current || girando.length) return;
    if (!validarTurma()) { setPasso(3); return; }
    if (!dados.anonimo && !dados.nome.trim()) { setErro('Preencha seu nome para se identificar.'); return; }
    trava.current = true; podeRenovarRecibo.current = false; setEnviando(true); onEnviando?.(true); setErro('');
    try {
      const resultado = await enviarPedidoV4(montarFormulario(comRespostas));
      apagarRascunhoV3(); onEnviado(resultado, { orientacao, respostasNaoEnviadas: Boolean(def && !comRespostas) });
    } catch (falha) {
      if (comRespostas && def && falha instanceof ErroApi && ((falha.status === 400 && falha.erroServidor.startsWith('respostas invalidas')) || falha.status === 503)) {
        podeRenovarRecibo.current = falha.status === 400;
        setConfirmarSemRespostas(true); setErro('As perguntas não puderam ser aceitas. Revise as respostas ou confirme abaixo o envio apenas do relato e das imagens.');
      } else if (falha instanceof ErroApi && falha.status === 409) {
        setErro('O servidor já recebeu outra versão deste pedido. Estas alterações não foram enviadas. Seu relato continua nesta tela.');
      } else setErro(`${mensagemErro(falha)} Seu relato continua nesta tela.`);
    } finally { trava.current = false; if (ativo.current) { setEnviando(false); onEnviando?.(false); } }
  }
  function continuar() {
    if (trava.current) return;
    setErro('');
    if (passo === 1) {
      if (!def || !visiveis.length) relatoLivre(); else { setVisitadas([visiveis[0]]); setPasso(2); }
    } else if (passo === 2) {
      const seguinte = visiveis.find(id => !visitadasValidas.includes(id));
      if (seguinte) setVisitadas([...visitadasValidas, seguinte]); else setPasso(3);
    } else if (passo === 3) {
      if (tamanhoTexto < 10) setErro('Conte um pouco mais, com pelo menos 10 caracteres.');
      else if (excesso > 0) setErro(`Seu relato tem ${excesso} caracteres a mais que o limite de ${LIMITE_RELATO}. Apague um pouco para continuar.`);
      else if (!validarTurma()) return;
      else setPasso(4);
    } else void enviar(Boolean(def) && !semRespostasConfirmado);
  }
  function limpar() {
    apagarRascunhoV3(); alterado.current = false; tentativa.current = null; recibo.current = null; podeRenovarRecibo.current = false; setDados({ ...vazioV3 });
    anexos.forEach(a => URL.revokeObjectURL(a.url)); urls.current.clear(); setAnexos([]); setVisitadas([]);
    setPasso(1); setErro(''); setErroAnexos(''); setConfirmarSemRespostas(false); setSemRespostasConfirmado(false); setAviso('Rascunho apagado.'); titulo.current?.focus();
  }
  const quantidade = dados.marcadas.length;
  return <section className="fluxo pedido-v3">
    <ol className="passos" aria-label="Etapas do pedido">{['Situação', 'Detalhes', 'Relato', 'Revisão e provas'].map((nome, i) =>
      <li key={nome} aria-current={passo === i + 1 ? 'step' : undefined}><span>{i + 1}</span>{nome}</li>)}</ol>
    <h1 ref={titulo} tabIndex={-1}>{titulos[passo - 1]}</h1>
    {temRascunho && <button type="button" className="botao-texto limpar-rascunho" disabled={enviando} onClick={limpar}>Limpar rascunho</button>}
    <form noValidate aria-busy={enviando} onSubmit={e => { e.preventDefault(); continuar(); }}>
      <fieldset className="sem-borda" disabled={enviando}>
        {passo === 1 && <>
          <p className="introducao-pedido">Você pode marcar mais de uma situação, mesmo em grupos diferentes. Se não encontrar, siga só com o relato.</p>
          {definicao === 'carregando' && <p role="status">Carregando as situações e perguntas…</p>}
          {def && <><div className="grupos-v3">{def.grupos.map(g => {
            const contagem = g.opcoes.filter(o => dados.marcadas.includes(o.id)).length;
            return <details key={g.id} open={contagem > 0 || undefined}>
              <summary>{g.nome}<span className="contagem-grupo">{contagem > 0 ? `${contagem} selecionada${contagem > 1 ? 's' : ''}` : `${g.opcoes.length} opções`}</span></summary>
              <div className="opcoes-grupo">{g.opcoes.map(o => <label className="opcao" key={o.id}><input type="checkbox" checked={dados.marcadas.includes(o.id)} onChange={e => marcar(o.id, e.target.checked)} />{o.texto}</label>)}</div>
            </details>;
          })}</div><p className="selecao-v3" role="status">{quantidade} {quantidade === 1 ? 'situação selecionada' : 'situações selecionadas'}</p></>}
          <button type="button" className="botao-texto" onClick={relatoLivre}>Continuar só com o relato</button>
        </>}
        {passo === 2 && pergunta && <div className="pergunta">
          {assuntosPergunta.length > 0 && <p className="texto-pequeno">Sobre: {assuntosPergunta.join(' · ')}</p>}
          <p className="texto-pequeno">Pergunta {visitadasValidas.length} de {visiveis.length} · Responder é opcional.</p>
          <fieldset className="sem-borda"><legend ref={legenda} tabIndex={-1}>{pergunta.texto}</legend>
            <div className="opcoes-tipo">{pergunta.respostas.map(r => <label className="opcao" key={r.id}>
              <input type={pergunta.tipo === 'unica' ? 'radio' : 'checkbox'} name={pergunta.id} checked={(dados.respostas[pergunta.id] ?? []).includes(r.id)} onChange={e => responder(pergunta, r.id, e.target.checked)} />{r.texto}
            </label>)}</div>
          </fieldset>
          <button type="button" className="botao-texto" onClick={() => setPasso(3)}>Ir para o relato</button>
        </div>}
        {orientacao && <p className="aviso orientacao" role="status">{TEXTO_ORIENTACAO}</p>}
        {passo === 3 && <div className="campos">
          <div><label htmlFor="relato">O que aconteceu?</label>
            <p id="ajuda-relato" className="texto-pequeno">Conte com suas palavras. Você não precisa lembrar de todos os detalhes.</p>
            <textarea id="relato" rows={7} value={dados.relato} onChange={e => alterar('relato', e.target.value)} aria-describedby="ajuda-relato tamanho-relato" />
            <p id="tamanho-relato" className={'texto-pequeno contador' + (excesso > 0 ? ' excedido' : '')}>{tamanhoTexto} de {LIMITE_RELATO} caracteres. Mínimo de 10.{excesso > 0 && ` ${excesso} ${excesso === 1 ? 'caractere' : 'caracteres'} a mais.`}</p>
          </div>
          <div><label htmlFor="quando">Quando aconteceu? <span>(opcional)</span></label><input id="quando" maxLength={200} value={dados.quando} onChange={e => alterar('quando', e.target.value)} placeholder="Por exemplo, ontem à noite" /></div>
          <div><label htmlFor="local-mapa">Local no mapa da escola</label>
            <select id="local-mapa" value={dados.local_id} onChange={e => alterar('local_id', e.target.value)} aria-describedby="ajuda-local-mapa">
              <option value="">Não sei / fora do mapa</option>
              {dados.local_id && !locais?.some(l => l.id === dados.local_id) && <option value={dados.local_id}>Local selecionado anteriormente</option>}
              {locais?.map(l => <option key={l.id} value={l.id}>{caminhoLocal(l.id)}</option>)}
            </select>
            <p id="ajuda-local-mapa" className="texto-pequeno">Escolha onde aconteceu. Esse local pode ser diferente da sala da sua turma.</p>
            <MapaLocal valor={dados.local_id} aoEscolher={id => alterar('local_id', id)} />
            {erroLocais && <p className="texto-pequeno">O mapa não pôde ser carregado. Você pode descrever o local abaixo e continuar.</p>}
            {locais?.length === 0 && <p className="texto-pequeno">A escola ainda não cadastrou ambientes no mapa. Descreva o local abaixo, se souber.</p>}
          </div>
          <div><label htmlFor="local-outro">Outro local ou mais detalhes <span>(opcional)</span></label><input id="local-outro" maxLength={200} value={dados.local_outro} onChange={e => alterar('local_outro', e.target.value)} placeholder="Por exemplo, saída da escola ou aplicativo" /></div>
          <fieldset className="turma-relator sem-borda"><legend>Sua turma</legend>
            <p id="ajuda-turma-relator" className="texto-pequeno">Informe o ano e a sala de quem está fazendo este relato. Os dois campos são obrigatórios, mesmo sem informar o nome.</p>
            <div className="turma-relator-campos"><div><label htmlFor="ano-relator">Seu ano</label><input id="ano-relator" ref={anoRelator} required maxLength={40} autoComplete="off" list="anos-relator" value={dados.ano_relator} onChange={e => alterar('ano_relator', e.target.value)} aria-describedby="ajuda-turma-relator" placeholder="Por exemplo, 8º ano" />
              <datalist id="anos-relator">{['1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1º EM', '2º EM', '3º EM'].map(a => <option key={a} value={a} />)}</datalist></div>
              <div><label htmlFor="sala-relator">Sua sala</label><input id="sala-relator" ref={salaRelator} required maxLength={50} autoComplete="off" value={dados.sala_relator} onChange={e => alterar('sala_relator', e.target.value)} aria-describedby="ajuda-turma-relator" placeholder="Por exemplo, B" /></div></div>
          </fieldset>
          <label className="opcao"><input type="checkbox" checked={dados.em_andamento} onChange={e => alterar('em_andamento', e.target.checked)} />Está acontecendo agora?</label>
        </div>}
        {passo === 4 && <div className="campos">
          <div className="revisao-v3"><h2>Situações e respostas</h2>
            <ul>{def?.grupos.flatMap(g => g.opcoes).filter(o => dados.marcadas.includes(o.id)).map(o => <li key={o.id}>{o.texto}</li>)}</ul>
            {!quantidade && <p>Nenhuma situação selecionada.</p>}
            <button type="button" className="botao-texto" onClick={() => setPasso(1)}>Editar situações</button>
            <dl>{def?.perguntas.filter(p => visiveis.includes(p.id) && dados.respostas[p.id]?.length).map(p => <div key={p.id}><dt>{p.texto}</dt><dd>{p.respostas.filter(r => dados.respostas[p.id].includes(r.id)).map(r => r.texto).join('; ')}</dd></div>)}</dl>
            {def && <button type="button" className="botao-texto" onClick={() => { setVisitadas([visiveis[0]]); setPasso(2); }}>Editar respostas</button>}
          </div>
          <div className="revisao-v3"><h2>Seu relato</h2><p className="relato-revisao">{dados.relato}</p>
            {dados.quando && <p>Quando: {dados.quando}</p>}{dados.onde && <p>Onde: {dados.onde}</p>}{dados.em_andamento && <p>Está acontecendo agora.</p>}
            <p>{dados.ano_relator.trim()} · sala {dados.sala_relator.trim()}</p>
            {dados.local_id && <p>{caminhoLocal(dados.local_id)}</p>}{dados.local_outro && <p>Local: {dados.local_outro}</p>}
            <button type="button" className="botao-texto" onClick={() => setPasso(3)}>Editar relato</button></div>
          <div><label htmlFor="anexos">Adicionar imagens</label><p id="ajuda-anexos" className="texto-pequeno">Opcional. Até 5 imagens de até 5 MB cada. PNG, JPEG, WebP ou GIF.</p>
            <input id="anexos" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={adicionar} aria-describedby="ajuda-anexos" />
            {erroAnexos && <p role="alert" className="erro">{erroAnexos}</p>}
            <ul className="anexos">{anexos.map(anexo => <li key={anexo.id}>
              <img src={anexo.url} alt={`Prévia de ${anexo.arquivo.name}`} /><p>{anexo.arquivo.name}</p>
              {anexo.arquivo.type !== 'image/gif' && <button type="button" className="botao secundario" aria-label={`Girar ${anexo.arquivo.name}`} disabled={girando.includes(anexo.id)} onClick={() => void girar(anexo)}>Girar</button>}
              <button type="button" className="botao secundario" aria-label={`Remover ${anexo.arquivo.name}`} onClick={() => remover(anexo)}>Remover</button>
            </li>)}</ul>
            <p className="texto-pequeno">As imagens ficam nesta tela. Se você sair, será preciso adicioná-las novamente.</p>
          </div>
          <fieldset className="sem-borda identificacao"><legend>Como você quer enviar?</legend>
            <label className="opcao"><input type="radio" name="identificacao" checked={dados.anonimo} onChange={() => { editar(d => ({ ...d, anonimo: true, nome: '', turma: '' })); setErro(''); }} />Quero ficar anônimo</label>
            <label className="opcao"><input type="radio" name="identificacao" checked={!dados.anonimo} onChange={() => alterar('anonimo', false)} />Quero me identificar</label>
          </fieldset>
          {!dados.anonimo && <div><label htmlFor="nome">Seu nome</label><input id="nome" autoComplete="off" maxLength={200} value={dados.nome} onChange={e => alterar('nome', e.target.value)} /></div>}
          <p className="texto-pequeno">Mesmo sem seu nome, o ano, a sala e o conteúdo podem permitir que a equipe reconheça você. Essas informações ficam disponíveis à coordenação.</p>
          <p className="texto-pequeno">Ao enviar, a escola guarda seu pedido para cuidar do caso. A rede escolar pode registrar os horários de acesso.</p>
        </div>}
      </fieldset>
      {definicao === null && <p className="aviso" role="status">Não foi possível carregar as perguntas agora. Você pode continuar só com o relato.</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      {confirmarSemRespostas && <button type="button" className="botao secundario" disabled={enviando || girando.length > 0} onClick={() => {
        if (podeRenovarRecibo.current) { recibo.current = null; tentativa.current = null; }
        setSemRespostasConfirmado(true); void enviar(false);
      }}>Confirmar envio sem respostas</button>}
      <div className="acoes fim-etapa">
        {passo > 1 && <button type="button" className="botao secundario" disabled={enviando} onClick={voltar}>Voltar</button>}
        <button className="botao principal" disabled={enviando || (passo === 4 && girando.length > 0) || (passo === 1 && definicao === 'carregando')}>{enviando ? 'Enviando pedido…' : passo === 4 ? 'Enviar pedido de ajuda' : 'Continuar'}</button>
      </div>
      {enviando && <p role="status">Enviando. Aguarde nesta tela.</p>}
    </form>
  </section>;
}
