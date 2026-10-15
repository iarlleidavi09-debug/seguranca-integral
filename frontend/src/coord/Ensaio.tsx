import { useEffect, useRef, useState } from 'react';
import { carregarSimulacao, ErroApi, mensagemErroCoord, removerSimulacao } from '../shared/api';

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export default function Ensaio({ confirmarInicial = false }: { confirmarInicial?: boolean }) {
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(confirmarInicial);
  const [ocupado, setOcupado] = useState(false);
  const trabalhando = useRef(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const abriu = useRef(false);
  useEffect(() => {
    if (confirmando) { botaoConfirmar.current?.focus(); abriu.current = true; }
    else if (abriu.current) { gatilho.current?.focus(); abriu.current = false; }
  }, [confirmando]);

  async function executar(acao: () => Promise<string>) {
    if (trabalhando.current) return;
    trabalhando.current = true; setOcupado(true); setErro(''); setAviso('');
    try { setAviso(await acao()); }
    catch (falha) { if (!(falha instanceof ErroApi && falha.status === 401)) setErro(mensagemErroCoord(falha)); }
    finally { trabalhando.current = false; setOcupado(false); setConfirmando(false); }
  }

  return <section aria-labelledby="titulo-ensaio">
    <h1 id="titulo-ensaio" tabIndex={-1}>Ensaio</h1>
    <p>Use o modo de ensaio para treinar a equipe sem tocar em casos reais. Os casos de simulação aparecem na fila com o selo <span className="selo-simulacao">simulação</span>.</p>
    <div aria-live="polite" role="status" className="resultado-acao">{aviso}</div>
    {erro && <p className="erro" role="alert">{erro}</p>}
    <div className="acoes">
      <button type="button" className="botao principal" disabled={ocupado}
        onClick={() => void executar(async () => {
          const { criados } = await carregarSimulacao();
          return criados === 0 ? 'A simulação já está carregada.' : `${criados} ${plural(criados, 'caso criado', 'casos criados')}.`;
        })}>Carregar casos de simulação</button>
      <button type="button" ref={gatilho} className="botao secundario" disabled={ocupado} onClick={() => setConfirmando(true)}>Remover simulação</button>
    </div>
    {confirmando && <div className="confirmar" role="group" aria-label="Confirmar remoção da simulação"
      onKeyDown={e => { if (e.key === 'Escape') setConfirmando(false); }}>
      <p>Remover todos os casos de simulação? Os casos reais ficam como estão.</p>
      <div className="acoes">
        <button type="button" ref={botaoConfirmar} className="botao perigo" disabled={ocupado}
          onClick={() => void executar(async () => {
            const { removidos } = await removerSimulacao();
            return `${removidos} ${plural(removidos, 'caso removido', 'casos removidos')}.`;
          })}>Confirmar remoção</button>
        <button type="button" className="botao secundario" onClick={() => setConfirmando(false)}>Cancelar</button>
      </div>
    </div>}
  </section>;
}
