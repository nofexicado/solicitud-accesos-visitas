import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/preparar-base.js',
    setupFiles: ['./test/entorno.js'],
    // Comparten la base de tests: una suite por vez.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
