import { test, expect } from '@playwright/test';

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGjB0AANsBA/0X8GkAAAAASUVORK5CYII=';

const me = {
  id:'11111111-1111-4111-8111-111111111111',
  handle:'photoqa',
  name:'Photo QA',
  bio:'',
  palette:0,
  avatar_url:null,
  stars:[],
  created_at:new Date().toISOString(),
  session_version:1,
  csrf:'photo-csrf',
};

const friend = {
  id:'22222222-2222-4222-8222-222222222222',
  name:'Amigo Foto',
  handle:'amigofoto',
  palette:1,
  avatar_url:null,
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) });
}

async function mockSession(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'EventSource', { value:undefined, configurable:true });
    Object.defineProperty(navigator, 'canShare', {
      configurable:true,
      value:payload => Array.isArray(payload?.files) && payload.files.length === 1,
    });
    Object.defineProperty(navigator, 'share', {
      configurable:true,
      value:async payload => {
        const file = payload.files?.[0];
        window.__luminaPhotoShare = file ? { name:file.name, type:file.type, size:file.size } : null;
      },
    });
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
    if (path === '/api/messages/threads' && method === 'GET') return json(route, [{
      id:'thread-photo', other_id:friend.id, name:friend.name, handle:friend.handle,
      palette:friend.palette, avatar_url:null, body:'📷 Fotografia', unread:0,
    }]);
    if (path === '/api/messages/threads/thread-photo/messages') return json(route, [{
      id:'message-photo', thread_id:'thread-photo', sender_id:friend.id,
      kind:'media', mode:'normal', media_type:'image', media_url:PHOTO,
      created_at:new Date().toISOString(), delivered_at:new Date().toISOString(), read_at:new Date().toISOString(),
    }]);
    if (path === '/api/messages/delivered') return json(route, {});
    if (path === '/api/users/me/followers' || path === '/api/users/me/following') return json(route, []);
    if (path === '/api/calls/incoming') return json(route, null);

    return json(route, {});
  });
}

test('received chat photo opens full-screen and can be sent to the iPhone save sheet', async ({ browser }) => {
  const context = await browser.newContext({ locale:'pt-PT', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await mockSession(page);

  await page.goto('/');
  await expect(page.getByRole('button', { name:'Entrar no Feed' })).toBeVisible({ timeout:9000 });
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  await page.getByRole('button', { name:'Conversas' }).click();
  await page.getByRole('button', { name:'Abrir conversa com Amigo Foto' }).click();

  const thumbnail = page.getByRole('button', { name:'Abrir fotografia' });
  await expect(thumbnail).toBeVisible();
  await thumbnail.click();

  const viewer = page.locator('[data-lumina-photo-viewer="true"]');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img')).toBeVisible();

  const bounds = await viewer.locator('img').evaluate(image => {
    const rect = image.getBoundingClientRect();
    return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(390);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(844);

  const save = viewer.getByRole('button', { name:'Guardar' });
  await expect(save).toBeEnabled({ timeout:5000 });
  await save.click();

  await expect.poll(() => page.evaluate(() => window.__luminaPhotoShare)).toMatchObject({
    type:'image/png',
  });
  const shared = await page.evaluate(() => window.__luminaPhotoShare);
  expect(shared.name).toMatch(/\.png$/);
  expect(shared.size).toBeGreaterThan(0);

  await viewer.getByRole('button', { name:'Fechar' }).click();
  await expect(viewer).toBeHidden();
  await context.close();
});
