import { useCallback, useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  atualizarRascunhoConversa, observarRascunhosConversa, obterRascunhoConversa,
} from './rascunhosConversa';
import type { RascunhoConversa } from './rascunhosConversa';

export function useRascunhoConversa(id: number) {
  const consultar = useCallback(() => obterRascunhoConversa(id), [id]);
  const rascunho = useSyncExternalStore(observarRascunhosConversa, consultar, consultar);
  const setRascunho: Dispatch<SetStateAction<RascunhoConversa>> = useCallback(atualizar => {
    atualizarRascunhoConversa(id, typeof atualizar === 'function' ? atualizar(obterRascunhoConversa(id)) : atualizar);
  }, [id]);
  return [rascunho, setRascunho] as const;
}
