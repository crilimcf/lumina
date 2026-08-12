import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function register(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `onev2scope${suffix}`.slice(0, 22);
  await page.route('**/api/radar?limit=8', async route => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[
      { id:'scope-radar-1', type:'news', title:'Descoberta para ti', summary:'Radar global', external_url:'https://example.com/scope', region:'Bragança' },
    ] }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina Scope Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  await page.getByRole('button', { name:'Abrir Lumina One' }).click();
}

test('Pulso v2 mostra Radar em Para ti, esconde em Amigos e recupera ao voltar', async ({ page }) => {
  await register(page);
  const seed = page.locator('.one-v2-pulse-seed');
  await expect(seed).toBeVisible();
  await expect(seed).toContainText('Descoberta para ti');

  await page.locator('.one-segment button').filter({ hasText:'Amigos' }).click();
  await expect(seed).toBeHidden();
  await expect(page.getByText('O teu círculo ainda está silencioso')).toBeVisible();

  await page.locator('.one-segment button').filter({ hasText:'Para ti' }).click();
  await expect(seed).toBeVisible();
  await expect(page.getByText('O teu círculo ainda está silencioso')).toBeHidden();
});
