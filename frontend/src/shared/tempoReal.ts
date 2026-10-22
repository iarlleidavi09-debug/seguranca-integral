import { useEffect, useRef, useState } from 'react';
import { notificarSessaoPerdida } from './api';

export type EstadoConexao = 'conectando' | 'online' | 'reconectando';
type Portal = 'coord' | 'aluno';
type Opcoes = {
  portal: Portal; codigo?: string; invalidar: () => void;
  estado: (estado: EstadoConexao) => void; sessaoPerdida?: () => void;
};

const ouvintes = new Set<() => void>();
let coordGerenciada = false;
export const coordenacaoGerenciada = () => coordGerenciada;
export function ouvirAtualizacoes(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}
function invalidarCoordenacao() { for (const ouvinte of ouvintes) ouvinte(); }

export function conectarTempoReal(opcoes: Opcoes): () => void {
  if (opcoes.portal === 'coord') coordGerenciada = true;
  let encerrado = false;
  let controle: AbortController | null = null;
  let leitor: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let tentativa = 0;
  let online = false;
  let reconectar: ReturnType<typeof setTimeout> | undefined;
  let silencio: ReturnType<typeof setTimeout> | undefined;
  const mudarEstado = (estado: EstadoConexao) => {
    online = estado === 'online';
    opcoes.estado(estado);
  };
  const cancelar = () => {
    clearTimeout(reconectar); clearTimeout(silencio);
    controle?.abort(); controle = null;
    void leitor?.cancel().catch(() => {}); leitor = null;
    online = false;
  };
  const fallback = setInterval(() => { if (!encerrado && !document.hidden && !online) opcoes.invalidar(); }, 8000);
  const fechar = () => {
    encerrado = true; cancelar(); clearInterval(fallback);
    if (opcoes.portal === 'coord') coordGerenciada = false;
    document.removeEventListener('visibilitychange', visibilidade);
  };
  async function abrir() {
    if (encerrado || document.hidden) return;
    const atual = new AbortController(); controle = atual;
    const inicio = Date.now();
    mudarEstado(tentativa ? 'reconectando' : 'conectando');
    const vigiar = () => { clearTimeout(silencio); silencio = setTimeout(() => atual.abort(), 45000); };
    vigiar();
    try {
      const response = await fetch(opcoes.portal === 'coord' ? '/api/eventos' : '/api/acompanhar/eventos', {
        method: opcoes.portal === 'coord' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: atual.signal,
        ...(opcoes.portal === 'aluno' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: opcoes.codigo }) } : {}),
      });
      if (atual.signal.aborted || encerrado) return;
      if (response.status === 401) { fechar(); opcoes.sessaoPerdida?.(); return; }
      if (!response.ok || !response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body) throw new Error('Streaming indisponível');
      const reader = response.body.getReader(); leitor = reader;
      mudarEstado('online');
      let buffer = '';
      const decoder = new TextDecoder();
      while (!atual.signal.aborted && !encerrado) {
        const chunk = await reader.read();
        if (chunk.done) break;
        vigiar();
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 65536) throw new Error('Evento inválido');
        let boundary = /\r?\n\r?\n/.exec(buffer);
        while (boundary) {
          const evento = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          if (/^event: ?atualizar\r?$/m.test(evento)) opcoes.invalidar();
          boundary = /\r?\n\r?\n/.exec(buffer);
        }
      }
    } catch { /* O fallback mantém as leituras durante falha de rede ou transporte. */ }
    finally {
      if (controle === atual) {
        clearTimeout(silencio);
        void leitor?.cancel().catch(() => {}); leitor = null;
        atual.abort(); controle = null;
        if (!encerrado && !document.hidden) {
          mudarEstado('reconectando');
          if (Date.now() - inicio >= 30000) tentativa = 0;
          const espera = Math.min(30000, 1000 * 2 ** Math.min(tentativa++, 5));
          reconectar = setTimeout(() => void abrir(), espera);
        }
      }
    }
  }
  function visibilidade() {
    if (document.hidden) { cancelar(); mudarEstado('reconectando'); }
    else { opcoes.invalidar(); void abrir(); }
  }
  document.addEventListener('visibilitychange', visibilidade);
  void abrir();
  return fechar;
}

export function useTempoReal(portal: Portal, ativo: boolean, invalidar?: () => void, codigo?: string) {
  const [estado, setEstado] = useState<EstadoConexao>('conectando');
  const callback = useRef(invalidar);
  callback.current = invalidar;
  useEffect(() => {
    if (!ativo) return;
    return conectarTempoReal({ portal, codigo, estado: setEstado,
      invalidar: () => { if (portal === 'coord') invalidarCoordenacao(); callback.current?.(); },
      sessaoPerdida: portal === 'coord' ? notificarSessaoPerdida : undefined });
  }, [portal, ativo, codigo]);
  return estado;
}
