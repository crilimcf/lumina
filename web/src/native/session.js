import { Capacitor } from '@capacitor/core';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';
import { AndroidBiometryStrength, BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const SESSION_KEY = 'session-token';
const BIOMETRIC_KEY = 'biometric-unlock';
const API_ORIGIN = 'https://api-production-f9e9.up.railway.app';

export const isNativeApp = Capacitor.isNativePlatform();
export const nativePlatform = isNativeApp ? Capacitor.getPlatform() : 'web';
export const nativeApiOrigin = import.meta.env.VITE_API_URL || API_ORIGIN;

let authToken = null;
let initialized = false;
let originalFetch = null;

const targetsLuminaApi = (value) => {
  try {
    const url = new URL(value, window.location.href);
    return url.origin === new URL(nativeApiOrigin).origin;
  } catch {
    return false;
  }
};

const nativeUrl = (value) => {
  if (!isNativeApp || typeof value !== 'string') return value;
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return value;
    return `${nativeApiOrigin}${url.pathname.slice(4)}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

export function installNativeFetchBridge() {
  if (!isNativeApp || originalFetch) return;
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const sourceUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    const resolvedUrl = nativeUrl(sourceUrl);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    if (authToken && targetsLuminaApi(resolvedUrl)) headers.set('authorization', `Bearer ${authToken}`);

    if (input instanceof Request && resolvedUrl !== input.url) {
      const method = init.method || input.method;
      let body = init.body;
      if (body === undefined && !['GET', 'HEAD'].includes(method.toUpperCase())) {
        body = await input.clone().arrayBuffer();
      }
      const request = new Request(resolvedUrl || input.url, {
        method,
        headers,
        body,
        mode:init.mode || input.mode,
        credentials:init.credentials || input.credentials,
        cache:init.cache || input.cache,
        redirect:init.redirect || input.redirect,
        referrer:init.referrer || input.referrer,
        referrerPolicy:init.referrerPolicy || input.referrerPolicy,
        integrity:init.integrity || input.integrity,
        keepalive:init.keepalive ?? input.keepalive,
        signal:init.signal || input.signal,
      });
      return originalFetch(request);
    }
    if (input instanceof Request) return originalFetch(input, { ...init, headers });
    return originalFetch(resolvedUrl ?? input, { ...init, headers });
  };
}

export async function initializeNativeSession() {
  if (!isNativeApp || initialized) return;
  initialized = true;
  await SecureStorage.setKeyPrefix('lumina_');
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);

  const stored = await SecureStorage.get(SESSION_KEY).catch(() => null);
  if (typeof stored !== 'string' || !stored) return;

  const biometric = await SecureStorage.get(BIOMETRIC_KEY).catch(() => false);
  if (biometric === true) {
    try {
      await BiometricAuth.authenticate({
        reason: 'Desbloquear a tua sessão Lumina',
        cancelTitle: 'Cancelar',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Usar código do dispositivo',
        androidTitle: 'Desbloquear Lumina',
        androidSubtitle: 'Confirma que és tu',
        androidConfirmationRequired: false,
        androidBiometryStrength: AndroidBiometryStrength.weak,
      });
    } catch {
      return;
    }
  }
  authToken = stored;
}

export const nativeAuthHeaders = () => (
  isNativeApp && authToken ? { authorization: `Bearer ${authToken}` } : {}
);

export const hasNativeSession = () => !!authToken;

export async function captureNativeSession(data) {
  if (!isNativeApp || typeof data?.token !== 'string' || !data.token) return;
  authToken = data.token;
  await SecureStorage.set(SESSION_KEY, data.token, true, false, KeychainAccess.whenUnlockedThisDeviceOnly)
    .catch(() => false);
  window.dispatchEvent(new CustomEvent('lumina:native-session'));
}

export async function clearNativeSession() {
  if (!isNativeApp) return;
  authToken = null;
  await SecureStorage.remove(SESSION_KEY).catch(() => false);
}

export async function nativeBiometricState() {
  if (!isNativeApp) return { native:false, available:false, enabled:false, type:'none' };
  const [availability, enabled] = await Promise.all([
    BiometricAuth.checkBiometry().catch(() => null),
    SecureStorage.get(BIOMETRIC_KEY).catch(() => false),
  ]);
  return {
    native: true,
    available: !!(availability?.isAvailable || availability?.deviceIsSecure),
    enabled: enabled === true,
    type: String(availability?.biometryType ?? 'none'),
  };
}

export async function enableNativeBiometric() {
  if (!isNativeApp) return false;
  await BiometricAuth.authenticate({
    reason: 'Ativar o desbloqueio protegido da Lumina',
    cancelTitle: 'Cancelar',
    allowDeviceCredential: true,
    iosFallbackTitle: 'Usar código do dispositivo',
    androidTitle: 'Ativar desbloqueio da Lumina',
    androidSubtitle: 'Usa biometria ou o código do dispositivo',
    androidConfirmationRequired: false,
    androidBiometryStrength: AndroidBiometryStrength.weak,
  });
  await SecureStorage.set(BIOMETRIC_KEY, true, true, false, KeychainAccess.whenPasscodeSetThisDeviceOnly);
  return true;
}

export async function disableNativeBiometric() {
  if (!isNativeApp) return;
  await SecureStorage.remove(BIOMETRIC_KEY).catch(() => false);
}

export function toNativeNavigationUrl(value) {
  try {
    const url = new URL(String(value || ''), 'https://lumina-snowy-ten.vercel.app');
    if (url.protocol === 'lumina:') {
      const path = url.hostname === 'open' ? url.pathname : `/${url.hostname}${url.pathname}`;
      return `${path || '/'}${url.search}${url.hash}`;
    }
    if (url.hostname === 'lumina-snowy-ten.vercel.app') return `${url.pathname}${url.search}${url.hash}`;
  } catch {}
  return '/?tab=feed';
}
