import { test, expect } from '@playwright/test';

const me = {
  id:'11111111-1111-4111-8111-111111111111',
  handle:'brunoqa',
  name:'Bruno Fernandes',
  bio:'Bio écrite par l’utilisateur',
  palette:1,
  avatar_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%23d77"/%3E%3C/svg%3E',
  stars:[],
  created_at:new Date().toISOString(),
  session_version:1,
  csrf:'french-csrf',
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) });
}

async function mockFrenchSession(page) {
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
    if (path === '/api/radar' && method === 'GET') return json(route, {
      items:[{
        id:'radar-1',
        type:'news',
        title:'União de Leiria contrata belga Hugo Masaki',
        summary:'Este texto editorial permanece no idioma original da fonte.',
        source_name:'RTP Notícias · Desporto',
        published_at:'2026-08-14T10:00:00Z',
        sponsored:false,
      }],
    });
    if (path === '/api/2fa/status') return json(route, { enabled:false, codesLeft:0 });
    if (path === '/api/sessions') return json(route, []);

    return json(route, method === 'GET' ? {} : {});
  });
}

async function openAuthenticatedApp(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-FR');
  await expect(page.getByRole('button', { name:'Ouvrir le Fil' })).toBeVisible({ timeout:9000 });
  await page.getByRole('button', { name:'Ouvrir le Fil' }).click();
}

test('French iPhone UI has no Portuguese chrome across Feed, Rooms, Radar, Profile and publishing', async ({ browser }) => {
  const context = await browser.newContext({ locale:'fr-FR', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await mockFrenchSession(page);
  await openAuthenticatedApp(page);

  await expect(page.getByText('Ta lumière, tes connexions', { exact:true })).toBeVisible();
  await expect(page.locator('.lumina-feed-empty')).toContainText('Ton Fil est vide.');
  await expect(page.getByText('Les histoires des personnes qui font partie de ta lumière', { exact:true })).toBeVisible();
  await expect(page.getByText('Sua luz, suas conexões', { exact:true })).toHaveCount(0);

  await page.getByRole('button', { name:'Salons' }).click();
  await expect(page.getByText('Salons', { exact:true })).toBeVisible();
  await expect(page.getByText('Des sujets vivants, sans encombrer le Fil.', { exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'Créer' })).toBeVisible();
  await expect(page.getByText('Toutes', { exact:true })).toBeVisible();
  await expect(page.getByText('Publics', { exact:true })).toBeVisible();
  await expect(page.getByText('Privés', { exact:true })).toBeVisible();
  await expect(page.getByText('Confidentialité réelle.', { exact:true })).toBeVisible();
  await expect(page.getByText('Tópicos vivos, sem poluir o Feed.', { exact:true })).toHaveCount(0);

  await page.getByRole('button', { name:'Radar' }).click();
  await expect(page.getByText('Explorer maintenant', { exact:true })).toBeVisible();
  await expect(page.getByText('Découvrir avec du contexte, pas du bruit.', { exact:true })).toBeVisible();
  await expect(page.getByText('Actualités', { exact:true })).toBeVisible();
  await expect(page.getByText('Événements', { exact:true })).toBeVisible();
  await expect(page.getByText('Source vérifiée', { exact:true })).toBeVisible();
  // Publisher/editorial content is not UI chrome and must remain exactly as published.
  await expect(page.getByText('União de Leiria contrata belga Hugo Masaki', { exact:true })).toBeVisible();
  await expect(page.getByText('Este texto editorial permanece no idioma original da fonte.', { exact:true })).toBeVisible();
  await expect(page.getByText('Notícias', { exact:true })).toHaveCount(0);

  await page.getByRole('button', { name:'Profil' }).click();
  await expect(page.getByText('Sécurité et sessions', { exact:true })).toBeVisible();
  await expect(page.getByText('Protège ton compte et gère les appareils connectés.', { exact:true })).toBeVisible();
  await expect(page.getByText('Confidentialité', { exact:true })).toBeVisible();
  await expect(page.getByText('Se déconnecter de Lumina', { exact:true })).toBeVisible();
  await expect(page.getByText('Segurança e sessões', { exact:true })).toHaveCount(0);
  await expect(page.getByText('Bio écrite par l’utilisateur', { exact:true })).toBeVisible();

  await page.getByRole('button', { name:/Modifier le profil/i }).click();
  await expect(page.getByText('Modifier le profil', { exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'Choisir une photo de profil' })).toContainText('Changer la photo');
  await expect(page.getByText('Supprimer la photo', { exact:true })).toBeVisible();
  await expect(page.getByText('Nom', { exact:true })).toBeVisible();
  await expect(page.getByText('Biographie', { exact:true })).toBeVisible();
  await expect(page.getByText('Enregistrer les modifications', { exact:true })).toBeVisible();
  await expect(page.getByText('Changer le mot de passe', { exact:true }).last()).toBeVisible();
  await expect(page.getByPlaceholder('Mot de passe actuel')).toBeVisible();
  await expect(page.getByPlaceholder('Nouveau mot de passe')).toBeVisible();
  await expect(page.getByText('Trocar foto', { exact:true })).toHaveCount(0);
  await expect(page.getByText('Guardar alterações', { exact:true })).toHaveCount(0);

  await page.getByRole('button', { name:'Retour' }).click();
  await page.getByRole('button', { name:'Nouveau' }).click();
  await expect(page.getByText('Publier', { exact:true }).first()).toBeVisible();
  await expect(page.getByText('Partage une photo, une vidéo, une pensée ou lance un direct', { exact:true })).toBeVisible();
  await expect(page.getByText('Photo', { exact:true })).toBeVisible();
  await expect(page.getByText('Direct', { exact:true })).toBeVisible();
  await expect(page.getByPlaceholder('Qu’est-ce que tu regardes ou à quoi penses-tu ?')).toBeVisible();
  await expect(page.getByText('Partilha uma fotografia, um vídeo, um pensamento ou entra em direto', { exact:true })).toHaveCount(0);

  await context.close();
});
