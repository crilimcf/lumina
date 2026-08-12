import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One V2 Safari');
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
  await expect(page.locator('.lumina-one.one-v2')).toBeVisible();
}

async function openTab(page, name) {
  await page.locator('.one-tabs button').filter({ hasText:name }).click();
}

async function denyGps(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(_success, error) {
          setTimeout(() => error({ code:1, message:'denied' }), 0);
        },
      },
    });
  });
}

test('Pulso v2 usa Radar como descoberta inicial em vez de ficar morto', async ({ page }) => {
  await page.route('**/api/radar?limit=8', async route => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ items:[
        { id:'radar-seed-1', type:'news', title:'Bragança acorda com uma nova história', summary:'Uma descoberta visual para começar o Pulso.', image_url:null, external_url:'https://example.com/noticia', source_name:'Teste', region:'Bragança' },
        { id:'radar-seed-2', type:'event', title:'Hoje perto de ti', summary:'O Pulso mistura Radar e rede.', image_url:null, external_url:'https://example.com/evento', source_name:'Teste', region:'Bragança' },
      ], nextCursor:null }),
    });
  });

  await register(page, 'onev2pulse');
  await expect(page.getByText('Há sempre algo para descobrir')).toBeVisible();
  await expect(page.getByText('Bragança acorda com uma nova história')).toBeVisible();
  await expect(page.locator('.one-v2-pulse-seed-card')).toHaveCount(2);
  await expect(page.getByText('O Pulso está a aquecer')).toBeHidden();
});

test('Radar Local não substitui uma cidade escolhida pelo utilizador por Lisboa aproximada', async ({ page, context }) => {
  await denyGps(context);
  await page.route('**/api/edge-location', async route => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ city:'Lisbon', region:'11', country:'PT', accuracy:'approximate' }) });
  });

  await register(page, 'onev2region');
  await openTab(page, 'Agora');
  const input = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await input.fill('Bragança');
  await page.getByRole('button', { name:'Guardar e adaptar a Lumina' }).click();
  await expect(input).toHaveValue('Bragança');

  await page.getByRole('button', { name:/Usar a minha localização|Atualizar a minha localização|Tentar GPS/ }).click();
  await expect(input).toHaveValue('Bragança');
  await expect(page.locator('.one-location-status')).toContainText('Mantive Bragança');
  await expect(page.locator('.one-v2-location-suggestion')).toHaveCount(0);
});

test('Radar Local trata a cidade por rede apenas como sugestão até o utilizador aceitar', async ({ page, context }) => {
  await denyGps(context);
  await page.route('**/api/edge-location', async route => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ city:'Lisboa', region:'11', country:'PT', accuracy:'approximate' }) });
  });

  await register(page, 'onev2suggest');
  await openTab(page, 'Agora');
  const input = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name:'◎ Usar a minha localização' }).click();

  const suggestion = page.locator('.one-v2-location-suggestion');
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText('Lisboa');
  await expect(suggestion).toContainText('Pode estar errada');
  await expect(input).toHaveValue('');
  await suggestion.getByRole('button', { name:'Usar Lisboa' }).click();
  await expect(input).toHaveValue('Lisboa');
});

test('Juntos v2 remove Play de notícias e mostra ações que fazem sentido', async ({ page }) => {
  await page.route('**/api/one/together', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify([{ id:'11111111-1111-4111-8111-111111111111', title:'Notícia Radar V2', source_type:'radar', source_id:'radar-v2', participants:1, mine:true }]),
    });
  });
  await page.route('**/api/one/source/radar/radar-v2', async route => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ type:'radar', id:'radar-v2', title:'Notícia Radar V2', summary:'Uma notícia não é um vídeo.', external_url:'https://example.com/radar-v2', source_name:'Radar Teste' }),
    });
  });

  await register(page, 'onev2juntos');
  await page.evaluate(() => {
    const root = document.querySelector('.lumina-one');
    const overlay = document.createElement('div');
    overlay.className = 'one-together-overlay';
    overlay.innerHTML = `
      <header class="one-together-header"><button>×</button><div><span>JUNTOS</span><b>Notícia Radar V2</b></div><button>share</button></header>
      <div class="one-together-stage"><div class="one-together-radar"><span>RADAR</span><h3>Notícia Radar V2</h3><p>Uma notícia não é um vídeo.</p></div></div>
      <div class="one-together-bottom"><div class="one-members-row"><span>1 juntos</span></div><div class="one-sync-controls"><button>Reproduzir</button><span>Tu controlas a sessão</span></div></div>`;
    root.append(overlay);
  });

  const overlay = page.locator('.one-together-overlay');
  await expect(overlay.getByText('Aqui não há botão Play')).toBeVisible();
  await expect(overlay.getByRole('link', { name:'Abrir notícia' })).toHaveAttribute('href', 'https://example.com/radar-v2');
  await expect(overlay.getByRole('button', { name:'Partilhar convite' })).toBeVisible();
  await expect(overlay.getByText('Reproduzir', { exact:true })).toBeHidden();
});

test('Lumina One v2 suporta swipe entre tabs e swipe da margem para voltar', async ({ page }) => {
  await register(page, 'onev2swipe');

  await page.evaluate(() => {
    const root = document.querySelector('.lumina-one');
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:10, pointerType:'touch', clientX:330, clientY:520 }));
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:10, pointerType:'touch', clientX:170, clientY:525 }));
  });
  await expect(page.locator('.one-tabs button.is-on')).toContainText('Lumes');

  await page.evaluate(() => {
    const root = document.querySelector('.lumina-one');
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:11, pointerType:'touch', clientX:220, clientY:520 }));
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:11, pointerType:'touch', clientX:350, clientY:520 }));
  });
  await expect(page.locator('.one-tabs button.is-on')).toContainText('Pulso');

  await page.evaluate(() => {
    const root = document.querySelector('.lumina-one');
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:12, pointerType:'touch', clientX:20, clientY:520 }));
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:12, pointerType:'touch', clientX:130, clientY:522 }));
  });
  await expect(page.getByRole('button', { name:'Abrir Lumina One' })).toBeVisible();
});
