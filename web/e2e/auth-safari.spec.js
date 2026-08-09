import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

test('criar conta, sair e voltar a entrar funciona em Mobile Safari', async ({ page }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `auth${suffix}`.slice(0, 22);
  const email = `${handle}@example.test`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Safari Auth');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await expect(page.getByRole('button', { name: 'Ir para o Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para o Feed' }).click();
  await expect(page.getByRole('button', { name: 'Perfil' })).toBeVisible();

  await page.getByRole('button', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Olá, Safari')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ir para o Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para o Feed' }).click();
  await expect(page.getByRole('button', { name: 'Perfil' })).toBeVisible();
});
