import { test, expect } from '@playwright/test';

test('a atualização da Lumina não descarta mensagens, posts nem chamadas ativas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.lumina-auth form')).toBeVisible({timeout:20_000});
  const checks = await page.evaluate(async () => {
    const { hasActiveUserWork } = await import('/src/utils/updateSafety.js');
    const results = [];
    results.push(['idle', hasActiveUserWork()]);

    const composer = document.createElement('input');
    composer.className = 'messages-composer-input';
    composer.value = 'mensagem ainda não enviada';
    document.body.append(composer);
    results.push(['unsent-message', hasActiveUserWork()]);
    composer.remove();

    const sheet = document.createElement('div');
    sheet.className = 'composer-sheet';
    document.body.append(sheet);
    results.push(['media-composer', hasActiveUserWork()]);
    sheet.remove();

    const call = document.createElement('div');
    call.dataset.luminaCallActive = 'true';
    document.body.append(call);
    results.push(['call-active', hasActiveUserWork()]);
    call.remove();

    const editor = document.createElement('textarea');
    editor.value = 'rascunho de publicação';
    document.body.append(editor);
    results.push(['unsent-post', hasActiveUserWork()]);
    editor.remove();

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    results.push(['focused-input', hasActiveUserWork()]);
    input.blur();
    input.remove();
    results.push(['back-to-idle', hasActiveUserWork()]);
    return results;
  });
  expect(checks).toEqual([
    ['idle', false],
    ['unsent-message', true],
    ['media-composer', true],
    ['call-active', true],
    ['unsent-post', true],
    ['focused-input', true],
    ['back-to-idle', false],
  ]);
});
