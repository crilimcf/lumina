import { test, expect } from '@playwright/test';

const me = {
  id:'11111111-1111-4111-8111-111111111111',
  handle:'noah', name:'Noah Test', bio:'', palette:0, avatar_url:null,
  stars:[], created_at:new Date().toISOString(), session_version:1, csrf:'regression-csrf',
};
const json = (route, body, status = 200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) });

async function commonMocks(page, moments = []) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'EventSource', { value:undefined, configurable:true });
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          success({ coords:{ latitude:41.806, longitude:-6.757, accuracy:80, altitude:null, altitudeAccuracy:null, heading:null, speed:null }, timestamp:Date.now() });
        },
        watchPosition() { return 1; }, clearWatch() {},
      },
    });
  });
  await page.route('https://nominatim.openstreetmap.org/reverse**', route => json(route, {
    address:{ city:'Bragança', state:'Bragança', country:'Portugal', country_code:'pt' },
  }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === '/api/auth/me') return json(route, me);
    if (path === '/api/posts/feed') return json(route, { posts:[] });
    if (path === '/api/moments' && method === 'GET') return json(route, moments);
    if (/^\/api\/moments\/[^/]+\/view$/.test(path) && method === 'POST') return json(route, { viewed:true });
    if (path === '/api/notifications/unread-count') return json(route, { count:0 });
    if (path === '/api/messages/threads' && method === 'GET') return json(route, []);
    if (path === '/api/messages/delivered') return json(route, {});
    if (path === '/api/calls/incoming') return json(route, null);
    if (path === '/api/one/preferences') return json(route, { boost_topics:[], mute_topics:[], context_mode:'auto', local_region:'' });
    if (path === '/api/one/capsules' || path === '/api/one/lumes') return json(route, []);
    if (path === '/api/one/pulse') return json(route, { items:[] });
    if (path === '/api/radar' && method === 'GET') return json(route, {
      country:url.searchParams.get('country'),
      scope:url.searchParams.get('scope'),
      region:url.searchParams.get('region'),
      items:[{
        id:'trend-pt', type:'trend', title:'crystal palace - city', summary:'Pesquisa em alta',
        source_name:'Google Trends · Portugal', source_url:'https://trends.google.com/',
        external_url:'https://trends.google.com/trending/rss?geo=PT', image_url:null,
        sponsored:false, sponsor_label:null, tags:['country:pt','country:global','google-trends'],
        region:'Portugal', published_at:new Date().toISOString(), priority:20,
      }],
    });
    return json(route, {});
  });
}

test('Google Trends never opens the raw RSS document from Radar', async ({ browser }) => {
  const context = await browser.newContext({ locale:'pt-PT', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await commonMocks(page);
  await page.goto('/?tab=promos');

  await expect(page.getByRole('heading', { name:'crystal palace - city' })).toBeVisible({ timeout:9000 });
  const link = page.getByRole('link', { name:/Abrir na fonte Google Trends · Portugal/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  const href = await link.getAttribute('href');
  expect(href).toContain('https://trends.google.com/trends/explore');
  expect(href).toContain('geo=PT');
  expect(decodeURIComponent(href)).toContain('q=crystal palace - city');
  expect(href).not.toContain('/trending/rss');
  await context.close();
});

test('Pulso is story-first with blue unseen ring, grey seen ring and own plus button', async ({ browser }) => {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 23 * 60 * 60_000).toISOString();
  const moments = [
    {
      id:'story-unseen', media_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="900" height="1600"%3E%3Crect width="900" height="1600" fill="%23526cff"/%3E%3C/svg%3E',
      media_mime:'image/svg+xml', palette:1, created_at:now, expires_at:later,
      author_id:'22222222-2222-4222-8222-222222222222', handle:'lea', name:'Léa Story', author_palette:1, author_avatar_url:null,
      viewed:false, likes:0, fires:0, my_reactions:[],
    },
    {
      id:'story-seen', media_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="900" height="1600"%3E%3Crect width="900" height="1600" fill="%23777"/%3E%3C/svg%3E',
      media_mime:'image/svg+xml', palette:2, created_at:now, expires_at:later,
      author_id:'33333333-3333-4333-8333-333333333333', handle:'emma', name:'Emma Vue', author_palette:2, author_avatar_url:null,
      viewed:true, likes:0, fires:0, my_reactions:[],
    },
  ];
  const context = await browser.newContext({ locale:'pt-PT', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await commonMocks(page, moments);
  await page.goto('/?one=pulse');

  const stories = page.locator('.one-story-section');
  await expect(stories).toBeVisible({ timeout:9000 });
  await expect(stories).toContainText('A acontecer agora');
  await expect(stories.getByRole('button', { name:'Adicionar story' })).toBeVisible();
  await expect(stories.locator('.one-story-plus')).toBeVisible();

  const lea = stories.locator('.one-story-button').filter({ hasText:'Léa' });
  const emma = stories.locator('.one-story-button').filter({ hasText:'Emma' });
  await expect(lea.locator('.one-story-avatar')).toHaveClass(/is-unseen/);
  await expect(emma.locator('.one-story-avatar')).toHaveClass(/is-seen/);
  await lea.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await context.close();
});
