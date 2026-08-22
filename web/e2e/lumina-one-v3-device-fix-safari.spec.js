import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One Device Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
}

async function openOne(page) {
  const entry = page.locator('.one-v3-feed-entry');
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
}

async function openTab(page, name) {
  await page.locator('.one-tabs button').filter({ hasText:name }).click();
}

test('Pulso vazio continua social e nunca injeta Radar ou Juntos', async ({ page }) => {
  let legacyLocalCalls = 0;
  let togetherPosts = 0;
  await page.route('**/api/one/local?**', route => { legacyLocalCalls += 1; return route.fulfill({ status:200, contentType:'application/json', body:'{"items":[]}' }); });
  await page.route('**/api/one/together', async route => {
    if (route.request().method() === 'POST') togetherPosts += 1;
    await route.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });

  await register(page, 'socialonly');
  await openOne(page);
  await openTab(page, 'Pulso');

  await expect(page.getByText('Pessoas e momentos. Não notícias.')).toBeVisible();
  await expect(page.locator('.one-v3-discovery')).toHaveCount(0);
  await expect(page.locator('.one-v3-together-sheet')).toHaveCount(0);
  await expect(page.getByText('Juntos', { exact:true })).toHaveCount(0);
  expect(legacyLocalCalls).toBe(0);
  expect(togetherPosts).toBe(0);
});

test('Localização do iPhone usa posição recente, deteta Bragança e não guarda coordenadas', async ({ page, context }) => {
  await context.addInitScript(() => {
    const position = {
      coords:{ latitude:41.8062, longitude:-6.7567, accuracy:80, altitude:null, altitudeAccuracy:null, heading:null, speed:null },
      timestamp:Date.now(),
    };
    window.__luminaGeoCalls = [];
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success, _error, options = {}) {
          window.__luminaGeoCalls.push({ kind:'current', ...options });
          setTimeout(() => success(position), 0);
        },
        watchPosition(success, _error, options = {}) {
          window.__luminaGeoCalls.push({ kind:'watch', ...options });
          setTimeout(() => success(position), 0);
          return 11;
        },
        clearWatch() {},
      },
    });
  });

  await page.route('https://nominatim.openstreetmap.org/reverse**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ address:{ city:'Bragança', state:'Bragança', country:'Portugal', country_code:'pt' } }),
  }));

  await register(page, 'gpsone');
  await openOne(page);
  await openTab(page, 'Agora');

  await expect(page.locator('.one-radar-handoff')).toContainText('Bragança, Portugal', { timeout:12000 });
  const calls = await page.evaluate(() => window.__luminaGeoCalls);
  expect(calls[0]?.kind).toBe('current');
  expect(calls[0]?.enableHighAccuracy).toBe(false);
  expect(calls[0]?.maximumAge).toBeGreaterThan(0);

  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain('41.8062');
  expect(stored).not.toContain('-6.7567');
  expect(stored).toContain('Bragança');
  await expect(page.getByPlaceholder('Porto, Lisboa, Braga…')).toHaveCount(0);
});

test('GPS recusado preserva a última localização real em cache e não usa fallback IP', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('lumina.radar.location.v1', JSON.stringify({
      countryCode:'PT', country:'Portugal', city:'Bragança', region:'Bragança', label:'Bragança, Portugal', updatedAt:Date.now(),
    }));
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(_success, error) { setTimeout(() => error({ code:1, message:'denied' }), 0); },
        watchPosition(_success, error) { setTimeout(() => error({ code:1, message:'denied' }), 0); return 12; },
        clearWatch() {},
      },
    });
  });
  let edgeCalls = 0;
  await page.route('**/api/edge-location', route => {
    edgeCalls += 1;
    return route.fulfill({ status:200, contentType:'application/json', body:'{"city":"Lisbon"}' });
  });

  await register(page, 'cachedgeo');
  await openOne(page);
  await openTab(page, 'Agora');

  const handoff = page.locator('.one-radar-handoff');
  await expect(handoff).toContainText('Bragança, Portugal');
  await handoff.getByRole('button').click();
  await expect(handoff).toContainText('Bragança, Portugal');
  expect(edgeCalls).toBe(0);
  await expect(page.getByPlaceholder('Porto, Lisboa, Braga…')).toHaveCount(0);
});
