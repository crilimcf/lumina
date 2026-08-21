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

function radarItem({ id, title, summary, source, tags, region }) {
  return {
    id,
    type:'news',
    title,
    summary,
    source_name:source,
    source_url:null,
    external_url:'https://example.test/story',
    image_url:null,
    sponsored:false,
    sponsor_label:null,
    tags,
    region,
    starts_at:null,
    ends_at:null,
    published_at:new Date().toISOString(),
    priority:10,
  };
}

test('Radar mantém Mundo, contraste premium e muda o Local de Portugal para França sem mudar a língua da app', async ({ page, context }) => {
  await context.emulateMedia({ colorScheme:'light' });
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

  const radarRequests = [];
  await page.route('**/api/radar?**', async route => {
    const url = new URL(route.request().url());
    const country = url.searchParams.get('country');
    const scope = url.searchParams.get('scope') || 'mixed';
    radarRequests.push({ country, scope });
    const france = country === 'FR';
    const global = scope === 'global';
    const item = global
      ? radarItem({ id:'world-item', title:'World briefing', summary:'Global&nbsp;&nbsp;editorial signal.', source:'Euronews', tags:['country:global'], region:'Global' })
      : radarItem({
          id:france ? 'fr-item' : 'pt-item',
          title:france ? 'Actualité locale à Paris' : 'Notícia local em Lisboa',
          summary:france ? 'Contenu&nbsp;&nbsp;éditorial français.' : 'Conteúdo&nbsp;&nbsp;editorial português.',
          source:france ? 'franceinfo' : 'RTP Notícias',
          tags:[`country:${String(country || 'pt').toLowerCase()}`],
          region:france ? 'France' : 'Portugal',
        });
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ country, scope, region:france ? 'Paris' : 'Lisboa', nextCursor:null, items:[item] }),
    });
  });

  await register(page);
  await page.getByRole('button', { name:'Radar' }).click();

  await expect(page.getByRole('button', { name:'Atualizar localização' })).toContainText('Lisboa, Portugal');
  await expect(page.getByText('Local ativo', { exact:true })).toBeVisible();
  await expect(page.getByText('Mundo sempre ativo', { exact:true })).toBeVisible();
  await expect(page.getByRole('heading', { name:'Notícia local em Lisboa' })).toBeVisible();
  await expect(page.getByRole('heading', { name:'World briefing' })).toBeVisible();
  await expect(page.getByText('Conteúdo editorial português.', { exact:true })).toBeVisible();
  await expect(page.getByText('Global editorial signal.', { exact:true })).toBeVisible();
  await expect(page.getByText(/&nbsp;/)).toHaveCount(0);

  const localHeadingStyle = await page.locator('[data-radar-scope="local"] .radar-scope-heading').evaluate(node => {
    const style = getComputedStyle(node);
    const title = node.querySelector('.radar-scope-title');
    return {
      color:getComputedStyle(title).color,
      backgroundColor:style.backgroundColor,
      backgroundImage:style.backgroundImage,
    };
  });
  expect(localHeadingStyle.color).toBe('rgb(255, 255, 255)');
  expect(localHeadingStyle.backgroundColor).not.toMatch(/rgba?\(255,\s*255,\s*255/);
  expect(localHeadingStyle.backgroundImage).toContain('linear-gradient');

  expect(radarRequests.some(req => req.scope === 'local' && req.country === 'PT')).toBe(true);
  expect(radarRequests.some(req => req.scope === 'global' && req.country === null)).toBe(true);

  await page.evaluate(() => { window.__radarCountry = 'FR'; });
  await page.getByRole('button', { name:'Atualizar localização' }).click();

  await expect(page.getByRole('button', { name:'Atualizar localização' })).toContainText('Paris, France');
  await expect(page.getByRole('heading', { name:'Actualité locale à Paris' })).toBeVisible();
  await expect(page.getByText('Contenu éditorial français.', { exact:true })).toBeVisible();
  await expect(page.getByRole('heading', { name:'World briefing' })).toBeVisible();
  expect(radarRequests.some(req => req.scope === 'local' && req.country === 'FR')).toBe(true);

  await page.getByRole('button', { name:'Feed' }).click();
  const oneEntry = page.locator('.one-v3-feed-entry');
  await expect(oneEntry).toBeVisible();
  await oneEntry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
  await page.locator('.one-tabs button').filter({ hasText:'Agora' }).click();

  await expect(page.getByPlaceholder('Porto, Lisboa, Braga…')).toHaveValue('Paris');
  await expect(page.locator('.one-local-grid article')).toContainText('Actualité locale à Paris');
  expect(radarRequests.some(req => req.country === 'FR')).toBe(true);
});