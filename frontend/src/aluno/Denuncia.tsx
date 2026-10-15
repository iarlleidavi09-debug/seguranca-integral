import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { enviarDenuncia, mensagemErro } from '../shared/api';
import type { ResultadoDenuncia } from '../shared/api';
import { girarImagem } from './girarImagem';
import { apagarRascunho, lerRascunho, salvarRascunho } from './rascunho';
import type { DadosRascunho } from './rascunho';
import { LIMITE_RELATO, SITUACOES, comporRelato, tipoDe } from './situacoes';

const vazio: DadosRascunho = { situacaoId: '', marcadas: [], relato: '', quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '' };
const etapas = ['Situação', 'Detalhes', 'Relato', 'Provas'];
const titulos = ['Qual é a situação?', 'O que está acontecendo?', 'O que aconteceu?', 'Provas e identificação'];
type Anexo = { arquivo: File; url: string; id: number };
type Passo = 1 | 2 | 3 | 4;

export default function Denuncia({ onEnviado, onEnviando, passoInicial = 1, dadosIniciais }: { onEnviado: (resultado: ResultadoDenuncia) => void; onEnviando?: (enviando: boolean) => void; passoInicial?: Passo; dadosIniciais?: Partial<DadosRascunho> }) {
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
  const urls = useRef(new Set<string>());
  const ativo = useRef(true);
  const atuais = useRef<Anexo[]>([]);
  atuais.current = anexos;
  const sequencia = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const situacao = SITUACOES.find(s => s.id === dados.situacaoId);
  const temDetalhes = (situacao?.opcoes.length ?? 0) > 0;
  const temRascunho = Boolean(dados.situacaoId || dados.marcadas.length || dados.relato || dados.quando || dados.onde || dados.nome || dados.turma || dados.em_andamento || !dados.anonimo);
  // espaço que o bloco das opções marcadas ocupa; o resto é o que o aluno pode escrever
  const limiteTexto = LIMITE_RELATO - comporRelato('', dados.marcadas).length;
  // o rascunho restaurado não se regrava ao abrir: só uma edição real renova o prazo de 24 horas
  const gravado = useRef(dados);
  useEffect(() => {
    if (!persistir || dados === gravado.current) return;
    // sem texto nem escolha não há o que guardar
    if (temRascunho) { if (!salvarRascunho(dados)) setAvisoRascunho('Este navegador não permite salvar o rascunho. Mantenha esta tela aberta até enviar.'); }
    else apagarRascunho();
  }, [dados, temRascunho, persistir]);
  function limparRascunho() {
    setDados({ ...vazio }); setPasso(1); setErro(''); setAvisoRascunho('Rascunho apagado.');
    titulo.current?.focus();
  }
  const tamanhoTexto = dados.relato.trim().length;
  const excesso = tamanhoTexto - limiteTexto;
  useEffect(() => { titulo.current?.focus(); }, [passo]);
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
    // trocar de situação descarta as opções da anterior, que não valem para a nova
    setDados(anterior => ({ ...anterior, situacaoId: id, marcadas: anterior.situacaoId === id ? anterior.marcadas : [] }));
    setErro('');
  }
  function marcar(opcao: string, marcada: boolean) {
    setDados(anterior => ({ ...anterior, marcadas: marcada ? [...anterior.marcadas, opcao] : anterior.marcadas.filter(o => o !== opcao) }));
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
    if (passo === 2 && !dados.marcadas.length) return 'Escolha pelo menos uma opção.';
    if (passo === 3) {
      const tamanho = comporRelato(dados.relato, dados.marcadas).length;
      if (dados.relato.trim().length < 10) return 'Conte um pouco mais, com pelo menos 10 caracteres.';
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
    setPasso(passo === 3 && !temDetalhes ? 1 : (passo - 1) as Passo);
  }
  async function continuar() {
    if (enviando || girando.length > 0) return;
    const problema = validar();
    if (problema) { setErro(problema); return; }
    if (passo < 4) { setErro(''); setPasso(passo === 1 && !temDetalhes ? 3 : (passo + 1) as Passo); return; }
    setEnviando(true); onEnviando?.(true); setErro('');
    const form = new FormData();
    form.append('tipo', tipoDe(dados.situacaoId));
    form.append('relato', comporRelato(dados.relato, dados.marcadas));
    form.append('quando', dados.quando);
    form.append('onde', dados.onde);
    form.append('em_andamento', String(dados.em_andamento));
    form.append('anonimo', String(dados.anonimo));
    form.append('nome', dados.anonimo ? '' : dados.nome);
    form.append('turma', dados.anonimo ? '' : dados.turma);
    anexos.forEach(({ arquivo }) => form.append('anexos[]', arquivo));
    try {
      const resultado = await enviarDenuncia(form);
      apagarRascunho();
      onEnviado(resultado);
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
        {passo === 2 && situacao && <fieldset className="sem-borda">
          <legend>Marque tudo o que se parece com o que você está vivendo.</legend>
          <div className="opcoes-tipo">{situacao.opcoes.map(o => <label className="opcao" key={o}>
            <input type="checkbox" checked={dados.marcadas.includes(o)} onChange={e => marcar(o, e.target.checked)} />{o}
          </label>)}</div>
        </fieldset>}
        {passo === 3 && <div className="campos">
          <div><label htmlFor="relato">O que aconteceu?</label>
            <p id="ajuda-relato" className="texto-pequeno">Conte com suas palavras. Você não precisa lembrar de todos os detalhes.</p>
            <textarea id="relato" rows={7} value={dados.relato} onChange={e => alterar('relato', e.target.value)} aria-describedby="ajuda-relato tamanho-relato" />
            <p id="tamanho-relato" className={'texto-pequeno contador' + (excesso > 0 ? ' excedido' : '')}>{tamanhoTexto} de {limiteTexto} caracteres. Mínimo de 10.{excesso > 0 && ` ${excesso} ${excesso === 1 ? 'caractere' : 'caracteres'} a mais.`}</p>
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
      {avisoRascunho && <p className="aviso" role="status">{avisoRascunho}</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="acoes fim-etapa">
        {passo > 1 && <button type="button" className="botao secundario" disabled={enviando} onClick={voltar}>Voltar</button>}
        <button className="botao principal" disabled={enviando || girando.length > 0}>{enviando ? 'Enviando pedido…' : passo === 4 ? 'Enviar pedido de ajuda' : 'Continuar'}</button>
      </div>
      {enviando && <p role="status">Enviando. Aguarde nesta tela.</p>}
    </form>
  </section>;
}
