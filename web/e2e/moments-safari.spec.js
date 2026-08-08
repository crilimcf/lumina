import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function openFeed(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `moment${suffix}`.slice(0, 22);

  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Moment QA');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name: /Criar ou entrar numa comunidade/ }).click();

  const communityName = `Moment QA ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.getByPlaceholder('ex: Amigos da faculdade').fill(communityName);
  const seeds = page.locator('input[placeholder^="ideia "]');
  for (let i = 0; i < 5; i++) await seeds.nth(i).fill(`momento pergunta ${i + 1}`);
  await page.getByRole('button', { name: 'Criar comunidade' }).click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
}

test('Momentos usam media vertical, editor de texto e vídeo em Mobile Safari', async ({ page }) => {
  await openFeed(page);

  await page.getByRole('button', { name: 'Tu' }).click();
  await expect(page.getByRole('heading', { name: 'Momento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar fotografia ao momento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar vídeo ao momento' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Cor \d/ })).toHaveCount(0);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGjB0AANsBA/0X8GkAAAAASUVORK5CYII=',
    'base64'
  );
  await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: 'momento.png',
    mimeType: 'image/png',
    buffer: png,
  });

  await expect(page.getByText('Editar momento', { exact: true })).toBeVisible();
  await expect(page.getByText('1 dedo move · 2 dedos aproximam · 9:16')).toBeVisible();
  await expect(page.getByTestId('moment-photo-zoom-readout')).toHaveText('100%');

  await page.getByPlaceholder('Escreve sobre a foto…').fill('Noite em Lisboa ✨');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.locator('[data-moment-text-overlay]')).toContainText('Noite em Lisboa');
  await page.getByLabel('Tamanho do texto').fill('40');
  await page.getByRole('button', { name: 'Usar no momento' }).click();

  await expect(page.getByText('Editar momento', { exact: true })).toBeHidden();
  await expect(page.getByRole('img', { name: 'Pré-visualização do momento' })).toBeVisible();
  await expect(page.getByText('9:16 · MOMENTO')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar foto do momento' })).toBeVisible();

  await page.getByRole('button', { name: /Remover/ }).click();
  const mp4 = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
  ]);
  await page.locator('input[accept="video/mp4,video/quicktime,video/webm"]').setInputFiles({
    name: 'momento.mp4',
    mimeType: 'video/mp4',
    buffer: mp4,
  });

  await expect(page.getByLabel('Pré-visualização do vídeo do momento')).toBeVisible();
  await expect(page.getByText('VÍDEO · MOMENTO')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar foto do momento' })).toHaveCount(0);
});
