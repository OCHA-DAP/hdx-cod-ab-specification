import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: process.env.BASE_PATH ?? '',
  integrations: [svelte()],
  vite: {
    resolve: {
      alias: {
        $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      },
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    optimizeDeps: {
      exclude: ['@duckdb/duckdb-wasm'],
    },
  },
});
