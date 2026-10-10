import { test, expect } from '@playwright/test';

test('Midnight Air e Pulse mantêm ações com área de toque >=44px no Safari', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout:20_000 });
  const measurements = await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.className = 'lumina-facelift';
    fixture.style.cssText = 'position:fixed;bottom:0;left:0;';
    fixture.innerHTML = '<button type="button" class="top-action" aria-label="Alertas">A</button><button type="button" class="lumina-search-button" aria-label="Pesquisar">B</button>';
    document.body.appendChild(fixture);
    const results = {};
    for (const identity of ['midnight', 'air', 'pulse']) {
      document.body.dataset.luminaIdentity = identity;
      const nodes = [...fixture.querySelectorAll('button')];
      results[identity] = {
        touch: nodes.map(node => {
          const rect = node.getBoundingClientRect();
          return [rect.width, rect.height];
        }),
        focusColor: getComputedStyle(document.body).getPropertyValue('--lumina-focus-color').trim(),
      };
    }
    fixture.remove();
    return results;
  });
  for (const identity of ['midnight', 'air', 'pulse']) {
    for (const [width, height] of measurements[identity].touch) {
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
    expect(measurements[identity].focusColor).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(measurements.air.focusColor).not.toBe(measurements.midnight.focusColor);
  expect(measurements.pulse.focusColor).not.toBe(measurements.midnight.focusColor);
});
