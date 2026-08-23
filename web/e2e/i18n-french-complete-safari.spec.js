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
    localStorage.setItem('lumina-one-last-mode-v1', 'agora');
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          success({ coords:{ latitude:38.7223, longitude:-9.1393, accuracy:100, altitude:null, altitudeAccuracy:null, heading:null, speed:null }, timestamp:Date.now() });
        },
        watchPosition() { return 1; },
        clearWatch() {},
      },
    });
  });

  await page.route('https://nominatim.openstreetmap.org/reverse**', route => json(route, {
    address:{ city:'Lisboa', state:'Lisboa', country:'Portugal', country_code:'pt' },
  }));

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
    if (path === '/api/radar' && method === 'GET') return json(route, {
      country:url.searchParams.get('country') || null,
      scope:url.searchParams.get('scope') || 'local',
      items:[{
        id:'radar-1', type:'news', title:'União de Leiria contrata belga Hugo Masaki',
        summary:'Este texto editorial permanece no idioma original da fonte.',
        source_name:'RTP Notícias · Desporto', published_at:'2026-08-14T10:00:00Z', sponsored:false,
      }],
    });
    if (path === '/api/2fa/status') return json(route, { enabled:false, codesLeft:0 });
    if (path === '/api/sessions') return json(route, []);
    return json(route, {});
  });
}

async function openAuthenticatedApp(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-FR');
  await expect(page.getByRole('button', { name:'Ouvrir le Fil' })).toBeVisible({ timeout:9000 });
  await page.getByRole('button', { name:'Ouvrir le Fil' }).click();
}

const bodyContains = (page, text) => expect(page.locator('body')).toContainText(text);
const bodyOmits = (page, text) => expect(page.locator('body')).not.toContainText(text);

test('French iPhone UI has no Portuguese chrome across core mobile surfaces', async ({ browser }) => {
  const context = await browser.newContext({ locale:'fr-FR', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await mockFrenchSession(page);
  await openAuthenticatedApp(page);

  await bodyContains(page, 'Ta lumière, tes connexions');
  await bodyContains(page, 'Ton Fil est vide.');
  await bodyContains(page, 'Les histoires des personnes qui font partie de ta lumière');
  await bodyOmits(page, 'Sua luz, suas conexões');

  const adventure = page.locator('.one-v3-feed-entry.one-adventure-entry');
  await expect(adventure).toBeVisible();
  await expect(adventure).toContainText('Ajuste ton Maintenant');
  await expect(adventure).toContainText('Contexte et préférences, sans mélanger les actualités');
  await expect(adventure).not.toContainText('Afina o teu Agora');

  await page.getByRole('button', { name:'Salons' }).click();
  await bodyContains(page, 'Salons');
  await bodyContains(page, 'Des sujets vivants, sans encombrer le Fil.');
  await bodyContains(page, 'Toutes');
  await bodyContains(page, 'Publics');
  await bodyContains(page, 'Privés');
  await bodyOmits(page, 'Tópicos vivos, sem poluir o Feed.');

  await page.getByRole('button', { name:'Radar' }).click();
  await bodyContains(page, 'Explorer maintenant');
  await bodyContains(page, 'Local et Monde sont deux expériences séparées.');
  await bodyContains(page, 'Les actualités restent dans Radar.');
  await bodyContains(page, 'sans mélanger ta zone avec le monde');
  await bodyContains(page, 'Nous affichons uniquement le contenu du pays ou de la région détecté par l’iPhone.');
  await bodyContains(page, 'Actualités');
  await bodyContains(page, 'Événements');
  await bodyContains(page, 'Source vérifiée');
  await expect(page.getByRole('tab', { name:'Local' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name:'Monde' })).toBeVisible();
  // Editorial content keeps the source language.
  await bodyContains(page, 'União de Leiria contrata belga Hugo Masaki');
  await bodyContains(page, 'Este texto editorial permanece no idioma original da fonte.');
  await bodyContains(page, 'RTP Notícias · Desporto');
  await bodyOmits(page, 'Local e Mundo são experiências separadas.');
  await bodyOmits(page, 'Notícias ficam no Radar.');

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
  await page.getByRole('button', { name:'Retour' }).click();

  await page.getByRole('button', { name:/Modifier le profil/i }).click();
  await bodyContains(page, 'Modifier le profil');
  await bodyContains(page, 'Changer la photo');
  await bodyContains(page, 'Nom');
  await bodyContains(page, 'Biographie');
  await bodyContains(page, 'Enregistrer les modifications');
  await expect(page.getByPlaceholder('Mot de passe actuel')).toBeVisible();
  await expect(page.getByPlaceholder('Nouveau mot de passe')).toBeVisible();
  await bodyOmits(page, 'Guardar alterações');

  await page.getByRole('button', { name:'Retour' }).click();
  await page.getByRole('button', { name:'Nouveau' }).click();
  await bodyContains(page, 'Publier');
  await bodyContains(page, 'Partage une photo, une vidéo, une pensée ou lance un direct');
  await expect(page.getByPlaceholder('Qu’est-ce que tu regardes ou à quoi penses-tu ?')).toBeVisible();
  await bodyOmits(page, 'Partilha uma fotografia, um vídeo, um pensamento ou entra em direto');

  await context.close();
});
