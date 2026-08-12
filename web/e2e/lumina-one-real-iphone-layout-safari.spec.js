import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina Real iPhone Layout');
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
  await page.locator('.one-tabs button').filter({ hasText: 'Agora' }).click();
}

test('Lumina One protege a status bar e mostra a cidade como um único campo no iPhone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page, 'realiphone');

  const layout = await page.locator('.lumina-one.one-v2').evaluate(root => {
    const shield = getComputedStyle(root, '::after');
    const tabs = root.querySelector('.one-tabs');
    const wrapper = root.querySelector('.one-region-input');
    const input = wrapper?.querySelector('input');
    const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
    const inputStyle = input ? getComputedStyle(input) : null;
    const tabsRect = tabs?.getBoundingClientRect();

    return {
      shieldPosition: shield.position,
      shieldHeight: parseFloat(shield.height || '0'),
      shieldZ: Number.parseInt(shield.zIndex || '0', 10),
      shieldBackground: shield.backgroundImage,
      tabsTop: tabsRect?.top ?? 0,
      wrapperBorder: wrapperStyle?.borderTopWidth,
      wrapperHeight: wrapper?.getBoundingClientRect().height ?? 0,
      inputBorder: inputStyle?.borderTopWidth,
      inputBackground: inputStyle?.backgroundColor,
      inputShadow: inputStyle?.boxShadow,
    };
  });

  expect(layout.shieldPosition).toBe('fixed');
  expect(layout.shieldHeight).toBeGreaterThanOrEqual(47);
  expect(layout.shieldZ).toBeGreaterThanOrEqual(40);
  expect(layout.shieldBackground).not.toBe('none');
  expect(layout.tabsTop).toBeGreaterThanOrEqual(47);

  expect(layout.wrapperBorder).not.toBe('0px');
  expect(layout.wrapperHeight).toBeGreaterThanOrEqual(52);
  expect(layout.inputBorder).toBe('0px');
  expect(layout.inputBackground).toBe('rgba(0, 0, 0, 0)');
  expect(layout.inputShadow).toBe('none');

  const regionInput = page.getByPlaceholder('Porto, Lisboa, Braga…');
  await regionInput.fill('Bragança');
  await expect(regionInput).toHaveValue('Bragança');

  await page.evaluate(() => window.scrollTo(0, 900));
  const shieldAfterScroll = await page.locator('.lumina-one.one-v2').evaluate(root => {
    const style = getComputedStyle(root, '::after');
    return { top: style.top, position: style.position, height: parseFloat(style.height || '0') };
  });
  expect(shieldAfterScroll.position).toBe('fixed');
  expect(shieldAfterScroll.top).toBe('0px');
  expect(shieldAfterScroll.height).toBeGreaterThanOrEqual(47);
});
