import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function newMember(page) {
  const handle = `alive${Date.now()}${Math.floor(Math.random()*1000)}`.slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Pessoa Alive');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button',{ name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button',{ name:'Entendido, vamos lá' }).click();
  await page.getByRole('button',{ name:'Entrar no Feed' }).click();
}

test('Alive preserves real Feed, composer, Rooms and persisted identity in iPhone WebKit', async ({ page }) => {
  await newMember(page);
  await page.getByRole('button',{name:'Perfil',exact:true}).first().click();
  const choices = page.locator('.lumina-identity-options');
  await expect(choices.locator('.lumina-identity-preview')).toHaveCount(4);
  await choices.getByRole('button',{name:/Alive,/}).click();
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','alive');

  await page.locator('.nav').getByRole('button',{name:'Feed'}).click();
  await expect(page.locator('.alive-root')).toBeVisible();
  await expect(page.getByRole('heading',{name:/O teu universo/})).toBeVisible();
  await expect(page.locator('.alive-orbit-core')).toBeVisible();
  await expect(page.locator('.alive-orbit-node').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(5);

  await page.locator('.alive-orbit-core').click();
  await expect(page.locator('.composer-sheet')).toBeVisible();
  await page.locator('.composer-close').click();

  await page.getByRole('button',{name:/Abrir Feed cronológico/}).click();
  await expect(page.locator('.lumina-feed')).toBeVisible();
  await page.locator('.alive-back-to-universe').click();
  await expect(page.locator('.alive-root')).toBeVisible();

  await page.locator('.nav').getByRole('button',{name:'Salas'}).click();
  await expect(page.locator('.rooms-header')).toBeVisible();
  await page.locator('.nav').getByRole('button',{name:'Feed'}).click();
  await expect(page.locator('.alive-root')).toBeVisible();

  await page.reload();
  await expect(page.locator('.alive-root')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','alive');
  await expect(page.getByRole('button',{name:'Entrar no Feed'})).toHaveCount(0);
});

test('Alive is accessible with reduced motion and no session', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(() => localStorage.setItem('lumina-identity-v1','alive'));
  await page.goto('/');
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout:20000 });
  await expect(page.locator('body')).toHaveAttribute('data-lumina-identity','alive');
  await expect(page.locator('.lumina-boot-recovery')).toHaveCount(0);
});
