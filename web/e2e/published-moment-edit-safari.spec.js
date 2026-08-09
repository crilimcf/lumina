import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsCLjDgA0wYRUdtBIAS4sBtNP0jmcAAAAASUVORK5CYII=',
  'base64'
);
const MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
]);

async function openFeed(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `editmoment${suffix}`.slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Edit Moment QA');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name: /Criar ou entrar numa comunidade/ }).click();
  await page.getByPlaceholder('ex: Amigos da faculdade').fill(`Edit Moment QA ${suffix}`);
  const seeds = page.locator('input[placeholder^="ideia "]');
  for (let i = 0; i < 5; i++) await seeds.nth(i).fill(`edição momento ${i + 1}`);
  await page.getByRole('button', { name: 'Criar comunidade' }).click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
  return page.evaluate(async () => (await fetch('/api/auth/me')).json());
}

test('autor substitui media de Momento já publicado em Mobile Safari', async ({ page }) => {
  const me = await openFeed(page);
  let moments = [];
  let uploadNumber = 0;
  let patchBody = null;
  const uploadMimes = new Map();

  await page.route('**/api/uploads/sign', async route => {
    uploadNumber += 1;
    const body = route.request().postDataJSON();
    uploadMimes.set(uploadNumber, body.mime);
    const extension = body.mime?.startsWith('video/') ? 'mp4' : 'png';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ uploadUrl: `https://upload.example.test/${uploadNumber}`, key: `qa/${uploadNumber}.${extension}` }),
    });
  });
  await page.route('https://upload.example.test/**', route => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/uploads/confirm', route => {
    const mime = uploadMimes.get(uploadNumber) || 'image/png';
    const extension = mime.startsWith('video/') ? 'mp4' : 'png';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: `https://media.example.test/${uploadNumber}.${extension}` }),
    });
  });

  await page.route('**/api/moments', async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(moments) });
    }
    const body = route.request().postDataJSON();
    const now = new Date();
    const moment = {
      id: '11111111-1111-4111-8111-111111111111',
      media_url: body.mediaUrl,
      media_mime: 'video/mp4',
      palette: body.palette || 0,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      author_id: me.id,
      handle: me.handle,
      name: me.name,
      author_palette: me.palette,
      author_avatar_url: me.avatar_url,
      viewed: false,
    };
    moments = [moment];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(moment) });
  });

  await page.route('**/api/moments/11111111-1111-4111-8111-111111111111', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patchBody = route.request().postDataJSON();
    moments = moments.map(moment => moment.id === '11111111-1111-4111-8111-111111111111'
      ? { ...moment, media_url: patchBody.mediaUrl, media_mime: 'image/png' }
      : moment);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(moments[0]) });
  });

  // A edição de fotografia antes de publicar já tem um teste Safari dedicado.
  // Aqui usamos vídeo de origem para isolar a responsabilidade deste teste:
  // substituir media de um Momento que já foi publicado.
  await page.getByRole('button', { name: 'Tu' }).click();
  await page.locator('input[accept="video/mp4,video/quicktime,video/webm"]').setInputFiles({
    name: 'original.mp4',
    mimeType: 'video/mp4',
    buffer: MP4,
  });
  await expect(page.getByLabel('Pré-visualização do vídeo do momento')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar momento' }).click();
  await expect(page.getByText(/Momento publicado/)).toBeVisible();

  await page.getByRole('button', { name: 'Tu' }).click();
  await expect(page.getByRole('button', { name: 'Editar momento' })).toBeVisible();
  const ownViewerInput = page.locator('input[type="file"][accept*="video/mp4"]');
  await ownViewerInput.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: PNG });

  await expect(page.getByText('Momento atualizado')).toBeVisible();
  expect(patchBody).not.toBeNull();
  expect(patchBody.mediaUrl).toBe('https://media.example.test/2.png');
  await expect(page.locator('img[src="https://media.example.test/2.png"]')).toBeVisible();
});
