import { test, expect } from '@playwright/test';

test('fotografia nativa grande fica JPEG quadrado compatível com API dos Lumes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { prepareLumePhoto } = await import('/src/utils/lumeImage.js');
    const canvas = document.createElement('canvas');
    canvas.width = 2100;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#236eca';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const original = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const withoutMime = new Blob([original], { type:'' });
    const prepared = await prepareLumePhoto(withoutMime);
    const image = new Image();
    const url = URL.createObjectURL(prepared);
    try {
      image.src = url;
      await image.decode();
      return {
        name: prepared.name,
        mime: prepared.type,
        size: prepared.size,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  expect(result.mime).toBe('image/jpeg');
  expect(result.name).toMatch(/^lume-\d+\.jpg$/);
  expect(result.width).toBe(1080);
  expect(result.height).toBe(1080);
  expect(result.size).toBeGreaterThan(0);
  expect(result.size).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test('ficheiros vazios ou que não são fotografias são rejeitados localmente', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { prepareLumePhoto } = await import('/src/utils/lumeImage.js');
    const outcomes = [];
    for (const blob of [new Blob([], { type:'image/jpeg' }), new Blob(['not an image'], { type:'text/plain' })]) {
      try { await prepareLumePhoto(blob); outcomes.push('accepted'); }
      catch { outcomes.push('rejected'); }
    }
    return outcomes;
  });
  expect(result).toEqual(['rejected', 'rejected']);
});
