import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function registerAndOpenProfile(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `avatar${suffix}`.slice(0, 22);

  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Avatar Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  await page.getByRole('button', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
  return { handle };
}

test('foto de perfil recorta, guarda e não mostra paleta antiga em Mobile Safari', async ({ page }) => {
  await registerAndOpenProfile(page);

  await expect(page.getByRole('button', { name: /^Cor / })).toHaveCount(0);
  await expect(page.locator('.scene .st')).toHaveCount(0);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGjB0AANsBA/0X8GkAAAAASUVORK5CYII=',
    'base64'
  );
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: 'perfil.png', mimeType: 'image/png', buffer: png,
  });

  await expect(page.getByRole('dialog', { name: 'Ajustar foto de perfil' })).toBeVisible();
  await expect(page.getByText('1 dedo move · 2 dedos aproximam')).toBeVisible();
  await page.getByLabel('Zoom da foto de perfil').fill('1.6');
  await page.getByRole('button', { name: 'Usar foto de perfil' }).click();

  const preview = page.getByRole('img', { name: 'Pré-visualização da foto de perfil' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img) => ({
    radius: getComputedStyle(img).borderRadius,
    border: getComputedStyle(img).borderTopWidth,
    fit: getComputedStyle(img).objectFit,
  }))).toEqual({ radius: '50%', border: '0px', fit: 'cover' });

  const me = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.json();
  });

  let signMime = null;
  let patchBody = null;
  const savedAvatar = 'https://media.example.test/avatar-safari-final.jpg';

  await page.route('**/api/uploads/sign', async (route) => {
    signMime = route.request().postDataJSON()?.mime || null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      uploadUrl: 'https://lumina-upload.test/avatar',
      key: 'avatar-safari-final.jpg',
    }) });
  });
  await page.route('https://lumina-upload.test/**', route => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/uploads/confirm', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ url: savedAvatar }),
  }));
  await page.route('**/api/auth/me', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patchBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...me, ...patchBody, avatar_url: patchBody.avatarUrl, bio: patchBody.bio }),
    });
  });

  await page.getByRole('button', { name: 'Guardar alterações' }).click();
  await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeHidden();
  expect(signMime).toBe('image/jpeg');
  expect(patchBody?.avatarUrl).toBe(savedAvatar);
  await expect(page.locator(`img[src="${savedAvatar}"]`).first()).toBeAttached();
});
