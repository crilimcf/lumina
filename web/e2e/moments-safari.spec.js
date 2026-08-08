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

test('Momentos têm editor Story completo com cores, stickers, desenho e vídeo em Mobile Safari', async ({ page }) => {
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
  await expect(page.getByText('Arrasta · aproxima · escreve · decora · desenha')).toBeVisible();
  await expect(page.getByTestId('moment-photo-zoom-readout')).toHaveText('100%');

  const confirmButton = page.getByRole('button', { name: 'Confirmar edição do momento' });
  await expect(confirmButton).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usar no momento' })).toBeVisible();
  const box = await confirmButton.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  const textTool = page.getByRole('button', { name: 'Adicionar texto ao momento' });
  const emojiTool = page.getByRole('button', { name: 'Adicionar emoji ao momento' });
  const drawTool = page.getByRole('button', { name: 'Desenhar no momento' });
  await expect(textTool).toBeVisible();
  await expect(emojiTool).toBeVisible();
  await expect(drawTool).toBeVisible();

  await textTool.click();
  await expect(page.getByRole('dialog', { name: 'Editor de texto do momento' })).toBeVisible();
  await page.getByPlaceholder('Escreve algo…').fill('Noite em Lisboa ✨');
  await page.getByRole('button', { name: 'Cor do texto Rosa' }).click();
  await page.getByRole('button', { name: 'Contorno' }).click();
  await page.getByLabel('Tamanho do texto').fill('40');
  await page.getByRole('button', { name: 'Concluir texto' }).click();

  const textOverlay = page.locator('[data-moment-text-overlay]');
  await expect(textOverlay).toContainText('Noite em Lisboa');
  await expect(textOverlay).toHaveCSS('color', 'rgb(255, 111, 200)');

  await emojiTool.click();
  await expect(page.getByRole('dialog', { name: 'Escolher emoji para o momento' })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar emoji 😂' }).click();
  await expect(page.locator('[data-moment-sticker-overlay]')).toContainText('😂');
  await expect(page.getByRole('button', { name: 'Aumentar sticker' })).toBeVisible();
  await page.getByRole('button', { name: 'Aumentar sticker' }).click();

  await drawTool.click();
  await expect(page.getByRole('button', { name: 'Cor do desenho Azul' })).toBeVisible();
  await page.getByRole('button', { name: 'Cor do desenho Azul' }).click();
  await page.getByRole('button', { name: 'Espessura do desenho 6' }).click();

  const frame = page.getByTestId('moment-photo-frame');
  const frameBox = await frame.boundingBox();
  expect(frameBox).not.toBeNull();
  await page.mouse.move(frameBox.x + 70, frameBox.y + 250);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 145, frameBox.y + 285, { steps: 4 });
  await page.mouse.move(frameBox.x + 210, frameBox.y + 245, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('[data-moment-drawing-stroke]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Concluir desenho' }).click();

  await confirmButton.click();

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
