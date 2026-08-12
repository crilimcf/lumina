import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function openLumina(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `polish${suffix}`.slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Polish QA');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name: 'Entrar no Feed' }).click();
  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
}

test('Radar mostra voltar ao topo apenas depois de scroll e regressa suavemente', async ({ page }) => {
  await openLumina(page);
  await page.getByRole('button', { name: 'Radar' }).click();
  await expect(page.getByRole('heading', { name: /Radar/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar ao topo' })).toHaveCount(0);

  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.dataset.testid = 'radar-scroll-spacer';
    spacer.style.height = '1800px';
    document.querySelector('.explore-shell')?.appendChild(spacer);
    window.scrollTo(0, 900);
    window.dispatchEvent(new Event('scroll'));
  });

  const top = page.getByRole('button', { name: 'Voltar ao topo' });
  await expect(top).toBeVisible();
  await top.click();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 2500 }).toBeLessThan(20);
});

test('criar Momento apresenta escolha vertical clara e CTA premium', async ({ page }) => {
  await openLumina(page);
  await page.getByRole('button', { name: 'Tu' }).click();
  await expect(page.getByRole('heading', { name: 'Criar momento' })).toBeVisible();
  await expect(page.getByText('24 HORAS · VERTICAL')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar fotografia ao momento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar vídeo ao momento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Partilhar momento' })).toBeDisabled();
});
