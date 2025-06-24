import { resolve } from 'path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { truncate } from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true,
    port: 5173, // As specified in PROJECT_PLAN.md docker-compose
    strictPort: true,
    watch: {
        usePolling: true
    },
  },
  resolve: {
    alias: {
      '$lib': resolve('./src/lib')
    }
  }
});
