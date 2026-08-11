import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function registerAndEnterFeed(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9._]/g, '');
  const handle = `${safeLabel}${suffix}`.slice(0, 22);
  const email = `${handle}@example.test`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill(label);
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await expect(page.getByRole('button', { name: 'Ir para o Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para o Feed' }).click();
  await expect(page.getByRole('button', { name: 'Perfil' })).toBeVisible();
  return { handle, email };
}

async function logout(page) {
  await page.getByRole('button', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
}

async function login(page, email, firstName) {
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(`Olá, ${firstName}`)).toBeVisible();
  await page.getByRole('button', { name: 'Ir para o Feed' }).click();
}

test('Sala privada fica invisível sem convite e entra pelo convite em Mobile Safari', async ({ page }) => {
  const guest = await registerAndEnterFeed(page, 'Convidado QA');
  await logout(page);

  const owner = await registerAndEnterFeed(page, 'Dono QA');
  await page.getByRole('button', { name: 'Salas' }).click();
  await page.getByRole('button', { name: /Criar/ }).click();

  const roomName = `Sala Privada QA ${Date.now()}`;
  await page.getByPlaceholder('Nome da sala').fill(roomName);
  await page.getByPlaceholder('Tópico principal').fill('Só convidados entram');
  await page.locator('.room-privacy-option.is-private').click();
  await page.getByRole('button', { name: 'Criar sala privada', exact: true }).click();

  await expect(page.getByText(roomName, { exact: true })).toBeVisible();
  await page.getByText(roomName, { exact: true }).click();
  await page.getByRole('button', { name: 'Convidar pessoas' }).click();
  const search = page.getByPlaceholder('Procurar utilizador');
  await search.fill(guest.handle);
  const invitee = page.getByRole('button').filter({ hasText: `@${guest.handle}` });
  await expect(invitee).toBeVisible();
  await invitee.click();
  await expect(search).toHaveValue('');

  await page.getByRole('button', { name: 'Voltar às salas' }).click();
  await logout(page);

  await login(page, guest.email, 'Convidado');
  await page.getByRole('button', { name: 'Salas' }).click();
  await expect(page.getByText(roomName, { exact: true })).toBeVisible();
  await expect(page.getByText('Aceitar convite', { exact: true })).toBeVisible();

  await page.getByText(roomName, { exact: true }).click();
  await expect(page.getByText(roomName, { exact: true })).toBeVisible();
  await expect(page.getByText('Só convidados entram', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Mensagem para a sala…')).toBeVisible();

  expect(owner.handle).not.toBe(guest.handle);
});
