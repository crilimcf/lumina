import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina Edge Location Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  await page.getByRole('button', { name: 'Abrir Lumina One' }).click();
  await page.locator('.one-tabs button').filter({ hasText: 'Agora' }).click();
}

function denyGps(context) {
  return context.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success, error) {
          setTimeout(() => error({ code: 1, message: 'denied' }), 0);
        },
      },
    });
  });
}

test('Radar Local usa cidade aproximada do edge quando o iPhone bloqueia o GPS', async ({ page, context }) => {
  await denyGps(context);
  await page.route('**/api/edge-location', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ city: 'Vila Nova de Gaia', region: '13', country: 'PT', accuracy: 'approximate', source: 'vercel-ip' }),
    });
  });

  await register(page, 'edgegeo');
  await page.getByRole('button', { name: '◎ Usar a minha localização' }).click();

  const regionInput = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await expect(regionInput).toHaveValue('Vila Nova de Gaia');
  await expect(page.locator('.one-location-status')).toContainText('detetado aproximadamente pela tua ligação');
  await expect(page.locator('.one-location-recovery')).toBeHidden();

  const storageDump = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(storageDump).not.toContain('latitude');
  expect(storageDump).not.toContain('longitude');
});

test('Radar Local mantém recuperação Safari quando GPS e edge falham', async ({ page, context }) => {
  await denyGps(context);
  await page.route('**/api/edge-location', async route => {
    await route.fulfill({ status: 204, body: '' });
  });

  await register(page, 'edgefail');
  await page.getByRole('button', { name: '◎ Usar a minha localização' }).click();

  await expect(page.locator('.one-location-status')).toContainText('bloqueou o GPS');
  const recovery = page.locator('.one-location-recovery');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('a permissão é do site');
});
