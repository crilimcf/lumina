import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');
const webRoot = path.resolve(mobileRoot, '../web');
const runtimeSource = path.join(mobileRoot, 'runtime/native-bootstrap.js');
const runtimeTarget = path.join(webRoot, 'public/native-bootstrap.js');
const indexPath = path.join(webRoot, 'index.html');
const mainPath = path.join(webRoot, 'src/main.jsx');
const passkeysPath = path.join(webRoot, 'src/passkeys.js');

await fs.copyFile(runtimeSource, runtimeTarget);

let html = await fs.readFile(indexPath, 'utf8');
if (!html.includes('/native-bootstrap.js')) {
  const marker = '<script type="module" src="/src/main.jsx"></script>';
  if (!html.includes(marker)) throw new Error('Lumina web entry point changed; native bootstrap was not injected.');
  html = html.replace(marker, '<script src="/native-bootstrap.js"></script>\n    ' + marker);
  await fs.writeFile(indexPath, html);
}

let main = await fs.readFile(mainPath, 'utf8');
main = main.replace(
  "const checkForNewDeployment = async () => {\n    if (checkingDeployment || reloadingForDeployment || !loadedDeployment) return;",
  "const checkForNewDeployment = async () => {\n    if (window.__LUMINA_NATIVE__) return;\n    if (checkingDeployment || reloadingForDeployment || !loadedDeployment) return;"
);
main = main.replace(
  "const supportsPush = 'Notification' in window && (",
  "const supportsPush = !window.__LUMINA_NATIVE__ && 'Notification' in window && ("
);
await fs.writeFile(mainPath, main);

let passkeys = await fs.readFile(passkeysPath, 'utf8');
passkeys = passkeys.replace(
  "export const passkeySupported = () => !!(\n  window.isSecureContext",
  "export const passkeySupported = () => !!(\n  !window.__LUMINA_NATIVE__ && window.isSecureContext"
);
await fs.writeFile(passkeysPath, passkeys);

console.log('[mobile] Web bundle prepared for native Capacitor runtime.');
