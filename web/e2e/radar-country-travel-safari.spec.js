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

function radarItem({ id, title, summary, source, tags, region, external = 'https://example.test/story' }) {
  return {
    id, type:'news', title, summary, source_name:source, source_url:null,
    external_url:external, image_url:null, sponsored:false, sponsor_label:null,
    tags, region, starts_at:null, ends_at:null, published_at:new Date().toISOString(), priority:10,
  };
}

test('Radar separa Perto de mim, País e Mundo e acompanha uma viagem sem mudar a língua da app', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme:'light' });
  await context.addInitScript(() => {
    window.__radarCountry = 'PT';
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          const france = window.__radarCountry === 'FR';
          success({
            coords:{ latitude:france ? 48.8566 : 38.7223, longitude:france ? 2.3522 : -9.1393, accuracy:100, altitude:null, altitudeAccuracy:null, heading:null, speed:null },
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

  const radarRequests = [];
  await page.route('**/api/radar?**', async route => {
    const url = new URL(route.request().url());
    const country = url.searchParams.get('country');
    const scope = url.searchParams.get('scope') || 'mixed';
    const region = url.searchParams.get('region');
    radarRequests.push({ country, scope, region });
    const france = country === 'FR';
    let item;
    if (scope === 'global') {
      item = radarItem({ id:'world-item', title:'World briefing', summary:'Global&nbsp;&nbsp;editorial signal.', source:'Euronews', tags:['country:global'], region:'Global' });
    } else if (scope === 'country') {
      item = radarItem({
        id:france ? 'fr-country' : 'pt-country',
        title:france ? 'France — actualité nationale' : 'Portugal — notícia nacional',
        summary:france ? 'Actualité de tout le pays.' : 'Notícia do país inteiro.',
        source:france ? 'franceinfo' : 'RTP Notícias',
        tags:[`country:${String(country || 'pt').toLowerCase()}`],
        region:france ? 'France' : 'Portugal',
      });
    } else {
      item = radarItem({
        id:france ? 'fr-nearby' : 'pt-nearby',
        title:france ? 'Actualité vraiment proche à Paris' : 'Notícia mesmo perto em Lisboa',
        summary:france ? 'Contenu&nbsp;&nbsp;local de Paris.' : 'Conteúdo&nbsp;&nbsp;local de Lisboa.',
        source:france ? 'Paris Local' : 'Lisboa Local',
        tags:[`country:${String(country || 'pt').toLowerCase()}`, `nearby:${String(region || '').toLowerCase()}`],
        region:france ? 'Paris' : 'Lisboa',
      });
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ country, scope, region, nextCursor:null, items:[item] }),
    });
  });

  await register(page);
  await page.getByRole('button', { name:'Radar' }).click();

  const nearbyTab = page.getByRole('tab', { name:'Perto de mim' });
  const countryTab = page.getByRole('tab', { name:'País' });
  const worldTab = page.getByRole('tab', { name:'Mundo' });
  await expect(nearbyTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.radar-scope-banner')).toContainText('Lisboa, Portugal');
  await expect(page.getByRole('heading', { name:'Notícia mesmo perto em Lisboa' })).toBeVisible();
  await expect(page.getByRole('heading', { name:'Portugal — notícia nacional' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name:'World briefing' })).toHaveCount(0);
  await expect(page.getByText('Conteúdo local de Lisboa.', { exact:true })).toBeVisible();
  await expect(page.getByText(/&nbsp;/)).toHaveCount(0);
  expect(radarRequests.some(req => req.scope === 'nearby' && req.country === 'PT' && req.region === 'Lisboa')).toBe(true);

  await countryTab.click();
  await expect(countryTab).toHaveAttribute('aria-selected', 'true');
  await expect(nearbyTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('heading', { name:'Portugal — notícia nacional' })).toBeVisible();
  await expect(page.getByRole('heading', { name:'Notícia mesmo perto em Lisboa' })).toHaveCount(0);
  expect(radarRequests.some(req => req.scope === 'country' && req.country === 'PT' && req.region === null)).toBe(true);

  await worldTab.click();
  await expect(worldTab).toHaveAttribute('aria-selected', 'true');
  await expect(countryTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('heading', { name:'World briefing' })).toBeVisible();
  await expect(page.getByText('Global editorial signal.', { exact:true })).toBeVisible();
  await expect(page.getByRole('heading', { name:'Portugal — notícia nacional' })).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Promoções' })).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Eventos' })).toHaveCount(0);
  expect(radarRequests.some(req => req.scope === 'global' && req.country === null)).toBe(true);

  await nearbyTab.click();
  await page.evaluate(() => { window.__radarCountry = 'FR'; });
  await page.getByRole('button', { name:'Atualizar localização' }).click();

  await expect(page.locator('.radar-scope-banner')).toContainText('Paris, France');
  await expect(page.getByRole('heading', { name:'Actualité vraiment proche à Paris' })).toBeVisible();
  await expect(page.getByText('Contenu local de Paris.', { exact:true })).toBeVisible();
  await expect(page.getByRole('heading', { name:'France — actualité nationale' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name:'World briefing' })).toHaveCount(0);
  expect(radarRequests.some(req => req.scope === 'nearby' && req.country === 'FR' && req.region === 'Paris')).toBe(true);

  // Travelling changes the Radar country/location, not the app language.
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
  await expect(page.getByRole('tab', { name:'Mundo' })).toBeVisible();

  await page.getByRole('button', { name:'Feed' }).click();
  const oneEntry = page.locator('.one-v3-feed-entry');
  await expect(oneEntry).toBeVisible();
  await oneEntry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
  await page.locator('.one-tabs button').filter({ hasText:'Agora' }).click();
  await expect(page.locator('.one-radar-handoff')).toContainText('Paris, France');
  await expect(page.locator('.one-radar-handoff')).toContainText('Perto de mim, País e Mundo ficam separados');
  await expect(page.locator('.one-local-grid')).toHaveCount(0);
  await expect(page.getByText('Actualité vraiment proche à Paris')).toHaveCount(0);
});
