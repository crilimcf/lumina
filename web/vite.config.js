import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const e2eHttps = process.env.VITE_E2E_HTTPS === 'true';
const https = e2eHttps ? {
  key: readFileSync(process.env.VITE_E2E_KEY || '.cert/key.pem'),
  cert: readFileSync(process.env.VITE_E2E_CERT || '.cert/cert.pem'),
} : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    // O gate WebKit usa HTTPS local para reproduzir a origem segura da Vercel.
    // Isto é essencial para testar o cookie __Host-* sem baixar a sua segurança.
    https,
    // Em desenvolvimento, /api vai para a API local — evita problemas de CORS.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
