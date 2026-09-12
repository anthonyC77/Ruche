import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Le flux temps réel du harnais. Voir README §4.
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { target: 'es2022' },
});
