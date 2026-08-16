import { Browser } from '@capacitor/browser';
import {
  captureNativeSession,
  isNativeApp,
  nativeApiOrigin,
  nativeAuthHeaders,
} from './native/session.js';

const BASE = isNativeApp ? nativeApiOrigin : (import.meta.env.VITE_API_URL || '/api');

const b64uToBytes = value => {
  const input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = input + '='.repeat((4 - input.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const bytesToB64u = value => {
  const bytes = new Uint8Array(value || new ArrayBuffer(0));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

async function jsonCall(path, { method = 'GET', body, csrf = false } = {}) {
  const headers = { Accept:'application/json', ...nativeAuthHeaders() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf && !isNativeApp) {
    const me = await fetch(`${BASE}/auth/me?__passkey_csrf=${Date.now()}`, {
      credentials:'include', cache:'no-store', headers:{ 'cache-control':'no-cache' },
    });
    const session = await me.json().catch(() => ({}));
    if (!me.ok || !session?.csrf) throw new Error(session?.error || 'Sessão inválida');
    headers['x-csrf-token'] = session.csrf;
  }
  const response = await fetch(`${BASE}${path}`, {
    method, credentials:'include', cache:'no-store', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.');
  await captureNativeSession(data);
  return data;
}

const creationOptions = json => {
  if (PublicKeyCredential.parseCreationOptionsFromJSON) return PublicKeyCredential.parseCreationOptionsFromJSON(json);
  return {
    ...json,
    challenge:b64uToBytes(json.challenge),
    user:{ ...json.user, id:b64uToBytes(json.user.id) },
    excludeCredentials:(json.excludeCredentials || []).map(item => ({ ...item, id:b64uToBytes(item.id) })),
  };
};

const requestOptions = json => {
  if (PublicKeyCredential.parseRequestOptionsFromJSON) return PublicKeyCredential.parseRequestOptionsFromJSON(json);
  return {
    ...json,
    challenge:b64uToBytes(json.challenge),
    allowCredentials:(json.allowCredentials || []).map(item => ({ ...item, id:b64uToBytes(item.id) })),
  };
};

export function credentialToJSON(credential) {
  if (typeof credential?.toJSON === 'function') return credential.toJSON();
  const response = credential?.response;
  const out = {
    id:credential.id,
    rawId:bytesToB64u(credential.rawId),
    type:credential.type,
    authenticatorAttachment:credential.authenticatorAttachment || undefined,
    clientExtensionResults:credential.getClientExtensionResults?.() || {},
    response:{ clientDataJSON:bytesToB64u(response.clientDataJSON) },
  };
  if ('attestationObject' in response) {
    out.response.attestationObject = bytesToB64u(response.attestationObject);
    out.response.transports = response.getTransports?.() || [];
  } else {
    out.response.authenticatorData = bytesToB64u(response.authenticatorData);
    out.response.signature = bytesToB64u(response.signature);
    out.response.userHandle = response.userHandle ? bytesToB64u(response.userHandle) : null;
  }
  return out;
}

export const passkeySupported = () => !!(
  isNativeApp || (window.isSecureContext && window.PublicKeyCredential
  && navigator.credentials?.create && navigator.credentials?.get)
);

export const passkeyLoginLabel = () => {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'Entrar com Face ID';
  if (/Android/i.test(navigator.userAgent)) return 'Entrar com biometria / PIN';
  return 'Entrar com passkey';
};

const deviceName = () => {
  if (/iPhone/i.test(navigator.userAgent)) return 'iPhone · Face ID';
  if (/iPad/i.test(navigator.userAgent)) return 'iPad · biometria';
  if (/Android/i.test(navigator.userAgent)) return 'Android · biometria/PIN';
  return `${navigator.platform || 'Dispositivo'} · passkey`.slice(0, 80);
};

export async function authenticateWithPasskey() {
  if (!passkeySupported()) throw new Error('Este dispositivo não suporta passkeys.');
  if (isNativeApp) {
    const verifier = bytesToB64u(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const codeChallenge = bytesToB64u(digest);
    const started = await jsonCall('/auth/mobile/start', { method:'POST', body:{ codeChallenge } });

    let cleanupNavigation = () => {};
    const callback = new Promise((resolve, reject) => {
      let timeout;
      const onNavigation = event => {
        const url = new URL(event.detail?.url || '/', window.location.href);
        if (url.pathname !== '/auth' || url.searchParams.get('handoff') !== started.id) return;
        cleanupNavigation();
        resolve({ handoff:started.id, code:url.searchParams.get('code') || '' });
      };
      cleanupNavigation = () => {
        window.clearTimeout(timeout);
        window.removeEventListener('lumina:native-navigation', onNavigation);
      };
      timeout = window.setTimeout(() => {
        cleanupNavigation();
        reject(new Error('O login por passkey expirou. Tenta novamente.'));
      }, 2 * 60_000);
      window.addEventListener('lumina:native-navigation', onNavigation);
    });

    let rejectBrowserFinished;
    const browserFinished = new Promise((_, reject) => { rejectBrowserFinished = reject; });
    const browserHandle = await Browser.addListener('browserFinished', () => {
      cleanupNavigation();
      rejectBrowserFinished(new Error('Login por passkey cancelado.'));
    });
    await Browser.open({ url:started.loginUrl, presentationStyle:'fullscreen' });
    try {
      const result = await Promise.race([callback, browserFinished]);
      return await jsonCall('/auth/mobile/exchange', {
        method:'POST',
        body:{ ...result, verifier },
      });
    } finally {
      cleanupNavigation();
      await browserHandle.remove().catch(() => {});
      await Browser.close().catch(() => {});
    }
  }
  const json = await jsonCall('/auth/passkeys/options');
  const credential = await navigator.credentials.get({ publicKey:requestOptions(json) });
  if (!credential) throw new Error('Login por passkey cancelado.');
  return jsonCall('/auth/passkeys/login', { method:'POST', body:{ credential:credentialToJSON(credential) } });
}

export async function registerPasskey() {
  if (!passkeySupported()) throw new Error('Este dispositivo não suporta passkeys.');
  if (isNativeApp) {
    const session = await jsonCall('/auth/mobile/browser-session', { method:'POST', body:{} });
    await Browser.open({ url:session.url, presentationStyle:'fullscreen' });
    return { external:true };
  }
  const json = await jsonCall('/auth/passkeys/register-options');
  const credential = await navigator.credentials.create({ publicKey:creationOptions(json) });
  if (!credential) throw new Error('Criação da passkey cancelada.');
  return jsonCall('/auth/passkeys/register', {
    method:'POST', csrf:true,
    body:{ credential:credentialToJSON(credential), deviceName:deviceName() },
  });
}

export const listPasskeys = () => jsonCall('/auth/passkeys');
export const removePasskey = id => jsonCall(`/auth/passkeys/${encodeURIComponent(id)}`, { method:'DELETE', csrf:true });
