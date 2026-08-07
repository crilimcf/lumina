#!/usr/bin/env node
/**
 * Copia os documentos legais da pasta raiz `legal/` para `public/legal/`
 * antes de cada build.
 *
 * Sem isto, há duas cópias e é fácil editar uma e esquecer a outra — foi
 * exatamente o que aconteceu: a política de privacidade que os utilizadores
 * liam dentro da app ficou desatualizada durante várias sessões (incluindo a
 * mudança de região do alojamento) porque só a cópia da raiz foi corrigida.
 * Agora só há um sítio para editar; este script trata do resto.
 */
import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../legal', import.meta.url));
const dest = fileURLToPath(new URL('../public/legal', import.meta.url));

// A Vercel constrói só a partir de web/ (é a Root Directory do projeto) — a
// pasta legal/, um nível acima no repositório, não existe nesse ambiente.
// Aí não há nada a sincronizar; o que já estiver commitado em public/legal
// é a versão válida. Isto só falha de propósito em local, onde o repositório
// está todo presente e esquecer de sincronizar antes de um commit é o
// próprio bug que este script existe para evitar.
if (!existsSync(src)) {
  console.log('[legal] pasta legal/ não encontrada (build isolado, ex. Vercel) — a usar o que já está em public/legal');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of readdirSync(src)) {
  if (!file.endsWith('.md') || file === 'RGPD-INTERNO.md') continue;   // interno, não vai para a app
  copyFileSync(`${src}/${file}`, `${dest}/${file}`);
  console.log(`[legal] ${file} sincronizado`);
}
