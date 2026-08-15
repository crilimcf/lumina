import { test, expect } from '@playwright/test';

const me = {
  id:'11111111-1111-4111-8111-111111111111',
  handle:'brunoqa',
  name:'Bruno Fernandes',
  bio:'Bio écrite par l’utilisateur',
  palette:1,
  avatar_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32%3E%3Crect width="32" height="32" fill="%23d77"/%3E%3C/svg%3E',
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

async function bodyContains(page, text) {
  await expect(page.locator('body')).toContainText(text);
}

async function bodyOmits(page, text) {
  await expect(page.locator('body')).not.toContainText(text);
}

test('French iPhone UI has no Portuguese chrome across core mobile surfaces', async ({ browser }) => {
  const context = await browser.newContext({ locale:'fr-FR', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await mockFrenchSession(page);
  await openAuthenticatedApp(page);

  await bodyContains(page, 'Ta lumière, tes connexions');
  await bodyContains(page, 'Ton Fil est vide.');
  await bodyContains(page, 'Les histoires des personnes qui font partie de ta lumière');
  await bodyOmits(page, 'Sua luz, suas conexões');

  await page.getByRole('button', { name:'Salons' }).click();
  await bodyContains(page, 'Salons');
  await bodyContains(page, 'Des sujets vivants, sans encombrer le Fil.');
  await bodyContains(page, 'Toutes');
  await bodyContains(page, 'Publics');
  await bodyContains(page, 'Privés');
  await bodyContains(page, 'Confidentialité réelle.');
  await bodyOmits(page, 'Tópicos vivos, sem poluir o Feed.');

  await page.getByRole('button', { name:'Radar' }).click();
  await bodyContains(page, 'Explorer maintenant');
  await bodyContains(page, 'Découvrir avec du contexte, pas du bruit.');
  await bodyContains(page, 'Les sources éditoriales vérifiées, les titres et le contexte restent séparés du Fil social.');
  await bodyContains(page, 'Actualités');
  await bodyContains(page, 'Événements');
  await bodyContains(page, 'Source vérifiée');
  // Publisher/editorial content is not UI chrome and must remain exactly as published.
  await bodyContains(page, 'União de Leiria contrata belga Hugo Masaki');
  await bodyContains(page, 'Este texto editorial permanece no idioma original da fonte.');
  await bodyContains(page, 'RTP Notícias · Desporto');
  await bodyOmits(page, 'Sources editoriais verificadas, manchetes e contexto ficam separados do Feed social. O artigo original continua na respetiva fonte e conteúdo comercial permanece sempre identificado.');

  await page.getByRole('button', { name:'Profil' }).click();
  await bodyContains(page, 'Sécurité et sessions');
  await bodyContains(page, 'Protège ton compte et gère les appareils connectés.');
  await bodyContains(page, 'Confidentialité');
  await bodyContains(page, 'Se déconnecter de Lumina');
  await bodyContains(page, 'Bio écrite par l’utilisateur');
  await bodyOmits(page, 'Segurança e sessões');

  await page.getByRole('button', { name:/Sécurité et sessions/i }).click();
  await bodyContains(page, 'Sécurité');
  await bodyContains(page, 'Validation en deux étapes');
  await bodyContains(page, 'Où tu es connecté');
  await bodyOmits(page, 'Dois passos');
  await bodyOmits(page, 'Onde tens sessão iniciada');
  await page.getByRole('button', { name:'Retour' }).click();

  await page.getByRole('button', { name:/Confidentialité/i }).click();
  await bodyContains(page, 'Politique de confidentialité de Lumina');
  await bodyOmits(page, 'Política de Privacidade da Lumina');
  await page.getByRole('button', { name:'Retour' }).click();

  await page.getByRole('button', { name:/Conditions/i }).click();
  await bodyContains(page, 'Conditions d’utilisation de Lumina');
  await bodyOmits(page, 'Termos de Utilização da Lumina');
  await page.getByRole('button', { name:'Retour' }).click();

  await page.getByRole('button', { name:/Modifier le profil/i }).click();
  await bodyContains(page, 'Modifier le profil');
  await bodyContains(page, 'Changer la photo');
  await bodyContains(page, 'Supprimer la photo');
  await bodyContains(page, 'Nom');
  await bodyContains(page, 'Biographie');
  await bodyContains(page, 'Enregistrer les modifications');
  await bodyContains(page, 'Changer le mot de passe');
  await expect(page.getByPlaceholder('Mot de passe actuel')).toBeVisible();
  await expect(page.getByPlaceholder('Nouveau mot de passe')).toBeVisible();
  await bodyOmits(page, 'Trocar foto');
  await bodyOmits(page, 'Guardar alterações');

  await page.getByRole('button', { name:'Retour' }).click();
  await page.getByRole('button', { name:'Nouveau' }).click();
  await bodyContains(page, 'Publier');
  await bodyContains(page, 'Partage une photo, une vidéo, une pensée ou lance un direct');
  await bodyContains(page, 'Photo');
  await bodyContains(page, 'Direct');
  await expect(page.getByPlaceholder('Qu’est-ce que tu regardes ou à quoi penses-tu ?')).toBeVisible();
  await bodyOmits(page, 'Partilha uma fotografia, um vídeo, um pensamento ou entra em direto');

  await context.close();
});
