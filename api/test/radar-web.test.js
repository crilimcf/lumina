import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublisherHeadlineLinks } from '../src/jobs/radar-web.js';

test('adaptador web só recolhe manchetes do publisher e ignora navegação/assets', () => {
  const html = `
    <nav><a href="/ultimas">Últimas notícias</a></nav>
    <main>
      <a href="/pais/2026-08-10-noticia-importante-abc123">
        <img src="/images/noticia.webp">
        <h2>Portugal prepara novas medidas para esta semana</h2>
      </a>
      <a href="https://example.pt/mundo/2026/08/10/outra-noticia">
        <h2>Autoridades acompanham evolução da situação internacional</h2>
      </a>
      <a href="https://outro.example/artigo"><h2>Este link pertence a outro publisher e deve ser rejeitado</h2></a>
      <a href="/logo.svg">Imagem do logótipo do site oficial</a>
    </main>`;

  const rows = parsePublisherHeadlineLinks(html, 'https://example.pt/ultimas', { maxItems: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Portugal prepara novas medidas para esta semana');
  assert.equal(rows[0].externalUrl, 'https://example.pt/pais/2026-08-10-noticia-importante-abc123');
  assert.equal(rows[0].imageUrl, 'https://example.pt/images/noticia.webp');
  assert.match(rows[1].externalUrl, /\/mundo\/2026\/08\/10\/outra-noticia$/);
});
