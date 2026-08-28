import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function openLumina(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `clarity${suffix}`.slice(0, 22);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Clarity QA');
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

test('Lumina One separa Pulso social, Stories, Agora e Radar', async ({ page }) => {
  await openLumina(page);
  await page.getByRole('button', { name: 'Abrir Lumina One' }).click();

  await expect(page.getByRole('heading', { name: /Tudo ligado/i })).toBeVisible();
  await page.getByRole('button', { name: 'Pulso', exact:true }).click();
  await expect(page.getByText('Pessoas e momentos. Não notícias.')).toBeVisible();
  await expect(page.locator('.one-story-section')).toBeVisible();
  await expect(page.locator('.one-story-head')).toContainText('A acontecer agora');
  await expect(page.locator('.one-story-button').first()).toBeVisible();
  await expect(page.locator('.one-story-avatar').first()).toBeVisible();
  await expect(page.getByText('Juntos', { exact:true })).toHaveCount(0);
  await expect(page.getByText('Ver Juntos', { exact:true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Agora' }).click();
  await expect(page.getByText('Esta área não é um feed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aplicar agora' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir Radar Perto / País / Mundo' })).toBeVisible();
  await expect(page.locator('.one-radar-handoff')).toContainText('Perto de mim, País e Mundo ficam separados');
  await expect(page.getByText('RADAR LOCAL', { exact:true })).toHaveCount(0);
});

test('Radar mantém Perto de mim, País e Mundo em superfícies separadas', async ({ page }) => {
  await openLumina(page);
  await page.getByRole('button', { name: 'Radar' }).click();

  const nearby = page.getByRole('tab', { name: 'Perto de mim' });
  const country = page.getByRole('tab', { name: 'País' });
  const world = page.getByRole('tab', { name: 'Mundo' });
  await expect(nearby).toHaveAttribute('aria-selected', 'true');
  await expect(country).toHaveAttribute('aria-selected', 'false');
  await expect(world).toHaveAttribute('aria-selected', 'false');

  await country.click();
  await expect(country).toHaveAttribute('aria-selected', 'true');
  await expect(nearby).toHaveAttribute('aria-selected', 'false');

  await world.click();
  await expect(world).toHaveAttribute('aria-selected', 'true');
  await expect(country).toHaveAttribute('aria-selected', 'false');
  await expect(nearby).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByText('Radar Mundo')).toBeVisible();
  await expect(page.getByText(/Nada deste separador é usado para preencher o Radar Local/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Promoções' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Eventos' })).toHaveCount(0);
});
