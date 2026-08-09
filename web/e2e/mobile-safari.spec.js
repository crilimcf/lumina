import { test, expect } from '@playwright/test';

const PASSWORD = 'lumina-webkit-1234';

async function registerFromUI(page) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const handle = `safari${suffix}`.slice(0, 22);
  const email = `${handle}@example.test`;

  await page.goto('/');
  await expect(page.getByText('Rede de amigos')).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await page.getByPlaceholder('Como te chamas').fill('Safari QA');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  return { handle, email };
}

async function createCommunityFromUI(page) {
  await page.getByRole('button', { name: 'Entendido, vamos lá' }).click();
  await expect(page.getByText('Ainda sem comunidade')).toBeVisible();
  await page.getByRole('button', { name: /Criar ou entrar numa comunidade/ }).click();
  await expect(page.getByRole('heading', { name: 'Comunidades' })).toBeVisible();

  const communityName = `Safari QA ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.getByPlaceholder('ex: Amigos da faculdade').fill(communityName);
  const seeds = page.locator('input[placeholder^="ideia "]');
  await expect(seeds).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await seeds.nth(i).fill(`pergunta de arranque ${i + 1}`);
  }
  await page.getByRole('button', { name: 'Criar comunidade' }).click();

  await expect(page.getByRole('button', { name: 'Novo' })).toBeVisible();
}

test('registo, reload, comunidade e publicação funcionam em Mobile Safari', async ({ page }) => {
  await registerFromUI(page);
  await createCommunityFromUI(page);

  const publishedText = `Publicação WebKit ${Date.now()}`;
  await page.getByRole('button', { name: 'Novo' }).click();
  const composer = page.getByPlaceholder('O que estás a ver?');
  await expect(composer).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar fotografia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar vídeo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Cor \d/ })).toHaveCount(0);

  await composer.pressSequentially(publishedText, { delay: 12 });
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue(publishedText);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: publishedText })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Olá, Safari')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver o feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver o feed' }).click();
  await expect(page.locator('article').filter({ hasText: publishedText })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('botão Novo abre o composer a partir de Perfil e Conversas', async ({ page }) => {
  await registerFromUI(page);
  await createCommunityFromUI(page);

  await page.getByRole('button', { name: 'Perfil' }).click();
  await expect(page.getByText('Os teus dados', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Novo' }).click();
  await expect(page.getByPlaceholder('O que estás a ver?')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByPlaceholder('O que estás a ver?')).toBeHidden();

  await page.getByRole('button', { name: 'Conversas' }).click();
  await expect(page.getByRole('heading', { name: /Conversas/i })).toBeVisible();
  await page.getByRole('button', { name: 'Novo' }).click();
  await expect(page.getByPlaceholder('O que estás a ver?')).toBeVisible();
});

test('Perfil funciona como hub social com ligações clicáveis', async ({ page }) => {
  await registerFromUI(page);
  await createCommunityFromUI(page);

  await page.getByRole('button', { name: 'Perfil' }).click();
  await expect(page.getByText('A TUA ÓRBITA', { exact: true })).toBeVisible();
  await expect(page.getByText('OS TEUS CÍRCULOS', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Amigos', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Comunidades', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ver seguidores' }).click();
  await expect(page.getByText('Ligações', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Pesquisar seguidores…')).toBeVisible();
  await page.getByRole('button', { name: /A seguir ·/ }).click();
  await expect(page.getByPlaceholder('Pesquisar quem segues…')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar ligações' }).click();
  await expect(page.getByText('Ligações', { exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Ver a seguir' }).click();
  await expect(page.getByPlaceholder('Pesquisar quem segues…')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar ligações' }).click();

  await page.getByRole('button', { name: /Descobrir/ }).first().click();
  await expect(page.getByPlaceholder('Pesquisar pessoas…')).toBeVisible();
  await page.getByRole('button', { name: 'Comunidades', exact: true }).click();
  await expect(page.getByPlaceholder('Pesquisar comunidades…')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar descobrir' }).click();
  await expect(page.getByPlaceholder('Pesquisar comunidades…')).toBeHidden();
});

test('composer de fotografia usa gestos e stickers em Mobile Safari', async ({ page }) => {
  await registerFromUI(page);
  await createCommunityFromUI(page);
  await page.getByRole('button', { name: 'Novo' }).click();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGjB0AANsBA/0X8GkAAAAASUVORK5CYII=',
    'base64'
  );
  await page.locator('input[accept*="image/jpeg"]').setInputFiles({
    name: 'IMG_9226.png',
    mimeType: 'image/png',
    buffer: png,
  });

  await expect(page.getByText('Editar foto', { exact: true })).toBeVisible();
  await expect(page.getByText('1 dedo move · 2 dedos aproximam · formato 4:5')).toBeVisible();
  await expect(page.getByLabel('Zoom')).toHaveCount(0);
  await expect(page.getByTestId('photo-zoom-readout')).toHaveText('100%');

  await page.getByRole('button', { name: 'Adicionar emoji ✨' }).click();
  await expect(page.getByTestId('photo-sticker')).toHaveCount(1);
  await expect(page.getByLabel('Tamanho do emoji')).toBeVisible();
  await page.getByLabel('Tamanho do emoji').fill('68');

  await expect(page.getByLabel('Brilho')).toBeVisible();
  await page.getByLabel('Brilho').fill('110');
  await page.getByRole('button', { name: /Rodar/ }).click();
  await page.getByRole('button', { name: 'Usar esta foto' }).click();

  await expect(page.getByText('Editar foto', { exact: true })).toBeHidden();
  await expect(page.getByRole('img', { name: 'Pré-visualização da foto' })).toBeVisible();
  await expect(page.getByText('4:5 · PRONTA')).toBeVisible();
  await expect(page.getByText('IMG_9226.png')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar foto' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Trocar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remover/ })).toBeVisible();
});

test('composer aceita vídeo com preview inline em Mobile Safari', async ({ page }) => {
  await registerFromUI(page);
  await createCommunityFromUI(page);
  await page.getByRole('button', { name: 'Novo' }).click();

  // Cabeçalho mínimo de contentor ISO BMFF. O objetivo deste teste de UI é
  // confirmar seleção/preview; a validade binária completa é testada na API.
  const mp4 = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
  ]);
  await page.locator('input[accept*="video/mp4"]').setInputFiles({
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: mp4,
  });

  await expect(page.getByLabel('Pré-visualização do vídeo')).toBeVisible();
  await expect(page.getByText('VÍDEO · PRONTO')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar foto' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Trocar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remover/ })).toBeVisible();
});

test('formulário de registo mantém os dados ao consultar os Termos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Dados Mantidos');
  await page.getByPlaceholder('Email').fill('preservar@example.test');

  await page.getByRole('button', { name: 'termos' }).click();
  await expect(page.getByText(/Termos de Utilização/)).toBeVisible();
  await page.getByRole('button', { name: /Voltar/i }).click();

  await expect(page.getByPlaceholder('Como te chamas')).toHaveValue('Dados Mantidos');
  await expect(page.getByPlaceholder('Email')).toHaveValue('preservar@example.test');
});
