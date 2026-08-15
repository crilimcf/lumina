import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

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

test('Lumina One ganha portal de descoberta, prompts rotativos e continua dentro do iPhone', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await register(page);

  const entry = page.locator('.one-v3-feed-entry.one-adventure-entry');
  await expect(entry).toBeVisible({ timeout:9000 });
  await expect(entry).toContainText('LUMINA ONE');
  await expect(entry).toContainText('Descobrir agora');
  await expect(entry.locator('.one-adventure-portal')).toBeVisible();
  await expect(entry.locator('.one-adventure-dots i.is-on')).toHaveCount(1);

  const firstPrompt = await entry.locator('[data-one-adventure-prompt]').innerText();
  expect([
    'Surpresa do dia',
    'Hoje perto de ti',
    'Uma ideia para explorar',
    'Vê o que está a mexer',
    'Experimenta algo diferente',
  ]).toContain(firstPrompt);

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

  await page.waitForTimeout(5500);
  const secondPrompt = await entry.locator('[data-one-adventure-prompt]').innerText();
  expect(secondPrompt).not.toBe(firstPrompt);

  await entry.click();
  await expect(page.locator('.lumina-one.one-v3')).toBeVisible();
});
