import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One v3 Safari');
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
});

test('One v3 é compacto, sem onboarding permanente, e suporta swipe entre modos', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await register(page, 'v3shell');
  await openOne(page);
  await expect(page.getByText('Tudo ligado.')).toBeVisible();
  await expect(page.locator('.one-assist-guide')).toHaveCount(0);
  const root = page.locator('.lumina-one.one-v3');
  await root.evaluate(node => {
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerType:'touch', pointerId:7, clientX:310, clientY:520 }));
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerType:'touch', pointerId:7, clientX:170, clientY:525 }));
  });
  await expect(page.locator('.one-tabs button.is-on')).toContainText('Lumes');
});

test('Radar Local usa GPS preciso para Bragança e nunca troca por cidade de rede', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude:41.8062, longitude:-6.7567, accuracy:45 });
  await page.route('https://nominatim.openstreetmap.org/reverse**', async route => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ address:{ city:'Bragança', state:'Bragança', country:'Portugal' } }) });
  });
  await register(page, 'v3gps');
  await openOne(page);
  await openTab(page, 'Agora');
  const gps = page.getByRole('button', { name:'Detetar localização do iPhone' });
  await expect(gps).toBeVisible();
  await gps.click();
  const input = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await expect(input).toHaveValue('Bragança');
  await expect(page.locator('.one-v3-location-status')).toContainText('Bragança detetada pela localização do iPhone');
  const dump = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(dump).not.toContain('41.8062');
  expect(dump).not.toContain('-6.7567');
});

test('GPS recusado preserva a cidade manual e não chama fallback IP', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(_success, error){ setTimeout(() => error({ code:1, message:'denied' }), 0); },
        watchPosition(_success, error){ setTimeout(() => error({ code:1, message:'denied' }), 0); return 9; },
        clearWatch() {},
      },
    });
  });
  let edgeCalls = 0;
  await page.route('**/api/edge-location', async route => {
    edgeCalls += 1;
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ city:'Lisbon' }) });
  });
  await register(page, 'v3manual');
  await openOne(page);
  await openTab(page, 'Agora');
  const input = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await input.fill('Bragança');
  await page.getByRole('button', { name:'Guardar e adaptar a Lumina' }).click();
  await page.getByRole('button', { name:'Detetar localização do iPhone' }).click();
  await expect(input).toHaveValue('Bragança');
  await expect(page.locator('.one-v3-location-status')).toContainText('Mantive a tua cidade confirmada');
  expect(edgeCalls).toBe(0);
});

test('Pulso vazio ganha descoberta visual e Juntos dá feedback funcional', async ({ page }) => {
  const radarItem = {
    id:'radar-v3-1', type:'news', title:'Eclipse em Bragança', summary:'O céu transforma-se e a cidade prepara-se para observar o fenómeno.',
    region:'Bragança', source_name:'Radar', external_url:'https://example.com/eclipse', image_url:null,
  };
  await page.route('**/api/one/local?region=**', async route => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[radarItem] }) });
  });
  await page.route('**/api/radar?limit=10', async route => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[radarItem] }) });
  });
  await page.route('**/api/one/together', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ id:'11111111-1111-4111-8111-111111111111' }) });
    } else await route.continue();
  });
  await register(page, 'v3pulse');
  await openOne(page);
  const discovery = page.locator('.one-v3-discovery');
  await expect(discovery).toBeVisible();
  await expect(discovery.getByText('Eclipse em Bragança')).toBeVisible();
  await discovery.getByRole('button', { name:'Juntos' }).first().click();
  const sheet = page.locator('.one-v3-together-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('JUNTOS CRIADO');
  await expect(sheet.getByRole('button', { name:'Partilhar convite' })).toBeVisible();
  await expect(sheet.getByRole('button', { name:'Entrar na sessão' })).toBeVisible();
});
