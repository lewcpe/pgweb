import { resolve } from 'path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173, // As specified in PROJECT_PLAN.md docker-compose
    strictPort: true,
  },
  resolve: {
    alias: {
      '$lib': resolve('./src/lib')
    }
  }
});
