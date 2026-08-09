import { test, expect } from '@playwright/test';

const PASSWORD='lumina-webkit-1234';

async function openLumina(page){
  const suffix=`${Date.now()}${Math.floor(Math.random()*1000)}`;const handle=`social${suffix}`.slice(0,22);
  await page.goto('/');await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByPlaceholder('Como te chamas').fill('Social QA');await page.getByPlaceholder('Nome de utilizador').fill(handle);await page.locator('input[type="date"]').fill('1990-01-01');await page.getByPlaceholder('Email').fill(`${handle}@example.test`);await page.getByPlaceholder('Password').fill(PASSWORD);await page.locator('input[type="checkbox"]').check();await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByRole('button',{name:'Entendido, vamos lá'}).click();await expect(page.getByText('Ainda sem comunidade')).toBeVisible();await page.getByRole('button',{name:/Criar ou entrar numa comunidade/}).click();
  await page.getByPlaceholder('ex: Amigos da faculdade').fill(`Social QA ${Date.now()}${Math.floor(Math.random()*1000)}`);const seeds=page.locator('input[placeholder^="ideia "]');for(let i=0;i<5;i++)await seeds.nth(i).fill(`social pergunta ${i+1}`);await page.getByRole('button',{name:'Criar comunidade'}).click();await expect(page.getByRole('button',{name:'Novo'})).toBeVisible();
}

test('nova navegação separa Salas e Promoções e o post é editável/apagável em Mobile Safari',async({page})=>{
  await openLumina(page);await expect(page.getByRole('button',{name:'Salas'})).toBeVisible();await expect(page.getByRole('button',{name:'Promoções'})).toBeVisible();await expect(page.getByRole('button',{name:'Convites'})).toHaveCount(0);
  const text=`Post editável ${Date.now()}`;await page.getByRole('button',{name:'Novo'}).click();await page.getByPlaceholder('O que estás a ver?').fill(text);await page.getByRole('button',{name:'Publicar',exact:true}).click();
  let article=page.locator('article').filter({hasText:text});await expect(article).toBeVisible();await article.getByRole('button',{name:'Mais opções'}).click();await article.getByRole('button',{name:/Editar/}).click();await expect(page.getByText('Editar publicação',{exact:true})).toBeVisible();
  await page.locator('textarea').fill(`${text} corrigido`);await page.getByRole('button',{name:'Guardar edição'}).click();article=page.locator('article').filter({hasText:`${text} corrigido`});await expect(article).toBeVisible();await expect(article).toContainText('editado');
  await article.getByRole('button',{name:'Mais opções'}).click();await expect(article.getByRole('button',{name:/Apagar/})).toBeVisible();
  await page.getByRole('button',{name:'Promoções'}).click();await expect(page.getByText('Publicidade tem casa própria.')).toBeVisible();await expect(page.getByText(/feed social fica limpo/i)).toBeVisible();
});

test('Salas públicas criam cartão com tópico e chat interno em Mobile Safari',async({page})=>{
  await openLumina(page);await page.getByRole('button',{name:'Salas'}).click();await expect(page.getByRole('heading',{name:/Salas/i})).toBeVisible();await page.getByRole('button',{name:/Criar/}).click();
  await page.getByPlaceholder('Nome da sala').fill('Sala Futebol QA');await page.getByPlaceholder('Tópico principal').fill('Liga Portugal esta noite');await page.getByPlaceholder('Descrição (opcional)').fill('Conversa em tempo real sem poluir o feed.');await page.getByRole('button',{name:'Pública Qualquer pessoa',exact:true}).click();await page.getByRole('button',{name:'Criar sala',exact:true}).click();
  const roomName=page.getByText('Sala Futebol QA',{exact:true});await expect(roomName).toBeVisible();await roomName.click();await expect(page.getByText('Liga Portugal esta noite',{exact:true})).toBeVisible();const input=page.getByPlaceholder('Mensagem para a sala…');await input.fill('Boa noite sala 👋');await page.getByRole('button',{name:'Enviar para a sala'}).click();await expect(page.getByText('Boa noite sala 👋')).toBeVisible();
});

test('Chat mostra ações de chamada áudio e vídeo sem as confundir com mensagens',async({page})=>{
  await openLumina(page);const fakeThread={id:'11111111-1111-4111-8111-111111111111',name:'Pessoa Chamada',handle:'pessoa',palette:1,avatar_url:null,body:'Olá',unread:0};
  await page.route('**/api/messages/threads',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([fakeThread])}));await page.route('**/api/messages/threads/11111111-1111-4111-8111-111111111111/messages',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));await page.route('**/api/calls/incoming',route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
  await page.getByRole('button',{name:'Conversas'}).click();await page.getByRole('button',{name:/Pessoa Chamada/}).click();await expect(page.getByRole('button',{name:'Ligar por áudio a Pessoa Chamada'})).toBeVisible();await expect(page.getByRole('button',{name:'Fazer videochamada com Pessoa Chamada'})).toBeVisible();await expect(page.getByRole('button',{name:'Enviar mensagem'})).toBeVisible();
});
