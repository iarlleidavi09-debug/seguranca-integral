import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { enviarDenuncia, mensagemErro } from '../shared/api';
import type { ResultadoDenuncia } from '../shared/api';

const tipos = [
  ['cyberbullying', 'Cyberbullying'], ['ameaca', 'Ameaça'], ['vazamento', 'Vazamento de fotos ou dados'],
  ['golpe', 'Golpe ou extorsão'], ['perfil_falso', 'Perfil falso'], ['aliciamento', 'Aliciamento'], ['outro', 'Outro'],
] as const;
const chave = 'si-aluno-rascunho-v1';
type Rascunho = { tipo: string; relato: string; quando: string; onde: string; em_andamento: boolean; anonimo: boolean; nome: string; turma: string };
const vazio: Rascunho = { tipo: '', relato: '', quando: '', onde: '', em_andamento: false, anonimo: true, nome: '', turma: '' };
function restaurar(): Rascunho {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(chave) ?? 'null');
    if (!salvo || typeof salvo !== 'object') return { ...vazio };
    const dados = salvo as Record<string, unknown>;
    const texto = (campo: string, limite: number) => typeof dados[campo] === 'string' ? dados[campo].slice(0, limite) : '';
    const anonimo = dados.anonimo !== false;
    return {
      tipo: tipos.some(([valor]) => valor === dados.tipo) ? String(dados.tipo) : '',
      relato: texto('relato', 5000), quando: texto('quando', 200), onde: texto('onde', 200),
      em_andamento: dados.em_andamento === true, anonimo,
      nome: anonimo ? '' : texto('nome', 200), turma: anonimo ? '' : texto('turma', 50),
    };
  } catch { return { ...vazio }; }
}
type Anexo = { arquivo: File; url: string; id: number };

export default function Denuncia({ onEnviado, onEnviando }: { onEnviado: (resultado: ResultadoDenuncia) => void; onEnviando?: (enviando: boolean) => void }) {
  const [dados, setDados] = useState(restaurar);
  const [passo, setPasso] = useState(1);
  const [erro, setErro] = useState('');
  const [erroAnexos, setErroAnexos] = useState('');
  const [avisoRascunho, setAvisoRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const urls = useRef(new Set<string>());
  const sequencia = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const temRascunho = Boolean(dados.tipo || dados.relato || dados.quando || dados.onde || dados.nome || dados.turma || dados.em_andamento || !dados.anonimo);
  useEffect(() => {
    try {
      // sem texto nem escolha não há o que guardar
      if (temRascunho) localStorage.setItem(chave, JSON.stringify(dados));
      else localStorage.removeItem(chave);
    } catch { setAvisoRascunho('Este navegador não permite salvar o rascunho. Mantenha esta tela aberta até enviar.'); }
  }, [dados, temRascunho]);
  function limparRascunho() {
    setDados({ ...vazio }); setPasso(1); setErro(''); setAvisoRascunho('Rascunho apagado.');
    titulo.current?.focus();
  }
  useEffect(() => { titulo.current?.focus(); }, [passo]);
  useEffect(() => {
    const criadas = urls.current;
    return () => { criadas.forEach(url => URL.revokeObjectURL(url)); criadas.clear(); };
  }, []);
  function alterar<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) {
    setDados(anterior => ({ ...anterior, [campo]: valor }));
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
  function validar(): string {
    if (!dados.tipo) return 'Escolha o tipo de situação para continuar.';
    if (passo >= 2 && (dados.relato.trim().length < 10 || dados.relato.trim().length > 5000)) return 'Conte o que aconteceu em 10 a 5000 caracteres.';
    if (passo === 3 && !dados.anonimo && !dados.nome.trim()) return 'Preencha seu nome para se identificar.';
    return '';
  }
  async function continuar() {
    if (enviando) return;
    const problema = validar();
    if (problema) { setErro(problema); return; }
    if (passo < 3) { setErro(''); setPasso(passo + 1); return; }
    setEnviando(true); onEnviando?.(true); setErro('');
    const form = new FormData();
    for (const [campo, valor] of Object.entries(dados)) {
      form.append(campo, (campo === 'nome' || campo === 'turma') && dados.anonimo ? '' : String(valor));
    }
    anexos.forEach(({ arquivo }) => form.append('anexos[]', arquivo));
    try {
      const resultado = await enviarDenuncia(form);
      try { localStorage.removeItem(chave); } catch { /* O armazenamento pode estar bloqueado. */ }
      onEnviado(resultado);
    } catch (falha) { setErro(`${mensagemErro(falha)} Seu relato continua nesta tela.`); }
    finally { setEnviando(false); onEnviando?.(false); }
  }
  const titulos = ['Qual é a situação?', 'O que aconteceu?', 'Provas e identificação'];
  return <section>
    <ol className="passos" aria-label="Etapas do pedido">
      {['Tipo', 'Relato', 'Provas'].map((texto, i) => <li key={texto} aria-current={passo === i + 1 ? 'step' : undefined}><span>{i + 1}</span>{texto}</li>)}
    </ol>
    <p className="texto-pequeno">Passo {passo} de 3</p>
    {temRascunho && !enviando && <button type="button" className="botao-texto limpar-rascunho" onClick={limparRascunho}>Limpar rascunho</button>}
    <h1 ref={titulo} tabIndex={-1}>{titulos[passo - 1]}</h1>
    <form noValidate onSubmit={e => { e.preventDefault(); void continuar(); }} aria-busy={enviando}>
      <fieldset disabled={enviando} className="sem-borda">
        {passo === 1 && <fieldset className="sem-borda">
          <legend>Escolha o que mais se aproxima do que aconteceu.</legend>
          <div className="opcoes-tipo">{tipos.map(([valor, rotulo]) => <label className="opcao" key={valor}>
            <input type="radio" name="tipo" value={valor} checked={dados.tipo === valor} onChange={() => alterar('tipo', valor)} />{rotulo}
          </label>)}</div>
        </fieldset>}
        {passo === 2 && <div className="campos">
          <div><label htmlFor="relato">O que aconteceu?</label>
            <p id="ajuda-relato" className="texto-pequeno">Conte com suas palavras. Você não precisa lembrar de todos os detalhes.</p>
            <textarea id="relato" rows={7} value={dados.relato} maxLength={5000} onChange={e => alterar('relato', e.target.value)} aria-describedby="ajuda-relato tamanho-relato" />
            <p id="tamanho-relato" className="texto-pequeno contador">{dados.relato.length} de 5000 caracteres. Mínimo de 10.</p>
          </div>
          <div><label htmlFor="quando">Quando aconteceu? <span>(opcional)</span></label><input id="quando" maxLength={200} value={dados.quando} onChange={e => alterar('quando', e.target.value)} placeholder="Por exemplo, ontem à noite" /></div>
          <div><label htmlFor="onde">Onde aconteceu? <span>(opcional)</span></label><input id="onde" maxLength={200} value={dados.onde} onChange={e => alterar('onde', e.target.value)} placeholder="Rede social ou aplicativo" /></div>
          <label className="opcao"><input type="checkbox" checked={dados.em_andamento} onChange={e => alterar('em_andamento', e.target.checked)} />Está acontecendo agora?</label>
        </div>}
        {passo === 3 && <div className="campos">
          <div><label htmlFor="anexos">Adicionar imagens</label><p id="ajuda-anexos" className="texto-pequeno">Opcional. Até 5 imagens de até 5 MB cada. PNG, JPEG, WebP ou GIF.</p>
            <input id="anexos" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={adicionar} aria-describedby="ajuda-anexos" />
            {erroAnexos && <p role="alert" className="erro">{erroAnexos}</p>}
            <ul className="anexos">{anexos.map(anexo => <li key={anexo.id}>
              <img src={anexo.url} alt={`Prévia de ${anexo.arquivo.name}`} /><p>{anexo.arquivo.name}</p>
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
      <div className="acoes">
        {passo > 1 && <button type="button" className="botao secundario" disabled={enviando} onClick={() => { setErro(''); setPasso(passo - 1); }}>Voltar</button>}
        <button className="botao principal" disabled={enviando}>{enviando ? 'Enviando pedido…' : passo === 3 ? 'Enviar pedido de ajuda' : 'Continuar'}</button>
      </div>
      {enviando && <p role="status">Enviando. Aguarde nesta tela.</p>}
    </form>
  </section>;
}
