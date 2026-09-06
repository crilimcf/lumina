import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('ativação de chamadas não contém copy específica de iPhone no fluxo web', async () => {
  const root = process.cwd();
  const main = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
  const conversations = fs.readFileSync(path.join(root, 'src', 'screens', 'Conversas.jsx'), 'utf8');

  expect(main).toContain('Ativa as notificações da Lumina neste dispositivo.');
  expect(main).toContain('Tentar novamente');
  expect(main).not.toContain('Ativa as notificações da Lumina neste iPhone.');
  expect(conversations).toContain("t('Ativa as chamadas neste dispositivo')");
  expect(conversations).toContain("callPush.permission === 'denied'");
});
