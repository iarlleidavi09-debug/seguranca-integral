import { useEffect, useRef, useState } from 'react';
import type { Desfecho } from '../shared/api';
import { DESFECHOS } from './rotulos';

const TEXTO_MAX = 2000;
const ROTULO: Record<Desfecho, string> = { solucionada: 'Situação solucionada', intervencao_realizada: 'Intervenção realizada' };
type Dados = { desfecho: Desfecho; providencias: string; resultado: string };
type Erros = { desfecho?: string; providencias?: string; resultado?: string };

/** Formulário de resolução: quem chama grava e recarrega; a falha volta como exceção e o texto digitado fica. */
export default function RegistrarResolucao({ aoConfirmar, ocupado }: {
  aoConfirmar: (dados: Dados) => Promise<void>;
  ocupado: boolean;
}) {
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const [providencias, setProvidencias] = useState('');
  const [resultado, setResultado] = useState('');
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
    setErros(novos);
    if (novos.desfecho) { primeiraOpcao.current?.focus(); return; }
    if (novos.providencias) { campoProvidencias.current?.focus(); return; }
    if (novos.resultado) { campoResultado.current?.focus(); return; }
    setEnviando(true);
    try {
      await aoConfirmar({ desfecho: desfecho as Desfecho, providencias: p, resultado: r });
      if (montado.current) setEnviando(false);
    } catch {
      // quem chama mostra o erro; os campos ficam como estavam e o foco volta ao formulário
      if (montado.current) { setEnviando(false); setTimeout(() => campoProvidencias.current?.focus(), 0); }
    }
  }
  const limpar = (campo: keyof Erros) => setErros(e => (e[campo] ? { ...e, [campo]: undefined } : e));
  const ligacao = (campo: keyof Erros, ajuda?: string) => ({
    'aria-invalid': erros[campo] ? true as const : undefined,
    'aria-describedby': [erros[campo] ? `erro-${campo}` : '', ajuda ?? ''].filter(Boolean).join(' ') || undefined,
  });

  return <form className="form-acao form-resolucao" aria-labelledby="titulo-resolucao" noValidate
    onSubmit={e => { e.preventDefault(); void enviar(); }}>
    <h2 id="titulo-resolucao">Registrar resolução</h2>
    <p className="texto-pequeno">Para resolver, registre a resolução</p>
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
    <p id="ajuda-providencias" className="texto-pequeno">Visível para o aluno</p>
    <textarea id="resolucao-providencias" ref={campoProvidencias} rows={4} maxLength={TEXTO_MAX} value={providencias} disabled={travado}
      {...ligacao('providencias', 'ajuda-providencias')}
      onChange={e => { setProvidencias(e.target.value); limpar('providencias'); }} />
    <p className="texto-pequeno contador">{providencias.length} de {TEXTO_MAX}</p>
    {erros.providencias && <p id="erro-providencias" className="erro">{erros.providencias}</p>}
    <label htmlFor="resolucao-resultado">Resultado observado</label>
    <p id="ajuda-resultado" className="texto-pequeno">Visível para o aluno</p>
    <textarea id="resolucao-resultado" ref={campoResultado} rows={3} maxLength={TEXTO_MAX} value={resultado} disabled={travado}
      {...ligacao('resultado', 'ajuda-resultado')}
      onChange={e => { setResultado(e.target.value); limpar('resultado'); }} />
    <p className="texto-pequeno contador">{resultado.length} de {TEXTO_MAX}</p>
    {erros.resultado && <p id="erro-resultado" className="erro">{erros.resultado}</p>}
    <p className="texto-pequeno">Registrado automaticamente com o seu nome e a data de hoje</p>
    <div className="acoes">
      <button type="submit" className="botao principal" disabled={travado}>Registrar resolução</button>
    </div>
  </form>;
}
