import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-call-webkit-1234';

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

test('chamada iniciada chega ao destinatário visível em Mobile Safari e fica observável', async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random()*1000)}`;
  const callerHandle = `callera${suffix}`.slice(0,22);
  const calleeHandle = `calleeb${suffix}`.slice(0,22);

  const callerResponse = await request.post('/api/auth/register', { data:registration(callerHandle,'Caller WebKit') });
  expect(callerResponse.status()).toBe(201);
  const caller = await callerResponse.json();
  expect(caller.token).toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Callee WebKit');
  await page.getByPlaceholder('Nome de utilizador').fill(calleeHandle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${calleeHandle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();

  const callee = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials:'include', cache:'no-store' });
    return response.json();
  });
  expect(callee.id).toBeTruthy();

  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Ir para o Feed' }).click();
  await expect(page.getByRole('button', { name:'Novo' })).toBeVisible();

  const authHeaders = { authorization:`Bearer ${caller.token}` };
  const threadResponse = await request.post('/api/messages/threads', {
    headers:authHeaders,
    data:{ userId:callee.id },
  });
  expect(threadResponse.status()).toBe(201);
  const thread = await threadResponse.json();

  const callResponse = await request.post('/api/calls', {
    headers:authHeaders,
    data:{ threadId:thread.id, mode:'audio' },
  });
  expect(callResponse.status()).toBe(201);
  const call = await callResponse.json();
  expect(call.callee_push_ready).toBe(false);
  expect(call.push_attempted).toBe(0);
  expect(call.push_accepted).toBe(0);

  const incoming = page.getByRole('dialog', { name:'Chamada recebida de Caller WebKit' });
  await expect(incoming).toBeVisible({ timeout:5000 });
  await expect(page.getByText('Chamada áudio recebida')).toBeVisible();

  await expect.poll(async () => {
    const response = await request.get(`/api/calls/${call.id}/sync?after=0`, { headers:authHeaders });
    if (!response.ok()) return null;
    return (await response.json()).calleeSeenAt || null;
  }, { timeout:5000 }).not.toBeNull();

  await page.getByRole('button', { name:'Recusar chamada' }).click();
  await expect(incoming).toBeHidden();

  await expect.poll(async () => {
    const response = await request.get(`/api/calls/${call.id}/sync?after=0`, { headers:authHeaders });
    return response.ok() ? (await response.json()).status : 'error';
  }).toBe('declined');
});
