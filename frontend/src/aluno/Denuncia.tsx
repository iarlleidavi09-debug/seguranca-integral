import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ErroApi, enviarDenuncia, mensagemErro, obterQuestionario } from '../shared/api';
import type { Pergunta, Questionario, ResultadoDenuncia } from '../shared/api';
import { limparInvisiveis, montarEnvio, perguntasVisiveis, proxima } from './fluxo';
import { girarImagem } from './girarImagem';
import { apagarRascunho, lerRascunho, salvarRascunho } from './rascunho';
import type { DadosRascunho } from './rascunho';
import { LIMITE_RELATO, SITUACOES, TEXTO_ORIENTACAO, tipoDe } from './situacoes';

const vazio: DadosRascunho = { situacaoId: '', marcadas: [], respostas: {}, relato: '', quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '' };
const etapas = ['Situação', 'Detalhes', 'Relato', 'Provas'];
const titulos = ['Qual é a situação?', 'O que está acontecendo?', 'O que aconteceu?', 'Provas e identificação'];
type Anexo = { arquivo: File; url: string; id: number };
type Passo = 1 | 2 | 3 | 4;
type Fase = 'opcoes' | 'pergunta';
/** O que a confirmação precisa saber além do código. */
export type ExtrasEnvio = { orientacao: boolean; respostasNaoEnviadas: boolean };

// respostas da pergunta "Você está seguro agora?" que pedem o cuidado extra
const RESPOSTAS_DE_RISCO = ['q6.nao', 'q6.hoje'];

export default function Denuncia({ onEnviado, onEnviando, passoInicial = 1, dadosIniciais }: { onEnviado: (resultado: ResultadoDenuncia, extras?: ExtrasEnvio) => void; onEnviando?: (enviando: boolean) => void; passoInicial?: Passo; dadosIniciais?: Partial<DadosRascunho> }) {
  // com dados iniciais (prévia de telas) nada é lido nem gravado no navegador
  const persistir = !dadosIniciais;
  const [dados, setDados] = useState<DadosRascunho>(() => dadosIniciais ? { ...vazio, ...dadosIniciais } : lerRascunho() ?? { ...vazio });
  const [passo, setPasso] = useState<Passo>(passoInicial);
  const [erro, setErro] = useState('');
  const [erroAnexos, setErroAnexos] = useState('');
  const [avisoRascunho, setAvisoRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [girando, setGirando] = useState<number[]>([]);
  // 'carregando' até a definição chegar; null quando falhou (o pedido segue só com situação e relato)
  const [definicao, setDefinicao] = useState<Questionario | 'carregando' | null>('carregando');
  const [fase, setFase] = useState<Fase>('opcoes');
  // perguntas já mostradas, na ordem; a última é a da tela
  const [visitadas, setVisitadas] = useState<string[]>([]);
  const urls = useRef(new Set<string>());
  const ativo = useRef(true);
  const atuais = useRef<Anexo[]>([]);
  atuais.current = anexos;
  const sequencia = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const legenda = useRef<HTMLLegendElement>(null);
  const situacao = SITUACOES.find(s => s.id === dados.situacaoId);
  const def = typeof definicao === 'object' && definicao ? definicao : null;
  const opcoesDoServidor = def?.situacoes.find(s => s.id === dados.situacaoId)?.opcoes ?? [];
  // Enquanto a definição carrega, qualquer situação espera por ela no passo 2 (o servidor tem opções até para
  // Aliciamento e Outros); se ela chegar sem opções, ou falhar, o efeito abaixo leva ao relato.
  const temDetalhes = def ? opcoesDoServidor.length > 0 : definicao === 'carregando';
  const visiveis = def ? perguntasVisiveis(def, dados.situacaoId, dados.marcadas, dados.respostas) : [];
  const idAtual = visitadas[visitadas.length - 1];
  const perguntaAtual = def && passo === 2 && fase === 'pergunta' ? def.perguntas.find(p => p.id === idAtual && visiveis.includes(p.id)) : undefined;
  const respondidas = Object.values(def ? limparInvisiveis(def, dados.situacaoId, dados.marcadas, dados.respostas) : {}).flat();
  const orientacao = RESPOSTAS_DE_RISCO.some(id => respondidas.includes(id));
  const temRascunho = Boolean(dados.situacaoId || dados.marcadas.length || dados.relato || dados.quando || dados.onde || dados.nome || dados.turma || dados.em_andamento || !dados.anonimo);
  // o rascunho restaurado não se regrava ao abrir: só uma edição real renova o prazo de 24 horas
  const gravado = useRef(dados);
  useEffect(() => {
    if (!persistir || dados === gravado.current) return;
    // sem texto nem escolha não há o que guardar
    if (temRascunho) { if (!salvarRascunho(dados)) setAvisoRascunho('Este navegador não permite salvar o rascunho. Mantenha esta tela aberta até enviar.'); }
    else apagarRascunho();
  }, [dados, temRascunho, persistir]);
  function limparRascunho() {
    setDados({ ...vazio }); setPasso(1); setFase('opcoes'); setVisitadas([]); setErro(''); setAvisoRascunho('Rascunho apagado.');
    titulo.current?.focus();
  }
  const tamanhoTexto = dados.relato.trim().length;
  const excesso = tamanhoTexto - LIMITE_RELATO;
  // título a cada passo; na fase das perguntas, a legenda da pergunta da vez
  useEffect(() => {
    if (passo === 2 && fase === 'pergunta' && legenda.current) legenda.current.focus();
    else titulo.current?.focus();
  }, [passo, fase, idAtual]);
  useEffect(() => {
    let vivo = true;
    // uma resposta tardia não troca o estado se o aluno já seguiu só com o relato
    obterQuestionario()
      .then(q => { if (vivo) setDefinicao(atual => atual === 'carregando' ? q : atual); })
      .catch(() => { if (vivo) setDefinicao(atual => atual === 'carregando' ? null : atual); });
    return () => { vivo = false; };
  }, []);
  // com a definição na mão, descarta do rascunho o que ela não conhece; isso não renova o prazo de 24 horas
  useEffect(() => {
    if (!def) return;
    const validas = new Set(def.situacoes.find(s => s.id === dados.situacaoId)?.opcoes.map(o => o.id));
    const marcadas = dados.marcadas.filter(id => validas.has(id));
    const respostas = limparInvisiveis(def, dados.situacaoId, marcadas, dados.respostas);
    if (marcadas.length === dados.marcadas.length && JSON.stringify(respostas) === JSON.stringify(dados.respostas)) return;
    const limpo = { ...dados, marcadas, respostas };
    gravado.current = limpo;
    setDados(limpo);
    // só reage à chegada da definição
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);
  // sem perguntas para esta situação, ou sem definição, o passo 2 não existe
  useEffect(() => {
    if (passo === 2 && (definicao === null || (def && !temDetalhes))) { setFase('opcoes'); setVisitadas([]); setPasso(3); }
  }, [passo, definicao, def, temDetalhes]);
  useEffect(() => {
    const criadas = urls.current;
    ativo.current = true;
    return () => { ativo.current = false; criadas.forEach(url => URL.revokeObjectURL(url)); criadas.clear(); };
  }, []);
  function alterar<K extends keyof DadosRascunho>(campo: K, valor: DadosRascunho[K]) {
    setDados(anterior => ({ ...anterior, [campo]: valor }));
    setErro('');
  }
  function escolherSituacao(id: string) {
    // trocar de situação descarta opções, respostas e perguntas visitadas da anterior, que não valem para a nova
    if (id !== dados.situacaoId) { setVisitadas([]); setFase('opcoes'); }
    setDados(anterior => anterior.situacaoId === id ? anterior : { ...anterior, situacaoId: id, marcadas: [], respostas: {} });
    setErro('');
  }
  function marcar(opcao: string, marcada: boolean) {
    setDados(anterior => {
      const marcadas = marcada ? [...anterior.marcadas.filter(o => o !== opcao), opcao] : anterior.marcadas.filter(o => o !== opcao);
      // desmarcar uma opção pode fechar perguntas, e as respostas delas saem junto
      return { ...anterior, marcadas, respostas: def ? limparInvisiveis(def, anterior.situacaoId, marcadas, anterior.respostas) : anterior.respostas };
    });
    setErro('');
  }
  function responder(pergunta: Pergunta, resposta: string, marcada: boolean) {
    if (!def) return;
    setDados(anterior => {
      const atuais = anterior.respostas[pergunta.id] ?? [];
      const novas = pergunta.tipo === 'unica' ? [resposta] : marcada ? [...atuais.filter(r => r !== resposta), resposta] : atuais.filter(r => r !== resposta);
      const respostas = { ...anterior.respostas, [pergunta.id]: novas };
      if (!novas.length) delete respostas[pergunta.id];
      // mudar uma resposta pode abrir ou fechar perguntas dependentes
      return { ...anterior, respostas: limparInvisiveis(def, anterior.situacaoId, anterior.marcadas, respostas) };
    });
    setErro('');
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
    setAnexos(atuais => [...atuais, ...novos]);
    setErroAnexos([...new Set(erros)].join(' '));
    e.target.value = '';
  }
  function remover(anexo: Anexo) {
    URL.revokeObjectURL(anexo.url);
    urls.current.delete(anexo.url);
    setAnexos(atuais => atuais.filter(a => a.id !== anexo.id));
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
      setAnexos(lista => lista.map(a => a.id === anexo.id ? { ...a, arquivo: girado, url } : a));
    } catch (falha) {
      if (!ativo.current) return;
      setErroAnexos(falha instanceof Error && falha.message === 'girar-grande'
        ? 'A imagem girada passa de 5 MB. Ela continua anexada como estava.'
        : 'Não foi possível girar esta imagem. Ela continua anexada como estava.');
    } finally { if (ativo.current) setGirando(g => g.filter(id => id !== anexo.id)); }
  }
  function validar(): string {
    if (passo === 1 && !situacao) return 'Escolha uma situação para continuar.';
    if (passo === 2 && fase === 'opcoes' && !dados.marcadas.length) return 'Escolha pelo menos uma opção.';
    if (passo === 3) {
      const tamanho = dados.relato.trim().length;
      if (tamanho < 10) return 'Conte um pouco mais, com pelo menos 10 caracteres.';
      if (tamanho > LIMITE_RELATO) {
        const excesso = tamanho - LIMITE_RELATO;
        return `Seu relato tem ${excesso} ${excesso === 1 ? 'caractere' : 'caracteres'} a mais que o limite de ${LIMITE_RELATO}. Apague um pouco para continuar.`;
      }
    }
    if (passo === 4 && !dados.anonimo && !dados.nome.trim()) return 'Preencha seu nome para se identificar.';
    return '';
  }
  function voltar() {
    setErro('');
    if (passo === 2) {
      // da pergunta volta à anterior visitada; da primeira, às opções
      if (fase === 'pergunta' && visitadas.length > 1) setVisitadas(visitadas.slice(0, -1));
      else if (fase === 'pergunta') { setVisitadas([]); setFase('opcoes'); }
      else setPasso(1);
      return;
    }
    if (passo === 3 && temDetalhes) {
      // do relato volta à última pergunta vista, ou às opções se não houve pergunta
      setFase(visitadas.length ? 'pergunta' : 'opcoes');
      setPasso(2);
      return;
    }
    setPasso(passo === 3 ? 1 : (passo - 1) as Passo);
  }
  function montarFormulario(comRespostas: boolean): FormData {
    const form = new FormData();
    form.append('tipo', tipoDe(dados.situacaoId));
    // o relato vai só com o texto do aluno; as opções e respostas seguem no campo próprio
    form.append('relato', dados.relato.trim());
    if (comRespostas && def && dados.marcadas.length) form.append('respostas', montarEnvio(def, dados.situacaoId, dados.marcadas, dados.respostas));
    form.append('quando', dados.quando);
    form.append('onde', dados.onde);
    form.append('em_andamento', String(dados.em_andamento));
    form.append('anonimo', String(dados.anonimo));
    form.append('nome', dados.anonimo ? '' : dados.nome);
    form.append('turma', dados.anonimo ? '' : dados.turma);
    anexos.forEach(({ arquivo }) => form.append('anexos[]', arquivo));
    return form;
  }
  async function continuar() {
    if (enviando || girando.length > 0) return;
    const problema = validar();
    if (problema) { setErro(problema); return; }
    if (passo === 2 && fase === 'opcoes') {
      setErro('');
      if (visiveis.length) { setVisitadas([visiveis[0]]); setFase('pergunta'); }
      else { setVisitadas([]); setPasso(3); }
      return;
    }
    if (passo === 2) {
      // nenhuma pergunta é obrigatória: avança mesmo sem resposta
      const seguinte = proxima(visiveis, visitadas.filter(id => visiveis.includes(id)));
      setErro('');
      if (seguinte) setVisitadas([...visitadas.filter(id => visiveis.includes(id)), seguinte]);
      else setPasso(3);
      return;
    }
    if (passo < 4) {
      setErro('');
      if (passo === 1) { setFase('opcoes'); setVisitadas([]); }
      setPasso(passo === 1 && !temDetalhes ? 3 : (passo + 1) as Passo);
      return;
    }
    setEnviando(true); onEnviando?.(true); setErro('');
    try {
      let resultado: ResultadoDenuncia;
      let respostasNaoEnviadas = false;
      try { resultado = await enviarDenuncia(montarFormulario(true)); }
      catch (falha) {
        // a definição pode ter mudado entre carregar e enviar: o pedido de ajuda vai mesmo assim, sem as respostas
        if (def && dados.marcadas.length && falha instanceof ErroApi && falha.status === 400 && falha.erroServidor === 'respostas invalidas') {
          resultado = await enviarDenuncia(montarFormulario(false));
          respostasNaoEnviadas = true;
        } else throw falha;
      }
      apagarRascunho();
      onEnviado(resultado, { orientacao, respostasNaoEnviadas });
    } catch (falha) { setErro(`${mensagemErro(falha)} Seu relato continua nesta tela.`); }
    finally { setEnviando(false); onEnviando?.(false); }
  }
  return <section className="fluxo">
    <ol className="passos" aria-label="Etapas do pedido">
      {etapas.map((texto, i) => <li key={texto} aria-current={passo === i + 1 ? 'step' : undefined}><span>{i + 1}</span>{texto}</li>)}
    </ol>
    <p className="texto-pequeno passo-contagem"><span>Passo {passo} de 4</span> <span>Um passo de cada vez.</span></p>
    {temRascunho && !enviando && <button type="button" className="botao-texto limpar-rascunho" onClick={limparRascunho}>Limpar rascunho</button>}
    <h1 ref={titulo} tabIndex={-1}>{titulos[passo - 1]}</h1>
    <form noValidate onSubmit={e => { e.preventDefault(); void continuar(); }} aria-busy={enviando}>
      <fieldset disabled={enviando} className="sem-borda">
        {passo === 1 && <fieldset className="sem-borda">
          <legend>Escolha o que mais se aproxima do que aconteceu.</legend>
          <div className="situacoes">{SITUACOES.map(s => <label className={'situacao' + (dados.situacaoId === s.id ? ' selecionada' : '')} key={s.id}>
            <input type="radio" name="situacao" value={s.id} aria-label={`${s.nome}. ${s.descricao}`} checked={dados.situacaoId === s.id} onChange={() => escolherSituacao(s.id)} />
            <span><b>{s.nome}</b><small>{s.descricao}</small></span>
          </label>)}</div>
        </fieldset>}
        {passo === 2 && fase === 'opcoes' && definicao === 'carregando' && <div>
          <p role="status">Carregando as perguntas…</p>
          <button type="button" className="botao secundario" onClick={() => setDefinicao(null)}>Continuar só com o relato</button>
        </div>}
        {passo === 2 && fase === 'opcoes' && def && <fieldset className="sem-borda">
          <legend>Marque tudo o que se parece com o que você está vivendo.</legend>
          <div className="opcoes-tipo">{opcoesDoServidor.map(o => <label className="opcao" key={o.id}>
            <input type="checkbox" checked={dados.marcadas.includes(o.id)} onChange={e => marcar(o.id, e.target.checked)} />{o.texto}
          </label>)}</div>
        </fieldset>}
        {perguntaAtual && <div className="pergunta">
          <p id="pergunta-contagem" className="texto-pequeno pergunta-contagem">{`Pergunta ${visitadas.length} de ${Math.max(visiveis.length, visitadas.length)}`}</p>
          <fieldset className="sem-borda" aria-describedby="pergunta-contagem">
            <legend ref={legenda} tabIndex={-1}>{perguntaAtual.texto}</legend>
            <div className="opcoes-tipo">{perguntaAtual.respostas.map(r => <label className="opcao" key={r.id}>
              <input type={perguntaAtual.tipo === 'unica' ? 'radio' : 'checkbox'} name={perguntaAtual.id}
                checked={(dados.respostas[perguntaAtual.id] ?? []).includes(r.id)} onChange={e => responder(perguntaAtual, r.id, e.target.checked)} />{r.texto}
            </label>)}</div>
          </fieldset>
          <p className="texto-pequeno">Se preferir não responder, é só continuar.</p>
          <div role="status" className={RESPOSTAS_DE_RISCO.some(id => (dados.respostas[perguntaAtual.id] ?? []).includes(id)) ? 'aviso orientacao' : undefined}>
            {RESPOSTAS_DE_RISCO.some(id => (dados.respostas[perguntaAtual.id] ?? []).includes(id)) && TEXTO_ORIENTACAO}
          </div>
        </div>}
        {passo === 3 && <div className="campos">
          <div><label htmlFor="relato">O que aconteceu?</label>
            <p id="ajuda-relato" className="texto-pequeno">Conte com suas palavras. Você não precisa lembrar de todos os detalhes.</p>
            <textarea id="relato" rows={7} value={dados.relato} onChange={e => alterar('relato', e.target.value)} aria-describedby="ajuda-relato tamanho-relato" />
            <p id="tamanho-relato" className={'texto-pequeno contador' + (excesso > 0 ? ' excedido' : '')}>{tamanhoTexto} de {LIMITE_RELATO} caracteres. Mínimo de 10.{excesso > 0 && ` ${excesso} ${excesso === 1 ? 'caractere' : 'caracteres'} a mais.`}</p>
          </div>
          <div><label htmlFor="quando">Quando aconteceu? <span>(opcional)</span></label><input id="quando" maxLength={200} value={dados.quando} onChange={e => alterar('quando', e.target.value)} placeholder="Por exemplo, ontem à noite" /></div>
          <div><label htmlFor="onde">Onde aconteceu? <span>(opcional)</span></label><input id="onde" maxLength={200} value={dados.onde} onChange={e => alterar('onde', e.target.value)} placeholder="Rede social ou aplicativo" /></div>
          <label className="opcao"><input type="checkbox" checked={dados.em_andamento} onChange={e => alterar('em_andamento', e.target.checked)} />Está acontecendo agora?</label>
        </div>}
        {passo === 4 && <div className="campos">
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
            <label className="opcao"><input type="radio" name="identificacao" checked={dados.anonimo} onChange={() => { setDados(d => ({ ...d, anonimo: true, nome: '', turma: '' })); setErro(''); }} />Quero ficar anônimo</label>
            <label className="opcao"><input type="radio" name="identificacao" checked={!dados.anonimo} onChange={() => alterar('anonimo', false)} />Quero me identificar</label>
          </fieldset>
          {!dados.anonimo && <><div><label htmlFor="nome">Seu nome</label><input id="nome" autoComplete="off" maxLength={200} value={dados.nome} onChange={e => alterar('nome', e.target.value)} /></div>
            <div><label htmlFor="turma">Sua turma <span>(opcional)</span></label><input id="turma" maxLength={50} autoComplete="off" value={dados.turma} onChange={e => alterar('turma', e.target.value)} /></div></>}
        </div>}
      </fieldset>
      {definicao === null && passo >= 2 && <p className="aviso" role="status">Não foi possível carregar as perguntas agora. Você pode continuar só com o relato.</p>}
      {avisoRascunho && <p className="aviso" role="status">{avisoRascunho}</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="acoes fim-etapa">
        {passo > 1 && <button type="button" className="botao secundario" disabled={enviando} onClick={voltar}>Voltar</button>}
        <button className="botao principal" disabled={enviando || girando.length > 0 || (passo === 2 && fase === 'opcoes' && definicao === 'carregando')}>{enviando ? 'Enviando pedido…' : passo === 4 ? 'Enviar pedido de ajuda' : 'Continuar'}</button>
      </div>
      {enviando && <p role="status">Enviando. Aguarde nesta tela.</p>}
    </form>
  </section>;
}
