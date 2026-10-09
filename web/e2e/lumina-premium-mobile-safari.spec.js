import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function freshAccount(page) {
  const handle = `visual${Date.now()}${Math.floor(Math.random()*900+100)}`.slice(0,22);
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByPlaceholder('Como te chamas').fill('Lumina Visual');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Criar conta'}).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button',{name:'Entendido, vamos lá'}).click();
}

test('premium introduction has intentional content rather than an empty panel', async ({ page }) => {
  await freshAccount(page);
  await expect(page.locator('.opening-constellation')).toBeVisible();
  await expect(page.getByRole('button',{name:'Entrar no Feed'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Explorar Salas'})).toBeVisible();
  const bounds = await page.locator('.opening-actions').evaluate(node => {
    const r=node.getBoundingClientRect();
    return {top:r.top,left:r.left,right:r.right,screenWidth:innerWidth};
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.screenWidth+1);
  expect(bounds.top).toBeLessThan(700);
});

test('premium Feed keeps animated discovery portal inside the iPhone width', async ({ page }) => {
  await freshAccount(page);
  await page.getByRole('button',{name:'Entrar no Feed'}).click();
  await expect(page.locator('.lumina-v3-empty')).toBeVisible();
  const layout=await page.locator('.lumina-feed').evaluate(root => {
    const grab=selector=>{const n=root.querySelector(selector);const r=n?.getBoundingClientRect();return r?{left:r.left,right:r.right,height:r.height,top:r.top,bottom:r.bottom}:null};
    return {viewport:innerWidth, portal:grab('.one-v3-feed-entry'), floatingOrb:grab('.one-adventure-portal'), empty:grab('.lumina-v3-empty'), dock:grab('.nav')};
  });
  expect(layout.portal).not.toBeNull();
  expect(layout.portal.left).toBeGreaterThanOrEqual(-1);
  expect(layout.portal.right).toBeLessThanOrEqual(layout.viewport+1);
  expect(layout.portal.height).toBeLessThan(170);
  expect(layout.floatingOrb.left).toBeGreaterThanOrEqual(-1);
  expect(layout.floatingOrb.right).toBeLessThanOrEqual(layout.viewport+1);
  expect(layout.empty.left).toBeGreaterThanOrEqual(-1);
  expect(layout.empty.right).toBeLessThanOrEqual(layout.viewport+1);
  expect(layout.dock.left).toBeGreaterThanOrEqual(0);
  expect(layout.dock.right).toBeLessThanOrEqual(layout.viewport+1);
  await expect(page.getByRole('button',{name:'Novo'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Descobrir pessoas'})).toBeVisible();
});
