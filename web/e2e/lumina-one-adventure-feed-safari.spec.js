import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';
const MODE_INDEX = { pulse:0, lumes:1, capsules:2, agora:3 };

async function register(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `oneadventure${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One Adventure');
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

test('Lumina One é um portal vivo, continua dentro do iPhone e abre o contexto mostrado', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await register(page);

  const entry = page.locator('.one-v3-feed-entry.one-adventure-entry');
  await expect(entry).toBeVisible({ timeout:9000 });
  await expect(entry).toContainText('LUMINA ONE');
  await expect(entry.locator('.one-adventure-portal')).toBeVisible();
  await expect(entry.locator('.one-adventure-dots i.is-on')).toHaveCount(1);

  const mode = await entry.getAttribute('data-one-adventure-mode');
  expect(Object.keys(MODE_INDEX)).toContain(mode);
  await expect(entry.locator(`.one-adventure-symbol-${mode}`)).toBeVisible();

  const geometry = await entry.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const portal = node.querySelector('.one-adventure-portal')?.getBoundingClientRect();
    const htmlOverflow = getComputedStyle(document.documentElement).overflowX;
    return {
      left:rect.left,
      right:rect.right,
      viewport:window.innerWidth,
      portalLeft:portal?.left || 0,
      portalRight:portal?.right || 0,
      htmlOverflow,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.portalLeft).toBeLessThan(geometry.viewport);
  expect(geometry.portalRight).toBeGreaterThan(geometry.viewport);
  expect(['hidden', 'clip']).toContain(geometry.htmlOverflow);

  const firstPrompt = await entry.locator('[data-one-adventure-prompt]').innerText();
  await page.waitForTimeout(4300);
  const secondPrompt = await entry.locator('[data-one-adventure-prompt]').innerText();
  expect(secondPrompt).not.toBe(firstPrompt);

  const modeBeforeOpen = await entry.getAttribute('data-one-adventure-mode');
  await entry.locator('.one-adventure-portal').click({ force:true });
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
  await expect(page.locator('.one-tabs button').nth(MODE_INDEX[modeBeforeOpen])).toHaveClass(/is-on/);
});

test('Lumina One usa cidade, Juntos, Lumes e Cápsulas reais para personalizar o portal', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.addInitScript(() => {
    try { localStorage.setItem('lumina-one-last-mode-v1', 'agora'); } catch {}
  });

  await page.route('**/api/one/preferences', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ local_region:'Bragança', context_mode:'auto', boost_topics:[], mute_topics:[] }),
  }));
  await page.route('**/api/one/together', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([{ id:'11111111-1111-4111-8111-111111111111', title:'Sessão ativa' }]),
  }));
  await page.route('**/api/one/capsules', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([
      { id:'22222222-2222-4222-8222-222222222222', locked:true },
      { id:'33333333-3333-4333-8333-333333333333', locked:false },
    ]),
  }));
  await page.route('**/api/one/lumes', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([
      { id:'44444444-4444-4444-8444-444444444444', mine:false, viewed:false },
      { id:'55555555-5555-4555-8555-555555555555', mine:false, viewed:false },
    ]),
  }));

  await register(page);
  const entry = page.locator('.one-v3-feed-entry.one-adventure-entry');
  await expect(entry).toHaveAttribute('data-one-adventure-personalized', '1', { timeout:9000 });
  await expect(entry).toHaveAttribute('data-one-adventure-mode', 'agora');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('Agora em');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('Bragança');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('lumina-one:show-mode', { detail:{ mode:'lumes' } })));
  await expect(entry).toHaveAttribute('data-one-adventure-mode', 'lumes');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('2');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('Lumes para ver');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('lumina-one:show-mode', { detail:{ mode:'capsules' } })));
  await expect(entry).toHaveAttribute('data-one-adventure-mode', 'capsules');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('2');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('Cápsulas contigo');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('lumina-one:show-mode', { detail:{ mode:'pulse' } })));
  await expect(entry).toHaveAttribute('data-one-adventure-mode', 'pulse');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('1');
  await expect(entry.locator('[data-one-adventure-status]')).toContainText('Sessões Juntos');

  const portalAnimation = await entry.locator('.one-adventure-portal').evaluate(node => getComputedStyle(node).animationName);
  expect(portalAnimation).toContain('oneAdventurePortalPulse');
});
