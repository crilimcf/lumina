import { test, expect } from '@playwright/test';

for (const [language, expected, action] of [
  ['pt','Não percas mensagens nem chamadas','Ativar'],
  ['fr','Ne manque aucun message ni appel','Activer'],
  ['en',"Don't miss messages or calls",'Enable'],
  ['es','No te pierdas mensajes ni llamadas','Activar'],
]) {
  test(`pedido de notificações traduzido para ${language}`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem('lumina-language-v1', lang), language);
    await page.goto('/');
    await expect(page.locator('.lumina-auth form')).toBeVisible({timeout:20_000});
    const out = await page.evaluate(async () => {
      const { t } = await import('/src/i18n-ui.js');
      return {
        title:t('Não percas mensagens nem chamadas'),
        detail:t('Ativa as notificações da Lumina neste {device}.',{device:'iPhone'}),
        action:t('Ativar'),
      };
    });
    expect(out.title).toBe(expected);
    expect(out.action).toBe(action);
    expect(out.detail).toContain('iPhone');
    expect(out.detail).not.toContain('{device}');
  });
}
