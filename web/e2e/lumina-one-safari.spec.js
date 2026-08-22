import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await expect(page.getByRole('button', { name:'Entrar no Feed' })).toBeVisible();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  return handle;
}

async function openOne(page) {
  const entry = page.locator('.one-v3-feed-entry');
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
}

test('Lumina One abre do Feed e mantém a experiência dentro da app', async ({ page }) => {
  await register(page, 'oneopen');
  await openOne(page);

  await expect(page.getByText('Tudo ligado.')).toBeVisible();
  await expect(page.getByText('Pessoas e momentos. Não notícias.')).toBeVisible();
  await expect(page.getByRole('button', { name:'Pulso', exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'Lumes', exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'Cápsulas', exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'Agora', exact:true })).toBeVisible();
  await expect(page.getByText('Juntos', { exact:true })).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name:'Voltar ao Feed' }).click();
  await expect(page.locator('.one-v3-feed-entry')).toBeVisible();
});

test('Cápsulas cria e guarda uma memória sem sair da Lumina', async ({ page }) => {
  await register(page, 'onecapsule');
  await openOne(page);
  await page.getByRole('button', { name:'Cápsulas', exact:true }).click();

  await page.getByRole('button', { name:/Nova Cápsula/ }).click();
  await expect(page.getByRole('dialog', { name:'Nova Cápsula' })).toBeVisible();
  await page.getByPlaceholder('Verão 2026').fill('Teste Safari');
  await page.getByPlaceholder('O que estamos a guardar?').fill('Memórias dentro da Lumina');
  await page.getByRole('button', { name:'Criar Cápsula', exact:true }).click();

  await expect(page.getByText('Teste Safari', { exact:true })).toBeVisible();
  const memory = page.getByPlaceholder('Adicionar uma memória…');
  await expect(memory).toBeVisible();
  await memory.fill('Primeira memória do pacote Lumina One');
  await page.getByRole('button', { name:/Guardar na Cápsula/ }).click();
  await expect(page.getByText('Primeira memória do pacote Lumina One')).toBeVisible();
});

test('Agora afina o algoritmo e usa a localização real do iPhone sem virar feed', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          success({ coords:{ latitude:41.8062, longitude:-6.7567, accuracy:80, altitude:null, altitudeAccuracy:null, heading:null, speed:null }, timestamp:Date.now() });
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

  await register(page, 'oneagora');
  await openOne(page);
  await page.getByRole('button', { name:'Agora', exact:true }).click();

  await expect(page.locator('.one-settings-card')).toBeVisible();
  await expect(page.getByText('O que queres ver agora?')).toBeVisible();
  await expect(page.locator('.one-agora-summary')).toContainText('Esta área não é um feed.');
  await page.getByPlaceholder('viagens, carros, tecnologia').fill('viagens, tecnologia');
  await page.getByPlaceholder('política, futebol…').fill('política');
  await page.getByRole('button', { name:'Viagem', exact:true }).click();
  await expect(page.locator('.one-radar-handoff')).toContainText('Bragança, Portugal', { timeout:12000 });
  await page.getByRole('button', { name:'Aplicar agora' }).click();

  await expect(page.getByText('A Lumina foi adaptada ao teu momento')).toBeVisible();
  await expect(page.getByRole('button', { name:'Abrir Radar Local / Mundo' })).toBeVisible();
  await expect(page.locator('.one-local-grid')).toHaveCount(0);
  await expect(page.locator('.one-juntos-section')).toHaveCount(0);
  await expect(page.getByPlaceholder('Porto, Lisboa, Braga…')).toHaveCount(0);
  const background = await page.locator('.lumina-one').evaluate(node => getComputedStyle(node).backgroundImage);
  expect(background).not.toBe('none');
});
