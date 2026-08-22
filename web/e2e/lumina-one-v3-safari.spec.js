import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One v3 Safari');
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

test('Lumina One entra no Feed sem se sobrepor a Momentos', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await register(page, 'v3entry');
  const entry = page.locator('.one-v3-feed-entry');
  await expect(entry).toBeVisible();
  const geometry = await entry.evaluate(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const moments = node.closest('.lumina-moments-wrap')?.getBoundingClientRect();
    return { position:style.position, top:rect.top, momentsTop:moments?.top || 0, momentsBottom:moments?.bottom || 0 };
  });
  expect(geometry.position).not.toBe('fixed');
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.momentsTop);
  expect(geometry.top).toBeLessThan(geometry.momentsBottom);
  await expect(page.locator('.one-app-launch')).toBeHidden();
  await expect(entry).not.toContainText('Juntos');
});

test('One v3 é compacto, sem onboarding permanente, e suporta swipe entre modos', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await register(page, 'v3shell');
  await openOne(page);
  await expect(page.getByText('Tudo ligado.')).toBeVisible();
  await expect(page.locator('.one-assist-guide')).toHaveCount(0);
  await openTab(page, 'Pulso');
  const root = page.locator('.lumina-one.one-v3');
  await root.evaluate(node => {
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerType:'touch', pointerId:7, clientX:310, clientY:520 }));
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerType:'touch', pointerId:7, clientX:170, clientY:525 }));
  });
  await expect(page.locator('.one-tabs button.is-on')).toContainText('Lumes');
});

test('Lumes abre a câmara em ecrã inteiro no iPhone', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await register(page, 'v3lume');
  await openOne(page);
  await openTab(page, 'Lumes');

  await page.getByRole('button', { name:'Tirar um Lume' }).click();
  const camera = page.getByRole('dialog', { name:'Câmara Lume' });
  await expect(camera).toBeVisible();
  await expect(camera.getByRole('button', { name:'Tirar fotografia' })).toBeVisible();

  const layout = await camera.evaluate(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      position:style.position,
      zIndex:Number(style.zIndex),
      top:rect.top,
      left:rect.left,
      width:rect.width,
      height:rect.height,
      viewportWidth:window.innerWidth,
      viewportHeight:window.innerHeight,
    };
  });
  expect(layout.position).toBe('fixed');
  expect(layout.zIndex).toBeGreaterThan(80);
  expect(Math.abs(layout.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.left)).toBeLessThanOrEqual(1);
  expect(layout.width).toBeGreaterThanOrEqual(layout.viewportWidth - 1);
  expect(layout.height).toBeGreaterThanOrEqual(layout.viewportHeight - 1);
});

test('Agora e Radar usam GPS de Bragança sem campo manual nem coordenadas persistidas', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          success({ coords:{ latitude:41.8062, longitude:-6.7567, accuracy:45, altitude:null, altitudeAccuracy:null, heading:null, speed:null }, timestamp:Date.now() });
        },
        watchPosition() { return 1; },
        clearWatch() {},
      },
    });
  });
  await page.route('https://nominatim.openstreetmap.org/reverse**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ address:{ city:'Bragança', state:'Bragança', country:'Portugal', country_code:'pt' } }),
  }));

  await register(page, 'v3gps');
  await openOne(page);
  await openTab(page, 'Agora');
  await expect(page.locator('.one-radar-handoff')).toContainText('Bragança, Portugal', { timeout:12000 });
  await expect(page.getByPlaceholder('Porto, Lisboa, Braga…')).toHaveCount(0);

  const dump = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(dump).not.toContain('41.8062');
  expect(dump).not.toContain('-6.7567');
  expect(dump).toContain('Bragança');
});

test('Pulso vazio continua social e nunca ganha descoberta Radar ou Juntos', async ({ page }) => {
  const radarItem = {
    id:'radar-v3-1', type:'news', title:'Eclipse em Bragança', summary:'Notícia que pertence ao Radar.',
    region:'Bragança', source_name:'Radar', external_url:'https://example.com/eclipse', image_url:null,
  };
  await page.route('**/api/one/local?region=**', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[radarItem] }) }));
  await page.route('**/api/radar?limit=10', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[radarItem] }) }));

  await register(page, 'v3pulse');
  await openOne(page);
  await openTab(page, 'Pulso');
  await expect(page.getByText('Pessoas e momentos. Não notícias.')).toBeVisible();
  await expect(page.getByText('Eclipse em Bragança')).toHaveCount(0);
  await expect(page.locator('.one-v3-discovery')).toHaveCount(0);
  await expect(page.locator('.one-v3-together-sheet')).toHaveCount(0);
  await expect(page.getByText('Juntos', { exact:true })).toHaveCount(0);
});
