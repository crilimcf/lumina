import { test, expect } from '@playwright/test';

test('tema Air mantém contraste legível no cartão real de Salas', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lumina-identity-v1','air'));
  await page.goto('/');
  const values = await page.evaluate(() => {
    document.body.classList.add('lumina-v2');
    document.body.dataset.luminaIdentity = 'air';
    const article = document.createElement('article');
    article.className = 'card in room-card';
    article.innerHTML = `
      <button type="button" style="width:100%;background:transparent;color:inherit">
        <div style="position:relative;background:linear-gradient(135deg,#1b1038,#674cff);height:190px">
          <div style="position:absolute;inset:0"></div>
          <div style="position:absolute;left:15px;right:70px;bottom:14px;color:#fff">
            <div style="opacity:.75"> @viajantes.pt </div>
            <div class="d">Lisboa Secreta</div>
          </div>
        </div>
        <div style="padding:15px">
          <div>Tema da sala</div>
          <div style="color:var(--grey)">Uma conversa em tempo real</div>
          <div class="p p-brand">Juntar-me</div>
        </div>
      </button>`;
    document.body.appendChild(article);
    const cover = article.querySelector('.room-card > button > div:first-child .d');
    const topic = article.querySelector('.room-card > button > div:last-child > div:first-child');
    const summary = article.querySelector('.room-card > button > div:last-child > div:nth-child(2)');
    const css = [cover,topic,summary].map(node => ({
      color:getComputedStyle(node).color,
      fill:getComputedStyle(node).webkitTextFillColor,
      visible:node.getBoundingClientRect().width > 0,
    }));
    article.remove();
    return css;
  });
  expect(values.every(x => x.visible)).toBe(true);
  expect(values[0].color).toBe('rgb(255, 255, 255)');
  expect(values[0].fill).toBe('rgb(255, 255, 255)');
  expect(values[1].color).toBe('rgb(25, 44, 74)');
  expect(values[2].color).toBe('rgb(82, 100, 127)');
});
