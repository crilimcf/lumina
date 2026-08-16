import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_NATIVE_APP: 'true',
    VITE_API_URL: process.env.VITE_NATIVE_API_URL || 'https://api-production-f9e9.up.railway.app',
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
