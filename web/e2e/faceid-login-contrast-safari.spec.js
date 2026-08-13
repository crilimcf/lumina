import { test, expect } from '@playwright/test';

test('Face ID login button stays readable on Mobile Safari', async ({ page }) => {
  await page.addInitScript(() => {
    class FakePublicKeyCredential {}
    Object.defineProperty(window, 'PublicKeyCredential', { value:FakePublicKeyCredential, configurable:true });
    Object.defineProperty(navigator, 'credentials', { value:{ get:async()=>null, create:async()=>null }, configurable:true });
  });

  await page.goto('/');
  const button = page.getByRole('button', { name:/Entrar com Face ID|Entrar com biometria \/ PIN|Entrar com passkey/ });
  await expect(button).toBeVisible({ timeout:8000 });
  await expect(button.locator('span').filter({ hasText:/Entrar com/ }).last()).toBeVisible();

  const visual = await button.locator(':scope > span').evaluate(el => {
    const style = getComputedStyle(el);
    return { color:style.color, backgroundImage:style.backgroundImage, height:el.getBoundingClientRect().height };
  });
  expect(visual.color).toBe('rgb(255, 255, 255)');
  expect(visual.backgroundImage).toContain('linear-gradient');
  expect(visual.height).toBeGreaterThanOrEqual(50);
});
