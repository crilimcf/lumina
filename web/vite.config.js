import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const e2eHttps = process.env.VITE_E2E_HTTPS === 'true';
const https = e2eHttps ? {
  key: readFileSync(process.env.VITE_E2E_KEY || '.cert/key.pem'),
  cert: readFileSync(process.env.VITE_E2E_CERT || '.cert/cert.pem'),
} : undefined;

function stampServiceWorker() {
  const buildId = String(
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GITHUB_SHA
    || Date.now().toString(36)
  ).slice(0, 16);

  return {
    name: 'lumina-stamp-service-worker',
    closeBundle() {
      const path = 'dist/sw.js';
      if (!existsSync(path)) return;
      const source = readFileSync(path, 'utf8');
      writeFileSync(path, source.replaceAll('__LUMINA_BUILD__', buildId));
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  server: {
    // O gate WebKit usa HTTPS local para reproduzir a origem segura da Vercel.
    // Isto é essencial para testar o cookie __Host-* sem baixar a sua segurança.
    https,
    // Em desenvolvimento, /api vai para a API local — evita problemas de CORS.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
