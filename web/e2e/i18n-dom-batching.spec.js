import { test, expect } from '@playwright/test';

test('tradução do React em lote mantém rótulos e protege conteúdo do utilizador', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable:true, get:() => ['fr-FR'],
    });
    Object.defineProperty(navigator, 'language', {
      configurable:true, get:() => 'fr-FR',
    });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang','fr-FR');
  await expect(page.locator('.lumina-auth form')).toBeVisible({timeout:20_000});

  await page.evaluate(() => {
    const host = document.createElement('section');
    host.id = 'i18n-batch-fixture';
    document.body.appendChild(host);
    const container = document.createElement('div');
    host.appendChild(container);
    for (let i = 0; i < 40; i++) {
      const wrapper = document.createElement('span');
      wrapper.textContent = 'Criar conta';
      wrapper.dataset.index = String(i);
      container.appendChild(wrapper);
    }

    // Mutate an existing translated node in the same React-like DOM batch.
    container.firstChild.textContent = 'Voltar';

    const search = document.createElement('button');
    search.textContent = 'Pesquisar';
    search.setAttribute('aria-label', 'Pesquisar');
    search.setAttribute('title', 'Pesquisar');
    search.id = 'i18n-new-search';
    container.appendChild(search);

    const userPost = document.createElement('p');
    userPost.className = 'post-body';
    userPost.id = 'i18n-user-post';
    userPost.textContent = 'Criar conta';
    container.appendChild(userPost);
  });

  const labels = page.locator('#i18n-batch-fixture span');
  await expect(labels.first()).toHaveText('Retour');
  await expect(labels.nth(39)).toHaveText('Créer un compte');
  await expect(page.locator('#i18n-new-search')).toHaveAttribute('aria-label', 'Rechercher');
  await expect(page.locator('#i18n-new-search')).toHaveAttribute('title', 'Rechercher');
  await expect(page.locator('#i18n-user-post')).toHaveText('Criar conta');

  await page.evaluate(() => {
    const item = document.querySelector('#i18n-new-search');
    item.setAttribute('aria-label', 'Voltar');
    item.firstChild.data = 'Voltar';
  });
  await expect(page.locator('#i18n-new-search')).toHaveText('Retour');
  await expect(page.locator('#i18n-new-search')).toHaveAttribute('aria-label','Retour');
});
