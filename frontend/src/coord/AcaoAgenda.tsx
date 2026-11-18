import { useRef, useState } from 'react';
import { concluirAcao, ErroApi, mensagemErroCoord, salvarAtendimento } from '../shared/api';
import type { CasoFila } from '../shared/api';

export default function AcaoAgenda({ caso, aoAtualizar }: { caso: CasoFila; aoAtualizar: () => void }) {
  const [edicao, setEdicao] = useState<{ caso: CasoFila; prazo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ultimaRevisaoSalva, setUltimaRevisaoSalva] = useState<number | null>(null);
  const trava = useRef(false);
  const aguardandoAtualizacao = ultimaRevisaoSalva !== null && ultimaRevisaoSalva === (caso.revisao_estado ?? 0);
  async function agir(reagendar: boolean) {
    if (trava.current || conflito || aguardandoAtualizacao) return;
    const referencia = reagendar && edicao ? edicao.caso : caso;
    trava.current = true; setOcupado(true); setErro(''); setAviso('');
    try {
      if (reagendar && edicao) await salvarAtendimento(caso.id, { responsavel_id: referencia.responsavel?.id ?? null, proxima_acao: referencia.proxima_acao ?? '', prazo_acao: edicao.prazo }, referencia.revisao_estado ?? 0);
      else await concluirAcao(caso.id, referencia.revisao_estado ?? 0);
      setEdicao(null);
      setUltimaRevisaoSalva(referencia.revisao_estado ?? 0);
      setAviso(reagendar ? 'Prazo atualizado.' : 'Ação concluída.');
      aoAtualizar();
    } catch (falha) {
      if (falha instanceof ErroApi && falha.status === 409) {
        setConflito(true); setErro('O atendimento mudou. Abra o caso para conferir os dados atuais antes de tentar novamente.'); aoAtualizar();
      } else setErro(mensagemErroCoord(falha));
    } finally { trava.current = false; setOcupado(false); }
  }
  const possuiAcao = Boolean(caso.proxima_acao && caso.prazo_acao);
  if (!possuiAcao && !edicao && !erro && !aviso) return null;
  return <div className="agenda-acoes" onClick={e => e.stopPropagation()}>
    {possuiAcao && <div className="agenda-botoes">
      <button type="button" className="botao-texto" disabled={ocupado || aguardandoAtualizacao || conflito || edicao !== null} aria-label={`Concluir ação do caso ${caso.id}`} onClick={() => void agir(false)}>Concluir ação</button>
      <button type="button" className="botao-texto" disabled={ocupado || aguardandoAtualizacao || edicao !== null} aria-label={`Reagendar ação do caso ${caso.id}`} onClick={() => { setEdicao({ caso, prazo: caso.prazo_acao ?? '' }); setConflito(false); setErro(''); setAviso(''); }}>Reagendar</button>
    </div>}
    {edicao && <form className="agenda-reagendar" onSubmit={e => { e.preventDefault(); void agir(true); }}>
      <div><label htmlFor={`agenda-prazo-${caso.id}`}>Novo prazo do caso {caso.id}</label><input id={`agenda-prazo-${caso.id}`} type="date" required value={edicao.prazo} disabled={ocupado} onChange={e => setEdicao({ ...edicao, prazo: e.target.value })} /></div>
      <button className="botao secundario" type="submit" disabled={ocupado || conflito || !edicao.prazo}>Salvar novo prazo</button>
      <button className="botao-texto" type="button" disabled={ocupado} onClick={() => { setEdicao(null); setConflito(false); setErro(''); }}>Cancelar</button>
    </form>}
    {erro && <p className="erro" role="alert">{erro}</p>}
    {aviso && <p className="texto-pequeno" role="status">{aviso}</p>}
    {aguardandoAtualizacao && <p className="texto-pequeno" role="status">Atualizando a agenda…</p>}
  </div>;
}
