import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-realtime-webkit-1234';

function registration(handle, name) {
  return {
    handle,
    email:`${handle}@example.test`,
    password:PASSWORD,
    name,
    birthDate:'1990-01-01',
    acceptTerms:true,
  };
}

test('mensagens chegam por SSE, reações fecham fora e compositor acompanha o teclado no Safari', async ({ page, request }) => {
  await page.addInitScript(() => {
    const state = {
      width:window.innerWidth,
      height:window.innerHeight,
      offsetTop:0,
      offsetLeft:0,
    };
    const events = new EventTarget();
    const fakeViewport = {
      get width() { return state.width; },
      get height() { return state.height; },
      get offsetTop() { return state.offsetTop; },
      get offsetLeft() { return state.offsetLeft; },
      get pageTop() { return state.offsetTop; },
      get pageLeft() { return state.offsetLeft; },
      get scale() { return 1; },
      addEventListener(...args) { events.addEventListener(...args); },
      removeEventListener(...args) { events.removeEventListener(...args); },
    };
    try {
      Object.defineProperty(window, 'visualViewport', { configurable:true, value:fakeViewport });
      window.__luminaTestVisualViewport = (next) => {
        Object.assign(state, next || {});
        events.dispatchEvent(new Event('resize'));
        events.dispatchEvent(new Event('scroll'));
      };
    } catch {
      window.__luminaTestVisualViewport = null;
    }
  });

  const suffix = `${Date.now()}${Math.floor(Math.random()*1000)}`;
  const callerHandle = `rtcall${suffix}`.slice(0,22);
  const calleeHandle = `rtrecv${suffix}`.slice(0,22);

  const callerResponse = await request.post('/api/auth/register', {
    data:registration(callerHandle, 'Caller Realtime'),
  });
  expect(callerResponse.status()).toBe(201);
  const caller = await callerResponse.json();

  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Receiver Realtime');
  await page.getByPlaceholder('Nome de utilizador').fill(calleeHandle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${calleeHandle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();

  const realtimeConnected = page.waitForResponse(response =>
    response.url().includes('/api/messages/events') && response.status() === 200
  );
  await page.getByRole('button', { name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await realtimeConnected;

  const callee = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials:'include', cache:'no-store' });
    return response.json();
  });
  expect(callee.id).toBeTruthy();

  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  await page.getByRole('button', { name:'Conversas' }).click();
  await expect(page.getByRole('heading', { name:/Conversas/i })).toBeVisible();

  const authHeaders = {
    authorization:`Bearer ${caller.token}`,
    'x-csrf-token':caller.csrf,
  };
  const threadResponse = await request.post('/api/messages/threads', {
    headers:authHeaders,
    data:{ userId:callee.id },
  });
  expect(threadResponse.status()).toBe(201);
  const thread = await threadResponse.json();

  const conversation = page.getByRole('button', { name:'Abrir conversa com Caller Realtime' });
  await expect(conversation).toBeVisible({ timeout:2500 });
  await expect(conversation.getByRole('img', { name:'Online' })).toBeVisible();
  await conversation.click();
  await expect(page.getByText('@' + callerHandle)).toBeVisible();
  await expect(page.locator('.messages-thread-header').getByRole('img', { name:'Online' })).toBeVisible();

  const body = `Mensagem realtime ${Date.now()}`;
  const startedAt = Date.now();
  const messageResponse = await request.post(`/api/messages/threads/${thread.id}/messages`, {
    headers:authHeaders,
    data:{ kind:'text', mode:'normal', body, palette:0 },
  });
  expect(messageResponse.status()).toBe(201);
  const createdMessage = await messageResponse.json();

  await expect(page.getByText(body, { exact:true })).toBeVisible({ timeout:2500 });
  expect(Date.now() - startedAt).toBeLessThan(3000);

  const received = page.locator('.message-wrap-theirs').filter({ hasText:body });
  await expect(received).toBeVisible();
  await received.getByRole('button', { name:'Reagir à mensagem' }).click();
  await expect(received.locator('.message-reaction-tray')).toBeVisible();
  await page.locator('.messages-thread-header').click();
  await expect(received.locator('.message-reaction-tray')).toBeHidden();

  await received.getByRole('button', { name:'Reagir à mensagem' }).click();
  await expect(received.locator('.message-reaction-tray')).toBeVisible();
  const reactionResponse = page.waitForResponse(response =>
    response.url().includes(`/api/messages/${createdMessage.id}/reaction`)
      && response.request().method() === 'POST'
      && response.status() === 200
  );
  await received.getByRole('menuitem', { name:'❤️' }).click();
  await reactionResponse;
  await expect(received.locator('.message-reaction-pill')).toContainText('❤️');
  await expect(received.locator('.message-reaction-pill')).toContainText('1');

  const canMockViewport = await page.evaluate(() => typeof window.__luminaTestVisualViewport === 'function');
  if (canMockViewport) {
    await page.evaluate(() => window.__luminaTestVisualViewport({ height:430, offsetTop:64 }));
    const threadFrame = page.locator('.lumina-messages-thread.messages-visual-viewport');
    await expect.poll(() => threadFrame.evaluate(element => ({
      top:element.style.top,
      height:element.style.height,
    }))).toEqual({ top:'64px', height:'430px' });

    const composerBox = await page.locator('.messages-composer-shell').boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox.y).toBeGreaterThanOrEqual(64);
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(495);
  }

  const composer = page.getByPlaceholder('Escrever…');
  const reply = `Resposta sem fechar teclado ${Date.now()}`;
  await composer.fill(reply);
  await expect(composer).toBeFocused();

  const replySent = page.waitForResponse(response =>
    response.url().includes(`/api/messages/threads/${thread.id}/messages`)
      && response.request().method() === 'POST'
      && response.status() === 201
  );
  await page.locator('.messages-composer-row .messages-send-button').click();
  await replySent;
  await expect(composer).toBeFocused();
  await expect(page.getByText(reply, { exact:true })).toBeVisible({ timeout:2500 });

  const scrollState = await page.evaluate(() => ({
    windowY:window.scrollY,
    threadTop:document.querySelector('.lumina-messages-thread')?.getBoundingClientRect().top,
  }));
  expect(scrollState.windowY).toBe(0);
  if (canMockViewport) expect(Math.round(scrollState.threadTop)).toBe(64);
});
