import { test, expect } from '@playwright/test';

test('Radar permite apenas ligações de editoras HTTP(S)', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const { safeRadarExternalUrl } = await import('/src/utils/safeRadarExternalUrl.js');
    return [
      safeRadarExternalUrl('https://example.org/noticias?x=1'),
      safeRadarExternalUrl('http://example.org/abc'),
      safeRadarExternalUrl('javascript:alert(1)'),
      safeRadarExternalUrl('data:text/html,<script>test</script>'),
      safeRadarExternalUrl('//evil.example/phishing'),
      safeRadarExternalUrl('https://user:password@example.org/path'),
      safeRadarExternalUrl('mailto:news@example.org'),
      safeRadarExternalUrl('/relative'),
      safeRadarExternalUrl(''),
    ];
  });
  expect(out).toEqual([
    'https://example.org/noticias?x=1',
    'http://example.org/abc',
    '', '', '', '', '', '', '',
  ]);
});
