import { Device } from '@capacitor/device';
import { PushNotifications } from '@capacitor/push-notifications';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { isNativeApp, nativeApiOrigin, nativeAuthHeaders, nativePlatform, toNativeNavigationUrl } from './session.js';

const TOKEN_KEY = 'push-token';
const APNS_ENVIRONMENT = import.meta.env.VITE_APNS_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
let initialized = false;
let currentToken = null;
let registrationWaiters = [];

const resolveRegistration = (value) => {
  const waiters = registrationWaiters;
  registrationWaiters = [];
  for (const resolve of waiters) resolve(value);
};

const saveRegistration = async (token) => {
  currentToken = String(token || '').trim();
  if (!currentToken) return false;
  await SecureStorage.set(TOKEN_KEY, currentToken);
  const authHeaders = nativeAuthHeaders();
  if (!authHeaders.authorization) return false;
  const [deviceId, info] = await Promise.all([
    Device.getId().catch(() => ({ identifier:'' })),
    Device.getInfo().catch(() => ({})),
  ]);
  const response = await fetch(`${nativeApiOrigin}/notifications/native/subscribe`, {
    method:'POST',
    headers:{ 'content-type':'application/json', ...authHeaders },
    body:JSON.stringify({
      token:currentToken,
      platform:nativePlatform,
      deviceId:deviceId.identifier || null,
      deviceName:[info.manufacturer, info.model].filter(Boolean).join(' ').slice(0, 120) || null,
      osVersion:String(info.osVersion || '').slice(0, 40) || null,
      environment:nativePlatform === 'ios' ? APNS_ENVIRONMENT : 'production',
    }),
  });
  if (!response.ok) return false;
  window.dispatchEvent(new CustomEvent('lumina:push-state'));
  return true;
};

export async function initializeNativePush() {
  if (!isNativeApp || initialized) return;
  initialized = true;
  currentToken = await SecureStorage.get(TOKEN_KEY).catch(() => null);
  if (typeof currentToken !== 'string') currentToken = null;

  if (nativePlatform === 'android') {
    await PushNotifications.createChannel({
      id:'lumina_activity',
      name:'Atividade Lumina',
      description:'Mensagens, chamadas e atividade importante da tua conta.',
      sound:'default',
      importance:4,
      visibility:1,
      vibration:true,
      lights:true,
      lightColor:'#8B5CFF',
    }).catch(() => {});
  }

  await PushNotifications.addListener('registration', async ({ value }) => {
    const saved = await saveRegistration(value).catch(() => false);
    resolveRegistration(saved);
  });
  await PushNotifications.addListener('registrationError', () => resolveRegistration(false));
  await PushNotifications.addListener('pushNotificationReceived', notification => {
    window.dispatchEvent(new CustomEvent('lumina:notifications-changed', { detail:notification }));
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const target = action?.notification?.data?.url || action?.notification?.data?.navigate || '/?tab=alerts';
    window.dispatchEvent(new CustomEvent('lumina:native-navigation', {
      detail:{ url:toNativeNavigationUrl(target) },
    }));
  });
  window.addEventListener('lumina:native-session', () => {
    if (currentToken) void saveRegistration(currentToken).catch(() => false);
  });
  if (currentToken && nativeAuthHeaders().authorization) {
    void saveRegistration(currentToken).catch(() => false);
  }
}

export async function enableNativePush() {
  if (!isNativeApp) return false;
  await initializeNativePush();
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted') return false;

  const registered = new Promise(resolve => {
    registrationWaiters.push(resolve);
    window.setTimeout(() => {
      const index = registrationWaiters.indexOf(resolve);
      if (index >= 0) registrationWaiters.splice(index, 1);
      resolve(false);
    }, 15_000);
  });
  await PushNotifications.register();
  return registered;
}

export async function nativePushSnapshot() {
  if (!isNativeApp) return { supported:false, permission:'unsupported', subscribed:false };
  await initializeNativePush();
  const permission = await PushNotifications.checkPermissions().catch(() => ({ receive:'prompt' }));
  return {
    supported:true,
    standalone:true,
    permission:permission.receive,
    subscribed:!!currentToken,
  };
}

export async function disableNativePush() {
  if (!isNativeApp) return;
  await initializeNativePush();
  const token = currentToken || await SecureStorage.get(TOKEN_KEY).catch(() => null);
  if (token) {
    await fetch(`${nativeApiOrigin}/notifications/native/unsubscribe`, {
      method:'POST',
      headers:{ 'content-type':'application/json', ...nativeAuthHeaders() },
      body:JSON.stringify({ token }),
    }).catch(() => null);
  }
  await PushNotifications.unregister().catch(() => {});
  currentToken = null;
  await SecureStorage.remove(TOKEN_KEY).catch(() => false);
  window.dispatchEvent(new CustomEvent('lumina:push-state'));
}
