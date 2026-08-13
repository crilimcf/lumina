import React from 'react';
import { createRoot } from 'react-dom/client';
import { PasskeyLogin } from './components/PasskeyLogin.jsx';
import { PasskeySetup } from './components/PasskeySetup.jsx';

const roots = new WeakMap();
const mount = (host, node) => {
  if (!host || roots.has(host)) return;
  const root = createRoot(host);
  roots.set(host, root);
  root.render(node);
};

function securityShell() {
  const legacy = document.querySelector('.lumina-legacy-security');
  if (legacy) return legacy.querySelector('div[style*="max-width"]') || legacy;

  const heading = [...document.querySelectorAll('h2.d')].find(el =>
    el.textContent.replace(/\s/g, '').toLocaleLowerCase('pt-PT').includes('segurança')
  );
  return heading?.parentElement || null;
}

function decorate() {
  const form = document.querySelector('.lumina-auth form.auth-card');
  if (form && !form.querySelector('[data-passkey-react]')) {
    const host = document.createElement('div');
    host.dataset.passkeyReact = 'login';
    form.querySelector('button.p-brand')?.insertAdjacentElement('afterend', host);
    mount(host, <PasskeyLogin onIn={() => window.location.reload()} />);
  }

  const shell = securityShell();
  if (shell && !shell.querySelector('[data-passkey-react="setup"]')) {
    const host = document.createElement('div');
    host.dataset.passkeyReact = 'setup';
    shell.querySelector('.card')?.insertAdjacentElement('beforebegin', host);
    if (!host.isConnected) shell.append(host);
    mount(host, <PasskeySetup />);
  }
}

decorate();
new MutationObserver(decorate).observe(document.documentElement, { childList:true, subtree:true });
