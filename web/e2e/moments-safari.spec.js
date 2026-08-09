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
  await expect(page.getByRole('button', { name: 'Ir para o Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para o Feed' }).click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
}

async function pinchOut(locator) {
  await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const fire = (type, pointerId, x, y, isPrimary = false) => {
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary,
        clientX: x,
        clientY: y,
      }));
    };
    fire('pointerdown', 41, centerX - 18, centerY, true);
    fire('pointerdown', 42, centerX + 18, centerY);
    fire('pointermove', 42, centerX + 48, centerY);
    fire('pointermove', 42, centerX + 78, centerY);
    fire('pointerup', 42, centerX + 78, centerY);
    fire('pointerup', 41, centerX - 18, centerY, true);
  });
}

test('Momentos têm editor Story completo em Mobile Safari', async ({ page }) => {
  await openFeed(page);

  await page.getByRole('button', { name: 'Tu' }).click();
  await expect(page.getByRole('heading', { name: 'Momento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar fotografia ao momento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar vídeo ao momento' })).toBeVisible();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsCLjDgA0wYRUdtBIAS4sBtNP0jmcAAAAASUVORK5CYII=',
    'base64'
  );
  await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: 'momento.png', mimeType: 'image/png', buffer: png,
  });

  await expect(page.getByText('Editar momento', { exact: true })).toBeVisible();
  await expect(page.getByText('Arrasta · aproxima · escreve · decora · desenha')).toBeVisible();
  await expect(page.getByTestId('moment-photo-zoom-readout')).toHaveText('100%');

  const confirmButton = page.getByRole('button', { name: 'Confirmar edição do momento' });
  await expect(confirmButton).toBeVisible();
  await expect(confirmButton).toBeEnabled();

  await page.getByRole('button', { name: 'Adicionar texto ao momento' }).click();
  await expect(page.getByRole('dialog', { name: 'Editor de texto do momento' })).toBeVisible();
  await page.getByPlaceholder('Escreve algo…').fill('Noite em Lisboa ✨');
  await page.getByRole('button', { name: 'Cor do texto Rosa' }).click();
  await page.getByRole('button', { name: 'Contorno' }).click();
  await page.getByLabel('Tamanho do texto').fill('40');
  await page.getByRole('button', { name: 'Concluir texto' }).click();

  const textOverlay = page.locator('[data-moment-text-overlay]');
  await expect(textOverlay).toContainText('Noite em Lisboa');
  const textSizeBeforePinch = await textOverlay.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await pinchOut(textOverlay);
  await expect.poll(() => textOverlay.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(textSizeBeforePinch);

  await page.getByRole('button', { name: 'Adicionar emoji ao momento' }).click();
  await page.getByRole('button', { name: 'Adicionar emoji 😂' }).click();
  const stickerOverlay = page.locator('[data-moment-sticker-overlay]');
  await expect(stickerOverlay).toContainText('😂');
  const stickerSizeBeforePinch = await stickerOverlay.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await pinchOut(stickerOverlay);
  await expect.poll(() => stickerOverlay.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(stickerSizeBeforePinch);

  await page.getByRole('button', { name: 'Desenhar no momento' }).click();
  await page.getByRole('button', { name: 'Cor do desenho Azul' }).click();
  const frame = page.getByTestId('moment-photo-frame');
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + 70, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 145, box.y + 285, { steps: 4 });
  await page.mouse.move(box.x + 210, box.y + 245, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('[data-moment-drawing-stroke]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Concluir desenho' }).click();

  await confirmButton.click();
  await expect(page.getByText('Editar momento', { exact: true })).toBeHidden();
  await expect(page.getByRole('img', { name: 'Pré-visualização do momento' })).toBeVisible();
  await expect(page.getByText('9:16 · MOMENTO')).toBeVisible();

  await page.getByRole('button', { name: /Remover/ }).click();
  const mp4 = Buffer.from([
    0x00,0x00,0x00,0x18,0x66,0x74,0x79,0x70,
    0x69,0x73,0x6f,0x6d,0x00,0x00,0x02,0x00,
    0x69,0x73,0x6f,0x6d,0x6d,0x70,0x34,0x32,
  ]);
  await page.locator('input[accept="video/mp4,video/quicktime,video/webm"]').setInputFiles({
    name: 'momento.mp4', mimeType: 'video/mp4', buffer: mp4,
  });
  await expect(page.getByLabel('Pré-visualização do vídeo do momento')).toBeVisible();
  await expect(page.getByText('VÍDEO · MOMENTO')).toBeVisible();
});
