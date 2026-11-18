import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { limparRascunhosAtendimento } from '../coord/rascunhosAtendimento';
import { limparRespostasRascunho } from '../aluno/respostaRascunho';

// findBy*/waitFor esperam até 5 s (padrão 1 s): sob carga o jsdom demora a renderizar, sem enfraquecer nenhuma asserção.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:miniatura'),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => { cleanup(); limparRascunhosAtendimento(); limparRespostasRascunho(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
