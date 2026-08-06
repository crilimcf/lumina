import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, /api vai para a API local — evita problemas de CORS.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
