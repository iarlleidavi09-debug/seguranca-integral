import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// A entrada se chama coordenacao.html; no pacote final ela vira index.html,
// que é o arquivo que o servidor da coordenação entrega.
type Pacote = Record<string, { type: string; fileName: string; source?: string | Uint8Array }>;
const comoIndex = {
  name: 'saida-index',
  apply: 'build' as const,
  generateBundle: {
    order: 'post' as const,
    handler(this: { emitFile(arquivo: { type: 'asset'; fileName: string; source: string | Uint8Array }): string }, _opcoes: unknown, pacote: Pacote) {
      const pagina = pacote['coordenacao.html'];
      if (!pagina || pagina.source === undefined) return;
      this.emitFile({ type: 'asset', fileName: 'index.html', source: pagina.source });
      delete pacote['coordenacao.html'];
    },
  },
};

export default defineConfig({
  plugins: [react(), comoIndex],
  base: '/',
  build: { outDir: '../backend/app/static/coordenacao', emptyOutDir: true, rollupOptions: { input: 'coordenacao.html' } },
  server: { proxy: { '/api': 'http://127.0.0.1:4000' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/coord/**/*.test.ts', 'src/coord/**/*.test.tsx'],
    clearMocks: true,
  },
});
