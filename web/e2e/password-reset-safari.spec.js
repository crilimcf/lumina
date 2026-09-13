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
  let authMeCalls = 0;
  await page.route('**/auth/me', async (route) => {
    authMeCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'session-user', name: 'Sessão ativa', handle: 'sessao' } }),
    });
  });

  await page.goto('/recuperar?token=token-with-existing-session');

  await expect(page.getByRole('heading', { name: 'Nova password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar nova password' })).toBeVisible();
  expect(authMeCalls).toBe(0);
});
