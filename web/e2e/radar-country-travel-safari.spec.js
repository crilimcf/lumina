import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `radartrip${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Radar Trip Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
}

test('Radar muda de Portugal para França sem mudar a língua da app', async ({ page, context }) => {
  await context.addInitScript(() => {
    window.__radarCountry = 'PT';
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          const france = window.__radarCountry === 'FR';
          success({
            coords:{
              latitude:france ? 48.8566 : 38.7223,
              longitude:france ? 2.3522 : -9.1393,
              accuracy:100,
              altitude:null,
              altitudeAccuracy:null,
              heading:null,
              speed:null,
            },
            timestamp:Date.now(),
          });
        },
        watchPosition() { return 1; },
        clearWatch() {},
      },
    });
  });

  await page.route('https://nominatim.openstreetmap.org/reverse**', async route => {
    const url = new URL(route.request().url());
    const france = Number(url.searchParams.get('lat')) > 45;
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        address:france
          ? { city:'Paris', state:'Île-de-France', country:'France', country_code:'fr' }
          : { city:'Lisboa', state:'Lisboa', country:'Portugal', country_code:'pt' },
      }),
    });
  });

  const requestedCountries = [];
  await page.route('**/api/radar?**', async route => {
    const url = new URL(route.request().url());
    const country = url.searchParams.get('country');
    requestedCountries.push(country);
    const france = country === 'FR';
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        country,
        region:france ? 'Paris' : 'Lisboa',
        nextCursor:null,
        items:[{
          id:france ? 'fr-item' : 'pt-item',
          type:'news',
          title:france ? 'Actualité locale à Paris' : 'Notícia local em Lisboa',
          summary:france ? 'Contenu éditorial français.' : 'Conteúdo editorial português.',
          source_name:france ? 'franceinfo' : 'RTP Notícias',
          source_url:null,
          external_url:null,
          image_url:null,
          sponsored:false,
          sponsor_label:null,
          tags:[`country:${country.toLowerCase()}`],
          region:france ? 'France' : 'Portugal',
          starts_at:null,
          ends_at:null,
          published_at:new Date().toISOString(),
          priority:10,
        }],
      }),
    });
  });

  await register(page);
  await page.getByRole('button', { name:'Radar' }).click();

  await expect(page.getByRole('button', { name:'Tentar localização novamente' })).toContainText('Lisboa, Portugal');
  await expect(page.getByRole('heading', { name:'Notícia local em Lisboa' })).toBeVisible();
  expect(requestedCountries.at(-1)).toBe('PT');

  await page.evaluate(() => { window.__radarCountry = 'FR'; });
  await page.getByRole('button', { name:'Tentar localização novamente' }).click();

  await expect(page.getByRole('button', { name:'Tentar localização novamente' })).toContainText('Paris, France');
  await expect(page.getByRole('heading', { name:'Actualité locale à Paris' })).toBeVisible();
  expect(requestedCountries.at(-1)).toBe('FR');
});
