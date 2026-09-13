import { test, expect } from '@playwright/test';

test('ligação de recuperação abre formulário e permite definir nova password', async ({ page }) => {
  let resetPayload = null;
  await page.route('**/account/reset-password', async (route) => {
    resetPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/recuperar?token=token-regression-test');

  await expect(page.getByRole('heading', { name: 'Nova password' })).toBeVisible();
  await page.getByPlaceholder('Nova password', { exact: true }).fill('NovaPassword-123');
  await page.getByPlaceholder('Confirmar nova password', { exact: true }).fill('NovaPassword-123');
  await page.getByRole('button', { name: 'Guardar nova password' }).click();

  await expect(page.getByRole('heading', { name: 'Password atualizada' })).toBeVisible();
  expect(resetPayload).toEqual({ token: 'token-regression-test', password: 'NovaPassword-123' });
  await expect.poll(() => page.url()).not.toContain('token-regression-test');
});

test('ligação de recuperação sem token não mostra o login como se nada tivesse acontecido', async ({ page }) => {
  await page.goto('/recuperar');
  await expect(page.getByRole('heading', { name: 'Nova password' })).toBeVisible();
  await expect(page.getByText(/não contém um token válido/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar nova password' })).toBeDisabled();
});

test('recuperação continua pública mesmo quando já existe uma sessão válida', async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'session-user', name: 'Sessão ativa', handle: 'sessao' } }),
    });
  });

  await page.goto('/recuperar?token=token-with-existing-session');

  // O que importa aqui é que uma sessão já existente nunca substitui a rota pública
  // de recuperação pelo feed/app autenticado.
  await expect(page.getByRole('heading', { name: 'Nova password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar nova password' })).toBeVisible();
});

test('recuperação usa a língua francesa do dispositivo', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    locale: 'fr-FR',
    baseURL: testInfo.project.use.baseURL,
  });
  const page = await context.newPage();
  try {
    await page.goto('/recuperar?token=token-fr');
    await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible();
    await expect(page.getByPlaceholder('Confirmer le nouveau mot de passe')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer le nouveau mot de passe' })).toBeVisible();
  } finally {
    await context.close();
  }
});
