import { useEffect, useRef } from 'react';
import { coordenacaoGerenciada, ouvirAtualizacoes } from '../shared/tempoReal';

export const INTERVALO_MS = 8000;

/**
 * Chama `tarefa` na montagem, a cada INTERVALO_MS e ao voltar à aba. Um tick que cai durante
 * uma requisição lenta é ignorado, não a cancela; a aba oculta pausa; desmontar aborta e limpa.
 * `tarefa` recebe o sinal de cancelamento e `ativo()` (falso depois de desmontar ou trocar `deps`).
 */
export function usePolling(tarefa: (sinal: AbortSignal, ativo: () => boolean) => Promise<void>, deps: readonly unknown[]) {
  const ultima = useRef(tarefa);
  ultima.current = tarefa;
  useEffect(() => {
    let ativo = true;
    let emCurso = false;
    let pendente = false;
    const diaBrasilia = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let ultimoDia = diaBrasilia();
    const controle = new AbortController();
    async function carregar() {
      if (!ativo || document.hidden) return;
      if (emCurso) { pendente = true; return; }
      emCurso = true;
      try { await ultima.current(controle.signal, () => ativo); } finally {
        emCurso = false;
        if (pendente && ativo) { pendente = false; void carregar(); }
      }
    }
    void carregar();
    const relogio = setInterval(() => {
      if (document.hidden) return;
      const hoje = diaBrasilia(), mudouDia = hoje !== ultimoDia;
      ultimoDia = hoje;
      if (mudouDia || (!coordenacaoGerenciada() && !emCurso)) void carregar();
    }, INTERVALO_MS);
    const remover = ouvirAtualizacoes(() => void carregar());
    const aoMudarVisibilidade = () => { if (!document.hidden && !coordenacaoGerenciada()) void carregar(); };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      ativo = false;
      clearInterval(relogio);
      remover();
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      controle.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
