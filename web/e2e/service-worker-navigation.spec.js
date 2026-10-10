import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://lumina.example.test';

async function openNotification(raw) {
  const handlers = new Map();
  const opened = [];
  const self = {
    location:{origin},
    navigator:{},
    addEventListener(type, fn) { handlers.set(type, fn); },
    clients:{
      matchAll:async () => [],
      openWindow:async url => { opened.push(url); return null; },
    },
  };
  runInNewContext(source, {self,URL,caches:{keys:async()=>[]},console}, {timeout:2000});
  const handler = handlers.get('notificationclick');
  expect(typeof handler).toBe('function');
  let pending;
  handler({
    notification:{data:{url:raw},close(){}},
    waitUntil(promise) {pending=promise;},
  });
  await pending;
  return opened;
}

test('notificação abre links internos válidos da Lumina', async () => {
  expect(await openNotification('/?tab=dms')).toEqual([`${origin}/?tab=dms`]);
  expect(await openNotification('/?tab=rooms')).toEqual([`${origin}/?tab=rooms`]);
});

test('notificações externas e URLs perigosos são neutralizados', async () => {
  for (const raw of ['https://evil.example/phishing', '//evil.example', 'javascript:alert(1)', 'data:text/html,test', 'http://lumina.example.test/login']) {
    expect(await openNotification(raw)).toEqual([`${origin}/?tab=alerts`]);
  }
  expect(await openNotification(undefined)).toEqual([`${origin}/?tab=alerts`]);
});
