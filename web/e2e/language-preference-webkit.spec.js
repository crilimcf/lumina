import { test, expect } from '@playwright/test';

const KEY = 'lumina-language-v1';

test('idioma francês guardado prevalece sobre idioma do WebView no arranque', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, 'fr');
  }, KEY);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-FR');
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout:20_000 });
  await expect(page.getByRole('button', { name:'Créer un compte' })).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), KEY);
  expect(saved).toBe('fr');
});

test('preferência inválida não bloqueia a Lumina e respeita o idioma do dispositivo', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, 'unsupported-language');
    Object.defineProperty(navigator, 'languages', { configurable:true, get:() => ['pt-PT'] });
    Object.defineProperty(navigator, 'language', { configurable:true, get:() => 'pt-PT' });
  }, KEY);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang','pt-PT');
  await expect(page.locator('.lumina-auth form')).toBeVisible({ timeout:20_000 });
  await expect(page.getByRole('button', { name:'Criar conta' })).toBeVisible();
});

test('utilizador altera para francês no Perfil sem perder a sessão', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(key => localStorage.setItem(key, 'pt'), KEY);
  await page.reload();
  await expect(page.getByRole('button', {name:'Criar conta'})).toBeVisible();

  const suffix = `${Date.now()}${Math.floor(Math.random()*900)}`;
  const handle = `idioma${suffix}`.slice(0, 22);
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Idioma QA');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill('lumina-webkit-1234');
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', {name:'Criar conta'}).click();

  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible({timeout:20_000});
  await page.getByRole('button',{name:'Entendido, vamos lá'}).click();
  await page.getByRole('button',{name:'Entrar no Feed'}).click();
  await expect(page.getByRole('button',{name:'Perfil'})).toBeVisible({timeout:20_000});
  await page.getByRole('button',{name:'Perfil'}).click();

  const choices = page.getByRole('group',{name:'Idioma da aplicação'});
  await expect(choices).toBeVisible();
  await expect(choices.getByRole('button',{name:'Português'})).toHaveAttribute('aria-pressed','true');
  await choices.getByRole('button',{name:'Français'}).click();

  await expect(page.locator('html')).toHaveAttribute('lang','fr-FR',{timeout:20_000});
  await expect(page.getByRole('button',{name:'Profil'})).toBeVisible({timeout:20_000});
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe('fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','fr-FR');
  await expect(page.getByRole('button',{name:'Profil'})).toBeVisible({timeout:20_000});
});

test('idioma pode ser escolhido no login antes de criar conta', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(key => localStorage.setItem(key, 'pt'), KEY);
  await page.reload();
  const picker = page.getByLabel('Idioma da aplicação');
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue('pt');
  await picker.selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-FR', { timeout:20_000 });
  await expect(page.getByRole('button', {name:'Créer un compte'})).toBeVisible();
  await expect(page.getByLabel('Langue de l’application')).toHaveValue('fr');
});
