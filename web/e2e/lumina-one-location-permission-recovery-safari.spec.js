import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `georecovery${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Geo Recovery Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  const entry = page.locator('.one-v3-feed-entry');
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
  await page.locator('.one-tabs button').filter({ hasText:'Agora' }).click();
}

test('usa a localização real mesmo se Permissions API disser denied', async ({ page, context }) => {
  await context.addInitScript(() => {
    const position = {
      coords:{ latitude:41.8062, longitude:-6.7567, accuracy:60, altitude:null, altitudeAccuracy:null, heading:null, speed:null },
      timestamp:Date.now(),
    };
    Object.defineProperty(navigator, 'permissions', {
      configurable:true,
      value:{ query:async () => ({ state:'denied' }) },
    });
    window.__geoCurrentCalls = 0;
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          window.__geoCurrentCalls += 1;
          setTimeout(() => success(position), 0);
        },
        watchPosition(success) { setTimeout(() => success(position), 0); return 31; },
        clearWatch() {},
      },
    });
  });

  await page.route('https://nominatim.openstreetmap.org/reverse**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ address:{ city:'Bragança', state:'Bragança', country:'Portugal', country_code:'pt' } }),
  }));

  await register(page);
  const handoff = page.locator('.one-radar-handoff');
  await expect(handoff).toContainText('Bragança, Portugal', { timeout:12000 });
  await expect(page.getByPlaceholder('Porto, Lisboa, Braga…')).toHaveCount(0);
  await expect(page.locator('.one-v3-location')).toHaveCount(0);
  expect(await page.evaluate(() => window.__geoCurrentCalls)).toBeGreaterThan(0);

  await handoff.getByRole('button').click();
  await expect(handoff).toContainText('Bragança, Portugal');
  expect(await page.evaluate(() => window.__geoCurrentCalls)).toBeGreaterThan(1);
});
