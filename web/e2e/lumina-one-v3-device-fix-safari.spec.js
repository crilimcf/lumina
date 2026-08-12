import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One Device Fix Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
}

async function openOne(page) {
  const entry = page.locator('.one-v3-feed-entry');
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
}

async function openTab(page, name) {
  await page.locator('.one-tabs button').filter({ hasText: name }).click();
}

test('Juntos envia x-csrf-token e deixa de falhar com Pedido inválido CSRF', async ({ page }) => {
  const radarItem = {
    id: 'radar-device-fix-1',
    type: 'news',
    title: 'Eclipse total do sol em Bragança',
    summary: 'Conteúdo usado para validar Juntos no Safari.',
    region: 'Bragança',
    source_name: 'Radar',
    external_url: 'https://example.com/eclipse',
    image_url: null,
  };

  await page.route('**/api/one/local?region=**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [radarItem] }),
  }));
  await page.route('**/api/radar?limit=10', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [radarItem] }),
  }));

  await page.route('**/api/one/together', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const csrfHeader = route.request().headers()['x-csrf-token'] || '';
    if (!csrfHeader) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Pedido inválido (CSRF)' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '22222222-2222-4222-8222-222222222222' }),
    });
  });

  await register(page, 'csrfone');
  await openOne(page);
  const discovery = page.locator('.one-v3-discovery');
  await expect(discovery).toBeVisible();
  const togetherRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/one/together');
  await discovery.getByRole('button', { name: 'Juntos' }).first().click();
  const request = await togetherRequest;

  expect((request.headers()['x-csrf-token'] || '').length).toBeGreaterThan(10);
  await expect(page.locator('.one-v3-together-sheet')).toBeVisible();
  await expect(page.getByText('Pedido inválido (CSRF)')).toHaveCount(0);
});

test('Localização do iPhone usa getCurrentPosition antes de refinar e deteta Bragança', async ({ page, context }) => {
  await context.addInitScript(() => {
    const position = {
      coords: {
        latitude: 41.8062,
        longitude: -6.7567,
        accuracy: 80,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) { setTimeout(() => success(position), 0); },
        watchPosition(success) { setTimeout(() => success(position), 0); return 11; },
        clearWatch() {},
      },
    });
  });

  await page.route('https://nominatim.openstreetmap.org/reverse**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ address: { city: 'Bragança', state: 'Bragança', country: 'Portugal' } }),
  }));

  await register(page, 'gpsone');
  await openOne(page);
  await openTab(page, 'Agora');

  const button = page.getByRole('button', { name: 'Usar GPS preciso' });
  await expect(button).toBeVisible();
  await button.click();

  const input = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await expect(input).toHaveValue('Bragança');
  await expect(page.locator('.one-v3-location-status')).toContainText('Bragança detetada por GPS/localização do iPhone');
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain('41.8062');
  expect(stored).not.toContain('-6.7567');
});

test('Localização imprecisa nunca substitui uma cidade confirmada', async ({ page, context }) => {
  await context.addInitScript(() => {
    const coarse = {
      coords: {
        latitude: 38.7223,
        longitude: -9.1393,
        accuracy: 50000,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) { setTimeout(() => success(coarse), 0); },
        watchPosition(success) { setTimeout(() => success(coarse), 0); return 12; },
        clearWatch() {},
      },
    });
  });

  await register(page, 'coarseone');
  await openOne(page);
  await openTab(page, 'Agora');
  const input = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await input.fill('Bragança');
  await page.getByRole('button', { name: 'Guardar e adaptar a Lumina' }).click();
  await page.getByRole('button', { name: 'Usar GPS preciso' }).click();

  await expect(input).toHaveValue('Bragança');
  await expect(page.locator('.one-v3-location-status')).toContainText('Mantive Bragança', { timeout: 12_000 });
});
