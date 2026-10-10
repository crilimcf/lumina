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

test('falha temporária do auth/me é reavaliada sem intervenção do utilizador', async ({ page }) => {
  let probes = 0;
  await page.route('**/api/auth/me', route => {
    probes++;
    return route.fulfill({ status:503, contentType:'application/json', body:'{"error":"temporary"}' });
  });
  await page.goto('/');
  await expect(page.locator('.lumina-auth form')).toBeVisible({timeout:20_000});
  // Boot performs one session request. The notification probe retries after
  // its 5s backoff instead of becoming permanently disconnected on a 503.
  await expect.poll(() => probes, {timeout:15_000}).toBeGreaterThanOrEqual(3);
});
