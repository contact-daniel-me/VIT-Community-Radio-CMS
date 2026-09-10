import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  test: {
    include: ['tests/specs/**/*.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
    // Each spec boots its own PostgreSQL (PGlite, WASM). Running the files in
    // parallel starts one instance per file and exhausts memory, which shows up
    // as every suite failing in beforeAll rather than as an obvious OOM.
    fileParallelism: false,
  },
});
