import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One Guide Safari');
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
}

async function openTab(page, name) {
  await page.locator('.one-tabs button').filter({ hasText: name }).click();
}

test('Lumina One explica cada experiência sem obrigar o utilizador a adivinhar', async ({ page }) => {
  await register(page, 'oneguide');

  const guide = page.locator('.one-assist-guide');
  await expect(guide).toBeVisible();
  await expect(guide.locator('.one-assist-current')).toContainText('Desliza para descobrir');

  await openTab(page, 'Lumes');
  await expect(guide.locator('.one-assist-current')).toContainText('Tira uma foto agora');

  await openTab(page, 'Cápsulas');
  await expect(guide.locator('.one-assist-current')).toContainText('Cria uma memória com amigos');

  await openTab(page, 'Agora');
  await expect(guide.locator('.one-assist-current')).toContainText('Diz o que queres ver');

  await guide.locator('.one-assist-summary').click();
  await expect(guide.getByText('Radar Local', { exact: true })).toBeVisible();
  await expect(guide.getByText('Juntos', { exact: true })).toBeVisible();
  await expect(guide.getByText(/cidade, detetada com permissão/)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Radar Local deteta a cidade com permissão e não guarda coordenadas', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 41.1579, longitude: -8.6291, accuracy: 25 });
  await page.route('https://nominatim.openstreetmap.org/reverse**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        display_name: 'Porto, Portugal',
        address: { city: 'Porto', state: 'Porto', country: 'Portugal' },
      }),
    });
  });

  await register(page, 'onelocal');
  await openTab(page, 'Agora');

  const locationButton = page.getByRole('button', { name: '◎ Usar a minha localização' });
  await expect(locationButton).toBeVisible();
  await expect(page.getByText(/latitude e longitude não ficam guardadas/)).toBeVisible();
  await locationButton.click();

  const regionInput = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await expect(regionInput).toHaveValue('Porto');
  await expect(page.locator('.one-location-status')).toContainText('Porto detetado');

  await page.getByRole('button', { name: 'Guardar e adaptar a Lumina' }).click();
  await expect(page.getByText('Porto', { exact: true }).first()).toBeVisible();

  const storageDump = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(storageDump).not.toContain('41.1579');
  expect(storageDump).not.toContain('-8.6291');
});

test('Radar Local mantém um fallback simples quando GPS e localização aproximada falham', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success, error) {
          setTimeout(() => error({ code: 1, message: 'denied' }), 0);
        },
      },
    });
  });
  await page.route('**/api/edge-location', async route => {
    await route.fulfill({ status: 204, body: '' });
  });

  await register(page, 'onedenied');
  await openTab(page, 'Agora');
  await page.getByRole('button', { name: '◎ Usar a minha localização' }).click();

  await expect(page.locator('.one-location-status')).toContainText('Não consegui detetar a cidade');
  await expect(page.locator('.one-location-recovery')).toBeHidden();
  const regionInput = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await expect(regionInput).toBeVisible();
  await regionInput.fill('Bragança');
  await expect(regionInput).toHaveValue('Bragança');
});

test('Radar Local mantém a cidade manual como fallback', async ({ page }) => {
  await register(page, 'onemanual');
  await openTab(page, 'Agora');

  const regionInput = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await regionInput.fill('Braga');
  await page.getByRole('button', { name: 'Guardar e adaptar a Lumina' }).click();
  await expect(regionInput).toHaveValue('Braga');
  await expect(page.getByText('Braga', { exact: true }).first()).toBeVisible();
});

test('Juntos explica o fluxo e aceita um link de convite sem expor IDs ao utilizador', async ({ page }) => {
  await register(page, 'onejuntos');
  await openTab(page, 'Agora');

  const section = page.locator('.one-juntos-section');
  await expect(section.getByText('O que é o Juntos?', { exact: true })).toBeVisible();
  await expect(section).toContainText('Escolhe algo no Pulso ou Radar');
  await expect(section).toContainText('Partilha o convite com os teus amigos');
  await expect(section.getByText('Código/ID da sessão', { exact: true })).toHaveCount(0);

  const invite = section.getByRole('textbox', { name: 'Link do convite Juntos' });
  const id = '11111111-1111-4111-8111-111111111111';
  await invite.fill(`https://lumina-snowy-ten.vercel.app/?one=together&id=${id}`);
  await expect(invite).toHaveValue(id);
  await expect(section.getByRole('button', { name: 'Entrar com convite' })).toBeVisible();

  await section.getByRole('button', { name: 'Escolher no Pulso' }).click();
  await expect(page.locator('.one-tabs button.is-on')).toContainText('Pulso');
});
