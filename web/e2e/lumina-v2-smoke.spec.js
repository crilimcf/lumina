import { test, expect } from '@playwright/test';

test('Lumina 2.0 boots on iPhone WebKit without a blank screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/lumina-v2/);
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.lumina-auth h1')).toContainText('Lumina');
});

test('Lumina 2.0 remains accessible with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/lumina-v2/);
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout: 20_000 });
});
