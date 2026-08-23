import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina Real iPhone Layout');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  const entry = page.locator('.one-v3-feed-entry');
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
  await page.locator('.one-tabs button').filter({ hasText:'Agora' }).click();
}

test('Lumina One protege a status bar e enquadra o contexto/localização no iPhone', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await register(page, 'realiphone');

  const layout = await page.locator('.lumina-one.one-v3').evaluate(root => {
    const shield = getComputedStyle(root, '::after');
    const tabs = root.querySelector('.one-tabs');
    const handoff = root.querySelector('.one-radar-handoff');
    const refresh = handoff?.querySelector('button');
    const handoffStyle = handoff ? getComputedStyle(handoff) : null;
    const refreshStyle = refresh ? getComputedStyle(refresh) : null;
    const tabsRect = tabs?.getBoundingClientRect();
    return {
      shieldPosition:shield.position,
      shieldHeight:parseFloat(shield.height || '0'),
      shieldZ:Number.parseInt(shield.zIndex || '0', 10),
      shieldBackground:shield.backgroundImage,
      tabsTop:tabsRect?.top ?? 0,
      handoffBorder:handoffStyle?.borderTopWidth,
      handoffHeight:handoff?.getBoundingClientRect().height ?? 0,
      refreshHeight:refresh?.getBoundingClientRect().height ?? 0,
      refreshBackground:refreshStyle?.backgroundColor,
      overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(layout.shieldPosition).toBe('fixed');
  expect(layout.shieldHeight).toBeGreaterThanOrEqual(47);
  expect(layout.shieldZ).toBeGreaterThanOrEqual(40);
  expect(layout.shieldBackground).not.toBe('none');
  expect(layout.tabsTop).toBeGreaterThanOrEqual(47);
  expect(layout.handoffBorder).not.toBe('0px');
  expect(layout.handoffHeight).toBeGreaterThanOrEqual(80);
  expect(layout.refreshHeight).toBeGreaterThanOrEqual(44);
  expect(layout.refreshBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(layout.overflow).toBeLessThanOrEqual(1);
  await expect(page.getByPlaceholder('Porto, Lisboa, Braga…')).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 900));
  const shieldAfterScroll = await page.locator('.lumina-one.one-v3').evaluate(root => {
    const style = getComputedStyle(root, '::after');
    return { top:style.top, position:style.position, height:parseFloat(style.height || '0') };
  });
  expect(shieldAfterScroll.position).toBe('fixed');
  expect(shieldAfterScroll.top).toBe('0px');
  expect(shieldAfterScroll.height).toBeGreaterThanOrEqual(47);
});
