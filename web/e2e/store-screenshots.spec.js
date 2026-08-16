import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.skip(process.env.CAPTURE_STORE_SCREENSHOTS !== '1', 'Executado apenas pelo job de assets das lojas');

const me = {
  id:'11111111-1111-4111-8111-111111111111',
  handle:'lumina.demo',
  name:'Marta Lumina',
  bio:'Momentos, pessoas e descobertas num só lugar.',
  palette:1,
  avatar_url:null,
  stars:['fotografia', 'viagens', 'música'],
  created_at:'2026-01-10T10:00:00.000Z',
  session_version:1,
  csrf:'store-screenshot-csrf',
};

const post = {
  id:'22222222-2222-4222-8222-222222222222',
  author_id:'33333333-3333-4333-8333-333333333333',
  name:'Inês Martins',
  handle:'ines.martins',
  author_palette:3,
  author_avatar_url:null,
  body:'A luz de Lisboa ao fim da tarde ✨ Que lugar queres descobrir hoje?',
  media_url:'/lumina-orbit-ios-v2.png',
  media_mime:'image/png',
  likes:128,
  fires:34,
  comments:12,
  reposts:9,
  my_reactions:['like'],
  created_at:new Date(Date.now() - 4 * 60_000).toISOString(),
};

const thread = {
  id:'44444444-4444-4444-8444-444444444444',
  other_id:'55555555-5555-4555-8555-555555555555',
  name:'Miguel Costa',
  handle:'miguel.costa',
  palette:2,
  avatar_url:null,
  body:'Encontramo-nos na sala às 21h?',
  unread:2,
  created_at:new Date(Date.now() - 9 * 60_000).toISOString(),
};

const room = {
  id:'66666666-6666-4666-8666-666666666666',
  creator_id:'77777777-7777-4777-8777-777777777777',
  creator_handle:'viajantes.pt',
  name:'Lisboa Secreta',
  topic:'Ideias, miradouros e música para esta noite',
  description:'Uma conversa em tempo real para descobrir a cidade com contexto.',
  visibility:'public',
  billing_state:'active',
  joined:false,
  member_count:184,
  image_url:null,
};

const radar = {
  items:[
    {
      id:'88888888-8888-4888-8888-888888888888',
      type:'event',
      title:'Lisboa recebe uma noite de arte e música ao ar livre',
      summary:'Agenda verificada, contexto local e ligações para a fonte original.',
      source_name:'Agenda Cultural Lisboa',
      published_at:'2026-08-16T12:00:00.000Z',
      starts_at:'2026-08-16T20:30:00.000Z',
      sponsored:false,
    },
    {
      id:'99999999-9999-4999-8999-999999999999',
      type:'news',
      title:'Novos espaços criativos abrem portas no centro da cidade',
      summary:'Uma seleção editorial com fontes identificadas.',
      source_name:'RTP Notícias',
      published_at:'2026-08-16T10:00:00.000Z',
      sponsored:false,
    },
  ],
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) });
}

async function mockStoreSession(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('lumina-push-later', '1');
    Object.defineProperty(window, 'EventSource', { value:undefined, configurable:true });
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === '/api/auth/me') return json(route, me);
    if (path === '/api/posts/feed') return json(route, { posts:[post] });
    if (path === '/api/moments') return json(route, []);
    if (path === '/api/live') return json(route, []);
    if (path === '/api/notifications/unread-count') return json(route, { count:2 });
    if (path === '/api/messages/threads' && method === 'GET') return json(route, [thread]);
    if (path === `/api/messages/threads/${thread.id}/messages`) return json(route, []);
    if (path === '/api/messages/delivered') return json(route, {});
    if (path === '/api/users/me/followers' || path === '/api/users/me/following') return json(route, []);
    if (path === '/api/users/me/suggestions') return json(route, []);
    if (path === '/api/users/me/blocked') return json(route, []);
    if (path === '/api/account/delete') return json(route, { scheduled:false, executeAt:null });
    if (path === '/api/rooms' && method === 'GET') return json(route, [room]);
    if (path === '/api/radar' && method === 'GET') return json(route, radar);
    if (path === '/api/calls/incoming') return json(route, null);
    if (path === '/api/notifications/push/status') return json(route, { subscribed:true, devices:1 });
    return json(route, method === 'GET' ? [] : {});
  });
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(350);
}

async function captureDevice(browser, output, contextOptions) {
  const context = await browser.newContext({
    locale:'pt-PT',
    isMobile:true,
    hasTouch:true,
    colorScheme:'dark',
    ...contextOptions,
  });
  const page = await context.newPage();
  await mockStoreSession(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name:'Entrar no Feed' })).toBeVisible({ timeout:10_000 });
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name:'Novo' })).toBeVisible();

  const shot = async (name) => {
    await settle(page);
    await page.screenshot({ path:`${output}/${name}.png`, animations:'disabled' });
  };

  await shot('01-feed');
  await page.getByRole('button', { name:'Salas', exact:true }).click();
  await expect(page.getByRole('heading', { name:/Salas/i })).toBeVisible();
  await shot('02-salas');
  await page.getByRole('button', { name:'Radar', exact:true }).click();
  await expect(page.getByRole('heading', { name:/Radar/i })).toBeVisible();
  await shot('03-radar');
  await page.getByRole('button', { name:'Conversas', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Conversas' })).toBeVisible();
  await shot('04-conversas');
  await page.getByRole('button', { name:'Perfil' }).first().click();
  await expect(page.getByText('@lumina.demo')).toBeVisible();
  await shot('05-perfil');
  await context.close();
}

test('gera screenshots determinísticos para App Store e Google Play', async ({ browser }) => {
  const root = '../mobile/store-assets/screenshots';
  await fs.mkdir(`${root}/iphone-6.7`, { recursive:true });
  await fs.mkdir(`${root}/android-phone`, { recursive:true });

  await captureDevice(browser, `${root}/iphone-6.7`, {
    viewport:{ width:430, height:932 },
    screen:{ width:430, height:932 },
    deviceScaleFactor:3,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
  });
  await captureDevice(browser, `${root}/android-phone`, {
    viewport:{ width:360, height:640 },
    screen:{ width:360, height:640 },
    deviceScaleFactor:3,
    userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36',
  });
});
