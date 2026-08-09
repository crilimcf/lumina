import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function registerAndCreateCommunity(page, label) {
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
  await page.getByRole('button', { name: /Criar ou entrar numa comunidade/ }).click();

  await page.getByPlaceholder('ex: Amigos da faculdade').fill(`${label} Circle ${suffix}`);
  const seeds = page.locator('input[placeholder^="ideia "]');
  for (let i = 0; i < 5; i++) await seeds.nth(i).fill(`${label} pergunta ${i + 1}`);
  await page.getByRole('button', { name: 'Criar comunidade' }).click();
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
  await page.getByRole('button', { name: 'Ver o feed' }).click();
}

test('Sala privada fica invisível sem convite e entra pelo convite em Mobile Safari', async ({ page }) => {
  const guest = await registerAndCreateCommunity(page, 'Convidado QA');
  await logout(page);

  await page.getByRole('button', { name: 'Criar conta' }).click();
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const ownerHandle = `owner${suffix}`.slice(0, 22);
  const ownerEmail = `${ownerHandle}@example.test`;
  await page.getByPlaceholder('Como te chamas').fill('Dono QA');
  await page.getByPlaceholder('Nome de utilizador').fill(ownerHandle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(ownerEmail);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name: /Criar ou entrar numa comunidade/ }).click();
  await page.getByPlaceholder('ex: Amigos da faculdade').fill(`Owner Circle ${suffix}`);
  const seeds = page.locator('input[placeholder^="ideia "]');
  for (let i = 0; i < 5; i++) await seeds.nth(i).fill(`owner pergunta ${i + 1}`);
  await page.getByRole('button', { name: 'Criar comunidade' }).click();

  await page.getByRole('button', { name: 'Salas' }).click();
  await page.getByRole('button', { name: /Criar/ }).click();
  const roomName = `Sala Privada QA ${suffix}`;
  await page.getByPlaceholder('Nome da sala').fill(roomName);
  await page.getByPlaceholder('Tópico principal').fill('Só convidados entram');
  await page.getByRole('button', { name: 'Privada Só aparece a pessoas convidadas por ti.', exact: true }).click();
  await page.getByRole('button', { name: 'Criar sala', exact: true }).click();

  await expect(page.getByText(roomName, { exact: true })).toBeVisible();
  await page.getByText(roomName, { exact: true }).click();
  await page.getByRole('button', { name: 'Convidar pessoas' }).click();
  await page.getByPlaceholder('Procurar utilizador').fill(guest.handle);
  const invitee = page.getByRole('button').filter({ hasText: `@${guest.handle}` });
  await expect(invitee).toBeVisible();
  await invitee.click();
  await expect(page.getByText('Convidado QA convidado', { exact: true })).toBeVisible();

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
});