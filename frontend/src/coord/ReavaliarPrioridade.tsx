import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { PRIORIDADES, prioridade } from './rotulos';
import type { Prioridade as ValorPrioridade } from '../shared/api';

const JUSTIFICATIVA_MAX = 2000;

/** Reavaliação de prioridade: exige nova prioridade e justificativa; quem chama grava e recarrega. */
export default function ReavaliarPrioridade({ atual, aoConfirmar, ocupado }: {
  atual: ValorPrioridade;
  aoConfirmar: (nova: ValorPrioridade, justificativa: string) => Promise<void>;
  ocupado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState<ValorPrioridade>(atual);
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const seletor = useRef<HTMLSelectElement>(null);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => { if (aberto) seletor.current?.focus(); }, [aberto]);
  const travado = ocupado || enviando;

  function abrir() { setNova(atual); setJustificativa(''); setErro(''); setAberto(true); }
  function fechar() { setAberto(false); setErro(''); setTimeout(() => gatilho.current?.focus(), 0); }
  async function enviar() {
    const limpa = justificativa.trim();
    if (!limpa || limpa.length > JUSTIFICATIVA_MAX) { setErro(`Escreva de 1 a ${JUSTIFICATIVA_MAX} caracteres.`); return; }
    if (nova === atual) return;
    setErro(''); setEnviando(true);
    try {
      await aoConfirmar(nova, limpa);
      if (montado.current) { setEnviando(false); fechar(); }
    } catch {
      // quem chama mostra o erro; o formulário fica aberto com o texto digitado
      if (montado.current) setEnviando(false);
    }
  }
  function teclas(e: KeyboardEvent) {
    if (e.key === 'Escape' && !travado) { e.stopPropagation(); fechar(); }
  }

  return <div className="reavaliar">
    <button type="button" ref={gatilho} className="botao secundario" aria-expanded={aberto} aria-controls="form-reavaliar"
      disabled={travado} onClick={() => (aberto ? fechar() : abrir())}>Reavaliar prioridade</button>
    {aberto && <form id="form-reavaliar" className="form-acao" aria-labelledby="titulo-reavaliar" onKeyDown={teclas}
      onSubmit={e => { e.preventDefault(); void enviar(); }}>
      <h2 id="titulo-reavaliar">Nova avaliação da prioridade</h2>
      <label htmlFor="reavaliar-nova">Nova prioridade</label>
      <select id="reavaliar-nova" ref={seletor} value={nova} disabled={travado} onChange={e => setNova(e.target.value as ValorPrioridade)}>
        {PRIORIDADES.map(p => <option key={p} value={p}>{prioridade(p)}</option>)}
      </select>
      <label htmlFor="reavaliar-justificativa">Justificativa</label>
      <p className="texto-pequeno">Fica registrada na linha do tempo, com o seu nome.</p>
      <textarea id="reavaliar-justificativa" rows={4} maxLength={JUSTIFICATIVA_MAX} value={justificativa} disabled={travado}
        onChange={e => setJustificativa(e.target.value)} />
      <p className="texto-pequeno contador">{justificativa.length} de {JUSTIFICATIVA_MAX}</p>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="acoes">
        <button type="submit" className="botao principal" disabled={travado || nova === atual}>Confirmar</button>
        <button type="button" className="botao secundario" disabled={travado} onClick={fechar}>Cancelar</button>
      </div>
    </form>}
  </div>;
}
