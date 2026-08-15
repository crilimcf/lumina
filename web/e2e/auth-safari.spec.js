import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

test('criar conta, sair e voltar a entrar funciona em Mobile Safari', async ({ page }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `auth${suffix}`.slice(0, 22);
  const email = `${handle}@example.test`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  // Password managers and browser autofill can update the whole form in one
  // render. Every controlled value must survive those concurrent changes.
  await Promise.all([
    page.getByPlaceholder('Como te chamas').fill('Safari Auth'),
    page.getByPlaceholder('Nome de utilizador').fill(handle),
    page.locator('input[type="date"]').fill('1990-01-01'),
    page.getByPlaceholder('Email').fill(email),
    page.getByPlaceholder('Password').fill(PASSWORD),
  ]);
  await expect(page.getByPlaceholder('Como te chamas')).toHaveValue('Safari Auth');
  await expect(page.getByPlaceholder('Nome de utilizador')).toHaveValue(handle);
  await expect(page.locator('input[type="date"]')).toHaveValue('1990-01-01');
  await expect(page.getByPlaceholder('Email')).toHaveValue(email);
  await expect(page.getByPlaceholder('Password')).toHaveValue(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name: 'Perfil' })).toBeVisible();

  await page.getByRole('button', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Olá, Safari')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar no Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name: 'Perfil' })).toBeVisible();
  await page.getByRole('button', { name: 'Perfil' }).click();
  await expect(page.getByRole('button', { name: /Exportar os meus dados/ })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Pedir eliminação da conta/ }).click();
  await expect(page.getByRole('button', { name: /Cancelar eliminação da conta/ })).toBeVisible();
});
