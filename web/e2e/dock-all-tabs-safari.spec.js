import { test, expect } from '@playwright/test';

const PASSWORD='lumina-dock-webkit-1234';

async function registerAndEnterFeed(page) {
  const suffix=`${Date.now()}${Math.floor(Math.random()*1000)}`;
  const handle=`dock${suffix}`.slice(0,22);
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByPlaceholder('Como te chamas').fill('Dock Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Criar conta'}).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button',{name:'Entendido, vamos lá'}).click();
  await page.getByRole('button',{name:'Ir para o Feed'}).click();
  await expect(page.getByRole('button',{name:'Novo'})).toBeVisible();
}

async function scrollWindow(page,y) {
  await page.evaluate(async nextY=>{
    window.scrollTo(0,nextY);
    window.dispatchEvent(new Event('scroll'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },y);
}

test('dock global é compacto, baixo, esconde ao descer e volta ao subir em todas as abas principais', async ({page}) => {
  await registerAndEnterFeed(page);
  await page.evaluate(()=>{
    const spacer=document.createElement('div');
    spacer.dataset.testid='global-dock-spacer';
    spacer.style.height='260vh';
    spacer.style.pointerEvents='none';
    document.body.appendChild(spacer);
  });

  const nav=page.locator('.nav');
  await expect(nav).toBeVisible();
  const box=await nav.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(332);
  expect(box?.height).toBeLessThanOrEqual(54);
  const bottom=await nav.evaluate(el=>parseFloat(getComputedStyle(el).bottom));
  expect(bottom).toBeLessThanOrEqual(8);

  for (const label of ['Feed','Salas','Radar','Conversas']) {
    await scrollWindow(page,0);
    await expect(nav).not.toHaveClass(/nav-smart-hidden/);
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(nav).toBeVisible();

    await scrollWindow(page,520);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);
    await expect(nav).toHaveClass(/nav-smart-hidden/);

    await scrollWindow(page,220);
    await expect(nav).not.toHaveClass(/nav-smart-hidden/);
  }

  await page.getByRole('button',{name:'Novo'}).click();
  await expect(page.getByPlaceholder('O que estás a ver?')).toBeVisible();
});
