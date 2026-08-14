import { test, expect } from '@playwright/test';

const me = {
  id:'11111111-1111-4111-8111-111111111111',
  handle:'mobileqa',
  name:'Mobile QA',
  bio:'',
  palette:0,
  avatar_url:null,
  stars:[],
  created_at:new Date().toISOString(),
  session_version:1,
  csrf:'mobile-csrf',
};

const thread = {
  id:'thread-1',
  other_id:'22222222-2222-4222-8222-222222222222',
  name:'Bruno Fernandes',
  handle:'carrisso',
  palette:1,
  avatar_url:null,
  body:'Ou',
  unread:0,
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) });
}

async function mockMobileSession(page) {
  await page.addInitScript(() => {
    // Use the polling fallback so this layout test never holds an EventSource open.
    Object.defineProperty(window, 'EventSource', { value:undefined, configurable:true });
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/api/auth/me') return json(route, me);
    if (path === '/api/posts/feed') return json(route, { posts:[] });
    if (path === '/api/moments') return json(route, []);
    if (path === '/api/notifications/unread-count') return json(route, { count:0 });
    if (path === '/api/messages/threads' && method === 'GET') return json(route, [thread]);
    if (path === '/api/messages/threads/thread-1/messages') return json(route, [
      { id:'message-1', thread_id:'thread-1', sender_id:me.id, body:'Ou', kind:'text', mode:'normal', created_at:new Date().toISOString() },
    ]);
    if (path === '/api/messages/delivered') return json(route, {});
    if (path === '/api/users/me/followers' || path === '/api/users/me/following') return json(route, []);
    if (path === '/api/calls/incoming') return json(route, null);

    return json(route, method === 'GET' ? {} : {});
  });
}

test('iPhone chat stays inside the visual viewport when the keyboard reduces height', async ({ browser }) => {
  const context = await browser.newContext({ locale:'pt-PT', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await mockMobileSession(page);

  await page.goto('/');
  await expect(page.getByRole('button', { name:'Entrar no Feed' })).toBeVisible({ timeout:9000 });
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  await page.getByRole('button', { name:'Conversas' }).click();
  await expect(page.getByRole('button', { name:'Abrir conversa com Bruno Fernandes' })).toBeVisible();
  await page.getByRole('button', { name:'Abrir conversa com Bruno Fernandes' }).click();

  await expect(page.locator('.lumina-messages-thread')).toBeVisible();
  await expect(page.getByPlaceholder('Escrever…')).toBeVisible();

  // Approximate the usable visual viewport after the iOS keyboard opens.
  await page.setViewportSize({ width:390, height:500 });
  await page.getByPlaceholder('Escrever…').focus();
  await page.waitForTimeout(100);

  const layout = await page.evaluate(() => {
    const root = document.querySelector('.lumina-messages-thread');
    const composer = document.querySelector('.messages-composer-shell');
    const input = document.querySelector('.messages-composer-input');
    const chips = [...document.querySelectorAll('.messages-mode-chip')];
    const rootRect = root.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    return {
      width:window.innerWidth,
      htmlScrollWidth:document.documentElement.scrollWidth,
      root:{ left:rootRect.left, right:rootRect.right, width:rootRect.width, top:rootRect.top, bottom:rootRect.bottom },
      composer:{ left:composerRect.left, right:composerRect.right, bottom:composerRect.bottom },
      inputFont:getComputedStyle(input).fontSize,
      chips:chips.map(chip => {
        const rect = chip.getBoundingClientRect();
        return { left:rect.left, right:rect.right, width:rect.width };
      }),
    };
  });

  expect(layout.htmlScrollWidth - layout.width).toBeLessThanOrEqual(1);
  expect(layout.root.left).toBeGreaterThanOrEqual(-1);
  expect(layout.root.right).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.root.width).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.composer.left).toBeGreaterThanOrEqual(-1);
  expect(layout.composer.right).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.composer.bottom).toBeLessThanOrEqual(501);
  expect(layout.inputFont).toBe('16px');
  for (const chip of layout.chips) {
    expect(chip.left).toBeGreaterThanOrEqual(-1);
    expect(chip.right).toBeLessThanOrEqual(layout.width + 1);
    expect(chip.width).toBeGreaterThan(70);
  }

  await context.close();
});
