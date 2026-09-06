import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const manifests = [
  'manifest.webmanifest',
  'manifest-pt.webmanifest',
  'manifest-en.webmanifest',
  'manifest-fr.webmanifest',
  'manifest-es.webmanifest',
];

test('Android PWA publica o manifest e a identidade Lumina atuais', async ({ page, request }) => {
  await page.goto('/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toMatch(/^\/manifest-pt\.webmanifest\?v=3$/);

  const release = await page.locator('meta[name="lumina-ui-release"]').getAttribute('content');
  expect(release).toBe('android-pwa-push-2026-09-06');

  for (const file of manifests) {
    const manifest = JSON.parse(read('public', file));
    const sources = manifest.icons.map(icon => icon.src);
    expect(manifest.display).toBe('standalone');
    expect(sources).toContain('/lumina-icon-192-v3.png');
    expect(sources).toContain('/lumina-icon-512-v3.png');
    expect(sources).toContain('/lumina-icon-192-maskable-v3.png');
    expect(sources).toContain('/lumina-icon-512-maskable-v3.png');
    expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBeTruthy();
    expect(sources).not.toContain('/icon-192.png');
    expect(sources).not.toContain('/icon-512.png');
  }

  for (const asset of [
    '/lumina-icon-192-v3.png',
    '/lumina-icon-512-v3.png',
    '/lumina-icon-192-maskable-v3.png',
    '/lumina-icon-512-maskable-v3.png',
    '/lumina-badge-96-v3.png',
  ]) {
    const response = await request.get(asset);
    expect(response.ok(), asset).toBeTruthy();
    expect(response.headers()['content-type'] || '').toContain('image/png');
  }
});

test('Android pede permissão de notificações antes de esperar pelo service worker', async () => {
  const source = read('src', 'main.jsx');
  const start = source.indexOf('const registerPush = async');
  const end = source.indexOf('window.__luminaEnablePush', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const registerPush = source.slice(start, end);
  const permission = registerPush.indexOf('Notification.requestPermission()');
  const registration = registerPush.indexOf('const registration = await getRegistration()');
  expect(permission).toBeGreaterThanOrEqual(0);
  expect(registration).toBeGreaterThan(permission);

  expect(source).toContain('Ativa as notificações da Lumina neste dispositivo.');
  expect(source).not.toContain('Ativa as notificações da Lumina neste iPhone.');
});

test('notificações Android usam o ícone e badge Lumina atuais', async () => {
  const worker = read('public', 'sw.js');
  expect(worker).toContain("icon: '/lumina-icon-192-v3.png'");
  expect(worker).toContain("badge: '/lumina-badge-96-v3.png'");
  expect(worker).not.toContain("icon: '/icon-192.png'");
});
