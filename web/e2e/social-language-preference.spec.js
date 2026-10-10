import { test, expect } from '@playwright/test';

for (const preferred of ['fr','en','es','pt']) {
  test(`Lumes e Agora seguem idioma ${preferred} escolhido no Perfil`, async ({ page }) => {
    await page.addInitScript(language => {
      localStorage.setItem('lumina-language-v1', language);
      Object.defineProperty(navigator, 'languages', {
        configurable:true,
        get:() => ['pt-PT'],
      });
      Object.defineProperty(navigator, 'language', {
        configurable:true,
        get:() => 'pt-PT',
      });
    },preferred);
    await page.goto('/');
    await expect(page.locator('.lumina-auth form')).toBeVisible({timeout:20_000});
    const result = await page.evaluate(async () => {
      const { language } = await import('/src/i18n.js');
      const { socialLoopsLanguage } = await import('/src/one-social-loops.js');
      return { app:language, social:socialLoopsLanguage };
    });
    expect(result).toEqual({app:preferred,social:preferred});
  });
}
