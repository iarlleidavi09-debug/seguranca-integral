import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: '../backend/app/static/aluno', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/aluno/**/*.test.ts', 'src/aluno/**/*.test.tsx', 'src/shared/**/*.test.ts'],
    clearMocks: true,
    testTimeout: 20000,
  },
});
