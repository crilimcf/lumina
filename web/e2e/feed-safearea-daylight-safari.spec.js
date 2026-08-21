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

async function feedMetrics(page) {
  return page.locator('.lumina-feed').evaluate((root) => {
    const bar = root.querySelector('.lumina-feed-bar');
    const brand = root.querySelector('.lumina-brand-lockup');
    const header = root.querySelector('.lumina-feed-header');
    const empty = root.querySelector('.lumina-feed-empty');
    const barRect = bar?.getBoundingClientRect();
    const brandRect = brand?.getBoundingClientRect();
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const headerStyle = header ? getComputedStyle(header) : null;
    const emptyStyle = empty ? getComputedStyle(empty) : null;
    return {
      barTop: barRect?.top ?? 0,
      brandTop: brandRect?.top ?? 0,
      bodyPaddingTop: parseFloat(bodyStyle.paddingTop) || 0,
      headerPaddingTop: parseFloat(headerStyle?.paddingTop || '0') || 0,
      rootBackground: rootStyle.backgroundColor,
      headerBackground: headerStyle?.backgroundImage ?? 'none',
      emptyBackground: emptyStyle?.backgroundImage ?? 'none',
      mutedColor: getComputedStyle(root.querySelector('.lumina-brand-subtitle')).color,
    };
  });
}

test('Feed fica abaixo da barra de estado e usa daylight v2 no iPhone', async ({ page }) => {
  await register(page, 'feedday');
  const metrics = await feedMetrics(page);

  expect(metrics.barTop).toBeGreaterThanOrEqual(51);
  expect(metrics.brandTop).toBeGreaterThanOrEqual(63);
  expect(metrics.rootBackground).toBe('rgb(24, 40, 70)');
  expect(metrics.headerBackground).not.toBe('none');
  expect(metrics.emptyBackground).not.toBe('none');
  expect(metrics.mutedColor).toBe('rgb(201, 208, 226)');
});

test('Feed nativo iOS mantém o chrome totalmente abaixo da status bar', async ({ page }) => {
  await page.addInitScript(() => document.documentElement.classList.add('lumina-native', 'lumina-native-ios'));
  await register(page, 'feednative');
  const metrics = await feedMetrics(page);

  expect(metrics.bodyPaddingTop).toBe(0);
  expect(metrics.headerPaddingTop).toBeGreaterThanOrEqual(52);
  expect(metrics.barTop).toBeGreaterThanOrEqual(52);
  expect(metrics.brandTop).toBeGreaterThanOrEqual(64);
});
