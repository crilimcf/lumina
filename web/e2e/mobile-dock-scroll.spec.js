import { test, expect } from '@playwright/test';

test('dock inferior preserva centragem e esconde de facto ao deslizar no iPhone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout:20_000 });

  await page.evaluate(() => {
    const dock = document.createElement('nav');
    dock.className = 'nav';
    dock.setAttribute('aria-label', 'Navegação principal');
    dock.innerHTML = '<button class="nb" type="button">Feed</button>';
    document.body.append(dock);
    const container = document.createElement('div');
    container.id = 'dock-scroll-fixture';
    container.style.cssText = 'height:100px;overflow:auto';
    const content = document.createElement('div');
    content.style.height = '800px';
    container.append(content);
    document.body.append(container);
    container.scrollTop = 0;
    container.dispatchEvent(new Event('scroll'));
  });
  const dock = page.locator('nav.nav');
  await expect(dock).toBeVisible();
  const initial = await dock.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {center:rect.left + rect.width / 2, viewport:window.innerWidth / 2};
  });
  expect(Math.abs(initial.center - initial.viewport)).toBeLessThan(2);

  await page.evaluate(() => {
    const el = document.querySelector('#dock-scroll-fixture');
    el.scrollTop = 150;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(dock).toHaveClass(/nav-smart-hidden/);
  await expect(dock).toHaveCSS('pointer-events','none');

  await page.evaluate(() => {
    const el = document.querySelector('#dock-scroll-fixture');
    el.scrollTop = 20;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(dock).not.toHaveClass(/nav-smart-hidden/);
  await expect(dock).toHaveCSS('pointer-events','auto');
  await expect(dock).toBeVisible();

  // Radar and other long screens must never leave the main navigation
  // permanently inaccessible if the reader stops scrolling.
  await page.evaluate(() => {
    const el = document.querySelector('#dock-scroll-fixture');
    el.scrollTop = 180;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(dock).toHaveClass(/nav-smart-hidden/);
  await expect(dock).toHaveClass(/nav-smart-hidden/);
  await expect(dock).not.toHaveClass(/nav-smart-hidden/, { timeout:4_000 });
});

test('dock móvel respeita reduzir movimento', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.evaluate(() => {
    const nav = document.createElement('nav');
    nav.className = 'nav';
    document.body.append(nav);
  });
  await expect(page.locator('.nav')).toHaveCSS('transition-duration', '0s');
});
