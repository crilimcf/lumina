import { test, expect } from '@playwright/test';

test('Radar principal permite apenas ligações externas HTTP(S) seguras', async ({ page }) => {
  await page.goto('/');
  const links = await page.evaluate(async () => {
    const { safeArticleUrl } = await import('/src/screens/Promocoes.jsx');
    return [
      safeArticleUrl({ external_url:'https://example.org/noticias' }),
      safeArticleUrl({ external_url:'javascript:alert(1)' }),
      safeArticleUrl({ external_url:'data:text/html,evil' }),
      safeArticleUrl({ external_url:'//example.org/relative' }),
      safeArticleUrl({ external_url:'/api/auth/me' }),
      safeArticleUrl({ external_url:'https://user:password@example.org/news' }),
      safeArticleUrl({ external_url:'https://trends.google.com/trending/rss?geo=PT', title:'Lisboa', source_name:'Google Trends' }),
    ];
  });
  expect(links.slice(0, 6)).toEqual(['https://example.org/noticias', null, null, null, null, null]);
  expect(links[6]).toContain('https://trends.google.com/trends/explore?geo=PT');
});

test('telemetria remove PII, tokens e query strings de erros', async ({ page }) => {
  await page.goto('/');
  const diagnostic = await page.evaluate(async () => {
    const { redactDiagnostic } = await import('/src/utils/redactDiagnostic.js');
    return redactDiagnostic('maria@example.com Bearer abc.def https://example.org/path?token=private');
  });
  expect(diagnostic).toContain('[redacted-email]');
  expect(diagnostic).toContain('Bearer [redacted]');
  expect(diagnostic).toContain('https://example.org/path');
  expect(diagnostic).not.toContain('maria@example.com');
  expect(diagnostic).not.toContain('abc.def');
  expect(diagnostic).not.toContain('token=private');
});

test('design partilhado mantém alvos >=44px e cores por identidade em iPhone', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 375, 390, 428]) {
    await page.setViewportSize({ width, height:760 });
    const states = await page.evaluate(() => {
      document.body.classList.add('lumina-v2');
      const fixture = document.createElement('div');
      fixture.className = 'lumina-facelift';
      fixture.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999';
      fixture.innerHTML = '<button class="top-action" type="button" aria-label="Alertas">A</button>';
      document.body.appendChild(fixture);
      const results = {};
      for (const theme of ['midnight','air','pulse']) {
        document.body.dataset.luminaIdentity = theme;
        results[theme] = {
          focus:getComputedStyle(document.body).getPropertyValue('--ev-focus').trim(),
          width:fixture.firstElementChild.getBoundingClientRect().width,
          height:fixture.firstElementChild.getBoundingClientRect().height,
        };
      }
      fixture.remove();
      return results;
    });
    for (const theme of ['midnight','air','pulse']) {
      expect(states[theme].focus).toMatch(/^#[0-9a-f]{6}$/i);
      expect(states[theme].width).toBeGreaterThanOrEqual(44);
      expect(states[theme].height).toBeGreaterThanOrEqual(44);
    }
    expect(states.air.focus).not.toBe(states.midnight.focus);
  }
});
