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

test('abertura sobe os CTAs e dá a Feed e Salas a mesma presença', async ({ page }) => {
  await register(page, 'opening');

  const feed = page.getByRole('button', { name: 'Entrar no Feed' });
  const rooms = page.getByRole('button', { name: 'Explorar Salas' });
  await expect(feed).toBeVisible();
  await expect(rooms).toBeVisible();
  await expect(feed).toHaveCount(1);
  await expect(rooms).toHaveCount(1);
  await expect(feed).toHaveClass(/p-brand/);
  await expect(rooms).toHaveClass(/p-brand/);
  await expect(page.locator('.opening-card')).toHaveCount(0);
  await expect(page.getByText('Escolhe onde queres começar')).toBeVisible();

  const [feedBox, roomsBox, actionMetrics] = await Promise.all([
    feed.boundingBox(),
    rooms.boundingBox(),
    page.locator('.opening-actions').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { bottom: rect.bottom, viewportHeight: window.innerHeight };
    }),
  ]);
  expect(feedBox).not.toBeNull();
  expect(roomsBox).not.toBeNull();
  expect(Math.abs(feedBox.height - roomsBox.height)).toBeLessThanOrEqual(1);
  expect(actionMetrics.viewportHeight - actionMetrics.bottom).toBeGreaterThanOrEqual(100);

  await feed.click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
});

test('composer da Sala fica claramente acima da home indicator', async ({ page }) => {
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

  expect(metrics.paddingBottom).toBeGreaterThanOrEqual(58);
  expect(metrics.viewportHeight - metrics.inputBottom).toBeGreaterThanOrEqual(54);
});

test('Publicar destaca a área de escrita e usa o tema daylight-friendly', async ({ page }) => {
  await register(page, 'daylight');
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo' }).click();

  const textarea = page.getByPlaceholder('O que estás a ver ou a pensar?');
  await expect(textarea).toBeVisible();

  const metrics = await textarea.evaluate((node) => {
    const style = getComputedStyle(node);
    const htmlStyle = getComputedStyle(document.documentElement);
    return {
      borderWidth: parseFloat(style.borderTopWidth),
      borderColor: style.borderTopColor,
      backgroundImage: style.backgroundImage,
      color: style.color,
      rootBackground: htmlStyle.backgroundColor,
    };
  });

  expect(metrics.borderWidth).toBeGreaterThanOrEqual(1.5);
  expect(metrics.backgroundImage).not.toBe('none');
  expect(metrics.borderColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(metrics.color).toBe('rgb(255, 255, 255)');
  expect(metrics.rootBackground).toBe('rgb(24, 40, 70)');
});
