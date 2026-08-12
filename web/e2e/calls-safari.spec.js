import { test, expect } from '@playwright/test';
import { callCopy } from '../src/components/calls/callCopy.js';
import { preferCallReceiver, prepareCallAudioSession, resetCallAudioSession } from '../src/components/calls/audioSession.js';

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

test('copy de chamada é neutro ao dispositivo e a sessão de áudio usa modo de chamada', () => {
  const copy = Object.values(callCopy).join(' ');
  expect(copy).not.toContain('iPhone');
  expect(copy).not.toContain('outro amigo');
  expect(callCopy.waiting).toContain('outro dispositivo');

  const history = [];
  const audioSession = {};
  Object.defineProperty(audioSession, 'type', {
    configurable:true,
    get:() => history.at(-1) || 'auto',
    set:value => history.push(value),
  });
  const fakeNavigator = { audioSession };

  expect(prepareCallAudioSession(fakeNavigator)).toBe(true);
  expect(preferCallReceiver(fakeNavigator)).toBe(true);
  expect(resetCallAudioSession(fakeNavigator)).toBe(true);
  expect(history).toEqual(['auto', 'play-and-record', 'playback', 'auto']);
});

test('chamada aberta pelo deep-link do push chega ao destinatário em Mobile Safari', async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random()*1000)}`;
  const callerHandle = `callera${suffix}`.slice(0,22);
  const calleeHandle = `calleeb${suffix}`.slice(0,22);

  const callerResponse = await request.post('/api/auth/register', { data:registration(callerHandle,'Caller WebKit') });
  expect(callerResponse.status()).toBe(201);
  const caller = await callerResponse.json();
  expect(caller.token).toBeTruthy();
  expect(caller.csrf).toBeTruthy();

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
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name:'Novo' })).toBeVisible();

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

  const callResponse = await request.post('/api/calls', {
    headers:authHeaders,
    data:{ threadId:thread.id, mode:'audio' },
  });
  expect(callResponse.status()).toBe(201);
  const call = await callResponse.json();
  expect(call.callee_push_ready).toBe(false);
  expect(call.push_attempted).toBe(0);
  expect(call.push_accepted).toBe(0);

  // Simula o toque numa notificação Web Push depois de a PWA ter estado fora
  // do ecrã: a sessão persiste e o deep-link deve recuperar a chamada pendente.
  await page.goto(`/?tab=dms&call=${encodeURIComponent(call.id)}`);
  await expect(page).toHaveURL(/tab=dms/);

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
