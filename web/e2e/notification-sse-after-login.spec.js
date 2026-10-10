import { test, expect } from '@playwright/test';

test('canal SSE de notificações inicia logo após criar sessão', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout:20_000 });
  const suffix = String(Date.now()) + String(Math.floor(Math.random() * 1000));
  const handle = ('ssestart' + suffix).slice(0,22);
  await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByPlaceholder('Como te chamas').fill('Realtime QA');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(handle + '@example.test');
  await page.getByPlaceholder('Password').fill('lumina-realtime-12345');
  await page.locator('input[type="checkbox"]').check();
  const connected = page.waitForResponse(response =>
    response.url().includes('/api/notifications/events') && response.status() === 200,
    { timeout:20_000 }
  );
  await page.getByRole('button',{name:'Criar conta'}).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible({ timeout:20_000 });
  await connected;
});
