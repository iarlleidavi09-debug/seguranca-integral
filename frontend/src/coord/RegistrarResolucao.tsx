import { useEffect, useRef, useState } from 'react';
import type { AutorResolucaoInput, DadosResolucao, Desfecho } from '../shared/api';
import { DESFECHOS } from './rotulos';
import './autoria.css';

const TEXTO_MAX = 2000;
const ROTULO: Record<Desfecho, string> = { solucionada: 'Situação solucionada', intervencao_realizada: 'Intervenção realizada' };
type Erros = { desfecho?: string; providencias?: string; resultado?: string; justificativa?: string };
type CampoAutor = 'nome' | 'ano' | 'sala' | 'foto';
type AutorEditando = AutorResolucaoInput & { chave: number; erroFoto?: string };
const LIMITES_AUTOR = { nome: 200, ano: 40, sala: 50 };
const ROTULOS_AUTOR = { nome: 'Nome', ano: 'Ano', sala: 'Sala' };
const ERRO_FOTO = 'Use uma imagem JPG, PNG ou WebP de até 5 MiB.';

/** Formulário de resolução: quem chama grava e recarrega; a falha volta como exceção e o texto digitado fica. */
export default function RegistrarResolucao({ aoConfirmar, ocupado, aoEditar, resolvido = false }: {
  aoConfirmar: (dados: DadosResolucao) => Promise<void>;
  ocupado: boolean;
  aoEditar?: () => void;
  resolvido?: boolean;
}) {
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const [providencias, setProvidencias] = useState('');
  const [resultado, setResultado] = useState('');
  const [autoria, setAutoria] = useState<'identificada' | 'nao_identificada'>('identificada');
  const [justificativa, setJustificativa] = useState('');
  const [autores, setAutores] = useState<AutorEditando[]>([{ chave: 0, nome: '', ano: '', sala: '' }]);
  const proximaChave = useRef(1);
  const [errosAutores, setErrosAutores] = useState<Record<number, Partial<Record<CampoAutor, string>>>>({});
  const campoAutoria = useRef<HTMLFieldSetElement>(null);
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const primeiraOpcao = useRef<HTMLInputElement>(null);
  const campoProvidencias = useRef<HTMLTextAreaElement>(null);
  const campoResultado = useRef<HTMLTextAreaElement>(null);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const travado = ocupado || enviando;

  async function enviar() {
    const p = providencias.trim();
    const r = resultado.trim();
    const novos: Erros = {};
    if (!desfecho) novos.desfecho = 'Escolha o desfecho.';
    if (!p || p.length > TEXTO_MAX) novos.providencias = `Escreva de 1 a ${TEXTO_MAX} caracteres.`;
    if (r.length > TEXTO_MAX) novos.resultado = `Use no máximo ${TEXTO_MAX} caracteres.`;
    const errosPessoas: typeof errosAutores = {};
    if (autoria === 'nao_identificada') {
      if (!justificativa.trim() || justificativa.trim().length > TEXTO_MAX) novos.justificativa = `Escreva de 1 a ${TEXTO_MAX} caracteres.`;
    } else {
      for (const autor of autores) {
        const campos: Partial<Record<CampoAutor, string>> = {};
        for (const campo of ['nome', 'ano', 'sala'] as const) {
          if (!autor[campo].trim() || autor[campo].trim().length > LIMITES_AUTOR[campo]) campos[campo] = `Escreva de 1 a ${LIMITES_AUTOR[campo]} caracteres.`;
        }
        if (autor.erroFoto) campos.foto = autor.erroFoto;
        if (Object.keys(campos).length) errosPessoas[autor.chave] = campos;
      }
    }
    setErrosAutores(errosPessoas);
    setErros(novos);
    if (novos.desfecho) { primeiraOpcao.current?.focus(); return; }
    if (novos.providencias) { campoProvidencias.current?.focus(); return; }
    if (novos.resultado) { campoResultado.current?.focus(); return; }
    if (novos.justificativa || Object.keys(errosPessoas).length) {
      setTimeout(() => campoAutoria.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setEnviando(true);
    try {
      await aoConfirmar({ desfecho: desfecho as Desfecho, providencias: p, resultado: r, autoria,
        justificativa_autoria: autoria === 'nao_identificada' ? justificativa.trim() : '',
        autores: autoria === 'identificada' ? autores.map(({ nome, ano, sala, foto }) => ({ nome: nome.trim(), ano: ano.trim(), sala: sala.trim(), ...(foto ? { foto } : {}) })) : [] });
      if (montado.current) setEnviando(false);
    } catch {
      // quem chama mostra o erro; os campos ficam como estavam e o foco volta ao formulário
      if (montado.current) { setEnviando(false); setTimeout(() => campoProvidencias.current?.focus(), 0); }
    }
  }
  const limpar = (campo: keyof Erros) => setErros(e => (e[campo] ? { ...e, [campo]: undefined } : e));
  function atualizarAutor(chave: number, campo: CampoAutor, valor: string | File | undefined, erroFoto?: string) {
    setAutores(atuais => atuais.map(a => a.chave === chave ? { ...a, [campo]: valor, ...(campo === 'foto' ? { erroFoto } : {}) } : a));
    setErrosAutores(atuais => ({ ...atuais, [chave]: { ...atuais[chave], [campo]: erroFoto } }));
  }
  const ligacao = (campo: keyof Erros, ajuda?: string) => ({
    'aria-invalid': erros[campo] ? true as const : undefined,
    'aria-describedby': [erros[campo] ? `erro-${campo}` : '', ajuda ?? ''].filter(Boolean).join(' ') || undefined,
  });

  return <form className="form-acao form-resolucao" aria-labelledby="titulo-resolucao" noValidate
    onChange={() => aoEditar?.()} onSubmit={e => { e.preventDefault(); if (!resolvido) void enviar(); }}>
    <h2 id="titulo-resolucao">Registrar resolução</h2>
    <p className="texto-pequeno">{resolvido ? 'Outra pessoa resolveu este caso. Seu texto foi preservado para consulta.' : 'Para resolver, registre a resolução.'}</p>
    <fieldset className="grupo-desfecho" aria-describedby={erros.desfecho ? 'erro-desfecho' : undefined}>
      <legend>Desfecho</legend>
      {DESFECHOS.map((d, i) => <label key={d} className="opcao-desfecho" htmlFor={`desfecho-${d}`}>
        <input id={`desfecho-${d}`} type="radio" name="desfecho" value={d} checked={desfecho === d} disabled={travado}
          ref={i === 0 ? primeiraOpcao : undefined} aria-invalid={erros.desfecho ? true : undefined}
          onChange={() => { setDesfecho(d); limpar('desfecho'); }} />
        <span>{ROTULO[d]}</span>
      </label>)}
      {erros.desfecho && <p id="erro-desfecho" className="erro">{erros.desfecho}</p>}
    </fieldset>
    <label htmlFor="resolucao-providencias">Providências</label>
    <p id="ajuda-providencias" className="texto-pequeno">Visível para o aluno.</p>
    <textarea id="resolucao-providencias" ref={campoProvidencias} rows={4} maxLength={TEXTO_MAX} value={providencias} disabled={travado}
      {...ligacao('providencias', 'ajuda-providencias')}
      onChange={e => { setProvidencias(e.target.value); limpar('providencias'); }} />
    <p className="texto-pequeno contador">{providencias.length} de {TEXTO_MAX}</p>
    {erros.providencias && <p id="erro-providencias" className="erro">{erros.providencias}</p>}
    <label htmlFor="resolucao-resultado">Resultado observado</label>
    <p id="ajuda-resultado" className="texto-pequeno">Visível para o aluno.</p>
    <textarea id="resolucao-resultado" ref={campoResultado} rows={3} maxLength={TEXTO_MAX} value={resultado} disabled={travado}
      {...ligacao('resultado', 'ajuda-resultado')}
      onChange={e => { setResultado(e.target.value); limpar('resultado'); }} />
    <p className="texto-pequeno contador">{resultado.length} de {TEXTO_MAX}</p>
    {erros.resultado && <p id="erro-resultado" className="erro">{erros.resultado}</p>}
    <fieldset className="autoria-interna" ref={campoAutoria}>
      <legend>Autoria apurada (uso interno)</legend>
      <p id="ajuda-autoria" className="texto-pequeno">Nomes, turmas, fotos e justificativa ficam somente com a coordenação. Não são enviados ao aluno.</p>
      <label className="opcao-desfecho"><input type="radio" name="autoria" checked={autoria === 'identificada'} disabled={travado}
        onChange={() => setAutoria('identificada')} />Autoria identificada</label>
      <label className="opcao-desfecho"><input type="radio" name="autoria" checked={autoria === 'nao_identificada'} disabled={travado}
        onChange={() => setAutoria('nao_identificada')} />Autoria não identificada</label>
      {autoria === 'nao_identificada' ? <>
        <label htmlFor="resolucao-justificativa">Justificativa interna</label>
        <textarea id="resolucao-justificativa" rows={3} maxLength={TEXTO_MAX} value={justificativa} disabled={travado}
          {...ligacao('justificativa', 'ajuda-autoria')} onChange={e => { setJustificativa(e.target.value); limpar('justificativa'); }} />
        {erros.justificativa && <p id="erro-justificativa" className="erro">{erros.justificativa}</p>}
      </> : <>
        {autores.map((autor, indice) => <fieldset className="autor-formulario" key={autor.chave}>
          <legend>Autor {indice + 1}</legend>
          <div className="autor-campos">
            {(['nome', 'ano', 'sala'] as const).map(campo => {
              const id = `autor-${autor.chave}-${campo}`;
              const erro = errosAutores[autor.chave]?.[campo];
              return <div key={campo}><label htmlFor={id}>{ROTULOS_AUTOR[campo]} do autor {indice + 1}</label>
                <input id={id} type="text" value={autor[campo]} maxLength={LIMITES_AUTOR[campo]} disabled={travado}
                  aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : undefined}
                  onChange={e => atualizarAutor(autor.chave, campo, e.target.value)} />
                {erro && <p className="erro" id={`${id}-erro`}>{erro}</p>}
              </div>;
            })}
          </div>
          <label htmlFor={`autor-${autor.chave}-foto`}>Foto do autor {indice + 1} (opcional)</label>
          <p id={`autor-${autor.chave}-foto-ajuda`} className="texto-pequeno">JPG, PNG ou WebP, até 5 MiB.</p>
          <input id={`autor-${autor.chave}-foto`} type="file" accept="image/jpeg,image/png,image/webp" disabled={travado}
            aria-invalid={autor.erroFoto ? true : undefined}
            aria-describedby={`autor-${autor.chave}-foto-ajuda${autor.erroFoto ? ` autor-${autor.chave}-foto-erro` : ''}`}
            onChange={e => { const foto = e.target.files?.[0]; const invalida = foto && (!['image/jpeg', 'image/png', 'image/webp'].includes(foto.type) || foto.size > 5 * 1024 * 1024);
              atualizarAutor(autor.chave, 'foto', invalida ? undefined : foto, invalida ? ERRO_FOTO : undefined); }} />
          {autor.erroFoto && <p className="erro" id={`autor-${autor.chave}-foto-erro`}>{autor.erroFoto}</p>}
          {autor.foto && <p className="texto-pequeno">Foto selecionada: {autor.foto.name}</p>}
          {autor.foto && <button type="button" className="botao-texto" disabled={travado} onClick={() => {
            atualizarAutor(autor.chave, 'foto', undefined);
            aoEditar?.();
            const input = document.getElementById(`autor-${autor.chave}-foto`) as HTMLInputElement | null;
            if (input) input.value = '';
          }}>Remover foto do autor {indice + 1}</button>}
          <button type="button" className="botao-texto" disabled={travado || autores.length === 1}
            onClick={() => { setAutores(atuais => atuais.filter(a => a.chave !== autor.chave)); aoEditar?.(); }}>Remover autor {indice + 1}</button>
        </fieldset>)}
        <button type="button" className="botao secundario" disabled={travado || autores.length >= 10} onClick={() => {
          const chave = proximaChave.current++;
          setAutores(atuais => [...atuais, { chave, nome: '', ano: '', sala: '' }]);
          aoEditar?.();
        }}>Adicionar autor</button>
        <p className="texto-pequeno">Até 10 autores. Informe o ano e a sala da turma de cada pessoa.</p>
      </>}
    </fieldset>
    <p className="texto-pequeno">Registrado automaticamente com o seu nome e a data de hoje.</p>
    <div className="acoes">
      <button type="submit" className="botao principal" disabled={travado || resolvido}>Registrar resolução</button>
    </div>
  </form>;
}
