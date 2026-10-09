import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

const contrastOnPaleSurface = async (locator) => locator.evaluate((element) => {
  const rgb = getComputedStyle(element).color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!rgb || rgb.length !== 3) return 0;
  const channel = value => {
    const normalized = value / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  };
  const foreground = .2126 * channel(rgb[0]) + .7152 * channel(rgb[1]) + .0722 * channel(rgb[2]);
  const background = .2126 * channel(248) + .7152 * channel(250) + .0722 * channel(255);
  return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
});

async function register(page) {
  const handle = `airaudit${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0,22);
  await page.addInitScript(() => localStorage.setItem('lumina-identity-v1', 'air'));
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Air UX');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
}

test('Air readable across entry, Feed, Direct, Rooms and Explore on iPhone', async ({ page }) => {
  console.log('[air-qa] register start');
  await register(page);
  console.log('[air-qa] entry loaded');
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','air');

  // The two entry choices must remain distinct, not light text on a light card.
  const secondary = page.getByRole('button',{ name:'Explorar Salas' });
  await expect(secondary).toBeVisible();
  expect(await secondary.evaluate(node => getComputedStyle(node).backgroundImage)).toContain('gradient');
  expect(await contrastOnPaleSurface(page.locator('.opening-choice-label'))).toBeGreaterThan(4.5);
  await page.getByRole('button',{ name:'Entrar no Feed' }).click();

  // The dynamic Lumina One discovery prompt is bright on Air, never white-on-white.
  console.log('[air-qa] feed loaded');
  const discoveryPill = page.locator('.one-adventure-prompt-pill').first();
  await expect(discoveryPill).toBeVisible();
  expect(await contrastOnPaleSurface(discoveryPill)).toBeGreaterThan(4.5);

  // Feed empty state, if present, must not hide the publish action.
  const publish = page.locator('.lumina-v3-empty .lumina-v2-empty-actions button:nth-child(2)');
  if (await publish.isVisible()) {
    expect(await publish.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('gradient');
    expect(await publish.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await contrastOnPaleSurface(page.locator('.lumina-v3-empty-subtitle'))).toBeGreaterThan(4.5);
  }

  console.log('[air-qa] starting Direct');
  await page.locator('.nav').getByRole('button',{ name:'Conversas' }).click();
  await expect(page.locator('.messages-title-row h1')).toBeVisible();
  expect(await contrastOnPaleSurface(page.locator('.messages-title-row p'))).toBeGreaterThan(4.5);
  expect(await contrastOnPaleSurface(page.locator('.messages-eyebrow'))).toBeGreaterThan(4.5);
  const group = page.getByRole('button',{ name:'Vídeo em grupo' });
  await expect(group).toBeVisible();
  expect(await group.evaluate(node => getComputedStyle(node).position)).not.toBe('fixed');
  const groupBounds = await group.boundingBox();
  const navBounds = await page.locator('.nav').boundingBox();
  expect(groupBounds.bottom).toBeLessThan(navBounds.top);

  console.log('[air-qa] starting Rooms');
  await page.locator('.nav').getByRole('button',{ name:'Salas' }).click();
  await expect(page.locator('.rooms-header')).toBeVisible();
  expect(await contrastOnPaleSurface(page.locator('.rooms-header .m'))).toBeGreaterThan(4.5);
  const selected = page.locator('.rooms-filters .p-ink');
  await expect(selected).toBeVisible();
  expect(await selected.evaluate(node => getComputedStyle(node).color)).toBe('rgb(255, 255, 255)');
  if (await page.locator('.rooms-empty-state').isVisible()) {
    expect(await contrastOnPaleSurface(page.locator('.rooms-empty-state p'))).toBeGreaterThan(4.5);
  }

  console.log('[air-qa] starting Explore');
  await page.locator('.nav').getByRole('button',{ name:'Radar' }).click();
  await expect(page.locator('.explore-title-row h1')).toBeVisible();
  expect(await contrastOnPaleSurface(page.locator('.explore-title-row p').first())).toBeGreaterThan(4.5);
  expect(await contrastOnPaleSurface(page.locator('.explore-eyebrow'))).toBeGreaterThan(4.5);
  expect(await contrastOnPaleSurface(page.locator('.lumina-v2-discover-bar h2'))).toBeGreaterThan(4.5);
});
