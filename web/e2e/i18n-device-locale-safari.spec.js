import { test, expect } from '@playwright/test';

const me = {
  id:'22222222-2222-4222-8222-222222222222',
  handle:'angeleqa',
  name:'Angèle Paris',
  bio:'Bio française',
  palette:1,
  avatar_url:null,
  stars:[],
  created_at:new Date().toISOString(),
  session_version:1,
  csrf:'locale-csrf',
};

const json = (route, body, status = 200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) });

async function mockSession(page) {
  await page.addInitScript(() => {
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
    if (path === '/api/notifications') return json(route, { notifications:[] });
    if (path === '/api/messages/threads' && method === 'GET') return json(route, []);
    if (path === '/api/messages/delivered') return json(route, {});
    if (path === '/api/users/me/followers' || path === '/api/users/me/following' || path === '/api/users/suggestions' || path === '/api/users/blocked') return json(route, []);
    if (path === '/api/users/privacy') return json(route, { isPrivate:false });
    if (path === '/api/rooms' && method === 'GET') return json(route, []);
    if (path === '/api/calls/incoming') return json(route, null);
    if (path === '/api/one/preferences') return json(route, { boost_topics:[], mute_topics:[], context_mode:'auto', local_region:'' });
    if (path === '/api/one/capsules' || path === '/api/one/lumes') return json(route, []);
    if (path === '/api/one/pulse') return json(route, { items:[] });
    if (path === '/api/radar' && method === 'GET') return json(route, { items:[] });
    return json(route, {});
  });
}

test('French iPhone keeps opening and clarified Lumina One fully in French', async ({ browser }) => {
  const context = await browser.newContext({ locale:'fr-FR', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await mockSession(page);
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-FR');
  await expect(page.locator('body')).toContainText('Personnes dans le Fil.');
  await expect(page.locator('body')).toContainText('Sujets dans les Salons.');
  await expect(page.locator('body')).not.toContainText('Pessoas no');
  await expect(page.locator('body')).not.toContainText('Tópicos nas');

  await page.getByRole('button', { name:'Ouvrir le Fil' }).click();
  const entry = page.locator('.one-v3-feed-entry');
  await expect(entry).toBeVisible({ timeout:9000 });
  await entry.click();
  await expect(page.locator('.lumina-one')).toBeVisible();

  await expect(page.locator('.one-title-wrap')).toContainText('Tout est connecté.');
  await expect(page.locator('.one-title-wrap')).toContainText('Sans interruption.');
  await expect(page.locator('.one-title-wrap')).toContainText('chaque espace a un rôle clair');
  await expect(page.locator('.lumina-one')).not.toContainText('Tudo ligado.');
  await expect(page.locator('.lumina-one')).not.toContainText('Sem saltar.');

  const tabs = page.locator('.one-tabs button');
  await tabs.nth(0).click();
  await expect(page.locator('.one-pulse-intro')).toContainText('Des personnes et des moments. Pas des actualités.');
  await expect(page.locator('.one-pulse-page')).not.toContainText('Juntos');

  await tabs.nth(1).click();
  await expect(page.locator('.one-lumes-page')).toContainText('Maintenant. Une fois. Réel.');
  await expect(page.locator('.one-lumes-page')).toContainText('Les Lumes de tes amis');
  await expect(page.locator('.one-lumes-page')).not.toContainText('Agora. Uma vez.');

  await tabs.nth(2).click();
  await expect(page.locator('.one-capsules-page')).toContainText('Des souvenirs qui attendent.');
  await expect(page.locator('.one-capsules-page')).toContainText('Nouvelle Capsule');
  await expect(page.locator('.one-capsules-page')).not.toContainText('Memórias que');

  await tabs.nth(3).click();
  const settings = page.locator('.one-settings-card');
  await expect(settings).toContainText('Que veux-tu voir maintenant ?');
  await expect(settings).toContainText('Je veux en voir plus');
  await expect(settings).toContainText('Je veux en voir moins');
  await expect(settings).toContainText('Mode actuel');
  await expect(settings).toContainText('Localisation de l’iPhone');
  await expect(settings.getByRole('button', { name:'Appliquer maintenant' })).toBeVisible();
  await expect(settings.getByRole('button', { name:'Ouvrir Radar Local / Monde' })).toBeVisible();
  await expect(settings).not.toContainText('Onde estás / o que queres descobrir');
  await expect(page.locator('.one-v3-location')).toHaveCount(0);

  const map = await page.evaluate(async () => (await import('/src/locales/device-extra.js')).FR_DEVICE);
  expect(map['Perfil público']).toBe('Profil public');
  expect(map['Tornar privado']).toBe('Rendre privé');
  expect(map['Qualquer pessoa pode ver o teu perfil; o Feed mostra quem segues.']).toContain('Tout le monde peut voir ton profil');

  await context.close();
});
