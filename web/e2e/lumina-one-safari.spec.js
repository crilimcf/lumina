import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page, label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `${label}${suffix}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina One Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  return handle;
}

test('Lumina One abre do Feed e mantém a experiência dentro da app', async ({ page }) => {
  await register(page, 'oneopen');

  const launcher = page.getByRole('button', { name: 'Abrir Lumina One' });
  await expect(launcher).toBeVisible();
  await launcher.click();

  await expect(page.getByText('Tudo acontece')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pulso', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lumes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cápsulas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agora', exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Voltar ao Feed' }).click();
  await expect(page.getByRole('button', { name: 'Abrir Lumina One' })).toBeVisible();
});

test('Cápsulas cria e guarda uma memória sem sair da Lumina', async ({ page }) => {
  await register(page, 'onecapsule');
  await page.getByRole('button', { name: 'Abrir Lumina One' }).click();
  await page.getByRole('button', { name: 'Cápsulas', exact: true }).click();

  await page.getByRole('button', { name: /Nova Cápsula/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nova Cápsula' })).toBeVisible();
  await page.getByPlaceholder('Verão 2026').fill('Teste Safari');
  await page.getByPlaceholder('O que estamos a guardar?').fill('Memórias dentro da Lumina');
  await page.getByRole('button', { name: 'Criar Cápsula', exact: true }).click();

  await expect(page.getByText('Teste Safari', { exact: true })).toBeVisible();
  const memory = page.getByPlaceholder('Adicionar uma memória…');
  await expect(memory).toBeVisible();
  await memory.fill('Primeira memória do pacote Lumina One');
  await page.getByRole('button', { name: /Guardar na Cápsula/ }).click();
  await expect(page.getByText('Primeira memória do pacote Lumina One')).toBeVisible();
});

test('Agora permite afinar algoritmo e Radar Local no iPhone', async ({ page }) => {
  await register(page, 'oneagora');
  await page.getByRole('button', { name: 'Abrir Lumina One' }).click();
  await page.getByRole('button', { name: 'Agora', exact: true }).click();

  await expect(page.getByText('A rede adapta-se')).toBeVisible();
  await page.getByPlaceholder('viagens, carros, tecnologia').fill('viagens, tecnologia');
  await page.getByPlaceholder('política, futebol…').fill('política');
  await page.getByRole('button', { name: 'Viagem', exact: true }).click();
  await page.getByPlaceholder('Porto, Lisboa, Braga…').fill('Porto');
  await page.getByRole('button', { name: 'Guardar e adaptar a Lumina' }).click();

  await expect(page.getByText('Porto', { exact: true })).toBeVisible();
  const background = await page.locator('.lumina-one').evaluate(node => getComputedStyle(node).backgroundImage);
  expect(background).not.toBe('none');
});
