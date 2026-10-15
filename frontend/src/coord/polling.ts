import { useEffect, useRef } from 'react';

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
    const controle = new AbortController();
    async function carregar() {
      if (emCurso) return;
      emCurso = true;
      try { await ultima.current(controle.signal, () => ativo); } finally { emCurso = false; }
    }
    void carregar();
    const relogio = setInterval(() => { if (!document.hidden) void carregar(); }, INTERVALO_MS);
    const aoMudarVisibilidade = () => { if (!document.hidden) void carregar(); };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      controle.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
