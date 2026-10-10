import { test, expect } from '@playwright/test';

test('legendas existentes da Lumina mantêm dimensão legível em iPhone pequeno', async ({page}) => {
  await page.setViewportSize({width:320,height:700});
  await page.goto('/');
  await expect(page.locator('.lumina-auth form')).toBeVisible({timeout:20_000});

  const measured = await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'readable-mobile-fixture';
    fixture.style.cssText = 'width:280px;max-width:100%;position:relative;';
    fixture.innerHTML = `
      <div class="one-v3-feed-entry one-adventure-entry">
        <div class="one-adventure-copy">
          <small>Explorar</small><b>Nova aventura</b><em>Encontra novas pessoas</em>
        </div>
        <span class="one-adventure-prompt-pill">Descobrir</span>
        <span class="one-adventure-status">Disponível agora</span>
      </div>
      <div class="lumina-feed-switch"><button type="button">Feed</button><span class="lumina-switch-hint">Mais opções</span></div>
      <div class="lumina-v3-empty"><div class="lumina-v3-empty-kicker">A explorar</div></div>
    `;
    document.body.append(fixture);
    const css = selector => {
      const element = fixture.querySelector(selector);
      const style = getComputedStyle(element);
      return {font:parseFloat(style.fontSize), height:element.getBoundingClientRect().height};
    };
    const sizes = {
      kicker:css('.one-adventure-copy small'),
      caption:css('.one-adventure-copy em'),
      pill:css('.one-adventure-prompt-pill'),
      status:css('.one-adventure-status'),
      hint:css('.lumina-switch-hint'),
      empty:css('.lumina-v3-empty-kicker'),
      switch:css('.lumina-feed-switch button'),
    };
    fixture.remove();
    return {...sizes,overflow:document.documentElement.scrollWidth-window.innerWidth};
  });
  expect(measured.kicker.font).toBeGreaterThanOrEqual(11);
  expect(measured.caption.font).toBeGreaterThanOrEqual(11);
  expect(measured.pill.font).toBeGreaterThanOrEqual(11);
  expect(measured.status.font).toBeGreaterThanOrEqual(11);
  expect(measured.hint.font).toBeGreaterThanOrEqual(11);
  expect(measured.empty.font).toBeGreaterThanOrEqual(11);
  expect(measured.switch.height).toBeGreaterThanOrEqual(44);
  expect(measured.overflow).toBeLessThanOrEqual(1);
});
