import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function openLumina(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `social${suffix}`.slice(0, 22);

  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Social QA');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await expect(page.getByRole('button', { name:'Entrar no Feed' })).toBeVisible();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name:'Novo' })).toBeVisible();
}

async function swipe(page, selector, fromX, toX, y = 360) {
  await page.locator(selector).first().evaluate((node, args) => {
    const fire = (type, x) => {
      const event = new Event(type, { bubbles:true, cancelable:true });
      const touch = { clientX:x, clientY:args.y };
      Object.defineProperty(event, 'touches', { value:type === 'touchend' ? [] : [touch] });
      Object.defineProperty(event, 'changedTouches', { value:[touch] });
      node.dispatchEvent(event);
    };
    fire('touchstart', args.fromX);
    fire('touchend', args.toX);
  }, { fromX, toX, y });
}

test('navegação final tem 5 itens; publicação edita/apaga; Radar está realmente separado', async ({ page }) => {
  await openLumina(page);

  await expect(page.getByRole('button', { name:'Feed' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Salas' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Novo' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Radar' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Conversas' })).toBeVisible();
  await expect(page.getByRole('button', { name:/Alertas/ })).toBeVisible();
  await expect(page.getByRole('button', { name:'Perfil' })).toBeVisible();

  const text = `Post editável ${Date.now()}`;
  await page.getByRole('button', { name:'Novo' }).click();
  await page.getByPlaceholder('O que estás a ver ou a pensar?').fill(text);
  await page.getByRole('button', { name:'Publicar', exact:true }).click();

  let article = page.locator('article').filter({ hasText:text });
  await expect(article).toBeVisible();
  await expect(article.locator('.lumina-post-meta')).toContainText(/agora|\d+ min/);
  await article.getByRole('button', { name:'Mais opções' }).click();
  await article.getByRole('button', { name:/Editar/ }).click();
  await expect(page.getByText('Editar publicação', { exact:true })).toBeVisible();
  await page.locator('textarea').fill(`${text} corrigido`);
  await page.getByRole('button', { name:'Guardar edição' }).click();

  article = page.locator('article').filter({ hasText:`${text} corrigido` });
  await expect(article).toBeVisible();
  await expect(article).toContainText('editado');

  await article.getByRole('button', { name:'Mais opções' }).click();
  await article.getByRole('button', { name:/Apagar/ }).click();
  await expect(page.locator('article').filter({ hasText:`${text} corrigido` })).toHaveCount(0);
  await expect(page.getByText('Publicação apagada')).toBeVisible();

  await page.getByRole('button', { name:'Radar' }).click();
  await expect(page.getByRole('heading', { name:/Radar/i })).toBeVisible();
  await expect(page.getByText(/Perto de mim, País e Mundo são experiências separadas/i)).toBeVisible();
  await expect(page.getByText('Notícias ficam no Radar.')).toBeVisible();
  const nearby = page.getByRole('tab', { name:'Perto de mim' });
  const country = page.getByRole('tab', { name:'País' });
  const world = page.getByRole('tab', { name:'Mundo' });
  await expect(nearby).toHaveAttribute('aria-selected', 'true');
  await expect(country).toBeVisible();
  await expect(page.getByRole('button', { name:'Notícias' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Promoções' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Eventos' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Tendências' })).toBeVisible();

  await world.click();
  await expect(world).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name:'Promoções' })).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Eventos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Notícias' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Tendências' })).toBeVisible();
});

test('gesto horizontal muda entre Feed, Salas, Radar e Chat', async ({ page }) => {
  await openLumina(page);

  await swipe(page, '.lumina-feed-content', 330, 80);
  await expect(page.getByRole('heading', { name:/Salas/i })).toBeVisible();

  await swipe(page, '.rooms-shell', 330, 80);
  await expect(page.getByRole('heading', { name:/Radar/i })).toBeVisible();

  await swipe(page, '.explore-shell', 330, 80);
  await expect(page.getByRole('heading', { name:'Conversas' })).toBeVisible();

  await swipe(page, '.messages-inbox-shell', 80, 330);
  await expect(page.getByRole('heading', { name:/Radar/i })).toBeVisible();
});

test('Sala pública cria, edita, conversa e apaga em Mobile Safari', async ({ page }) => {
  await openLumina(page);
  await page.getByRole('button', { name:'Salas' }).click();
  await expect(page.getByRole('heading', { name:/Salas/i })).toBeVisible();
  await page.getByRole('button', { name:/Criar/ }).click();

  const publicChoice = page.locator('.room-privacy-option.is-public');
  const privateChoice = page.locator('.room-privacy-option.is-private');
  await expect(publicChoice).toHaveAttribute('aria-pressed', 'true');
  await privateChoice.click();
  await expect(privateChoice).toHaveAttribute('aria-pressed', 'true');
  await expect(publicChoice).toHaveAttribute('aria-pressed', 'false');
  await publicChoice.click();

  const roomName = `Sala Futebol QA ${Date.now()}`;
  const editedRoomName = `${roomName} editada`;
  await page.getByPlaceholder('Nome da sala').fill(roomName);
  await page.getByPlaceholder('Tópico principal').fill('Liga Portugal esta noite');
  await page.getByPlaceholder('Descrição (opcional)').fill('Conversa em tempo real sem poluir o Feed.');
  await page.getByRole('button', { name:'Criar sala pública', exact:true }).click();

  await expect(page.getByText(roomName, { exact:true })).toBeVisible();
  await page.getByText(roomName, { exact:true }).click();
  await expect(page.getByRole('button', { name:'Adicionar foto ou vídeo à sala' })).toBeVisible();
  await page.getByRole('button', { name:'Editar sala' }).click();
  await page.getByPlaceholder('Nome da sala').fill(editedRoomName);
  await page.getByPlaceholder('Tópico principal').fill('Liga Portugal — tópico editado');
  await page.getByPlaceholder('Descrição (opcional)').fill('Descrição final da sala.');
  await page.getByRole('button', { name:'Guardar alterações' }).click();
  await expect(page.getByText(editedRoomName, { exact:true })).toBeVisible();

  const input = page.getByPlaceholder('Mensagem para a sala…');
  await input.fill('Boa noite sala 👋');
  await page.getByRole('button', { name:'Enviar para a sala' }).click();
  await expect(page.getByText('Boa noite sala 👋')).toBeVisible();
  await page.getByRole('button', { name:'Apagar mensagem' }).click();
  await expect(page.getByText('Boa noite sala 👋')).toHaveCount(0);

  await page.getByRole('button', { name:'Apagar sala' }).click();
  const dialog = page.getByRole('dialog', { name:'Confirmar apagar sala' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name:'Apagar sala' }).click();
  await expect(page.getByRole('heading', { name:/Salas/i })).toBeVisible();
  await expect(page.getByText(editedRoomName, { exact:true })).toHaveCount(0);
});

test('Chat mostra chamadas e deslizar para a direita sai da conversa', async ({ page }) => {
  await openLumina(page);
  const fakeThread = {
    id:'11111111-1111-4111-8111-111111111111', name:'Pessoa Chamada', handle:'pessoa',
    palette:1, avatar_url:null, body:'Olá', unread:0,
  };

  await page.route('**/api/messages/threads', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify([fakeThread]) }));
  await page.route('**/api/messages/threads/11111111-1111-4111-8111-111111111111/messages', route => route.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  await page.route('**/api/calls/incoming', route => route.fulfill({ status:200, contentType:'application/json', body:'null' }));

  await page.getByRole('button', { name:'Conversas' }).click();
  await expect(page.getByRole('heading', { name:'Conversas' })).toBeVisible();
  const search = page.getByRole('textbox', { name:'Pesquisar conversas e pessoas' });
  await expect(search).toBeVisible();
  await search.fill('Pessoa');
  await expect(page.getByRole('button', { name:'Abrir conversa com Pessoa Chamada' })).toBeVisible();
  await search.fill('Nada por aqui');
  await expect(page.getByText(/Não encontrámos conversas ou pessoas/)).toBeVisible();
  await search.fill('');

  await page.getByRole('button', { name:'Abrir conversa com Pessoa Chamada' }).click();
  await expect(page.getByRole('button', { name:'Ligar por áudio a Pessoa Chamada' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Fazer videochamada com Pessoa Chamada' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Enviar', exact:true })).toBeVisible();

  await swipe(page, '.messages-thread-scroll', 70, 320);
  await expect(page.getByRole('heading', { name:'Conversas' })).toBeVisible();
});

test('Alertas aceita pedido e Pessoas & privacidade muda o perfil', async ({ page }) => {
  await openLumina(page);
  const notificationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const actorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  let isPrivate = false;
  let accepted = false;

  await page.route('**/api/notifications/unread-count', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ count:accepted ? 0 : 1 }) }));
  await page.route('**/api/notifications', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ notifications:[{ id:notificationId, type:'follow_request', read_at:accepted ? new Date().toISOString() : null, created_at:new Date().toISOString(), follow_request_id:requestId, follow_request_status:accepted ? 'accepted' : 'pending', actor_id:actorId, actor_handle:'pessoa.privada', actor_name:'Pessoa Privada', actor_palette:1, actor_avatar_url:null }], nextCursor:null }) }));
  await page.route('**/api/users/me/privacy', async route => {
    if (route.request().method() === 'PATCH') {
      isPrivate = !!route.request().postDataJSON().isPrivate;
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ isPrivate, acceptedPending:0 }) });
    }
    return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ isPrivate }) });
  });
  await page.route(`**/api/users/me/follow-requests/${requestId}/accept`, route => { accepted = true; return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ accepted:true, requesterId:actorId }) }); });
  await page.route(`**/api/notifications/${notificationId}/read`, route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ read:true }) }));

  await page.getByRole('button', { name:/Alertas/ }).click();
  await expect(page.getByText('Pessoa Privada quer seguir-te')).toBeVisible();
  await page.getByRole('button', { name:'Aceitar' }).click();
  await page.getByRole('tab', { name:'Pessoas & privacidade' }).click();
  await expect(page.getByText('Perfil público', { exact:true })).toBeVisible();
  await page.getByRole('button', { name:'Tornar privado' }).click();
  await expect(page.getByText('Perfil privado', { exact:true })).toBeVisible();
});
