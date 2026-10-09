import { test, expect } from '@playwright/test';

// Guard against the regression where a stale SPA entrypoint receives HTML
// instead of its Vite module and Safari displays a completely blank screen.
test('a missing entrypoint shows a recoverable screen on iPhone', async ({ page }) => {
  const brokenModule = async (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body>Stale SPA fallback</body></html>',
  });

  await page.route('**/src/main.jsx*', brokenModule);
  await page.route('**/assets/index-*.js*', brokenModule);

  await page.goto('/');
  const recovery = page.locator('#root .lumina-boot-recovery');
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  await expect(recovery.getByRole('button', { name: /Tentar novamente|Try again|Réessayer|Reintentar/ })).toBeVisible();
  await expect(recovery).toContainText('Lumina');
});

test('normal startup renders real UI without a white screen', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"error":"Unauthenticated"}',
  }));
  await page.goto('/');
  await expect.poll(
    () => page.locator('#root').evaluate(el => el.childElementCount),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);
  await expect(page.locator('.lumina-boot-recovery')).toHaveCount(0);
});
