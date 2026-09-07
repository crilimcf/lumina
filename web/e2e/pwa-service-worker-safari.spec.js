import { test, expect, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

test('PWA mantém o service worker funcional no WebKit sem interferir com os mocks E2E', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale:'pt-PT',
    ignoreHTTPSErrors:baseURL.startsWith('https://'),
    serviceWorkers:'allow',
  });
  const page = await context.newPage();

  try {
    await page.goto(baseURL, { waitUntil:'domcontentloaded' });
    const result = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported:false, scriptURL:'' };
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('service-worker-timeout')), 12_000)),
      ]);
      return {
        supported:true,
        scriptURL:registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '',
      };
    });

    expect(result.supported).toBe(true);
    expect(result.scriptURL).toMatch(/\/sw\.js(?:$|\?)/);
  } finally {
    await context.close();
  }
});
