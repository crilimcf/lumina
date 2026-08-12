import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('UX Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
}

test('abertura apresenta uma escolha clara com Feed como ação principal', async ({ page }) => {
  await register(page, 'opening');

  const feed = page.getByRole('button', { name: 'Entrar no Feed' });
  const rooms = page.getByRole('button', { name: 'Explorar Salas' });
  await expect(feed).toBeVisible();
  await expect(rooms).toBeVisible();
  await expect(feed).toHaveCount(1);
  await expect(rooms).toHaveCount(1);
  await expect(feed).toHaveClass(/p-brand/);
  await expect(rooms).not.toHaveClass(/p-brand/);
  await expect(page.locator('.opening-card')).toHaveCount(0);
  await expect(page.getByText('Escolhe onde queres começar')).toBeVisible();

  await feed.click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
});

test('composer da Sala mantém folga mínima acima da home indicator', async ({ page }) => {
  await register(page, 'roomclear');
  await page.getByRole('button', { name: 'Explorar Salas' }).click();
  await expect(page.getByText('Tópicos vivos, sem poluir o Feed.')).toBeVisible();

  const roomName = `Sala UX ${Date.now()}`;
  await page.getByRole('button', { name: /Criar/ }).click();
  await page.getByPlaceholder('Nome da sala').fill(roomName);
  await page.getByPlaceholder('Tópico principal').fill('Teste de safe area');
  await page.getByRole('button', { name: 'Criar sala pública', exact: true }).click();
  await expect(page.getByText(roomName, { exact: true })).toBeVisible();
  await page.getByText(roomName, { exact: true }).click();

  const composer = page.locator('.room-composer-wrap');
  const input = page.getByPlaceholder('Mensagem para a sala…');
  await expect(composer).toBeVisible();
  await expect(input).toBeVisible();

  const metrics = await composer.evaluate((node) => {
    const style = getComputedStyle(node);
    const inputNode = node.querySelector('input[placeholder="Mensagem para a sala…"]');
    const inputBox = inputNode?.getBoundingClientRect();
    return {
      paddingBottom: parseFloat(style.paddingBottom),
      inputBottom: inputBox?.bottom ?? window.innerHeight,
      viewportHeight: window.innerHeight,
    };
  });

  expect(metrics.paddingBottom).toBeGreaterThanOrEqual(26);
  expect(metrics.viewportHeight - metrics.inputBottom).toBeGreaterThanOrEqual(24);
});
