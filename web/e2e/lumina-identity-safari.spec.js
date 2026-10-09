import { test, expect } from '@playwright/test';

const PASSWORD='lumina-webkit-1234';
async function register(page) {
  const handle=`identity${Date.now()}${Math.floor(Math.random()*1000)}`.slice(0,22);
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByPlaceholder('Como te chamas').fill('Identidade Visual');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Criar conta'}).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button',{name:'Entendido, vamos lá'}).click();
  await page.getByRole('button',{name:'Entrar no Feed'}).click();
}
test('Midnight Air and Pulse are real persistent appearance choices', async ({page}) => {
  await register(page);
  await page.getByRole('button',{name:'Perfil',exact:true}).first().click();
  await expect(page.getByText('A tua Lumina')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','midnight');

  const options=page.locator('.lumina-identity-options');
  await expect(options.locator('.lumina-identity-preview')).toHaveCount(3);

  await options.getByRole('button',{name:/Air,/}).click();
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','air');
  const air=await page.locator('.lumina-profile-hero').evaluate(el=>{
    const css=getComputedStyle(el);
    return {background:css.backgroundColor,color:css.color,scheme:getComputedStyle(document.body).colorScheme};
  });
  expect(air.background).toBe('rgb(255, 255, 255)');
  expect(air.scheme).toContain('light');

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','air');
  await page.getByRole('button',{name:'Entrar no Feed'}).click();

  await page.getByRole('button',{name:'Perfil',exact:true}).first().click();
  await options.getByRole('button',{name:/Pulse,/}).click();
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','pulse');
  await expect(options.locator('.is-selected')).toContainText('Pulse');
  await options.getByRole('button',{name:/Midnight,/}).click();
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','midnight');
});

test('Air identity is applied during boot, before any login', async ({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('lumina-identity-v1','air')});
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','air');
  await expect(page.locator('html')).toHaveAttribute('data-lumina-identity','air');
  await expect(page.locator('.lumina-auth')).toBeVisible();
  const bg=await page.locator('.lumina-auth').evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(bg).toContain('linear-gradient');
});
