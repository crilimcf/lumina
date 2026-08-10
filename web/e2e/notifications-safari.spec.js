import { test, expect } from '@playwright/test';

const PASSWORD='lumina-notify-webkit-1234';
const registration=(handle,name)=>({handle,email:`${handle}@example.test`,password:PASSWORD,name,birthDate:'1990-01-01',acceptTerms:true});

test('notificação passa de Não lida para Lida e deep-link limpa unread', async ({page,request}) => {
  const suffix=`${Date.now()}${Math.floor(Math.random()*1000)}`;
  const senderHandle=`notifys${suffix}`.slice(0,22), receiverHandle=`notifyr${suffix}`.slice(0,22);
  const senderResponse=await request.post('/api/auth/register',{data:registration(senderHandle,'Sender Notify')});
  expect(senderResponse.status()).toBe(201); const sender=await senderResponse.json();

  await page.goto('/'); await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByPlaceholder('Como te chamas').fill('Receiver Notify');
  await page.getByPlaceholder('Nome de utilizador').fill(receiverHandle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${receiverHandle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD); await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Criar conta'}).click(); await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();

  const receiver=await page.evaluate(async()=>await (await fetch('/api/auth/me',{credentials:'include'})).json());
  const headers={authorization:`Bearer ${sender.token}`,'x-csrf-token':sender.csrf};
  const threadResponse=await request.post('/api/messages/threads',{headers,data:{userId:receiver.id}}); expect(threadResponse.status()).toBe(201); const thread=await threadResponse.json();
  const send=async body=>{const r=await request.post(`/api/messages/threads/${thread.id}/messages`,{headers,data:{kind:'text',mode:'normal',body,palette:0}}); expect(r.status()).toBe(201);};
  const unreadCount=()=>page.evaluate(async()=>((await (await fetch('/api/notifications/unread-count',{credentials:'include',cache:'no-store'})).json()).count));

  await send('primeira notificação'); await page.goto('/?tab=alerts');
  const row=page.getByText('Sender Notify enviou-te uma mensagem'); await expect(row).toBeVisible({timeout:5000}); await expect(page.getByText('Não lida')).toBeVisible();
  await row.click(); await expect.poll(unreadCount).toBe(0);
  await page.goto('/?tab=alerts'); await expect(page.getByText('Lida').first()).toBeVisible();

  await send('segunda notificação');
  await expect.poll(async()=>page.evaluate(async()=>{const d=await (await fetch('/api/notifications',{credentials:'include',cache:'no-store'})).json(); return d.notifications?.some(n=>!n.read_at&&n.type==='message')||false;}),{timeout:5000}).toBe(true);
  const rows=await page.evaluate(async()=>(await (await fetch('/api/notifications',{credentials:'include',cache:'no-store'})).json()).notifications);
  const unread=rows.find(n=>!n.read_at&&n.type==='message'); expect(unread?.id).toBeTruthy();
  await page.goto(`/?tab=dms&notification=${encodeURIComponent(unread.id)}`); await expect.poll(unreadCount).toBe(0);
});
