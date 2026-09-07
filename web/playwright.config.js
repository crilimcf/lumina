import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL,
    ignoreHTTPSErrors: baseURL.startsWith('https://'),
    // The app registers a real PWA service worker. E2E tests mock API calls with
    // page.route(), and Playwright cannot reliably intercept requests handled by
    // a service worker. Blocking it here keeps the Safari suite deterministic;
    // service-worker/PWA behaviour is validated separately by dedicated tests.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'], locale:'pt-PT' },
    },
  ],
});
