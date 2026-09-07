import { test, expect } from '@playwright/test';

test.use({
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
  viewport:{ width:390, height:844 },
});

test('iPhone usa a luminária atual em todos os pontos PWA e distingue Marcador de instalação', async ({ page }) => {
  await page.goto('/');

  const currentIcon = '/lumina-app-icon-current-20260907c.png';
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', new RegExp(currentIcon.replaceAll('/', '\\/')));
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute('href', new RegExp(currentIcon.replaceAll('/', '\\/')));
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', new RegExp(currentIcon.replaceAll('/', '\\/')));

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.href;
    const response = await fetch(href, { cache:'no-store' });
    return response.json();
  });
  expect(manifest.icons[0].src).toContain(currentIcon);
  expect(manifest.icons[0].sizes).toBe('192x192');

  const install = await page.evaluate(() => window.__luminaInstallPwa());
  expect(install.status).toBe('manual');
  expect(install.platform).toBe('ios-web');
  await expect(page.getByRole('dialog', { name:'Instalar Lumina no iPhone' })).toBeVisible();
  await expect(page.getByText(/Não escolhas “Marcador” ou “Favoritos”/)).toBeVisible();
});
