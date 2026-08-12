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

test('mensagens chegam à conversa por SSE sem esperar pelo polling antigo', async ({ page, request }) => {
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
  await conversation.click();
  await expect(page.getByText('@' + callerHandle)).toBeVisible();

  const body = `Mensagem realtime ${Date.now()}`;
  const startedAt = Date.now();
  const messageResponse = await request.post(`/api/messages/threads/${thread.id}/messages`, {
    headers:authHeaders,
    data:{ kind:'text', mode:'normal', body, palette:0 },
  });
  expect(messageResponse.status()).toBe(201);

  await expect(page.getByText(body, { exact:true })).toBeVisible({ timeout:2500 });
  expect(Date.now() - startedAt).toBeLessThan(3000);
});
