import { useEffect, useRef, useState } from 'react';
import { listarEquipe } from '../shared/api';
import type { CasoDetalhe, DadosAtendimento } from '../shared/api';
import './atendimento.css';
import { obterRascunhoAtendimento, guardarRascunhoAtendimento, removerRascunhoAtendimento } from './rascunhosAtendimento';

export const MOTIVOS_ATENCAO: Record<string, string> = {
  sem_responsavel: 'Sem responsável ativo', sem_resposta: 'Sem primeira resposta',
  mensagem_pendente: 'Mensagem do aluno aguardando resposta', acao_vencida: 'Ação vencida', recorrencia: 'Recorrência pendente',
};
const dadosDo = (caso: CasoDetalhe): DadosAtendimento => ({
  responsavel_id: caso.responsavel?.id ?? null, proxima_acao: caso.proxima_acao ?? '', prazo_acao: caso.prazo_acao ?? null,
});
export const prazoLegivel = (data: string) => data.split('-').reverse().join('/');
const prazoCurto = (data: string) => data.split('-').slice(1).reverse().join('/');

export default function Atendimento({ caso, ocupado, aoSalvar, aoConcluir }: {
  caso: CasoDetalhe; ocupado: boolean;
  aoSalvar: (dados: DadosAtendimento, revisao: number) => Promise<boolean>;
  aoConcluir: (revisao: number) => Promise<boolean>;
}) {
  const inicial = useRef(obterRascunhoAtendimento(caso.id));
  const [dados, setDados] = useState(() => inicial.current?.dados ?? dadosDo(caso));
  const [editando, setEditando] = useState(Boolean(inicial.current));
  const [aberto, setAberto] = useState(Boolean(inicial.current));
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState('');
  const [equipe, setEquipe] = useState<{ id: number; nome: string }[] | null>(null);
  const [erroEquipe, setErroEquipe] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const revisao = useRef(inicial.current?.revisao ?? caso.revisao_estado ?? 0);
  const trava = useRef(false);
  useEffect(() => {
    if (!editando) { setDados(dadosDo(caso)); revisao.current = caso.revisao_estado ?? 0; }
    else if (falhou && revisao.current !== (caso.revisao_estado ?? 0)) setConfirmar(true);
  }, [caso, editando, falhou]);
  useEffect(() => {
    const abort = new AbortController();
    setErroEquipe(false);
    listarEquipe(abort.signal).then(r => { if (!abort.signal.aborted) setEquipe(r.usuarios); })
      .catch(() => { if (!abort.signal.aborted) setErroEquipe(true); });
    return () => abort.abort();
  }, [tentativa]);
  useEffect(() => {
    const proteger = (e: BeforeUnloadEvent) => { if (editando) e.preventDefault(); };
    window.addEventListener('beforeunload', proteger);
    return () => window.removeEventListener('beforeunload', proteger);
  }, [editando]);
  function mudar(parcial: Partial<DadosAtendimento>) {
    if (!editando) revisao.current = caso.revisao_estado ?? 0;
    const novos = { ...dados, ...parcial };
    guardarRascunhoAtendimento(caso.id, novos, revisao.current);
    setAberto(true); setEditando(true); setDados(novos); setErro('');
  }
  async function salvar() {
    if (trava.current) return;
    const acao = dados.proxima_acao.trim();
    if (Boolean(acao) !== Boolean(dados.prazo_acao)) { setErro('Preencha a próxima ação e seu prazo juntos. Para remover, limpe os dois campos.'); return; }
    trava.current = true; setSalvando(true);
    try {
      const ok = await aoSalvar({ ...dados, proxima_acao: acao }, revisao.current);
      if (ok) { removerRascunhoAtendimento(caso.id); inicial.current = undefined; setAberto(false); setEditando(false); setConfirmar(false); setFalhou(false); }
      else setFalhou(true);
    } finally { trava.current = false; setSalvando(false); }
  }
  const bloqueado = ocupado || salvando;
  return <section className="atendimento caso-atendimento-linha" aria-labelledby="titulo-atendimento">
    <h2 id="titulo-atendimento" className="so-leitor">Organização do atendimento</h2>
    {inicial.current && editando && <p role="status">Rascunho recuperado. Confira os dados e salve quando terminar.</p>}
    <div className="atendimento-sintese">
      <p>{`Responsável: ${caso.responsavel?.nome ?? 'Sem responsável'}${caso.responsavel && !caso.responsavel.ativo ? ' (conta desativada)' : ''} · Próxima ação: ${caso.proxima_acao || 'Nenhuma pendente'}${caso.proxima_acao && caso.prazo_acao ? ` até ${prazoCurto(caso.prazo_acao)}` : ''}`}</p>
      {caso.proxima_acao && <button type="button" className="botao secundario" disabled={bloqueado || editando} onClick={() => { void aoConcluir(caso.revisao_estado ?? 0); }}>Concluir ação</button>}
    </div>
    <details className="atendimento-editor acoes-recolhidas" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
      <summary className="botao secundario">Editar responsável e ação</summary>
      <div className="acoes-recolhidas-conteudo">
      <p className="texto-pequeno">Uso interno da equipe. O aluno não vê estes dados.</p>
    <form onSubmit={e => { e.preventDefault(); void salvar(); }}>
      <fieldset disabled={bloqueado}>
        <legend className="so-leitor">Planejar atendimento</legend>
        <div className="atendimento-campos">
          <div><label htmlFor="atendimento-responsavel">Responsável pelo caso</label>
            <select id="atendimento-responsavel" disabled={equipe === null || confirmar} value={dados.responsavel_id ?? ''} onChange={e => mudar({ responsavel_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sem responsável</option>
              {dados.responsavel_id && !equipe?.some(u => u.id === dados.responsavel_id) && <option value={dados.responsavel_id}>{caso.responsavel?.nome ?? 'Responsável atual'} (indisponível)</option>}
              {equipe?.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div><label htmlFor="atendimento-prazo">Prazo da ação</label><input id="atendimento-prazo" type="date" value={dados.prazo_acao ?? ''} onChange={e => mudar({ prazo_acao: e.target.value || null })} /></div>
          <div className="atendimento-texto"><label htmlFor="atendimento-acao">Próxima ação</label><textarea id="atendimento-acao" rows={2} maxLength={500} value={dados.proxima_acao} onChange={e => mudar({ proxima_acao: e.target.value })} /></div>
        </div>
        <p className="texto-pequeno">O prazo vale até o fim do dia, no horário de Brasília. Para retirar uma ação, limpe o texto e a data.</p>
        {erroEquipe && <p role="alert">Não foi possível carregar a equipe. <button className="botao-texto" type="button" onClick={() => setTentativa(t => t + 1)}>Tentar carregar equipe novamente</button></p>}
        {!equipe && !erroEquipe && <p role="status">Carregando equipe.</p>}
        {erro && <p className="erro" role="alert">{erro}</p>}
        {confirmar && <p className="aviso" role="alert">O atendimento mudou. Confira o responsável e a ação registrados acima. Seu texto foi preservado. <button type="button" className="botao secundario" onClick={() => { revisao.current = caso.revisao_estado ?? 0; guardarRascunhoAtendimento(caso.id, dados, revisao.current); setConfirmar(false); setFalhou(false); }}>Conferi o atendimento atualizado</button></p>}
        <div className="atendimento-acoes">
          <button type="submit" className="botao" disabled={!equipe || !editando || confirmar}>Salvar atendimento</button>
          {editando && <button type="button" className="botao secundario" onClick={() => { removerRascunhoAtendimento(caso.id); inicial.current = undefined; setAberto(false); setEditando(false); setConfirmar(false); setFalhou(false); setErro(''); }}>Descartar alterações</button>}
        </div>
      </fieldset>
    </form>
      </div>
    </details>
  </section>;
}
