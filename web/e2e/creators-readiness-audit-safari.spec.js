import { test, expect } from '@playwright/test';

const creator = {
  id:'11111111-1111-4111-8111-111111111111',
  handle:'creatorqa',
  name:'Criador QA',
  palette:0,
  bio:'',
  stars:[],
  session_version:1,
  is_staff:false,
};

const response = (route, data, status=200) => route.fulfill({
  status, contentType:'application/json', body:JSON.stringify(data),
});

test('conta Stripe verificada não é apresentada como subscrições ativas', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window,'EventSource',{value:undefined,configurable:true});
  });
  await page.route('**/api/**', route => {
    const path=new URL(route.request().url()).pathname;
    if (path==='/api/auth/me') return response(route,creator);
    if (path==='/api/creators/me/plans') return response(route,{plans:[]});
    if (path==='/api/creators/me/content') return response(route,{content:[]});
    if (path==='/api/creators/me/billing/status') return response(route,{
      available:true,
      enabled:false,
      account:{linked:true,transfersEnabled:true,payoutsEnabled:true,detailsSubmitted:true},
    });
    if (path==='/api/creators/me/billing/subscriptions') return response(route,{subscriptions:[]});
    if (path==='/api/posts/feed') return response(route,{posts:[]});
    if (path==='/api/moments') return response(route,[]);
    if (path==='/api/notifications/unread-count') return response(route,{count:0});
    if (path==='/api/messages/threads') return response(route,[]);
    if (path==='/api/calls/incoming') return response(route,null);
    return response(route,{});
  });

  await page.goto('/?creators=1');
  await expect(page.getByRole('heading',{name:/Lumina Creators/})).toBeVisible({timeout:20000});
  await expect(page.getByRole('heading',{name:'Configurar recebimentos'})).toBeVisible();
  await expect(page.getByText('Recebimentos verificados. Isto não ativa automaticamente as subscrições pagas.')).toBeVisible();
  await expect(page.getByText('As subscrições pagas ainda estão desativadas.',{exact:false})).toBeVisible();
  await expect(page.getByText('Ainda não criaste planos.',{exact:false})).toBeVisible();
  await expect(page.getByText('Ainda não tens conteúdos.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publicar plano'})).toHaveCount(0);
});
