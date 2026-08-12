import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Feed Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
}

test('Feed fica abaixo da barra de estado e usa daylight v2 no iPhone', async ({ page }) => {
  await register(page, 'feedday');

  const metrics = await page.locator('.lumina-feed').evaluate((root) => {
    const bar = root.querySelector('.lumina-feed-bar');
    const header = root.querySelector('.lumina-feed-header');
    const empty = root.querySelector('.lumina-feed-empty');
    const barRect = bar?.getBoundingClientRect();
    const rootStyle = getComputedStyle(document.documentElement);
    const headerStyle = header ? getComputedStyle(header) : null;
    const emptyStyle = empty ? getComputedStyle(empty) : null;
    return {
      barTop: barRect?.top ?? 0,
      rootBackground: rootStyle.backgroundColor,
      headerBackground: headerStyle?.backgroundImage ?? 'none',
      emptyBackground: emptyStyle?.backgroundImage ?? 'none',
      mutedColor: getComputedStyle(root.querySelector('.lumina-brand-subtitle')).color,
    };
  });

  expect(metrics.barTop).toBeGreaterThanOrEqual(47);
  expect(metrics.rootBackground).toBe('rgb(24, 40, 70)');
  expect(metrics.headerBackground).not.toBe('none');
  expect(metrics.emptyBackground).not.toBe('none');
  expect(metrics.mutedColor).toBe('rgb(201, 208, 226)');
});
